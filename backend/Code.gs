/**
 * Felix Plaza SOP Skill Check: Google Sheets backend.
 *
 * Paste this into Extensions → Apps Script of the results spreadsheet, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Put the /exec URL into js/config.js (backendUrl). See README.md.
 *
 * GET  ?action=check&empId=..&test=..&level=..  → may this person take the test now?
 * POST {action:"submit", ...}                    → save one finished attempt
 *
 * Rules, checked by employee ID so they work on any phone:
 *   - One test per day: after any test, the next test (any test, any level) opens 1 day later.
 *   - Fail: the same test and level opens 3 days later.
 */

var PASS_PERCENT = 60;  // keep the same as js/config.js
var RETAKE_DAYS = 3;     // wait after a fail, same test and level
var GAP_HOURS = 24;      // wait after any test, before the next one
var RECENT_KEEP = 30;   // question IDs remembered per person, so the next test gets new questions

var TEST_NAMES = { "gas-generator": "Gas Generator", "chiller": "Chiller" };
var LEVEL_NAMES = { "operator": "Operator / Technician", "supervisor": "Supervisor / Engineer" };

var TABS = {
  results: {
    name: "Results",
    headers: ["Date and time", "Attempt ID", "Employee ID", "Name", "Designation", "Department", "Agency",
      "Test", "Level", "Language", "Score", "Out of", "Score %", "Result", "Passed (1 = yes)",
      "Time taken (min)", "Time taken", "Retake allowed from", "Note", "Question IDs", "Wrong question IDs"]
  },
  answers: {
    name: "Answers",
    headers: ["Date and time", "Attempt ID", "Employee ID", "Name", "Department", "Test", "Level",
      "Question ID", "Topic", "Question", "Their answer", "Correct answer", "Correct (1 = yes)"]
  },
  status: {
    name: "Staff status",
    headers: ["Employee ID", "Name", "Designation", "Department", "Agency", "Test", "Level", "Attempts",
      "Best score %", "Last score %", "Last result", "Last attempt", "Retake allowed from", "Status",
      "Recent question IDs", "Key"]
  }
};
// Column numbers in "Staff status" (1-based)
var ST = { attempts: 8, best: 9, last: 10, result: 11, lastAt: 12, retake: 13, status: 14, recent: 15, key: 16 };

/* ---------------- Web app entry points ---------------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === "check") return json_(checkEligibility_(p.empId, p.test, p.level));
    return json_({ ok: true, service: "Felix Plaza SOP Skill Check" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (data.action === "submit") return json_(submitAttempt_(data));
    return json_({ ok: false, error: "Unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------------- Check ---------------- */

function checkEligibility_(empId, testId, levelId) {
  empId = normId_(empId);
  if (!empId || !testId || !levelId) throw new Error("Missing employee ID, test or level");
  var lock = activeLock_(empId, statusKey_(empId, testId, levelId), Date.now());
  return {
    ok: true,
    locked: !!lock.until,
    reason: lock.reason,                       // "daily" or "failed"
    retakeFrom: lock.until ? new Date(lock.until).toISOString() : null,
    lastResult: lock.lastResult,
    recentQuestionIds: lock.recent
  };
}

// Looks at every test this employee has taken and returns the latest date that still blocks them.
function activeLock_(empId, key, now) {
  var out = { until: null, reason: null, lastResult: null, recent: [] };
  findEmployeeRows_(empId).forEach(function (r) {
    var v = r.values, lastAt = v[ST.lastAt - 1], retake = v[ST.retake - 1];
    if (lastAt instanceof Date) {
      var t = lastAt.getTime() + GAP_HOURS * 60 * 60 * 1000;
      if (t > now && (!out.until || t > out.until)) { out.until = t; out.reason = "daily"; }
    }
    if (v[ST.key - 1] === key) {
      out.lastResult = v[ST.result - 1] || null;
      out.recent = String(v[ST.recent - 1] || "").split(",").map(trim_).filter(String);
      if (v[ST.result - 1] === "Fail" && retake instanceof Date && retake.getTime() > now &&
          (!out.until || retake.getTime() >= out.until)) {
        out.until = retake.getTime(); out.reason = "failed";
      }
    }
  });
  return out;
}

