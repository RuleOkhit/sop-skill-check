# Felix Plaza SOP Skill Check

A short multiple choice test on our Standard Operating Procedures (SOPs), in English and Hindi.

- **Live test:** https://ruleokhit.github.io/sop-skill-check/
- **Results:** the Google Sheet "Felix Plaza SOP Skill Check results"

## How the test works

1. Staff enter their name, employee ID, designation, department and agency.
2. They choose the test (Gas Generator now, Chiller later) and their level:
   - **Operator / Technician**: basic questions on daily work and safety.
   - **Supervisor / Engineer**: limits, sequences and real situations.
3. 15 questions, 4 options each, one at a time. A clock in the top corner shows the time taken (no time limit).
4. English / हिंदी button at the top works at any time, even in the middle of the test.
5. At the end they see their score and only the questions they got wrong, with the correct answer.
6. Pass mark is 60% (9 of 15).
7. If someone scores below 60%, the same employee ID can take that test and level again only after 3 days. This is checked against the Google Sheet, so changing phones does not help. (A one-test-per-day rule is built in but switched off: set `dailyGapHours` in `js/config.js` and `GAP_HOURS` in `backend/Code.gs` to 24 and redeploy to use it.)

Each test picks 15 questions from a bank of 62 per level. Questions the person saw in their last attempts are skipped first, and the 15 are spread across topics (safety, pre-start, start, shutdown, trips, checks, records and so on). Answer options are shuffled every time.

If a staff member closes the page by mistake, the test continues from the same question when they open it again on the same phone.

## The Google Sheet

| Tab | What it shows |
|---|---|
| Summary | Totals, and pass rate and average score by test and level, by department, and by department + test + level |
| Results | One row per attempt (filter by any column) |
| Staff status | Each person's latest result per test and level, attempts, best score, and whether they are locked or can retake |
| Question analysis | Which questions are answered wrong most often (useful for training) |
| Agency summary | Attempts, pass rate and average score by agency |
| Answers | Every answer given, one row per question |

Do not rename the Results, Answers or Staff status tabs or reorder their columns: the backend writes to them.

## One-time backend setup (about 3 minutes)

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Delete what is in `Code.gs` and paste everything from [`backend/Code.gs`](backend/Code.gs). Save.
3. **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Press **Deploy**, then **Authorize access** and allow it with your Google account.
5. Copy the **Web app URL** (ends with `/exec`) and put it in `js/config.js` as `backendUrl`, then push.

After you change `Code.gs` later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the same URL keeps working.

## Common jobs

**Let someone take a test early:** in Apps Script, open `unlockRetake`, change the employee ID at the top, choose `unlockRetake` in the function menu and press **Run**. This clears both the 1-day and the 3-day wait for that person.

**Change pass mark, number of questions or wait times:** edit `js/config.js` (`passPercent`, `retakeDays`, `dailyGapHours`). If you change any of those three, change `PASS_PERCENT`, `RETAKE_DAYS` or `GAP_HOURS` in `backend/Code.gs` too and redeploy (Manage deployments → Edit → New version).

**Change the department list:** edit `departments` in `js/config.js`.

**Add the Chiller test:**
1. Copy `js/questions-gas-generator.js` to `js/questions-chiller.js`.
2. Change the last lines to `window.QUESTION_BANKS["chiller"] = { operator: operator, supervisor: supervisor };` and write the new questions (first option is always the correct one; keep IDs unique, for example `CO01`, `CS01`).
3. Add `<script src="js/questions-chiller.js"></script>` in `index.html` next to the Gas Generator one.
4. In `js/config.js`, set `available: true` for the Chiller test.

After any change, bump the `?v=1` numbers in `index.html` so phones load the new files.

## Notes

- The SOP sheet says battery voltage should be at least 26 V DC before a manual start, while the Operator Manual quick card says more than 24 V DC. The SOP says voltage is 415 V ± 5%, the manual says 415 ± 5 V. The questions avoid these conflicts; please correct the documents.
- This is a simple web page, so the questions and answers are visible to anyone who opens the page code. That is fine for a training check; do not use it for exams with serious consequences.
- The 3-day rule is checked against the Google Sheet by employee ID, so it works across phones. If the phone is offline, the phone's own record is used and the result is sent when it is back online.
