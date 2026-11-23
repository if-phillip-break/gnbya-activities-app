/**
 * GNBYA Activities Guide: Spanish and Portuguese listing text (Google Apps Script)
 *
 * Lives in the same script project as Code.gs and OrgForm.gs, in the
 * PRODUCTION spreadsheet. The website never loads this file; it lives in the
 * repo so there's a record of what runs inside the sheet.
 *
 * What it does: reads the two published Live tabs, translates each listing's
 * own words into Spanish and Portuguese with Google Translate (LanguageApp),
 * and writes them into the "Activities Translations" and "Organizations
 * Translations" tabs as plain text. The website reads those tabs to show
 * listings in the visitor's language (js/i18n.js, js/data.js).
 *
 * Why plain text, not =GOOGLETRANSLATE() formulas: Google re-runs formulas
 * when it builds the published copy, and a translation that isn't ready yet
 * comes out blank, so most published copies had no translations at all
 * (seen 2026-11-22: the activities feed was empty 9 times in 12). Plain text
 * publishes complete every time.
 *
 * Translations are remembered (script properties), so each run only sends
 * text that is new or has changed. Names are never translated: the website
 * keeps organization and program names in English.
 *
 * Run once:  translateListings()          (fills both tabs now)
 *            setupTranslationTrigger()     (then keeps them current every
 *                                          15 minutes)
 *
 * Every name here starts with TR_ or translate. The three .gs files share one
 * global scope, and a name declared twice stops the whole project loading.
 */

// =====================================================================
// SETTINGS: safe to edit. Change these, then save (Ctrl+S).
// =====================================================================

const TR_LANGUAGES = ["es", "pt"];

// One job per published tab. Columns are found by their row-1 headers.
// `keys` are copied as they are (the website matches rows on them);
// `fields` are translated into one "<lang>:<field>" column per language.
const TR_JOBS = [
  {
    source: "Live Activities",
    target: "Activities Translations",
    keys: ["Organization Name", "Program Name"],
    fields: ["Description", "Ages or Grades", "Session Dates", "Hours", "Cost", "Program Enrollment Cost"],
  },
  {
    source: "Live Organizations",
    target: "Organizations Translations",
    keys: ["Organization name"],
    fields: ["Schedule", "Description"],
  },
];

// How often the trigger refreshes the tabs, in minutes (1, 5, 10, 15 or 30).
const TR_EVERY_MINUTES = 15;

// =====================================================================
// Below here is the code. You shouldn't need to change anything.
// =====================================================================

const TR_CACHE_PREFIX = "tr1:";

/** Translates both Live tabs into their translation tabs. Safe to run any time. */
function translateListings() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("Another translation run is still going: skipped."); return; }
  try {
    const ss = SpreadsheetApp.getActive();
    const props = PropertiesService.getScriptProperties();
    const cache = TR_readCache_(props);
    const used = {};
    const stats = { translated: 0, remembered: 0, failed: 0 };
    TR_JOBS.forEach((job) => TR_runJob_(ss, job, cache, used, stats));
    TR_saveCache_(props, cache, used);
    Logger.log("Translations: " + stats.translated + " new, " + stats.remembered + " remembered, " + stats.failed + " failed.");
  } finally {
    lock.releaseLock();
  }
}

/** Installs the every-15-minutes trigger. Safe to run again: never makes duplicates. */
function setupTranslationTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "translateListings")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("translateListings").timeBased().everyMinutes(TR_EVERY_MINUTES).create();
  Logger.log("Translation trigger installed: every " + TR_EVERY_MINUTES + " minutes.");
}

function TR_runJob_(ss, job, cache, used, stats) {
  const source = ss.getSheetByName(job.source);
  const target = ss.getSheetByName(job.target);
  if (!source || !target) {
    // A missing tab means a rename: say so rather than write anywhere else.
    Logger.log('Skipped "' + job.target + '": no tab named "' + (source ? job.target : job.source) + '".');
    return;
  }
  const values = source.getDataRange().getValues();
  const headers = (values[0] || []).map((h) => String(h).trim());
  const col = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const missing = job.keys.concat(job.fields).filter((name) => col(name) === -1);
  if (missing.length) {
    Logger.log('Skipped "' + job.target + '": "' + job.source + '" has no column ' + missing.join(", ") + ".");
    return;
  }

  const header = job.keys.slice();
  TR_LANGUAGES.forEach((lang) => job.fields.forEach((f) => header.push(lang + ":" + f)));
  const out = [header];
  values.slice(1).forEach((row) => {
    if (job.keys.every((k) => String(row[col(k)]).trim() === "")) return; // empty row
    const line = job.keys.map((k) => row[col(k)]);
    TR_LANGUAGES.forEach((lang) => job.fields.forEach((f) => {
      line.push(TR_translate_(String(row[col(f)]), lang, cache, used, stats));
    }));
    out.push(line);
  });

  // One block write, as wide and tall as whatever was there before, so the
  // tab is never briefly empty (the website could read it at that moment)
  // and nothing old is left behind in rows or columns no longer used.
  const width = Math.max(header.length, target.getLastColumn());
  const height = Math.max(out.length, target.getLastRow());
  const block = [];
  for (let r = 0; r < height; r++) {
    const src = out[r] || [];
    const line = [];
    for (let c = 0; c < width; c++) line.push(c < src.length && src[c] !== undefined ? src[c] : "");
    block.push(line);
  }
  target.getRange(1, 1, height, width).setValues(block);
}

// Google Translate, remembered by language + exact text. A failure (quota,
// outage) leaves the cell blank; the website then shows that text in English.
function TR_translate_(text, lang, cache, used, stats) {
  const t = text.trim();
  if (!t) return "";
  const key = TR_CACHE_PREFIX + lang + ":" + TR_hash_(t);
  used[key] = true;
  if (Object.prototype.hasOwnProperty.call(cache, key)) { stats.remembered++; return cache[key]; }
  try {
    const result = LanguageApp.translate(t, "en", lang, { contentType: "text" });
    cache[key] = result;
    stats.translated++;
    return result;
  } catch (err) {
    stats.failed++;
    Logger.log("Couldn't translate into " + lang + ": " + err.message);
    return "";
  }
}

function TR_hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function TR_readCache_(props) {
  const all = props.getProperties();
  const cache = {};
  Object.keys(all).forEach((k) => { if (k.indexOf(TR_CACHE_PREFIX) === 0) cache[k] = all[k]; });
  return cache;
}

// Saves new translations and forgets ones no listing uses any more, so the
// store doesn't grow forever. Other script properties (OrgForm.gs's form ID)
// are left untouched.
function TR_saveCache_(props, cache, used) {
  const all = props.getProperties();
  const fresh = {};
  Object.keys(cache).forEach((k) => { if (used[k] && all[k] !== cache[k]) fresh[k] = cache[k]; });
  if (Object.keys(fresh).length) props.setProperties(fresh);
  Object.keys(all).forEach((k) => { if (k.indexOf(TR_CACHE_PREFIX) === 0 && !used[k]) props.deleteProperty(k); });
}
