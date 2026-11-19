/**
 * GNBYA Activities Guide: intake form helper (Google Apps Script)
 *
 * Set up for the PRODUCTION intake spreadsheet (column letters in SETTINGS).
 * The website never loads this file; it lives in the repo so there's a record
 * of what runs inside the sheet.
 *
 * What it does on every form submission:
 *   - writes the response's "edit your listing" link into the Edit link column
 *   - new listing  -> emails the listing manager their edit link
 *   - edited one   -> emails staff that an organization changed its listing
 * It never touches the Show on site column. Approving a listing stays a staff
 * decision.
 *
 * On every Organizations form submission (that form and tab are made by
 * OrgForm.gs; its columns are found by header, not letter):
 *   - writes the response's edit link into the tab's Edit link column
 *   - new profile  -> thanks the listing manager, tells staff it's waiting
 *                     for approval
 *   - edited one   -> tells staff the organization changed
 *   - no listing manager email (one of the backfilled rows) -> nothing at all
 *
 * On every "Get my listing links" submission (a second form, same trigger):
 *   - address manages listings or organization profiles -> emails that
 *     address its edit links
 *   - it doesn't               -> emails staff; the person asking gets nothing
 *     (the form's confirmation is the same either way)
 *
 * Rows with a blank Timestamp were typed in by hand and have no form response.
 * The script never writes to them, never matches them, and never emails about
 * them.
 *
 * Run once:  setup()            (creates the form-submit trigger)
 * Optional:  backfillEditLinks() (fills Edit link for existing rows, no emails)
 */

// =====================================================================
// SETTINGS: safe to edit. Change these, then save (Ctrl+S).
// =====================================================================

// Where staff "a listing was edited" emails go.
const STAFF_EMAIL = "philliptrah2015@gmail.com";

// The tab the form writes into.
const RESPONSES_SHEET_NAME = "Activities";

// Column letters in that tab.
const TIMESTAMP_COLUMN = "A";
const MANAGER_EMAIL_COLUMN = "W";
const SHOW_ON_SITE_COLUMN = "Z"; // read-only for this script: never written
const EDIT_LINK_COLUMN = "AA";

// Header text expected in row 1. The script checks them before writing, so a
// column that moved (adding a form question can shift columns) stops the
// script instead of letting it write into the wrong place.
const EDIT_LINK_HEADER = "Edit link";
const SHOW_ON_SITE_HEADER = "Show on site";

// Row-1 headers used to name the listing in the staff email.
const ORGANIZATION_HEADER = "Organization Name";
const PROGRAM_HEADER = "Program Name";

// Email wording. These placeholders are filled in automatically:
//   {organization} {program} {editLink} {sheetLink} {row}
const NEW_LISTING_SUBJECT = "Thanks for submitting {program} to the GNBYA Activities Guide";
const NEW_LISTING_BODY =
  "Thank you for submitting {program} ({organization}) to the GNBYA Activities Guide.\n\n" +
  "Our staff will review your listing before it appears on the site.\n\n" +
  "To update your listing at any time, use this link (keep it, it's unique to your listing):\n" +
  "{editLink}\n\n" +
  "GNBYA";

const EDITED_LISTING_SUBJECT = "Listing edited: {organization} – {program}";
const EDITED_LISTING_BODY =
  "{organization} edited their listing for {program}.\n\n" +
  "Review the row in the sheet (row {row}):\n" +
  "{sheetLink}\n\n" +
  "If it's already ticked Show on site, the edit is already live on the site.";

// Sent to staff when the script can't do its job (no match, moved columns, ...).
const PROBLEM_SUBJECT = "Activities Guide form script needs a look";

// ----- "Get my listing links" form -----

// The tab that form writes into, and the column holding the address asked about.
const LOOKUP_SHEET_NAME = "Link Requests";
const LOOKUP_EMAIL_COLUMN = "B";

// Sent to the address asked about, only when it manages at least one listing.
// {listings} is replaced with one LOOKUP_LINE per listing.
const LOOKUP_SUBJECT = "Your GNBYA Activities Guide listing links";
const LOOKUP_BODY =
  "Here are the links to update your listings on the GNBYA Activities Guide:\n\n" +
  "{listings}\n" +
  "Each link is unique to its listing, so please don't share them.\n\n" +
  "GNBYA";
