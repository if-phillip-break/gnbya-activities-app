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
- **Session Dates** — e.g. "July 1 - Aug 28." Also drives the calendar filter;
  see "How you write Session Dates matters" below.
- **Is the program free?** — Yes / No. Drives the **Free** filter button.
- **Scholarships Provided?** — Yes / No. Drives the **Financial aid** button. Answer
  this even when the program is free; the two are separate questions.
- **Program Enrollment Cost** — e.g. "$50/week," "$280 (2-week session)." This is the
  text a parent reads on the card, so write it the way you'd say it out loud.
- **Transportation Accessible?** — Yes / No. Drives the bus-access filter.
- **Contact** — name, email, and/or phone. The one guaranteed way a parent can follow up.

## Conditional

- **Nearest Bus Route/Stop** — only needed when "Transportation Accessible?" is No.
- **Languages Provided** — only when "Translation Available?" is Yes. Comma-separated.

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
- **Categorization** — tick every category that applies. The intake form offers:
  Academics, Art, Career Readiness, Culture, Health & Wellbeing, Leadership,
  Mentoring, Music, Nature, Science, Sports, Theatre. Leave blank if a program
  doesn't fit any category yet. See "What parents actually see" below.

## What parents actually see (categories)

**The site relabels categories in plain language and adds an emoji.** The
translation happens in the app, so nothing in the sheet or the form changes.

From the intake form:

- Academics → 📚 Homework & Tutoring
- Music → 🎵 Music
- Art → 🖌️ Art
- Theatre → 🎭 Theater
- Culture → 🌍 Culture
- Sports → ⚽ Sports & Recreation
- Science **and** Nature → 🔬 Science & Nature
- Health & Wellbeing → 💚 Health & Wellness
- Mentoring **and** Leadership → 🤝 Mentoring & Leadership
- Career Readiness → 💼 Jobs & Career Skills

The organizations directory still uses GNBYA's older resource-guide names, and
those are translated too, so a chip means the same thing wherever it appears:

- Academic Achievement → 📚 Homework & Tutoring
- Visual Arts/Performing Arts/Culture → 🎨 Arts & Culture
- Sports/Recreation → ⚽ Sports & Recreation
- Science/Nature → 🔬 Science & Nature
- Health Safety & Wellness **and** Mental Health Services → 💚 Health & Wellness
- Mentoring/Leadership → 🤝 Mentoring & Leadership
- Vocational Readiness → 💼 Jobs & Career Skills
- Care Infant and Toddler / Care Preschool / Care School Age → 👶 / 🧸 / 🎒

Three things follow from this. **Several values merge into one chip** — both
health categories, and Science with Nature — so families aren't asked to reason
about distinctions that matter to funders rather than to them. **Music, Art and
Theatre stay separate**, because parents asked for those by name and the form
now collects them separately; organizations keep a single "Arts & Culture" chip
since one coarse value can't be split into three. And **near-misses are
tolerated**: a cell truncated to "Visual Arts/Performing Arts/" still lands on
Arts & Culture rather than creating a broken duplicate chip.

A category name the app doesn't recognise isn't dropped — it appears as its own
chip, just without an emoji. That's the signal you've invented a new one.

To change a label or add a category, ask the developer to update
`CATEGORY_DISPLAY` in `js/data.js`.

## Which tab a program appears on

- **Activity Type** — the intake form asks the organization directly.
  "Summer Activities" → the **Summer Activities** tab. "Current Activities" →
  the **Current Activities** tab, for programs running during the school year.
- **A blank answer counts as Summer Activities.** That's where every listing
  submitted before this question existed belongs, so nothing moved when the
  question was added. If one of those older listings actually runs year-round,
  type `Current Activities` into its cell in Form Responses.
- **Summer camp?** and **Season** — earlier versions of this switch. Still read
  if a row has them, but Activity Type wins. Nothing new needs them.

The answer only reaches the site if `Activity Type` is in the Live listings
header row *and* inside its FILTER range — see "Adding a column without breaking
the site" in `planned-fields.md`.

## How you write Session Dates matters

Parents can now pick days on a calendar, and the site works out which listings
run then by **reading the dates back out of your Session Dates text**. You don't
have to change how you write it — these all work today:

- `Weekly sessions, 6/24-8/28`
- `Session 1: June 29-July 10; Session 2: July 14-25`
- `7/6-10 OR 7/27-31 (select one week)`
- `Monday, July 13 to Friday, July 17`
- `July 6-18 (8 slots); July 20-Aug 1 (8 slots)`

Two things help:

- **Write out both ends of every session.** "Starting June 16, ending week of
  8/25" reads correctly, but "runs all summer" gives the calendar nothing.
- **Don't worry about the year** — the current year is assumed. If a session
  crosses New Year, the site works that out from the months.

A listing whose dates can't be read — "Filled (no availability)", say — is
**never hidden** by the date filter. It simply always shows. Missing a real
program because of a parsing quirk would be worse than showing one extra.

## Filters parents asked for that aren't built yet

Availability and waitlists, registration dates, full-vs-partial day, vacation
weeks, and the cost slider all need columns that don't exist yet.
`planned-fields.md` has the spec for each.

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
  These power the category filter chips, translated as described in "What
  parents actually see" above.
- **Program year** — from: Full Year, Full Year With Limited Winter Programs,
  School Year, School Holidays/ Breaks, Summer.
- **Program model** — from: Before School, After School, Full Day, Partial Day,
  Evening, Weekend Only, Summer Only.
- **Cost** — from: Free, Fee, Financial Assistance, Slide Scale Based on
  Income, Accepts Child Care Subsidies. "Free or financial help" filtering
  matches everything except plain "Fee".
- **Registration** — from: Drop In, Application Required, Restricted Access.
- **Transportation**, **Location**, **Schools served**, **Schedule** — free text.
- **Description** — 1-3 plain-text sentences shown (truncated) on the card.
