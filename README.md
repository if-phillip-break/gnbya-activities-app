# GNBYA Activities Guide

A mobile-friendly directory of summer camps, programs, and year-round youth
organizations in Greater New Bedford, built for the
[Greater New Bedford Youth Alliance](https://www.gnbya.org). Parents can search
and filter by age, cost, schedule, transportation, language support, and
service category.

## How it works

Plain HTML/CSS/JavaScript — no frameworks, no build step. Data lives in Google
Sheets that GNBYA staff edit directly; the app fetches each sheet as CSV on
page load, so listing updates require **no code changes and no redeploy**.

```
index.html        Two tabbed views: Summer Camps & Programs / Year-Round Organizations
css/style.css     All styling; brand colors sampled from gnbya.org live in :root variables
js/csv.js         CSV parser (handles quoted cells, embedded commas/newlines)
js/data.js        Data source URLs + spreadsheet-record → app-object mapping
js/app.js         Tabs, filters, and card rendering
data/             Reference copies of the datasets + raw source CSV
docs/field-guide.md   Staff guide: every column, required vs optional, valid values
```

## Running locally

Browsers block `fetch()` from `file://` pages, so serve the folder:

```
python -m http.server 8000
```

then open http://localhost:8000.

## Data sources

| View | Source | Status |
|---|---|---|
| Summer Camps & Programs | [Placeholder Google Sheet](https://docs.google.com/spreadsheets/d/1oYJed7Vtqe3TbaG0d1rhDHn796ZOZYnXo3ZpoDYMdC0/edit) | Live |
| Year-Round Organizations | [Placeholder Google Sheet](https://docs.google.com/spreadsheets/d/17GgTCCFufEu5ubDUKBWE-vdZjBNQA4TUHHdCsKF5cUg/edit) | Local copy until sheet sharing is enabled |

Organization data originated from GNBYA's own resource-guide database
(`gnbya.org/_functions/organizationsData`, 43 published organizations), using
GNBYA's existing category taxonomy. The remaining orgs from the 60-org PDF
guide can be added as sheet rows by staff.

To point a view at a different sheet, change the one URL constant at the top
of `js/data.js`. The sheet must be shared as "Anyone with the link → Viewer".

## Editing listings (staff)

See [docs/field-guide.md](docs/field-guide.md) for the full column reference.
Ground rules: one row per distinct activity, don't add/remove/rename columns,
never leave `cost` blank (write "Free"), multi-value cells separate values
with semicolons.