// Placeholders: {organization} {program} {editLink}
const LOOKUP_LINE = "{organization} – {program}\n{editLink}\n";

// Sent to staff when the address asked about manages no listings. The person
// asking is never told either way.
const LOOKUP_NO_MATCH_SUBJECT = "Listing links requested for an unknown email";
const LOOKUP_NO_MATCH_BODY =
  "{requester} asked for their listing links, but no listing has that listing manager email.\n\n" +
  "They weren't sent anything. You may want to follow up. The listings sheet:\n" +
  "{sheetLink}";

// At most one lookup email per address in this many minutes, so the form
// can't be used to flood someone's inbox (or staff's). 0 turns this off.
const LOOKUP_COOLDOWN_MINUTES = 10;

// ----- Organizations form -----

// The tab name (ORG_TAB_NAME) and the Edit link header (ORG_EDIT_LINK_HEADER)
// come from OrgForm.gs, which made that form and tab. Columns there are found
// by these row-1 headers, not by letter.
const ORG_NAME_HEADER = "Organization name";
const ORG_MANAGER_EMAIL_HEADER = "Listing manager email";
const ORG_STATUS_HEADER = "Organization status";

// Email wording. Placeholders: {organization} {editLink} {sheetLink} {row} {status}
const ORG_NEW_SUBJECT = "Thanks for adding {organization} to the GNBYA Activities Guide";
const ORG_NEW_BODY =
  "Thank you for adding {organization} to the GNBYA Activities Guide.\n\n" +
  "Our staff will review it before it appears on the site.\n\n" +
  "To update your organization's profile at any time, use this link (keep it, it's unique to your organization):\n" +
  "{editLink}\n\n" +
  "GNBYA";

const ORG_WAITING_SUBJECT = "New organization waiting for approval: {organization}";
const ORG_WAITING_BODY =
  "{organization} submitted an organization profile.\n\n" +
  "Review the row in the sheet (row {row}), and tick Show on site to publish it:\n" +
  "{sheetLink}";

const ORG_EDITED_SUBJECT = "Organization edited: {organization}";
const ORG_EDITED_BODY =
  "{organization} edited their organization profile.\n\n" +
  "Organization status: {status}\n\n" +
  "Review the row in the sheet (row {row}):\n" +
  "{sheetLink}\n\n" +
  "If it's already ticked Show on site, the edit is already live on the site. " +
  "\"Remove from site\" takes it off the site straight away.";

// How organization profiles are labelled in "Get my listing links" emails.
const ORG_LOOKUP_LABEL = "Organization profile";

// =====================================================================
// Below here is the code. You shouldn't need to change anything.
// =====================================================================

/** Run this once from the editor. Safe to run again: it never makes duplicates. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  responsesFormUrl_(); // throws if the listings tab isn't linked to a form
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "handleFormSubmit")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("handleFormSubmit").forSpreadsheet(ss).onFormSubmit().create();
  Logger.log("Form-submit trigger installed.");
}

/**
 * Installable "On form submit" handler. One trigger fires for every form
 * linked to this spreadsheet, so route on the tab the response landed in
 * before doing anything else.
 */
function handleFormSubmit(e) {
  // A burst of submissions shouldn't race each other over the same columns.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!e || !e.range) throw new Error("Run setup() and submit the form. Don't run this function directly.");
    const name = e.range.getSheet().getName();
    if (name === RESPONSES_SHEET_NAME) handleListingSubmit_(e);
    else if (name === LOOKUP_SHEET_NAME) handleLookupSubmit_(e);
    // typeof, so listings and lookups keep working if OrgForm.gs is ever removed.
    else if (typeof ORG_TAB_NAME !== "undefined" && name === ORG_TAB_NAME) handleOrgSubmit_(e);
    // Any other linked form: not ours.
  } finally {
    lock.releaseLock();
  }
}

