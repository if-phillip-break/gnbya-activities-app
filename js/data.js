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

function toBool(value) {
  return (value || "").trim().toLowerCase() === "yes";
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- summer camps & programs ----------

function mapRecordToProgram(record) {
  return {
    id: slugify(`${record["Organization Name"]}-${record["Program Name"]}`),
    organizationName: record["Organization Name"],
    gnbyaMember: toBool(record["GNBYA member?"]),
    programName: record["Program Name"],
    // Categorization drives the filter chips and card tags; accepts comma- or
    // semicolon-separated values (see toCategoryList).
    categories: toCategoryList(record["Categorization"]),
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
    // One combined list drives the category chips; early-education entries
    // keep their identity for display but filter as ordinary categories.
    categories: [...youth, ...earlyEd],
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
