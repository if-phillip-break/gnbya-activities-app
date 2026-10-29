// Data sources and record mapping.
//
// Both datasets follow the same architecture: a Google Sheet staff can edit,
// fetched as CSV, parsed, and mapped to app objects. See docs/field-guide.md
// for the staff-facing description of every column.

// Programs come from the "Live listings" tab of the intake spreadsheet — a
// FILTER view that publishes only rows a staff member approved (Show on site =
// TRUE). Fed by a Google Form; see docs/form-intake-setup.md.
const PROGRAMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOv1GOvvxbbs45Zhnr7fLXKojgM6IvwChxO7omeJbnfWw1ziupuekM_x6jaSiTXgWJa35LbXUL17ww/pub?gid=1329653144&single=true&output=csv";

// Parent-facing "suggest a program" form. Parents kept naming programs that
// aren't listed, so give them somewhere to put that. Set this to a Google Form
// URL to reveal the link in the footer; left null, the link stays hidden.
const SUGGEST_FORM_URL = null;

// Organizations placeholder sheet:
// https://docs.google.com/spreadsheets/d/17GgTCCFufEu5ubDUKBWE-vdZjBNQA4TUHHdCsKF5cUg
// Until its link-sharing is enabled, we read the same data from a local copy.
// TODO: swap to the sheet's /export?format=csv URL once sharing is on.
const ORGS_CSV_URL = "data/organizations_placeholder_sheet.csv";