/** A program listing was submitted or edited. Fires for new and edited responses. */
function handleListingSubmit_(e) {
  const sheet = e.range.getSheet();
  checkHeaders_(sheet);

  // Forms reports the row it wrote, and for an edit that's the same row
  // it updated, so we never have to search for the row.
  const row = e.range.getRow();
  if (isHandTyped_(sheet.getRange(TIMESTAMP_COLUMN + row).getValue())) {
    Logger.log("Row " + row + " has no Timestamp (typed in by hand): left alone.");
    return;
  }
  const editCell = sheet.getRange(EDIT_LINK_COLUMN + row);
  const hadLink = String(editCell.getValue()).trim() !== "";
  const listing = describeRow_(sheet, row);

  const response = findResponseForRow_(sheet, row, formResponsesIndex_());
  if (!response) {
    // An edited row already has its link, so losing the match is harmless.
    // A new row without a link has to be fixed by hand.
    if (!hadLink) notifyProblem_("Couldn't match row " + row + " to a form response, so no edit link was written.", sheet, row);
    return;
  }
  const editLink = response.getEditResponseUrl();
  editCell.setValue(editLink);

  if (!hadLink) {
    const to = String(sheet.getRange(MANAGER_EMAIL_COLUMN + row).getValue()).trim();
    if (!isEmail_(to)) {
      notifyProblem_("Row " + row + " has no valid listing manager email (\"" + to + "\"), so the thank-you wasn't sent.", sheet, row);
      return;
    }
    sendTemplate_(to, NEW_LISTING_SUBJECT, NEW_LISTING_BODY, listing, editLink, sheet, row);
  } else {
    sendTemplate_(STAFF_EMAIL, EDITED_LISTING_SUBJECT, EDITED_LISTING_BODY, listing, editLink, sheet, row);
  }
}

/**
 * An organization profile was submitted or edited. Same shape as a listing,
 * but columns are found by header, and it never reads or writes Show on site.
 */
function handleOrgSubmit_(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const cols = orgColumns_(sheet);
  if (isHandTyped_(sheet.getRange(row, cols.timestamp || 1).getValue())) {
    Logger.log("Organizations row " + row + " has no Timestamp (typed in by hand): left alone.");
    return;
  }
  if (!cols.email) {
    notifyProblem_('Nothing was done for Organizations row ' + row + ': the tab has no "' +
      ORG_MANAGER_EMAIL_HEADER + '" column. Was the question renamed?', sheet, row);
    return;
  }
  // The backfilled organizations have no email (the CSV had none). This is
  // checked before anything that could write, email or throw, so their
  // submissions stay silent even before the Edit link column exists.
  const to = String(sheet.getRange(row, cols.email).getValue()).trim();
  if (to === "") {
    Logger.log("Organizations row " + row + " has no listing manager email (a backfilled organization): nothing done.");
    return;
  }
  if (!cols.link) {
    notifyProblem_('Nothing was written for Organizations row ' + row + ': the tab has no "' +
      ORG_EDIT_LINK_HEADER + '" column.', sheet, row);
    return;
  }
  const formUrl = sheet.getFormUrl();
  if (!formUrl) {
    notifyProblem_('Nothing was written for Organizations row ' + row + ": the tab isn't linked to a form.", sheet, row);
    return;
  }

  const editCell = sheet.getRange(row, cols.link);
  const hadLink = String(editCell.getValue()).trim() !== "";
  const cell = (col) => (col ? String(sheet.getRange(row, col).getValue()).trim() : "");
  const values = {
    organization: cell(cols.name) || "(no organization name)",
    status: cell(cols.status) || "(blank)",
    row: row,
    sheetLink: sheetLink_(sheet, row),
  };

  const response = findResponseForRow_(sheet, row, formResponsesIndex_(formUrl), cols.email);
  if (!response) {
    // As for listings: an edited row keeps its link, a new one needs fixing by hand.
    if (!hadLink) notifyProblem_("Couldn't match Organizations row " + row + " to a form response, so no edit link was written.", sheet, row);
    return;
  }
  values.editLink = response.getEditResponseUrl();
  editCell.setValue(values.editLink);

  if (hadLink) {
    MailApp.sendEmail(STAFF_EMAIL, fill_(ORG_EDITED_SUBJECT, values), fill_(ORG_EDITED_BODY, values));
    return;
  }
  if (isEmail_(to)) {
    MailApp.sendEmail(to, fill_(ORG_NEW_SUBJECT, values), fill_(ORG_NEW_BODY, values));
  } else {
    notifyProblem_("Organizations row " + row + " has no valid listing manager email (\"" + to + "\"), so the thank-you wasn't sent.", sheet, row);
  }
  // Staff hear about it either way: it's waiting behind Show on site.
  MailApp.sendEmail(STAFF_EMAIL, fill_(ORG_WAITING_SUBJECT, values), fill_(ORG_WAITING_BODY, values));
}

