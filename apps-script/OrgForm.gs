/**
 * GNBYA Activities Guide: Organizations intake form (Google Apps Script)
 *
 * Lives in the same script project as Code.gs, in the PRODUCTION spreadsheet.
 * The website never loads this file; it lives in the repo so there's a record
 * of what runs inside the sheet.
 *
 * Run once:  createOrgForm()  builds the "GNBYA Organizations" form from the
 *                             site's organizations CSV and links it to this
 *                             spreadsheet as a tab named "Organizations".
 * Then:      backfillOrgs()   submits one response per organization in that
 *                             CSV so each has a real edit link, written into
 *                             the tab's Edit link column. Sends no email. Safe
 *                             to run again: organizations already in the form
 *                             are skipped.
 *
 * Every name here starts with ORG_ or org. Code.gs shares this project's
 * global scope, and a name declared twice stops the whole project loading,
 * Code.gs's form-submit trigger included.
 */

// =====================================================================
// SETTINGS: safe to edit. Change these, then save (Ctrl+S).
// =====================================================================

// The site's organizations CSV. Both the form's questions and the backfill
// read it, so the form can't drift from the data it was built for.
const ORG_CSV_URL =
  "https://if-phillip-break.github.io/gnbya-activities-app/data/organizations_placeholder_sheet.csv";

// How many organizations the CSV should hold. A different count stops both
// functions, so a half-downloaded or replaced file can't build a wrong form.
const ORG_EXPECTED_ROWS = 43;

const ORG_FORM_TITLE = "GNBYA Organizations";
const ORG_FORM_DESCRIPTION =
  "Tell families about your organization. This is what appears on the GNBYA " +
  "Activities Guide. After you submit, you can come back and edit your answers " +
  "at any time.";

// What the response tab is renamed to. Code.gs routes form submissions by tab
// name and handles only "Form Responses 1" and "Form Responses 2", so a tab
// called this is ignored by it.
const ORG_TAB_NAME = "Organizations";
const ORG_EDIT_LINK_HEADER = "Edit link";

// One entry per question, in order. The CSV's 16 headers come first, word for
// word, so the tab's columns carry the names the site already reads. For a
// checkbox question the options are the values the CSV actually uses; `order`
// only sets the order they're listed in (the order the site's filters use).
const ORG_QUESTIONS = [
  { title: "Organization name", type: "text", required: true },
  { title: "Website", type: "url", required: true,
    help: "The full address, starting with https://" },
  { title: "Min age", type: "age", help: "Youngest age you serve, as a number. Leave blank if you serve all ages." },
  { title: "Max age", type: "age", help: "Oldest age you serve, as a number. Leave blank if there's no upper limit." },
  { title: "Grade levels served", type: "checkbox",
    order: ["Infant/Toddler", "Pre-K", "Elementary", "Middle", "High", "Out of School", "All Ages"] },
  { title: "Early education services", type: "checkbox",
    order: ["Care Infant and Toddler", "Care Preschool", "Care School Age"] },
  { title: "Youth development services", type: "checkbox",
    order: ["Academic Achievement", "Health Safety & Wellness", "Mental Health Services", "Mentoring/Leadership",
      "Science/Nature", "Sports/Recreation", "Visual Arts/Performing Arts/Culture", "Vocational Readiness"] },
  { title: "Program year", type: "checkbox",
    order: ["Full Year", "Full Year With Limited Winter Programs", "School Year", "School Holidays/ Breaks", "Summer"] },
  { title: "Program model", type: "checkbox",
    order: ["Before School", "After School", "Full Day", "Partial Day", "Evening", "Weekend Only", "Summer Only"] },
  { title: "Cost", type: "checkbox",
    order: ["Free", "Fee", "Financial Assistance", "Slide Scale Based on Income", "Accepts Child Care Subsidies"] },
  { title: "Registration", type: "checkbox",
    order: ["Drop In", "Application Required", "Restricted Access"] },
  { title: "Transportation", type: "checkbox",
    order: ["Accessible From Public Transportation", "Provided To Our Site", "Provided From Our Program Site To Home"] },
  { title: "Location", type: "paragraph" },
  { title: "Schools served", type: "paragraph" },
  { title: "Schedule", type: "text" },
  { title: "Description", type: "paragraph" },
  // Not in the CSV. Required once the backfill is done: the CSV has no emails,
  // so the backfill leaves this blank and turns "required" on at the end.
  { title: "Listing manager email", type: "email", inCsv: false, requiredAfterBackfill: true,
    help: "Where we send the link to update this listing." },
  { title: "Organization status", type: "choice", inCsv: false, required: true,
    choices: ["Active", "Remove from site"], backfillValue: "Active",
    help: "Choose \"Remove from site\" to take your organization off the Activities Guide." },
];