async function fetchRecords(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status} for ${url}`);
  const csvText = await response.text();
  return rowsToRecords(parseCSV(csvText));
}

// ---------- shared field helpers ----------

// Yes/No columns arrive as "Yes" when typed by hand and as "TRUE" when the
// column is a Google Sheets tick box. Accept either so staff can use whichever
// is convenient without silently breaking a filter.
function toBool(value) {
  return /^(yes|true|y|x)$/i.test((value || "").trim());
}

function toNullableString(value) {
  return value === "" ? null : value;
}

function toNumberOrNull(value) {
  return value === "" || value === undefined ? null : Number(value);
}

// Multi-value spreadsheet cells use "; " between values (e.g. "Free; Fee").
function toList(value) {
  if (!value) return [];
  return value.split(";").map((s) => s.trim()).filter(Boolean);
}

// Categorization may arrive semicolon-separated (typed by hand) or comma-separated
// (Google Forms joins checkbox answers with commas) — accept either separator.
function toCategoryList(value) {
  if (!value) return [];
  return value.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

// Read the first column that's actually present, in preference order.
//
// The intake form's questions get renamed and split as it evolves ("Bus
// Accessible?" became "Transportation Accessible?"), and the published sheet
// can carry either generation of header for a while — the form changes on one
// day, the Live listings tab catches up on another. Listing the names we
// accept means the site rides through that gap instead of going blank on
// whichever half hasn't caught up yet.
function pick(record, ...names) {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return "";
}

// Yes/No answers the form now asks directly. Older rows predate the questions
// and only have free-text cost, so fall back to reading that — otherwise every
// listing migrated before the form changed would look not-free.
function toFreeFlag(record, costText) {
  const explicit = pick(record, "Is the program free?");
  if (explicit !== "") return toBool(explicit);
  return /\bfree\b/i.test(costText || "");
}

function toScholarshipFlag(record, costText) {
  const explicit = pick(record, "Scholarships Provided?");
  if (explicit !== "") return toBool(explicit);
  return /scholarship|financial aid|slid(e|ing) scale/i.test(costText || "");
}

// ---------- category display layer ----------
//
// Two generations of taxonomy feed this app and neither is plain language on
// its own:
//
//   - The organizations directory uses GNBYA's resource-guide names, which are
//     coarse and institutional ("Visual Arts/Performing Arts/Culture", "Health
//     Safety & Wellness" vs "Mental Health Services").
//   - The intake form now asks for granular values instead ("Music", "Art",
//     "Theatre", "Science", "Nature", "Mentoring", "Leadership").
//
// Both are translated here, for display only — nothing upstream changes. Many
// raw values may map to the SAME label (both health categories merge into one;
// Science and Nature merge back together), which is why the app filters on
// these labels rather than on the raw values.
//
// Arts is the one place we deliberately keep the form's granularity: parents
// asked for "Music"/"Art"/"Theater" rather than one arts bucket, and the form
// now supplies them separately. Organizations can't be split the same way — one
// coarse value can't become three — so they keep a combined "Arts & Culture"
// chip. That's fine because chips are built from whatever the current tab's
// data contains, so no tab ever shows a chip that matches nothing on it.
//
// ORDER MATTERS TWICE OVER, so the two lists below are deliberately separate:
// CATEGORY_DISPLAY is in *match precedence* order (first pattern to match
// wins), CATEGORY_ORDER is in *display* order. Every label here must appear
// there.
const CATEGORY_DISPLAY = [
  // Coarse resource-guide values go first — they contain words the granular
  // patterns below would otherwise claim ("...Performing Arts/Culture" would
  // be caught by Culture, and "Visual Arts" by Art).
  { label: "🎨 Arts & Culture", match: /visual arts|performing arts/i },
  // Granular intake-form values, anchored: these arrive as exact checkbox
  // labels, and loose matching would steal the coarse values above.
  { label: "🎵 Music", match: /^music$/i },
  { label: "🖌️ Art", match: /^art$/i },
  { label: "🎭 Theater", match: /^theat(er|re)$/i },
  { label: "🌍 Culture", match: /^culture$/i },
  // Everything else merges old and new spellings into one label apiece.
  { label: "📚 Homework & Tutoring", match: /academic|tutor|homework|literacy/i },
  { label: "⚽ Sports & Recreation", match: /sports|recreation|athletic/i },
  { label: "🔬 Science & Nature", match: /science|nature|stem|technolog/i },
  { label: "💚 Health & Wellness", match: /health|wellness|wellbeing|mental|safety/i },
  { label: "🤝 Mentoring & Leadership", match: /mentor|leader/i },
  { label: "💼 Jobs & Career Skills", match: /vocational|career|job|workforce/i },
  { label: "👶 Infant & Toddler Care", match: /infant|toddler/i },
  { label: "🧸 Preschool Care", match: /preschool|pre-k/i },
  { label: "🎒 School-Age Care", match: /school.?age/i },
];

const CATEGORY_ORDER = [
  "📚 Homework & Tutoring",
  "🎨 Arts & Culture",
  "🎵 Music",
  "🖌️ Art",
  "🎭 Theater",
  "🌍 Culture",
  "⚽ Sports & Recreation",
  "🔬 Science & Nature",
  "💚 Health & Wellness",
  "🤝 Mentoring & Leadership",
  "💼 Jobs & Career Skills",
  "👶 Infant & Toddler Care",
  "🧸 Preschool Care",
  "🎒 School-Age Care",
];

// An unrecognised value passes through untouched rather than being dropped —
// a new category invented upstream still shows up, just without an emoji.
function toDisplayCategory(raw) {
  const hit = CATEGORY_DISPLAY.find((c) => c.match.test(raw));
  return hit ? hit.label : raw;
}

// Translate raw category values into parent-facing labels: deduped (because
// values merge) and in CATEGORY_DISPLAY order, with anything unrecognised
// sorted alphabetically at the end.
function toDisplayCategories(rawList) {
  const labels = new Set(rawList.map(toDisplayCategory));
  const known = CATEGORY_ORDER.filter((l) => labels.has(l));
  const unknown = [...labels].filter((l) => !CATEGORY_ORDER.includes(l)).sort();
  return [...known, ...unknown];
}

// ---------- session dates ----------
//
// Parents asked to filter by date, but the sheet only has a free-text
// "Session Dates" column written for humans: "Weekly sessions, 6/24-8/28",
// "Session 1: June 29-July 10; Session 2: July 14-25", "7/6-10 OR 7/27-31".
//
// So we read the dates back out of that text. This is a heuristic and it is
// allowed to fail: a listing we can't parse is never hidden by the date
// filter, the same way the age filter shows listings with no numeric ages
// rather than guessing. Under-showing a real program is a worse failure than
// over-showing one, because a parent can read the actual dates on the card but
// can't find a listing that was filtered away.
//
// Once "Session start" / "Session end" date columns exist (see
// planned-fields.md) they win outright and none of this guessing runs.

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function isoDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function monthTokenIndex(token) {
  return MONTH_INDEX[String(token).slice(0, 3).toLowerCase()];
}

function isoFromMonthName(year, token, day) {
  const i = monthTokenIndex(token);
  return i === undefined ? null : isoDate(year, i, Number(day));
}

function isoFromNumeric(year, month, day) {
  const i = Number(month) - 1;
  return i < 0 || i > 11 ? null : isoDate(year, i, Number(day));
}

function bumpYear(iso) {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}

// Weekday names are decoration between the dates we want ("Monday, July 13 to
// Friday, July 17"), and they break the separator matching, so drop them first.
const WEEKDAY_NOISE = /\b(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun)(day)?s?\b,?/gi;

function parseSessionRanges(text, year) {
  if (!text) return [];
  let rest = String(text)
    .replace(/[‐-―]/g, "-") // en/em dashes → hyphen
    .replace(WEEKDAY_NOISE, " ")
    .replace(/\s+/g, " ");

  const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
  const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
  const SEP = "\\s*(?:-|to|through|thru|until)\\s*";
  const ranges = [];

  // Most specific first. Each pattern blanks out what it consumed, so a later,
  // looser pattern can't re-read the same characters as a second date.
  const patterns = [
    { re: new RegExp(`${MON}\\s+${DAY}${SEP}${MON}\\s+${DAY}`, "gi"),      // July 1 - Aug 28
      take: (m) => [isoFromMonthName(year, m[1], m[2]), isoFromMonthName(year, m[3], m[4])] },
    { re: new RegExp(`${MON}\\s+${DAY}${SEP}${DAY}`, "gi"),                // July 7-9
      take: (m) => [isoFromMonthName(year, m[1], m[2]), isoFromMonthName(year, m[1], m[3])] },
    { re: new RegExp(`(\\d{1,2})/(\\d{1,2})${SEP}(\\d{1,2})/(\\d{1,2})`, "gi"), // 6/24-8/28
      take: (m) => [isoFromNumeric(year, m[1], m[2]), isoFromNumeric(year, m[3], m[4])] },
    { re: new RegExp(`(\\d{1,2})/(\\d{1,2})${SEP}(\\d{1,2})`, "gi"),       // 7/13-17
      take: (m) => [isoFromNumeric(year, m[1], m[2]), isoFromNumeric(year, m[1], m[3])] },
    { re: new RegExp(`${MON}${SEP}${MON}`, "gi"),                          // May - December
      take: (m) => {
        const a = monthTokenIndex(m[1]);
        const b = monthTokenIndex(m[2]);
        return a === undefined || b === undefined
          ? [null, null]
          : [isoDate(year, a, 1), isoDate(year, b + 1, 0)];
      } },
    { re: new RegExp(`${MON}\\s+${DAY}`, "gi"),                            // July 13
      take: (m) => {
        const d = isoFromMonthName(year, m[1], m[2]);
        return [d, d];
      } },
    { re: new RegExp(`(\\d{1,2})/(\\d{1,2})`, "gi"),                       // 8/25
      take: (m) => {
        const d = isoFromNumeric(year, m[1], m[2]);
        return [d, d];
      } },
  ];

  for (const pattern of patterns) {
    rest = rest.replace(pattern.re, (...args) => {
      const [start, end] = pattern.take(args.slice(0, -2));
      if (start && end) ranges.push({ s: start, e: end < start ? bumpYear(end) : end });
      return " ";
    });
  }

  const sorted = ranges.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));

  // "Every session (starting June 16, ending week of 8/25)" reads as two lone
  // days, which would hide the program for the whole summer in between. When a
  // listing yields only single days and no actual range, span the earliest to
  // the latest — over-showing is the failure we're willing to take.
  if (sorted.length > 1 && sorted.every((r) => r.s === r.e)) {
    return [{ s: sorted[0].s, e: sorted[sorted.length - 1].e }];
  }
  return sorted;
}

// A real date column beats anything we can infer from prose.
function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : isoDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function toSessionRanges(record) {
  const start = toIsoOrNull(pick(record, "Session start"));
  if (start) {
    const end = toIsoOrNull(pick(record, "Session end")) || start;
    return [{ s: start, e: end < start ? start : end }];
  }
  return parseSessionRanges(pick(record, "Session Dates"), new Date().getFullYear());
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- programs (summer + current activities) ----------

// Which of the two program tabs a listing belongs to. The intake form asks the
// submitting organization directly ("Summer Activities" / "Current
// Activities"); "Summer camp?" is the older staff tick box, kept because rows
// approved before the question existed still carry it. Anything naming summer
// wins, a ticked box wins, everything else is a current activity.
//
// A row with none of these columns falls back to summer — where every listing
// predating the question belongs — so the split degrades quietly rather than
// emptying the Summer Activities tab.
function toSummerCampFlag(record) {
  const answer = pick(record, "Activity Type", "Activity type", "Summer camp?", "Season");
  if (answer === "") return true;
  return /summer/i.test(answer) || toBool(answer);
}

function mapRecordToProgram(record) {
  const rawCategories = toCategoryList(record["Categorization"]);
  // The form dropped its free-text "Cost" question in favour of a required
  // enrolment figure plus two Yes/No flags. Either may be what's published.
  const cost = pick(record, "Cost", "Program Enrollment Cost");
  // Third generation of the transport question: "Bus Accessible?" became
  // "Transportation Accessible?", which became a checkbox list. Older rows
  // still carry a Yes/No, so a legacy yes keeps counting as bus access.
  const transport = pick(
    record, "How can kids get to this program?", "Transportation Accessible?", "Bus Accessible?"
  );
  return {
    id: slugify(`${record["Organization Name"]}-${record["Program Name"]}`),
    organizationName: record["Organization Name"],
    gnbyaMember: toBool(record["GNBYA member?"]),
    programName: record["Program Name"],
    isSummerCamp: toSummerCampFlag(record),
    // Categorization drives the filter chips and card tags; accepts comma- or
    // semicolon-separated values (see toCategoryList). The raw values are kept
    // so search still matches what staff actually typed.
    categories: toDisplayCategories(rawCategories),
    rawCategories,
    website: toNullableString(record["Website"]),
    ageRange: {
      min: toNumberOrNull(record["Age Minimum"]),
      max: toNumberOrNull(record["Age Maximum"]),
      display: record["Ages or Grades"],
    },
    sessionDates: toNullableString(record["Session Dates"]),
    // Machine-readable version of the line above, for the calendar filter.
    // Empty when we couldn't read any dates — which means "don't filter me out".
    sessionRanges: toSessionRanges(record),
    hours: toNullableString(record["Hours"]),
    cost: toNullableString(cost),
    // Free and financial aid are separate filters, so they're separate flags —
    // a $300 camp with scholarships is not free, but it isn't out of reach
    // either, and collapsing the two hid that from exactly the parents who
    // needed to see it.
    isFree: toFreeFlag(record, cost),
    scholarships: toScholarshipFlag(record, cost),
    address: toNullableString(record["Address"]),
    // Matched on the key phrase, not the whole option label: the form's wording
    // has already shifted once ("We pick kids up" → "The organization picks
    // kids up", "an SRTA" → "a SRTA") and an exact match went silently false.
    busAccessible: /near an? srta bus route/i.test(transport) || toBool(transport),
    schoolPickup: /picks? kids up from school/i.test(transport),
    // Staff-set. Only this exact answer means anything; blank or "Active" is a
    // normal listing.
    notRunning: /^not running this season$/i.test((record["Listing status"] || "").trim()),
    nearestBusRoute: toNullableString(record["Nearest Bus Route/Stop"]),
    staffLanguageSupport: toNullableString(
      pick(record, "Translation Available?", "Staff Language Support")
    ),
    translationAvailable: (() => {
      const langs = pick(record, "Languages Provided", "Translation Available");
      return langs ? langs.split(",").map((s) => s.trim()).filter(Boolean) : null;
    })(),
    contact: record["Contact"],
    season: toNullableString(record["Season"]) || "summer",
    description: toNullableString(record["Description"]),
  };
}

// ---------- year-round organizations ---------- /

function mapRecordToOrganization(record) {
  const earlyEd = toList(record["Early education services"]);
  const youth = toList(record["Youth development services"]);
  return {
    id: slugify(record["Organization name"]),
    name: record["Organization name"],
    website: toNullableString(record["Website"]),
    minAge: toNumberOrNull(record["Min age"]),
    maxAge: toNumberOrNull(record["Max age"]),
    gradeLevels: toList(record["Grade levels served"]),
    // One combined list drives the category filter; early-education entries
    // keep their identity for display but filter as ordinary categories. Both
    // lists go through the same parent-facing translation as programs, so a
    // chip means the same thing on every tab.
    categories: toDisplayCategories([...youth, ...earlyEd]),
    rawCategories: [...youth, ...earlyEd],
    programYear: toList(record["Program year"]),
    programModel: toList(record["Program model"]),
    cost: toList(record["Cost"]),
    registration: toList(record["Registration"]),
    transportation: toList(record["Transportation"]),
    location: toNullableString(record["Location"]),
    schoolsServed: toNullableString(record["Schools served"]),
    schedule: toNullableString(record["Schedule"]),
    description: toNullableString(record["Description"]),
  };
}