/**
 * Someone asked for their listing links. Read-only: writes nothing to either
 * tab. Links only ever go to the address that was asked about, and the person
 * asking sees the same confirmation either way, so the form can't be used to
 * find out whether an address has listings.
 */
function handleLookupSubmit_(e) {
  const lookupSheet = e.range.getSheet();
  const requester = String(lookupSheet.getRange(LOOKUP_EMAIL_COLUMN + e.range.getRow()).getValue()).trim();
  if (!isEmail_(requester)) {
    Logger.log("Lookup with no valid email (\"" + requester + "\"): ignored.");
    return;
  }
  if (!claimLookupCooldown_(requester)) {
    Logger.log("Lookup for " + requester + " is within the cooldown: ignored.");
    return;
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(RESPONSES_SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + RESPONSES_SHEET_NAME + '".');
  checkHeaders_(sheet); // a moved column must not mail the wrong cells
  const result = findListingsForEmail_(sheet.getDataRange().getValues(), {
    timestamp: columnIndex_(sheet, TIMESTAMP_COLUMN),
    email: columnIndex_(sheet, MANAGER_EMAIL_COLUMN),
    link: columnIndex_(sheet, EDIT_LINK_COLUMN),
  }, requester);

  const orgs = findOrgProfilesForEmail_(requester);

  if (result.missingLinkRows.length) {
    notifyProblem_(requester + " asked for their listing links, but row(s) " +
      result.missingLinkRows.join(", ") + " have no Edit link, so they were left out. " +
      "Run backfillEditLinks, then send those links by hand.", sheet, null);
  }
  if (orgs && orgs.missingLinkRows.length) {
    notifyProblem_(requester + " asked for their listing links, but Organizations row(s) " +
      orgs.missingLinkRows.join(", ") + " have no Edit link, so they were left out. " +
      "Run backfillOrgs, then send those links by hand.", orgs.sheet, null);
  }
  const found = result.listings.concat(orgs ? orgs.listings : []);
  if (found.length) {
    const lines = found.map((l) => fill_(LOOKUP_LINE, l)).join("\n");
    MailApp.sendEmail(requester, LOOKUP_SUBJECT, fill_(LOOKUP_BODY, { listings: lines }));
  } else if (!result.missingLinkRows.length && !(orgs && orgs.missingLinkRows.length)) {
    MailApp.sendEmail(STAFF_EMAIL, fill_(LOOKUP_NO_MATCH_SUBJECT, { requester: requester }),
      fill_(LOOKUP_NO_MATCH_BODY, { requester: requester, sheetLink: sheetLink_(sheet, null) }));
  }
}

/**
 * Pure lookup over the listings tab's values (row 1 = headers). Returns the
 * listings managed by `email` that have an Edit link, and the sheet row numbers
 * of matches that don't. Email comparison ignores case and all spaces. Rows
 * typed in by hand (blank Timestamp) are skipped: they have no edit link, and
 * no backfill will ever give them one.
 */
function findListingsForEmail_(values, cols, email) {
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  const headers = values[0].map((h) => String(h));
  const at = (name) => headers.findIndex((h) => sameHeader_(h, name));
  const org = at(ORGANIZATION_HEADER), prog = at(PROGRAM_HEADER);
  const want = norm(email);
  const listings = [], missingLinkRows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (isHandTyped_(r[cols.timestamp])) continue;
    if (want === "" || norm(r[cols.email]) !== want) continue;
    const editLink = String(r[cols.link]).trim();
    if (!editLink) { missingLinkRows.push(i + 1); continue; }
    listings.push({
      organization: (org === -1 ? "" : String(r[org]).trim()) || "(no organization name)",
      program: (prog === -1 ? "" : String(r[prog]).trim()) || "(no program name)",
      editLink: editLink,
    });
  }
  return { listings: listings, missingLinkRows: missingLinkRows };
}

