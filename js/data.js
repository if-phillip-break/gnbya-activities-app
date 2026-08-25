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

// ---------- category display layer ----------
//
// GNBYA's own taxonomy (from the resource guide) is what staff type into the
// sheet and pick in the form. It's accurate but it isn't plain language — a
// parent looking for a dance class doesn't scan for "Visual Arts/Performing
// Arts/Culture", and "Health Safety & Wellness" vs "Mental Health Services" is
// a distinction that matters to funders, not to families.
//
// So the raw value stays in the sheet and we translate it here, for display
// only. Nothing upstream changes. Two raw values may map to the SAME label
// (both health categories merge into one), which is why the app filters on
// these labels rather than on the raw values.
//
// Matching is a regex against the raw text, so near-misses still land correctly
// — e.g. a cell truncated to "Visual Arts/Performing Arts/" still reads as Arts
// & Culture. Order matters: the first pattern that matches wins.
const CATEGORY_DISPLAY = [
  { label: "📚 Homework & Tutoring", match: /academic|tutor|homework|literacy/i },
  { label: "🎨 Arts & Culture", match: /visual arts|performing arts|culture|music|dance|theat/i },
  { label: "⚽ Sports & Recreation", match: /sports|recreation|athletic/i },
  { label: "🔬 Science & Nature", match: /science|nature|stem|technolog/i },
  { label: "💚 Health & Wellness", match: /health|wellness|mental|safety/i },
  { label: "🤝 Mentoring & Leadership", match: /mentor|leader/i },
  { label: "💼 Jobs & Career Skills", match: /vocational|career|job|workforce/i },
  { label: "👶 Infant & Toddler Care", match: /infant|toddler/i },
  { label: "🧸 Preschool Care", match: /preschool|pre-k/i },
  { label: "🎒 School-Age Care", match: /school.?age/i },
];

const CATEGORY_ORDER = CATEGORY_DISPLAY.map((c) => c.label);

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- summer camps & programs ----------

// Which of the two program tabs a listing belongs to. "Summer camp?" is a
// tick-box column staff fill in on the intake sheet: ticked -> Summer Camps,
// unticked -> Current Activities. Until that column exists everything falls
// back to summer, which is where all current listings belong.
function toSummerCampFlag(record) {
  const explicit = record["Summer camp?"];
  if (explicit !== undefined && explicit.trim() !== "") return toBool(explicit);
  const season = (record["Season"] || "summer").trim().toLowerCase();
  return season === "" || season === "summer";
}

function mapRecordToProgram(record) {
  const rawCategories = toCategoryList(record["Categorization"]);
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
    hours: toNullableString(record["Hours"]),
    cost: toNullableString(record["Cost"]),
    address: toNullableString(record["Address"]),
    busAccessible: toBool(record["Bus Accessible?"]),
    nearestBusRoute: toNullableString(record["Nearest Bus Route/Stop"]),
    staffLanguageSupport: toNullableString(record["Staff Language Support"]),
    translationAvailable: record["Translation Available"]
      ? record["Translation Available"].split(",").map((s) => s.trim())
      : null,
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
