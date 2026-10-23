/* Felix Plaza SOP Skill Check: screens, test flow, saving results. */
(function () {
  "use strict";

  var C = window.APP_CONFIG;
  var TXT = window.I18N;
  var BANKS = window.QUESTION_BANKS || {};

  var KEY = {
    session: "sop_session_v1",   // test in progress on this device (survives a page reload)
    lang: "sop_lang_v1",
    outbox: "sop_outbox_v1",     // results that could not be sent yet
    locks: "sop_locks_v1",       // local copy of retake locks, used when offline
    recent: "sop_recent_v1"      // question IDs seen recently, per employee/test/level
  };
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ---------- Storage (never let a blocked localStorage break the page) ---------- */
  function load(k, fallback) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  /* ---------- State ---------- */
  function freshState() {
    return {
      screen: "details",
      lang: load(KEY.lang, "en") === "hi" ? "hi" : "en",
      person: { name: "", designation: "", department: "", empId: "", agency: "" },
      testId: null,
      levelId: null,
      attempt: null,
      result: null
    };
  }
  var S = load(KEY.session, null) || freshState();
  var resumed = S.screen === "quiz" && S.attempt;
  function persist() { store(KEY.session, S); store(KEY.lang, S.lang); }

  /* ---------- Helpers ---------- */
  function t(key, vars) {
    var s = (TXT[S.lang] && TXT[S.lang][key]) || TXT.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function normId(id) { return String(id || "").trim().toUpperCase().replace(/\s+/g, ""); }
  function clean(s) { return String(s || "").trim().replace(/\s+/g, " "); }
  function rand(n) {
    if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rand(i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function makeId() { return Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase(); }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(S.lang === "hi" ? "hi-IN" : "en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata"
      });
    } catch (e) { return new Date(iso).toLocaleString(); }
  }
  function findTest(id) { return C.tests.filter(function (x) { return x.id === id; })[0]; }
  function findLevel(id) { return C.levels.filter(function (x) { return x.id === id; })[0]; }
  function bank() { return (BANKS[S.testId] && BANKS[S.testId][S.levelId]) || []; }
  function qById(id) { return bank().filter(function (q) { return q.id === id; })[0]; }
  function lockKey(empId, testId, levelId) { return normId(empId) + "|" + testId + "|" + levelId; }
  function passMark(n) { return Math.ceil((C.passPercent / 100) * n); }

  /* ---------- Icons (Lucide, MIT) ---------- */
  var ICON = {
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    snowflake: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>";
  }

  /* ---------- Backend ---------- */
  function withTimeout(ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return { signal: ctrl ? ctrl.signal : undefined, done: function () { if (timer) clearTimeout(timer); } };
  }
  function apiGet(params) {
    if (!C.backendUrl) return Promise.reject(new Error("No backend URL"));
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
    var to = withTimeout(10000);
    return fetch(C.backendUrl + "?" + qs, { method: "GET", signal: to.signal })
      .then(function (r) { to.done(); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function apiPost(body) {
    if (!C.backendUrl) return Promise.reject(new Error("No backend URL"));
    var to = withTimeout(20000);
    // text/plain avoids a CORS preflight, which Apps Script does not answer.
    return fetch(C.backendUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: to.signal })
      .then(function (r) { to.done(); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (res) { if (!res || !res.ok) throw new Error((res && res.error) || "Save failed"); return res; });
  }

  function setLocalLock(key, iso) {
    var locks = load(KEY.locks, {});
    if (iso) locks[key] = iso; else delete locks[key];
    store(KEY.locks, locks);
  }
  function localLock(key) {
    var iso = load(KEY.locks, {})[key];
    return iso && new Date(iso).getTime() > Date.now() ? iso : null;
  }

  // Ask the sheet whether this employee may take this test now. Falls back to this device's record if offline.
  function checkEligibility() {
    var key = lockKey(S.person.empId, S.testId, S.levelId);
    return apiGet({ action: "check", empId: normId(S.person.empId), test: S.testId, level: S.levelId })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("Bad response");
        setLocalLock(key, res.locked ? res.retakeFrom : null);
        return { locked: !!res.locked, retakeFrom: res.retakeFrom, recent: res.recentQuestionIds || [] };
      })
      .catch(function () {
        var iso = localLock(key);
        return { locked: !!iso, retakeFrom: iso, recent: [] };
      });
  }

  function flushOutbox() {
    var box = load(KEY.outbox, []);
    if (!box.length || !C.backendUrl) return Promise.resolve();
    return box.reduce(function (p, item) {
      return p.then(function () {
        return apiPost(item).then(function () {
          store(KEY.outbox, load(KEY.outbox, []).filter(function (x) { return x.attemptId !== item.attemptId; }));
        }).catch(function () { /* keep for next time */ });
      });
    }, Promise.resolve());
  }

  /* ---------- Question picking ---------- */
  // Questions not seen recently come first, spread across topics so each test covers the whole SOP.
  function spreadByTopic(list) {
    var groups = {};
    shuffle(list).forEach(function (q) { (groups[q.topic] = groups[q.topic] || []).push(q); });
    var topics = shuffle(Object.keys(groups)), out = [], added = true;
    while (added) {
      added = false;
      topics.forEach(function (tp) { if (groups[tp].length) { out.push(groups[tp].shift()); added = true; } });
    }
    return out;
  }
  function pickQuestions(pool, n, avoidIds) {
    var avoid = {};
    avoidIds.forEach(function (id) { avoid[id] = true; });
    var fresh = pool.filter(function (q) { return !avoid[q.id]; });
    var seen = pool.filter(function (q) { return avoid[q.id]; });
    var chosen = spreadByTopic(fresh).concat(spreadByTopic(seen)).slice(0, n);
    return shuffle(chosen).map(function (q) { return { id: q.id, perm: shuffle([0, 1, 2, 3]) }; });
  }

  /* ---------- Flow ---------- */
  function go(screen) {
    S.screen = screen;
    persist();
    render(true);
  }

  function beginAttempt(serverRecent) {
    var key = lockKey(S.person.empId, S.testId, S.levelId);
    var localRecent = load(KEY.recent, {})[key] || [];
    var n = Math.min(C.questionsPerTest, bank().length);
    S.attempt = {
      id: makeId(),
      qs: pickQuestions(bank(), n, serverRecent.concat(localRecent)),
      answers: [],
      current: 0,
      pending: null,
      startedAt: Date.now(),
      langs: [S.lang]
    };
    S.result = null;
    go("quiz");
  }

  function finishAttempt() {
    var A = S.attempt, total = A.qs.length;
    var score = A.answers.filter(function (a) { return a === 0; }).length;
    var pass = score * 100 >= C.passPercent * total;
    var finishedAt = Date.now();
    var key = lockKey(S.person.empId, S.testId, S.levelId);
    var retakeFrom = pass ? null : new Date(finishedAt + C.retakeDays * DAY_MS).toISOString();

    S.result = {
      score: score, total: total, pass: pass,
      percent: Math.round((score / total) * 100),
      timeSec: Math.round((finishedAt - A.startedAt) / 1000),
      retakeFrom: retakeFrom,
      saveState: "saving"
    };
    setLocalLock(key, retakeFrom);

    var recent = load(KEY.recent, {});
    recent[key] = A.qs.map(function (q) { return q.id; }).concat(recent[key] || []).slice(0, 30);
    store(KEY.recent, recent);

    var payload = buildPayload(finishedAt);
    S.result.payload = payload; // kept so a reload can resend the exact same result
    go("result");
    sendResult(payload);
  }

  function buildPayload(finishedAt) {
    var A = S.attempt, test = findTest(S.testId), level = findLevel(S.levelId);
    var langs = A.langs.map(function (l) { return l === "hi" ? "Hindi" : "English"; });
    return {
      action: "submit",
      attemptId: A.id,
      person: {
        name: clean(S.person.name), designation: clean(S.person.designation), department: clean(S.person.department),
        empId: normId(S.person.empId), agency: clean(S.person.agency)
      },
      testId: S.testId, testName: test.name.en,
      levelId: S.levelId, levelName: level.name.en,
      language: langs.join(" + "),
      score: S.result.score, total: S.result.total,
      timeTakenSec: S.result.timeSec,
      startedAt: new Date(A.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      answers: A.qs.map(function (item, i) {
        var q = qById(item.id), chosen = A.answers[i];
        return { id: q.id, topic: q.topic, question: q.en.q, chosen: q.en.o[chosen], correct: q.en.o[0], ok: chosen === 0 };
      })
    };
  }

  function sendResult(payload) {
    apiPost(payload).then(function (res) {
      if (S.result && S.attempt && S.attempt.id === payload.attemptId) {
        S.result.saveState = "saved";
        if (!S.result.pass && res.retakeFrom) {
          S.result.retakeFrom = res.retakeFrom;
          setLocalLock(lockKey(payload.person.empId, payload.testId, payload.levelId), res.retakeFrom);
        }
        persist();
        if (S.screen === "result") render(false);
      }
    }).catch(function () {
      var box = load(KEY.outbox, []);
      if (!box.some(function (x) { return x.attemptId === payload.attemptId; })) box.push(payload);
      store(KEY.outbox, box);
      if (S.result && S.attempt && S.attempt.id === payload.attemptId) {
        S.result.saveState = "failed";
        persist();
        if (S.screen === "result") render(false);
      }
    });
  }

  /* ---------- Screens ---------- */
  var app = document.getElementById("app");

  function pageHead(title, desc, stepText) {
    return '<header class="page-head rise">' +
      (stepText ? '<p class="step">' + esc(stepText) + "</p>" : "") +
      '<h1 class="page-title" tabindex="-1">' + esc(title) + "</h1>" +
      (desc ? '<p class="page-desc">' + esc(desc) + "</p>" : "") +
      "</header>";
  }

  function field(id, label, control, hint) {
    return '<div class="field" data-field="' + id + '">' +
      '<label for="f-' + id + '">' + esc(label) + "</label>" + control +
      (hint ? '<p class="hint">' + esc(hint) + "</p>" : "") +
      '<p class="error" id="e-' + id + '" hidden>' + icon("alert") + "<span>" + esc(t("required")) + "</span></p>" +
      "</div>";
  }

  function screenDetails() {
    var p = S.person;
    var deptOptions = '<option value="">' + esc(t("departmentPh")) + "</option>" + C.departments.map(function (d) {
      return '<option value="' + esc(d.en) + '"' + (p.department === d.en ? " selected" : "") + ">" +
        esc(S.lang === "hi" && d.hi !== d.en ? d.hi + " (" + d.en + ")" : d.en) + "</option>";
    }).join("");
    var desList = '<datalist id="designations">' + C.designations.map(function (d) { return '<option value="' + esc(d) + '">'; }).join("") + "</datalist>";

    return pageHead(t("detailsTitle"), t("detailsDesc"), "1 / 4") +
      '<form class="card form rise" style="--i:1" id="details-form" novalidate>' +
      field("name", t("name"), '<input class="input" id="f-name" name="name" autocomplete="off" maxlength="80" placeholder="' + esc(t("namePh")) + '" value="' + esc(p.name) + '">') +
      '<div class="form-row">' +
      field("empId", t("empId"), '<input class="input" id="f-empId" name="empId" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" placeholder="' + esc(t("empIdPh")) + '" value="' + esc(p.empId) + '">') +
      field("designation", t("designation"), '<input class="input" id="f-designation" name="designation" list="designations" autocomplete="off" maxlength="60" placeholder="' + esc(t("designationPh")) + '" value="' + esc(p.designation) + '">' + desList) +
      "</div>" +
      field("department", t("department"), '<div class="select-wrap"><select class="input" id="f-department" name="department">' + deptOptions + "</select></div>") +
      field("agency", t("agency"), '<input class="input" id="f-agency" name="agency" autocomplete="off" maxlength="80" placeholder="' + esc(t("agencyPh")) + '" value="' + esc(p.agency) + '">', t("agencyHint")) +
      '<div class="actions"><button class="btn btn-primary btn-lg" type="submit">' + esc(t("next")) + icon("chevronRight") + "</button></div>" +
      "</form>";
  }

  function bindDetails() {
    var form = document.getElementById("details-form");
    ["name", "empId", "designation", "department", "agency"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      el.addEventListener(k === "department" ? "change" : "input", function () {
        S.person[k] = el.value;
        persist();
        if (clean(el.value)) showError(k, false);
      });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;
      ["name", "empId", "designation", "department", "agency"].forEach(function (k) {
        var ok = !!clean(S.person[k]);
        showError(k, !ok);
        if (!ok && !firstBad) firstBad = k;
      });
      if (firstBad) { document.getElementById("f-" + firstBad).focus(); return; }
      S.person.empId = normId(S.person.empId);
      go("test");
    });
  }
  function showError(k, on) {
    var err = document.getElementById("e-" + k), input = document.getElementById("f-" + k);
    if (!err) return;
    err.hidden = !on;
    if (on) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", "e-" + k); }
    else { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
  }

  function choiceButton(attrs, iconName, title, desc, badge, disabled) {
    return '<button type="button" class="choice" ' + attrs + (disabled ? " disabled" : "") + ">" +
      '<span class="choice-icon">' + icon(iconName) + "</span>" +
      '<span class="choice-text"><span class="choice-title">' + esc(title) + "</span>" +
      (desc ? '<span class="choice-desc">' + esc(desc) + "</span>" : "") + "</span>" +
      (badge ? '<span class="badge">' + esc(badge) + "</span>" : icon("chevronRight", "choice-arrow")) +
      "</button>";
  }

  function screenTest() {
    return pageHead(t("testTitle"), t("testDesc"), "2 / 4") +
      '<div class="choices">' + C.tests.map(function (x, i) {
        var hasBank = !!BANKS[x.id];
        var available = x.available && hasBank;
        return '<div class="rise" style="--i:' + (i + 1) + '">' +
          choiceButton('data-test="' + esc(x.id) + '"', x.id === "chiller" ? "snowflake" : "zap", x.name[S.lang], null, available ? null : t("comingSoon"), !available) +
          "</div>";
      }).join("") + "</div>" +
      '<div class="actions actions-split"><button class="btn btn-ghost" data-back="details">' + icon("chevronLeft") + esc(t("back")) + "</button></div>";
  }
  function bindTest() {
    app.querySelectorAll("[data-test]").forEach(function (b) {
      b.addEventListener("click", function () { S.testId = b.getAttribute("data-test"); go("level"); });
    });
  }

  function screenLevel() {
    return pageHead(t("levelTitle"), t("levelDesc"), "3 / 4") +
      '<div class="choices">' + C.levels.map(function (lv, i) {
        return '<div class="rise" style="--i:' + (i + 1) + '">' +
          choiceButton('data-level="' + esc(lv.id) + '"', lv.id === "operator" ? "wrench" : "clipboard", lv.name[S.lang], lv.desc[S.lang]) +
          "</div>";
      }).join("") + "</div>" +
      '<div class="actions actions-split"><button class="btn btn-ghost" data-back="test">' + icon("chevronLeft") + esc(t("back")) + "</button></div>";
  }
  function bindLevel() {
    app.querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { S.levelId = b.getAttribute("data-level"); go("ready"); });
    });
  }

  function langSeg(id) {
    return '<div class="seg" role="group" aria-label="' + esc(t("langLabel")) + '" id="' + id + '">' +
      '<button type="button" data-lang="en" lang="en" aria-pressed="' + (S.lang === "en") + '">English</button>' +
      '<button type="button" data-lang="hi" lang="hi" aria-pressed="' + (S.lang === "hi") + '">हिंदी</button>' +
      "</div>";
  }

  function screenReady() {
    var n = Math.min(C.questionsPerTest, bank().length), test = findTest(S.testId), level = findLevel(S.levelId);
    var rules = [
      t("rule1", { n: n }), t("rule2"), t("rule3"),
      t("rule4", { p: C.passPercent, m: passMark(n), n: n }),
      t("rule5", { p: C.passPercent, d: C.retakeDays }), t("rule6")
    ];
    return pageHead(t("readyTitle"), t("readyDesc"), "4 / 4") +
      '<section class="card rise" style="--i:1">' +
      '<dl class="summary">' +
      "<div><dt>" + esc(t("you")) + "</dt><dd>" + esc(clean(S.person.name)) + ' <span class="muted">· ' + esc(normId(S.person.empId)) + "</span></dd></div>" +
      "<div><dt>" + esc(t("test")) + "</dt><dd>" + esc(test.name[S.lang]) + "</dd></div>" +
      "<div><dt>" + esc(t("level")) + "</dt><dd>" + esc(level.name[S.lang]) + "</dd></div>" +
      "</dl></section>" +
      '<section class="card rise" style="--i:2"><ul class="rules">' + rules.map(function (r) {
        return "<li>" + icon("check") + "<span>" + esc(r) + "</span></li>";
      }).join("") + "</ul>" +
      '<div class="lang-pick"><span class="lang-pick-label">' + esc(t("testLang")) + "</span>" + langSeg("seg-ready") + "</div>" +
      "</section>" +
      '<div id="lock-area" aria-live="polite"></div>' +
      '<div class="actions actions-split rise" style="--i:3">' +
      '<button class="btn btn-ghost" data-back="level">' + icon("chevronLeft") + esc(t("back")) + "</button>" +
      '<button class="btn btn-primary btn-lg" id="start-btn">' + esc(t("start")) + icon("chevronRight") + "</button>" +
      "</div>";
  }
  function bindReady() {
    var btn = document.getElementById("start-btn");
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + esc(t("checking"));
      checkEligibility().then(function (r) {
        if (S.screen !== "ready") return;
        if (r.locked) {
          document.getElementById("lock-area").innerHTML =
            '<div class="alert alert-danger" role="alert">' + icon("lock") +
            '<div><p class="alert-title">' + esc(t("lockedTitle")) + "</p>" +
            '<p class="alert-desc">' + esc(t("lockedDesc", { date: fmtDate(r.retakeFrom) })) + " " +
            esc(t("lockedSame", { id: normId(S.person.empId) })) + "</p></div></div>";
          btn.innerHTML = esc(t("start")) + icon("chevronRight");
          btn.disabled = true;
          return;
        }
        beginAttempt(r.recent);
      });
    });
  }

  function screenQuiz() {
    var A = S.attempt, n = A.qs.length, item = A.qs[A.current], q = qById(item.id);
    var L = q[S.lang] || q.en, last = A.current === n - 1;
    var pct = Math.round((A.current / n) * 100);
    return '<section class="quiz">' +
      '<div class="progress">' +
      '<p class="progress-text">' + esc(t("questionOf", { i: A.current + 1, n: n })) + "</p>" +
      '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + A.current + '"><i style="width:' + pct + '%"></i></div>' +
      "</div>" +
      '<div class="card question-card" id="qcard">' +
      '<h1 class="question" tabindex="-1" id="qtext" lang="' + S.lang + '">' + esc(L.q) + "</h1>" +
      '<div class="options" role="radiogroup" aria-labelledby="qtext">' +
      item.perm.map(function (orig, i) {
        var sel = A.pending === i;
        return '<button type="button" class="opt" role="radio" aria-checked="' + sel + '" data-opt="' + i + '" lang="' + S.lang + '">' +
          '<span class="opt-key">' + "ABCD".charAt(i) + "</span>" +
          '<span class="opt-text">' + esc(L.o[orig]) + "</span></button>";
      }).join("") +
      "</div></div>" +
      '<div class="actions quiz-actions">' +
      '<button class="btn btn-primary btn-lg btn-block" id="next-btn"' + (A.pending == null ? " disabled" : "") + ">" +
      esc(last ? t("finish") : t("next")) + icon(last ? "check" : "chevronRight") + "</button>" +
      "</div></section>";
  }
  function bindQuiz() {
    var A = S.attempt;
    app.querySelectorAll("[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () {
        A.pending = Number(b.getAttribute("data-opt"));
        persist();
        app.querySelectorAll("[data-opt]").forEach(function (o) { o.setAttribute("aria-checked", String(o === b)); });
        document.getElementById("next-btn").disabled = false;
      });
    });
    document.getElementById("next-btn").addEventListener("click", function () {
      if (A.pending == null) return;
      A.answers[A.current] = A.qs[A.current].perm[A.pending]; // store the original option index (0 = correct)
      A.pending = null;
      A.current += 1;
      if (A.current >= A.qs.length) { finishAttempt(); return; }
      persist();
      render(true);
    });
  }

  function screenResult() {
    var R = S.result, A = S.attempt;
    var wrong = A.qs.map(function (item, i) { return { item: item, i: i, a: A.answers[i] }; }).filter(function (x) { return x.a !== 0; });
    var status =
      R.saveState === "saved" ? '<p class="save-state ok">' + icon("check") + esc(t("saved")) + "</p>" :
      R.saveState === "failed" ? '<p class="save-state warn">' + icon("cloud") + esc(t("saveFailed")) + "</p>" :
      '<p class="save-state"><span class="spinner" aria-hidden="true"></span>' + esc(t("saving")) + "</p>";

    var head =
      '<section class="card result-card rise" style="--i:1">' +
      '<div class="result-top">' +
      '<div class="metric"><span class="metric-label">' + esc(t("score")) + "</span>" +
      '<span class="metric-value">' + R.score + '<span class="unit">/' + R.total + "</span></span>" +
      '<span class="metric-note">' + R.percent + "% · " + esc(t("timeTaken")) + " " + fmtClock(R.timeSec) + "</span></div>" +
      (R.pass
        ? '<span class="badge badge-success">' + icon("check") + esc(t("passed")) + "</span>"
        : '<span class="badge badge-danger">' + icon("x") + esc(t("failed")) + "</span>") +
      "</div>" +
      '<p class="result-msg">' + esc(R.pass ? t("passMsg") : t("failMsg", { p: C.passPercent, date: fmtDate(R.retakeFrom) })) + "</p>" +
      '<p class="result-meta">' + esc(clean(S.person.name)) + " · " + esc(normId(S.person.empId)) + " · " +
      esc(findTest(S.testId).name[S.lang]) + " · " + esc(findLevel(S.levelId).name[S.lang]) + "</p>" +
      '<div aria-live="polite">' + status + "</div>" +
      "</section>";

    var list = wrong.length
      ? '<ol class="wrong-list">' + wrong.map(function (w, k) {
          var q = qById(w.item.id), L = q[S.lang] || q.en;
          return '<li class="rise" style="--i:' + Math.min(k + 2, 10) + '" lang="' + S.lang + '">' +
            '<p class="wq-num">' + esc(t("questionOf", { i: w.i + 1, n: A.qs.length })) + "</p>" +
            '<p class="wq-text">' + esc(L.q) + "</p>" +
            '<p class="ans ans-wrong">' + icon("x") + '<span><span class="ans-label">' + esc(t("yourAnswer")) + "</span>" + esc(L.o[w.a]) + "</span></p>" +
            '<p class="ans ans-right">' + icon("check") + '<span><span class="ans-label">' + esc(t("rightAnswer")) + "</span>" + esc(L.o[0]) + "</span></p>" +
            "</li>";
        }).join("") + "</ol>"
      : '<div class="empty">' + '<div class="empty-icon">' + icon("check") + "</div><h3>" + esc(t("wrongNone")) + "</h3></div>";

    return pageHead(t("resultTitle"), null, null) + head +
      '<section class="card rise" style="--i:2"><h2 class="card-title">' + esc(t("wrongTitle")) +
      (wrong.length ? ' <span class="count">' + wrong.length + "</span>" : "") + "</h2>" + list + "</section>" +
      '<div class="actions"><button class="btn btn-primary btn-lg" id="done-btn">' + esc(t("done")) + "</button></div>";
  }
  function bindResult() {
    document.getElementById("done-btn").addEventListener("click", function () {
      var lang = S.lang;
      S = freshState();
      S.lang = lang;
      go("details");
    });
  }

  /* ---------- Header: language toggle and timer ---------- */
  var headerSeg = document.getElementById("lang-seg");
  var timerEl = document.getElementById("timer");
  var timerText = document.getElementById("timer-text");

  function placeSeg(seg) {
    if (!seg) return;
    var active = seg.querySelector('[aria-pressed="true"]');
    if (!active) return;
    seg.style.setProperty("--x", active.offsetLeft + "px");
    seg.style.setProperty("--w", active.offsetWidth + "px");
    // First placement is instant; later changes glide.
    if (!seg.hasAttribute("data-ready")) requestAnimationFrame(function () { seg.setAttribute("data-ready", ""); });
  }
  function syncLangControls() {
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === S.lang));
    });
    document.querySelectorAll(".seg").forEach(placeSeg);
  }
  function setLang(lang) {
    if (lang === S.lang) return;
    S.lang = lang;
    if (S.screen === "quiz" && S.attempt && S.attempt.langs.indexOf(lang) < 0) S.attempt.langs.push(lang);
    persist();
    render(false);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]");
    if (b) { setLang(b.getAttribute("data-lang")); return; }
    var back = e.target.closest("[data-back]");
    if (back) go(back.getAttribute("data-back"));
  });

  function tick() {
    var on = S.screen === "quiz" && S.attempt;
    timerEl.hidden = !on;
    if (on) timerText.textContent = fmtClock((Date.now() - S.attempt.startedAt) / 1000);
  }
  setInterval(tick, 1000);

  window.addEventListener("beforeunload", function (e) {
    if (S.screen === "quiz") { e.preventDefault(); e.returnValue = t("leaveWarn"); return t("leaveWarn"); }
  });
  window.addEventListener("resize", function () { document.querySelectorAll(".seg").forEach(placeSeg); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { document.querySelectorAll(".seg").forEach(placeSeg); });

  /* ---------- Render ---------- */
  var SCREENS = {
    details: [screenDetails, bindDetails],
    test: [screenTest, bindTest],
    level: [screenLevel, bindLevel],
    ready: [screenReady, bindReady],
    quiz: [screenQuiz, bindQuiz],
    result: [screenResult, bindResult]
  };

  function guard() {
    // Fall back to a safe screen if saved state is incomplete (for example after a config change).
    if (S.screen !== "details" && !clean(S.person.empId)) S.screen = "details";
    if (["level", "ready", "quiz", "result"].indexOf(S.screen) >= 0 && !(S.testId && BANKS[S.testId])) S.screen = "test";
    if (["ready", "quiz", "result"].indexOf(S.screen) >= 0 && !(S.levelId && bank().length)) S.screen = "level";
    if (S.screen === "quiz" && !(S.attempt && S.attempt.qs && S.attempt.current < S.attempt.qs.length)) S.screen = "ready";
    if (S.screen === "result" && !(S.result && S.attempt)) S.screen = "details";
  }

  function render(newScreen) {
    guard();
    document.documentElement.lang = S.lang;
    document.title = t("appName") + " · Felix Plaza";
    document.getElementById("app-name").textContent = t("appName");
    document.body.setAttribute("data-screen", S.screen);
    var s = SCREENS[S.screen];
    app.innerHTML = s[0]();
    s[1]();
    syncLangControls();
    tick();
    if (newScreen) {
      window.scrollTo(0, 0);
      var h = app.querySelector("h1");
      if (h) h.focus({ preventScroll: true });
    } else {
      app.querySelectorAll(".rise").forEach(function (el) { el.classList.remove("rise"); });
    }
  }

  render(true);
  if (resumed) {
    var note = document.createElement("div");
    note.className = "toast";
    note.setAttribute("role", "status");
    note.innerHTML = icon("info") + "<span>" + esc(t("resumeNote")) + "</span>";
    document.body.appendChild(note);
    setTimeout(function () { note.remove(); }, 4000);
  }
  // Results stuck on this device from an earlier offline attempt.
  flushOutbox();
  // The result screen was reloaded before the save finished.
  if (S.screen === "result" && S.result && S.result.saveState === "saving" && S.result.payload) {
    sendResult(S.result.payload);
  }
})();