/**
 * Organization profiles managed by `email`, for the lookup: the same search as
 * listings, over the Organizations tab, labelled "Organization profile". Null
 * when there's no Organizations tab. A missing column never stops listing links
 * going out: staff are told, and organizations are left out of that email.
 */
function findOrgProfilesForEmail_(email) {
  if (typeof ORG_TAB_NAME === "undefined") return null;
  const sheet = SpreadsheetApp.getActive().getSheetByName(ORG_TAB_NAME);
  if (!sheet) return null;
  const cols = orgColumns_(sheet);
  if (!cols.email || !cols.link) {
    notifyProblem_('The "' + ORG_TAB_NAME + '" tab has no "' +
      (cols.email ? ORG_EDIT_LINK_HEADER : ORG_MANAGER_EMAIL_HEADER) +
      '" column, so organization profiles were left out of a listing-links lookup.', sheet, null);
    return null;
  }
  const result = findListingsForEmail_(sheet.getDataRange().getValues(), {
    timestamp: (cols.timestamp || 1) - 1,
    email: cols.email - 1,
    link: cols.link - 1,
  }, email);
  result.listings.forEach((l) => (l.program = ORG_LOOKUP_LABEL));
  result.sheet = sheet;
  return result;
}

// True if this address may get a lookup email now (and starts its cooldown).
function claimLookupCooldown_(email) {
  if (!(LOOKUP_COOLDOWN_MINUTES > 0)) return true;
  const cache = CacheService.getScriptCache();
  const key = "lookup:" + email.replace(/\s+/g, "").toLowerCase();
  if (cache.get(key)) return false;
  cache.put(key, "1", Math.min(21600, Math.round(LOOKUP_COOLDOWN_MINUTES * 60)));
  return true;
}

/** Fills Edit link for existing rows that don't have one. Sends no emails. */
function backfillEditLinks() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(RESPONSES_SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + RESPONSES_SHEET_NAME + '".');
  checkHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const index = formResponsesIndex_();
  const links = sheet.getRange(EDIT_LINK_COLUMN + "2:" + EDIT_LINK_COLUMN + lastRow).getValues();
  const stamps = sheet.getRange(TIMESTAMP_COLUMN + "2:" + TIMESTAMP_COLUMN + lastRow).getValues();
  let filled = 0, unmatched = [];
  links.forEach((cell, i) => {
    const row = i + 2;
    if (String(cell[0]).trim() !== "") return; // never overwrite an existing link
    if (isHandTyped_(stamps[i][0])) return; // no form response to link to
    const response = findResponseForRow_(sheet, row, index);
    if (!response) { unmatched.push(row); return; }
    // One cell at a time. Writing the whole column back would also rewrite
    // every row it skipped, flattening any formula or value typed there.
    sheet.getRange(EDIT_LINK_COLUMN + row).setValue(response.getEditResponseUrl());
    filled++;
  });
  Logger.log("Filled " + filled + " edit link(s)." +
    (unmatched.length ? " Couldn't match rows: " + unmatched.join(", ") : ""));
}

// ---------- helpers ----------

// Form responses grouped by timestamp to the second. That's the precision the
// sheet keeps, and an edit updates the response's timestamp and the row's
// together, so they still line up after an edit. With no URL, the listings form.
function formResponsesIndex_(formUrl) {
  const form = FormApp.openByUrl(formUrl || responsesFormUrl_());
  const index = {};
  form.getResponses().forEach((r) => {
    const key = Math.floor(r.getTimestamp().getTime() / 1000);
    (index[key] = index[key] || []).push(r);
  });
  return index;
}

// `emailCol` (1-based) names the manager email column for the tie-break; left
// out, it's the listings tab's MANAGER_EMAIL_COLUMN.
function findResponseForRow_(sheet, row, index, emailCol) {
  const ts = sheet.getRange(TIMESTAMP_COLUMN + row).getValue();
  const date = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(date.getTime())) return null;
  const candidates = index[Math.floor(date.getTime() / 1000)] || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;

  // Two responses landed in the same second: break the tie on the listing
  // manager email. If that still doesn't settle it, return nothing rather
  // than guess, because a wrong guess sends someone else's edit link.
  const header = emailCol
    ? String(sheet.getRange(1, emailCol).getValue()).trim()
    : headerAt_(sheet, MANAGER_EMAIL_COLUMN);
  const emailCell = emailCol ? sheet.getRange(row, emailCol) : sheet.getRange(MANAGER_EMAIL_COLUMN + row);
  const email = String(emailCell.getValue()).trim().toLowerCase();
  const matches = candidates.filter((r) =>
    r.getItemResponses().some((ir) =>
      sameHeader_(ir.getItem().getTitle(), header) &&
      String(ir.getResponse()).trim().toLowerCase() === email));
  return matches.length === 1 ? matches[0] : null;
}