// Checks shared by the form's validation and the backfill's pre-check, so a
// backfilled answer is held to the same rule a person typing it would be.
const ORG_AGE_PATTERN = "^[0-9]{1,2}$";
const ORG_URL_RE = /^https?:\/\/\S+$/i;

// =====================================================================
// Below here is the code. You shouldn't need to change anything.
// =====================================================================

/** Builds the form and links it to this spreadsheet. Run once. */
function createOrgForm() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty("ORG_FORM_ID");
  if (existing) {
    throw new Error("The Organizations form already exists (form ID " + existing + "). " +
      "Running this again would make a second form.");
  }
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(ORG_TAB_NAME)) {
    throw new Error('This spreadsheet already has a tab named "' + ORG_TAB_NAME + '". Nothing was created.');
  }
  const records = orgReadCsv_(); // checked before anything is created

  const form = FormApp.create(ORG_FORM_TITLE)
    .setDescription(ORG_FORM_DESCRIPTION)
    .setAllowResponseEdits(true)
    .setCollectEmail(false);
  ORG_QUESTIONS.forEach((q) => orgAddQuestion_(form, q, records));

  // Saved before linking, so even if linking fails a rerun can't make a
  // second form.
  props.setProperty("ORG_FORM_ID", form.getId());

  // The new tab gets the next free "Form Responses N" name. Rename it before
  // any response can arrive, so Code.gs never mistakes it for one of its own.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  const tab = orgFindLinkedTab_(ss, form);
  const linkedAs = tab.getName();
  tab.setName(ORG_TAB_NAME);

  Logger.log("Created \"" + ORG_FORM_TITLE + "\" with " + ORG_QUESTIONS.length + " questions. " +
    "Linked as \"" + linkedAs + "\", renamed to \"" + ORG_TAB_NAME + "\".\n" +
    "Edit the form: " + form.getEditUrl() + "\nShare with organizations: " + form.getPublishedUrl());
}

/**
 * One response per CSV organization, each with its own edit link. Every row is
 * checked before anything is submitted, so bad data stops the run with nothing
 * sent. Organizations already in the form are skipped, so a run that stopped
 * part way can simply be run again.
 */
function backfillOrgs() {
  const formId = PropertiesService.getScriptProperties().getProperty("ORG_FORM_ID");
  if (!formId) throw new Error("Run createOrgForm() first.");
  const form = FormApp.openById(formId);
  const tab = SpreadsheetApp.getActive().getSheetByName(ORG_TAB_NAME);
  if (!tab) throw new Error('No tab named "' + ORG_TAB_NAME + '". Was it renamed?');
  const items = orgItemsByTitle_(form);
  const records = orgReadCsv_();

  const problems = [];
  const planned = records.map((rec, i) => orgPlanResponse_(rec, items, problems, i + 2));
  if (problems.length) throw new Error("Nothing was submitted. Fix these in the CSV first:\n" + problems.join("\n"));

  const done = orgSubmittedNames_(form, items);
  let submitted = 0, skipped = 0;
  planned.forEach((p) => {
    if (done.has(orgNorm_(p.name))) { skipped++; return; }
    const response = form.createResponse();
    p.answers.forEach((a) => response.withItemResponse(a));
    response.submit();
    done.add(orgNorm_(p.name));
    submitted++;
  });

  const links = orgWriteEditLinks_(tab, form, items);
  // getItems() hands back generic Items, which have no setRequired(); only the
  // typed item does.
  items["Listing manager email"].asTextItem().setRequired(true);

  Logger.log("Submitted " + submitted + ", skipped " + skipped + " already in the form. " +
    "Wrote " + links.written + " edit link(s)." +
    (links.unmatched.length ? " No single response for: " + links.unmatched.join(", ") : "") +
    " \"Listing manager email\" is now required.");
}

// ---------- helpers ----------