/* ---------------- Submit ---------------- */

function submitAttempt_(d) {
  var person = d.person || {};
  var empId = normId_(person.empId);
  var testId = String(d.testId || ""), levelId = String(d.levelId || "");
  var total = Number(d.total), score = Number(d.score);
  var answers = Array.isArray(d.answers) ? d.answers : [];
  if (!d.attemptId || !empId || !testId || !levelId) throw new Error("Missing details");
  if (!(total > 0) || !(score >= 0) || score > total) throw new Error("Bad score");

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var results = ensureTab_(ss, TABS.results);
    var attemptId = String(d.attemptId).slice(0, 40);

    // The app may resend the same attempt after a network error. Save it only once.
    var dup = results.getRange("B:B").createTextFinder(attemptId).matchEntireCell(true).findNext();
    if (dup) {
      var r = results.getRange(dup.getRow(), 1, 1, TABS.results.headers.length).getValues()[0];
      return { ok: true, duplicate: true, pass: r[13] === "Pass", retakeFrom: r[17] instanceof Date ? r[17].toISOString() : null };
    }

    var now = new Date();
    var pct = score / total;
    var pass = score * 100 >= PASS_PERCENT * total;
    var retakeFrom = pass ? null : new Date(now.getTime() + RETAKE_DAYS * 24 * 60 * 60 * 1000);
    var testName = TEST_NAMES[testId] || safe_(d.testName);
    var levelName = LEVEL_NAMES[levelId] || safe_(d.levelName);
    var secs = Math.max(0, Math.round(Number(d.timeTakenSec) || 0));
    var key = statusKey_(empId, testId, levelId);

    // Flag attempts taken while a lock was active (for example from a phone that was offline).
    var note = "";
    var active = activeLock_(empId, key, now.getTime());
    if (active.until) {
      note = (active.reason === "failed" ? "Taken before retake date (" : "Taken within 1 day of last test (") +
        fmt_(ss, new Date(active.until)) + ")";
    }
    var prev = findStatusRow_(key);

    var qIds = answers.map(function (a) { return safe_(a.id); });
    var wrongIds = answers.filter(function (a) { return !a.ok; }).map(function (a) { return safe_(a.id); });

    var resRow = results.getLastRow() + 1;
    ensureRows_(results, resRow);
    results.getRange(resRow, 1, 1, TABS.results.headers.length).setValues([[
      now, attemptId, "'" + empId, safe_(person.name), safe_(person.designation), safe_(person.department),
      titleCase_(safe_(person.agency)), testName, levelName, safe_(d.language), score, total, pct,
      pass ? "Pass" : "Fail", pass ? 1 : 0, Math.round(secs / 6) / 10, "'" + clock_(secs),
      retakeFrom || "", note, qIds.join(", "), wrongIds.join(", ")
    ]]);
    results.getRange(resRow, 1).setNumberFormat("dd mmm yyyy, hh:mm");
    results.getRange(resRow, 18).setNumberFormat("dd mmm yyyy, hh:mm");

    if (answers.length) {
      var ans = ensureTab_(ss, TABS.answers);
      var rows = answers.map(function (a) {
        return [now, attemptId, "'" + empId, safe_(person.name), safe_(person.department), testName, levelName,
          safe_(a.id), safe_(a.topic), safe_(a.question), safe_(a.chosen), safe_(a.correct), a.ok ? 1 : 0];
      });
      var start = ans.getLastRow() + 1;
      ensureRows_(ans, start + rows.length - 1);
      ans.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
      ans.getRange(start, 1, rows.length, 1).setNumberFormat("dd mmm yyyy, hh:mm");
    }

    upsertStatus_(ss, key, prev, {
      empId: empId, person: person, testName: testName, levelName: levelName,
      pct: pct, pass: pass, now: now, retakeFrom: retakeFrom, qIds: qIds
    });

    return {
      ok: true, pass: pass, percent: Math.round(pct * 100),
      retakeFrom: retakeFrom ? retakeFrom.toISOString() : null,
      nextTestFrom: new Date(now.getTime() + GAP_HOURS * 60 * 60 * 1000).toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

function upsertStatus_(ss, key, prev, x) {
  var sh = ensureTab_(ss, TABS.status);
  var attempts = 1, best = x.pct, recent = x.qIds;
  if (prev) {
    var v = prev.values;
    attempts = (Number(v[ST.attempts - 1]) || 0) + 1;
    best = Math.max(Number(v[ST.best - 1]) || 0, x.pct);
    recent = x.qIds.concat(String(v[ST.recent - 1] || "").split(",").map(trim_).filter(String));
    recent = recent.filter(function (id, i) { return recent.indexOf(id) === i; });
  }
  var row = [
    "'" + x.empId, safe_(x.person.name), safe_(x.person.designation), safe_(x.person.department),
    titleCase_(safe_(x.person.agency)), x.testName, x.levelName, attempts, best, x.pct,
    x.pass ? "Pass" : "Fail", x.now, x.retakeFrom || "", "", recent.slice(0, RECENT_KEEP).join(", "), key
  ];
  var r = prev ? prev.row : sh.getLastRow() + 1;
  ensureRows_(sh, r);
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  sh.getRange(r, ST.lastAt, 1, 2).setNumberFormat("dd mmm yyyy, hh:mm");
  // Live status: changes from "Locked" to "Can retake now" on its own when the date passes.
  sh.getRange(r, ST.status).setFormulaR1C1(
    '=IF(R[0]C[-3]="Pass","Passed",IF(R[0]C[-1]="","",IF(NOW()>=R[0]C[-1],"Can retake now","Locked until retake date")))');
}

/* ---------------- Helpers ---------------- */

function findStatusRow_(key) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.status.name);
  if (!sh || sh.getLastRow() < 2) return null;
  var cell = sh.getRange(2, ST.key, sh.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).findNext();
  if (!cell) return null;
  return { row: cell.getRow(), values: sh.getRange(cell.getRow(), 1, 1, TABS.status.headers.length).getValues()[0] };
}

