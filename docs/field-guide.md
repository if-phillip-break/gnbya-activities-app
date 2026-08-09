# Activity Data Field Guide

This describes every field used in the activities data (`data/activities.json` today;
the live Google Sheet from Task 5 going forward). It's meant to be shareable with
GNBYA staff who will be entering/editing listings.

## Ground rules

1. **Don't add or remove columns/fields.** The app reads data by field name — renaming,
   removing, or reorganizing fields will silently break the app (blank cards, broken
   filters) rather than show an obvious error. If a new field is genuinely needed
   (e.g. "financial aid available"), that's a quick request to the developer to add
   it properly — not a DIY column insert.
2. **A blank cell should never be ambiguous.** If a value doesn't apply (e.g. no fixed
   address for a home-visit program), leave it blank on purpose. If cost is free, write
   "Free" — don't leave cost blank, since a blank could mean "actually free" or "staff
   forgot," and there's no way to tell those apart later.

## Required fields

Always fill these in — the app or a parent depends on them directly.

- **Organization name** — e.g. "Boys & Girls Club of New Bedford." Repeat in full on
  every row for this org; no "same as above."
- **Program name** — e.g. "Summer Fun Program." If one org runs two distinct activities
  (different ages, cost, or schedule), give each its own row — don't combine them.
- **GNBYA member?** — Yes / No.
- **Ages or grades** — e.g. "Ages 7-13" or "Grades 1-6." Plain text, written the way a
  parent would understand it.
- **Session dates** — e.g. "July 1 - Aug 28."
- **Cost** — e.g. "$50/week," "Free," "Scholarships available." Never leave blank.
- **Bus accessible?** — Yes / No. Drives the bus-access filter.
- **Contact** — name, email, and/or phone. The one guaranteed way a parent can follow up.

## Conditional

- **Nearest bus route/stop** — only needed when "Bus accessible?" is No.

## Optional

Leave blank when genuinely not applicable — that's expected, not an error.

- **Website**
- **Hours** — e.g. blank for home-visit programs with no fixed schedule.
- **Address** — e.g. blank for home-visit or no-fixed-location programs.
- **Staff language support** — e.g. "Yes, Spanish."
- **Translation available** — comma-separated languages.
- **Description** — 1-2 plain-text sentences summarizing what the program actually
  does (activities, focus, vibe), written for a parent. Shown (truncated to ~180
  characters) on the card. Leave blank if there's genuinely nothing to add.

## Not yet staff-editable

- **Category** (arts/sports/STEM/etc.) — reserved for a future categorization pass,
  not exposed until designed in Task 4/5.
- **Season** — reserved for year-round expansion, not exposed until then.

## Recommended for the future Google Sheet (Task 5)

Use **Data > Data validation** in Google Sheets to turn "GNBYA member?" and
"Bus accessible?" into dropdowns (Yes/No only). This prevents typos like
"yes"/"Yes"/"y" turning into three different values the app can't reliably read —
without needing a custom admin panel.

---

# Organizations Directory (second sheet)

The app's "Year-Round Organizations" view reads a second sheet with one row per
organization. Initial data came from GNBYA's own resource-guide database
(gnbya.org/resource-guide), so the taxonomy below matches what GNBYA already
uses — don't invent new category names; pick from the existing lists.

## Multi-value cells

Several columns hold multiple values in one cell, separated by semicolons
(e.g. `Free; Fee; Financial Assistance`). Keep that separator — the app splits
on it.

## Fields

**Required:**
- **Organization name**
- **Website** — the org's own site; this is the card's main action for parents.

**Fill in whichever apply (blank = not applicable / unknown):**
- **Min age / Max age** — numbers only. Leave blank when the org serves all
  ages or ages are unclear; the card shows "All ages" / "Ages 5+" style text
  automatically.
- **Grade levels served** — from: Infant/Toddler, Pre-K, Elementary, Middle,
  High, Out of School, All Ages.
- **Early education services** — from: Care Infant and Toddler, Care Preschool,
  Care School Age.
- **Youth development services** — from: Academic Achievement, Health Safety &
  Wellness, Mental Health Services, Mentoring/Leadership, Science/Nature,
  Sports/Recreation, Visual Arts/Performing Arts/Culture, Vocational Readiness.
  These power the category filter chips in the app.
- **Program year** — from: Full Year, Full Year With Limited Winter Programs,
  School Year, School Holidays/ Breaks, Summer.
- **Program model** — from: Before School, After School, Full Day, Partial Day,
  Evening, Weekend Only, Summer Only. Powers the "Schedule type" filter.
- **Cost** — from: Free, Fee, Financial Assistance, Slide Scale Based on
  Income, Accepts Child Care Subsidies. "Free or financial help" filtering
  matches everything except plain "Fee".
- **Registration** — from: Drop In, Application Required, Restricted Access.
- **Transportation**, **Location**, **Schools served**, **Schedule** — free text.
- **Description** — 1-3 plain-text sentences shown (truncated) on the card.