// 1-based columns on the Organizations tab, found by row-1 header (OrgForm.gs
// decides that layout, so letters would drift). A missing header comes back as
// 0. Show on site is deliberately not looked up: this script never touches it.
function orgColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const at = (name) => headers.findIndex((h) => sameHeader_(h, name)) + 1;
  return {
    timestamp: at("Timestamp"),
    name: at(ORG_NAME_HEADER),
    email: at(ORG_MANAGER_EMAIL_HEADER),
    status: at(ORG_STATUS_HEADER),
    link: at(ORG_EDIT_LINK_HEADER),
  };
}

// Headers are compared ignoring capitals and extra spaces: "Show on Site" is
// the same column as "Show on site", and refusing to run over that is noise.
function sameHeader_(a, b) {
  const norm = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

function checkHeaders_(sheet) {
  const problems = [];
  if (!sameHeader_(headerAt_(sheet, EDIT_LINK_COLUMN), EDIT_LINK_HEADER))
    problems.push(EDIT_LINK_COLUMN + '1 should say "' + EDIT_LINK_HEADER + '" but says "' + headerAt_(sheet, EDIT_LINK_COLUMN) + '"');
  if (!sameHeader_(headerAt_(sheet, SHOW_ON_SITE_COLUMN), SHOW_ON_SITE_HEADER))
    problems.push(SHOW_ON_SITE_COLUMN + '1 should say "' + SHOW_ON_SITE_HEADER + '" but says "' + headerAt_(sheet, SHOW_ON_SITE_COLUMN) + '"');
  if (problems.length) {
    const msg = "Nothing was written: " + problems.join("; ") + ". If the column moved, " +
      "change the column letter at the top of the script; if it was renamed, change the header setting there.";
    notifyProblem_(msg, sheet, null);
    throw new Error(msg);
  }
}

// The listings form specifically. With two forms linked, the spreadsheet-wide
// getFormUrl() may return either one, so ask the listings tab instead.
function responsesFormUrl_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(RESPONSES_SHEET_NAME);
  const url = sheet && sheet.getFormUrl();
  if (!url) throw new Error('The "' + RESPONSES_SHEET_NAME + '" tab isn\'t linked to a form.');
  return url;
}

// A row typed straight into the sheet has no Timestamp and no form response.
function isHandTyped_(timestamp) {
  return String(timestamp).trim() === "";
}

function isEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// 0-based position of a column letter, for indexing getValues() rows.
function columnIndex_(sheet, column) {
  return sheet.getRange(column + "1").getColumn() - 1;
}

function headerAt_(sheet, column) {
  return String(sheet.getRange(column + "1").getValue()).trim();
}

function describeRow_(sheet, row) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const get = (name) => { const i = headers.findIndex((h) => sameHeader_(h, name)); return i === -1 ? "" : String(values[i]).trim(); };
  return {
    organization: get(ORGANIZATION_HEADER) || "(no organization name)",
    program: get(PROGRAM_HEADER) || "(no program name)",
  };
}

function sheetLink_(sheet, row) {
  return SpreadsheetApp.getActive().getUrl() + "#gid=" + sheet.getSheetId() + (row ? "&range=A" + row : "");
}

function fill_(template, values) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
}

function sendTemplate_(to, subject, body, listing, editLink, sheet, row) {
  const values = {
    organization: listing.organization,
    program: listing.program,
    editLink: editLink,
    sheetLink: sheetLink_(sheet, row),
    row: row,
  };
  MailApp.sendEmail(to, fill_(subject, values), fill_(body, values));
}

function notifyProblem_(message, sheet, row) {
  Logger.log(message);
  MailApp.sendEmail(STAFF_EMAIL, PROBLEM_SUBJECT, message + "\n\n" + sheetLink_(sheet, row));
}