/** The CSV as records keyed by header, after checking it's the CSV this form is built for. */
function orgReadCsv_() {
  const res = UrlFetchApp.fetch(ORG_CSV_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error("Couldn't download the organizations CSV (HTTP " + res.getResponseCode() + "): " + ORG_CSV_URL);
  }
  const rows = Utilities.parseCsv(res.getContentText("UTF-8"))
    .filter((r) => r.some((c) => String(c).trim() !== ""));
  const headers = rows[0].map((h) => String(h).trim());
  const expected = ORG_QUESTIONS.filter((q) => q.inCsv !== false).map((q) => q.title);
  if (headers.join("|") !== expected.join("|")) {
    throw new Error("The CSV's columns aren't the ones this form is built for.\nExpected: " +
      expected.join(", ") + "\nFound:    " + headers.join(", "));
  }
  const records = rows.slice(1).map((r) => {
    const rec = {};
    headers.forEach((h, i) => (rec[h] = String(r[i] == null ? "" : r[i]).trim()));
    return rec;
  });
  if (records.length !== ORG_EXPECTED_ROWS) {
    throw new Error("Expected " + ORG_EXPECTED_ROWS + " organizations in the CSV, found " + records.length +
      ". If that's right, change ORG_EXPECTED_ROWS at the top of this file.");
  }
  return records;
}

// The site keeps several values in one cell, separated by semicolons.
function orgSplit_(cell) {
  return String(cell).split(";").map((s) => s.trim()).filter(Boolean);
}

/** A checkbox question's options: the values the CSV uses, in the question's `order`. */
function orgChoicesFor_(q, records) {
  const used = new Set();
  records.forEach((rec) => orgSplit_(rec[q.title]).forEach((v) => used.add(v)));
  const known = q.order.filter((v) => used.has(v));
  const extra = [...used].filter((v) => q.order.indexOf(v) === -1).sort();
  return known.concat(extra);
}

function orgAddQuestion_(form, q, records) {
  let item;
  if (q.type === "checkbox") {
    item = form.addCheckboxItem().setChoiceValues(orgChoicesFor_(q, records));
  } else if (q.type === "choice") {
    item = form.addMultipleChoiceItem().setChoiceValues(q.choices);
  } else if (q.type === "paragraph") {
    item = form.addParagraphTextItem();
  } else {
    item = form.addTextItem();
    const v = FormApp.createTextValidation();
    if (q.type === "url") item.setValidation(v.setHelpText("Enter a full web address, starting with https://").requireTextIsUrl().build());
    if (q.type === "email") item.setValidation(v.setHelpText("Enter an email address.").requireTextIsEmail().build());
    if (q.type === "age") item.setValidation(v.setHelpText("Enter a whole number from 0 to 99.").requireTextMatchesPattern(ORG_AGE_PATTERN).build());
  }
  item.setTitle(q.title).setRequired(q.required === true);
  if (q.help) item.setHelpText(q.help);
  else if (q.type === "checkbox") item.setHelpText("Tick all that apply.");
}

/**
 * The tab this form writes into. With several forms linked, the
 * spreadsheet-wide getFormUrl() could name any of them, so ask each tab. A
 * newly linked tab can take a moment to appear, hence the retries.
 */
function orgFindLinkedTab_(ss, form) {
  for (let attempt = 0; attempt < 10; attempt++) {
    SpreadsheetApp.flush();
    const tab = ss.getSheets().find((s) => {
      const url = s.getFormUrl();
      return url && FormApp.openByUrl(url).getId() === form.getId();
    });
    if (tab) return tab;
    Utilities.sleep(1000);
  }
  throw new Error("The form was created and linked, but its tab didn't appear. " +
    'Find the newest "Form Responses" tab and rename it "' + ORG_TAB_NAME + '" by hand before sharing the form.');
}

/**
 * The form's items by title, after checking every question this file expects
 * is there. These are generic Items: anything beyond getId()/getTitle() needs
 * the typed item first, e.g. asTextItem().setRequired().
 */
function orgItemsByTitle_(form) {
  const byTitle = {};
  form.getItems().forEach((item) => (byTitle[item.getTitle()] = item));
  const missing = ORG_QUESTIONS.map((q) => q.title).filter((t) => !byTitle[t]);
  if (missing.length) throw new Error("The form is missing question(s): " + missing.join(", ") + ". Was it edited?");
  return byTitle;
}

/**
 * One organization's answers, or problems describing why it can't be sent.
 * Blank cells are left unanswered rather than sent as empty answers.
 */