function findEmployeeRows_(empId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.status.name);
  if (!sh || sh.getLastRow() < 2) return [];
  var pattern = "^" + empId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\|";
  return sh.getRange(2, ST.key, sh.getLastRow() - 1, 1).createTextFinder(pattern).useRegularExpression(true).findAll()
    .map(function (cell) {
      return { row: cell.getRow(), values: sh.getRange(cell.getRow(), 1, 1, TABS.status.headers.length).getValues()[0] };
    });
}

function ensureTab_(ss, def) {
  var sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

// setValues fails past the last row of the grid, so add room first.
function ensureRows_(sh, lastRowNeeded) {
  var max = sh.getMaxRows();
  if (lastRowNeeded > max) sh.insertRowsAfter(max, lastRowNeeded - max + 500);
}

function statusKey_(empId, testId, levelId) { return normId_(empId) + "|" + testId + "|" + levelId; }
function normId_(s) { return String(s || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 30); }
function trim_(s) { return String(s).trim(); }

// Plain text only. A leading = + - @ would make Sheets treat the value as a formula.
function safe_(s) {
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// "abc facility services" and "ABC Facility Services" group together in the summary.
function titleCase_(s) {
  return String(s).replace(/\w\S*/g, function (w) {
    return w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function clock_(secs) {
  var m = Math.floor(secs / 60), s = secs % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function fmt_(ss, d) { return Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), "dd MMM yyyy, h:mm a"); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Admin helper ---------------- */

/**
 * Lets one person take a test now, without waiting (clears both the 1-day and the 3-day wait).
 * Run from the Apps Script editor: change the employee ID, then press Run.
 */
function unlockRetake() {
  var empId = normId_("FP1023");
  var rows = findEmployeeRows_(empId);
  if (!rows.length) { Logger.log("No record for " + empId); return; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TABS.status.name);
  var past = new Date(Date.now() - GAP_HOURS * 60 * 60 * 1000 - 60 * 1000);
  rows.forEach(function (r) {
    sh.getRange(r.row, ST.lastAt).setValue(past);
    if (r.values[ST.retake - 1] instanceof Date) sh.getRange(r.row, ST.retake).setValue(past);
  });
  Logger.log("Unlocked " + empId + " (" + rows.length + " test records)");
}
