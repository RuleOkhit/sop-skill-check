/*
  App settings. Edit here, then push to GitHub.
  backendUrl: the Google Apps Script web app URL (ends with /exec). See README.md.
*/
window.APP_CONFIG = {
  backendUrl: "https://script.google.com/macros/s/AKfycbzHh6_ikAfPQYQ1q_QIVrzMMJHE8H7tatQCGnfTvmYbIO1oNiNxApE_PsEyRH1N5Em9/exec",

  questionsPerTest: 15,
  passPercent: 60,     // below this = fail
  retakeDays: 3,       // wait after a fail, same test and level (also set in backend/Code.gs)
  dailyGapHours: 0,    // 0 = off. 24 = one test per day per employee ID (also set GAP_HOURS in backend/Code.gs)

  // Fixed list keeps the department-wise summary clean in Google Sheets.
  departments: [
    { en: "Engineering", hi: "इंजीनियरिंग" },
    { en: "Electrical", hi: "इलेक्ट्रिकल" },
    { en: "HVAC", hi: "HVAC" },
    { en: "Plumbing", hi: "प्लंबिंग" },
    { en: "Fire & Safety", hi: "फायर और सेफ्टी" },
    { en: "Housekeeping", hi: "हाउसकीपिंग" },
    { en: "Security", hi: "सिक्योरिटी" },
    { en: "Operations", hi: "ऑपरेशंस" },
    { en: "Other", hi: "अन्य" }
  ],

  // Suggestions only. Staff can type any designation.
  designations: ["GG Operator", "DG Operator", "MST", "Electrician", "Technician", "Shift Engineer", "Supervisor", "M&E Supervisor", "Engineer"],

  tests: [
    { id: "gas-generator", name: { en: "Gas Generator", hi: "गैस जनरेटर" }, short: "GG", available: true },
    { id: "chiller", name: { en: "Chiller", hi: "चिलर" }, short: "CH", available: false }
  ],

  levels: [
    {
      id: "operator",
      name: { en: "Operator / Technician", hi: "ऑपरेटर / टेक्नीशियन" },
      desc: { en: "Basic questions on daily work and safety", hi: "रोज़ के काम और सेफ्टी पर बेसिक सवाल" }
    },
    {
      id: "supervisor",
      name: { en: "Supervisor / Engineer", hi: "सुपरवाइज़र / इंजीनियर" },
      desc: { en: "Questions on limits, sequences and real situations", hi: "लिमिट, क्रम और असली स्थितियों पर सवाल" }
    }
  ]
};
