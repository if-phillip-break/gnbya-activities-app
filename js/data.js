// Data sources and record mapping.
//
// Both datasets follow the same architecture: a Google Sheet staff can edit,
// fetched as CSV, parsed, and mapped to app objects. See docs/field-guide.md
// for the staff-facing description of every column.

// Live staff-editable programs sheet (includes the Description column):
// https://docs.google.com/spreadsheets/d/1oYJed7Vtqe3TbaG0d1rhDHn796ZOZYnXo3ZpoDYMdC0
const PROGRAMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1oYJed7Vtqe3TbaG0d1rhDHn796ZOZYnXo3ZpoDYMdC0/export?format=csv";

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------- summer camps & programs ----------

function mapRecordToProgram(record) {
  return {
    id: slugify(`${record["Organization name"]}-${record["Program name"]}`),
    organizationName: record["Organization name"],
    gnbyaMember: toBool(record["GNBYA member?"]),
    programName: record["Program name"],
    // Multi-value "Categorization" cell (semicolon-separated), drives the
    // filter chips and card tags — mirrors the organizations' categories.
    categories: toList(record["Categorization"]),
    website: toNullableString(record["Website"]),
    ageRange: {
      min: toNumberOrNull(record["Age min"]),
      max: toNumberOrNull(record["Age max"]),
      display: record["Ages or grades"],
    },
    sessionDates: toNullableString(record["Session dates"]),
    hours: toNullableString(record["Hours"]),
    cost: toNullableString(record["Cost"]),
    address: toNullableString(record["Address"]),
    busAccessible: toBool(record["Bus accessible?"]),
    nearestBusRoute: toNullableString(record["Nearest bus route/stop"]),
    staffLanguageSupport: toNullableString(record["Staff language support"]),
    translationAvailable: record["Translation available"]
      ? record["Translation available"].split(",").map((s) => s.trim())
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