function orgPlanResponse_(rec, items, problems, csvLine) {
  const name = rec["Organization name"];
  const answers = [];
  const where = "CSV line " + csvLine + " (" + (name || "no name") + ")";
  ORG_QUESTIONS.forEach((q) => {
    const value = q.inCsv === false ? (q.backfillValue || "") : rec[q.title];
    if (!value) {
      if (q.required) problems.push(where + ": " + q.title + " is required but blank.");
      return;
    }
    const item = items[q.title];
    if (q.type === "checkbox") {
      const values = orgSplit_(value);
      const allowed = item.asCheckboxItem().getChoices().map((c) => c.getValue());
      const unknown = values.filter((v) => allowed.indexOf(v) === -1);
      if (unknown.length) { problems.push(where + ": " + q.title + " has value(s) the form doesn't offer: " + unknown.join(", ")); return; }
      answers.push(item.asCheckboxItem().createResponse(values));
    } else if (q.type === "choice") {
      answers.push(item.asMultipleChoiceItem().createResponse(value));
    } else if (q.type === "paragraph") {
      answers.push(item.asParagraphTextItem().createResponse(value));
    } else {
      if (q.type === "url" && !ORG_URL_RE.test(value)) { problems.push(where + ": Website isn't a full https:// address: " + value); return; }
      if (q.type === "age" && !new RegExp(ORG_AGE_PATTERN).test(value)) { problems.push(where + ": " + q.title + " isn't a whole number 0-99: " + value); return; }
      answers.push(item.asTextItem().createResponse(value));
    }
  });
  return { name: name, answers: answers };
}

// Names compared ignoring case and extra spaces.
function orgNorm_(s) {
  return String(s).trim().replace(/\s+/g, " ").toLowerCase();
}

/** Organization names that already have a response in the form. */
function orgSubmittedNames_(form, items) {
  const nameId = items["Organization name"].getId();
  const names = new Set();
  form.getResponses().forEach((r) =>
    r.getItemResponses().forEach((ir) => {
      if (ir.getItem().getId() === nameId) names.add(orgNorm_(ir.getResponse()));
    }));
  return names;
}

/**
 * Writes each response's edit link into its own row's Edit link cell, one cell
 * at a time. Never overwrites a link already there, and never touches a row
 * with no Timestamp (typed in by hand, so it has no response). A row is only
 * filled when exactly one response carries its organization name.
 */
function orgWriteEditLinks_(tab, form, items) {
  const nameId = items["Organization name"].getId();
  const linksByName = {};
  const responses = form.getResponses();
  responses.forEach((r) => {
    const ir = r.getItemResponses().find((x) => x.getItem().getId() === nameId);
    if (!ir) return;
    const key = orgNorm_(ir.getResponse());
    (linksByName[key] = linksByName[key] || []).push(r.getEditResponseUrl());
  });

  // Responses reach the tab a moment after they're submitted.
  let values;
  for (let attempt = 0; attempt < 30; attempt++) {
    SpreadsheetApp.flush();
    values = tab.getDataRange().getValues();
    const stamped = values.slice(1).filter((row) => String(row[0]).trim() !== "").length;
    if (stamped >= responses.length) break;
    Utilities.sleep(1000);
  }

  const headers = values[0].map((h) => String(h).trim());
  const nameCol = headers.indexOf("Organization name");
  if (nameCol === -1) throw new Error('The "' + ORG_TAB_NAME + '" tab has no "Organization name" column.');
  let linkCol = headers.findIndex((h) => orgNorm_(h) === orgNorm_(ORG_EDIT_LINK_HEADER));
  if (linkCol === -1) {
    // First run: put Edit link in the column straight after the last question.
    linkCol = headers.indexOf("Organization status") + 1;
    if (linkCol === 0) throw new Error('The "' + ORG_TAB_NAME + '" tab has no "Organization status" column.');
    if (linkCol < headers.length && headers[linkCol] !== "") {
      throw new Error("The column after Organization status is \"" + headers[linkCol] + "\", not empty. No edit links were written.");
    }
    tab.getRange(1, linkCol + 1).setValue(ORG_EDIT_LINK_HEADER);
  }

  let written = 0;
  const unmatched = [];
  values.slice(1).forEach((row, i) => {
    if (String(row[0]).trim() === "") return; // typed in by hand: leave alone
    if (linkCol < row.length && String(row[linkCol]).trim() !== "") return; // never overwrite
    const found = linksByName[orgNorm_(row[nameCol])] || [];
    if (found.length !== 1) { unmatched.push(String(row[nameCol]) || "row " + (i + 2)); return; }
    tab.getRange(i + 2, linkCol + 1).setValue(found[0]);
    written++;
  });
  return { written: written, unmatched: unmatched };
}
