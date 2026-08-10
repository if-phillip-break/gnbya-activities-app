# Summer Programs Intake Form → Site (setup guide)

How organizations submit summer programs through a Google Form, a staff member
reviews them, and only approved ones appear on the site.

## The idea: two layers with an approval gate

- **Intake** — the Google Form's raw responses (unreviewed; a public form always
  attracts some spam).
- **Published** — only the rows a staff member approved.
- **The site reads the Published layer only — never the raw intake.**

Why the gate lives in the sheet, not the app: anything the app fetches is
downloadable by every visitor's browser. Unapproved submissions (with people's
contact info) must never be in the file the app reads — so the filtering has to
happen in Google Sheets, *before* the data is published.

---

## One-time setup

### 1. Build the Form

Create a Google Form and add one question per row below. **Title each question
exactly as shown** — the title becomes the sheet's column header, and the site
matches columns by name.

| Question title (must be exact) | Type | Notes |
|---|---|---|
| Organization name | Short answer | |
| Program name | Short answer | |
| Categorization | Checkboxes | Options = the category list below |
| Description | Paragraph | 1–2 sentences for parents |
| Website | Short answer | |
| Ages or grades | Short answer | e.g. "Ages 7–13" — shown on the card |
| Age min | Short answer (number) | youngest age, digits only — powers the age filter |
| Age max | Short answer (number) | oldest age, digits only |
| Session dates | Short answer | |
| Hours | Short answer | |
| Cost | Short answer | "Free", "$50/week", "Scholarships available" |
| Address | Short answer | |
| Bus accessible? | Multiple choice | Yes / No |
| Nearest bus route/stop | Short answer | |
| Staff language support | Short answer | e.g. "Yes, Spanish" |
| Translation available | Short answer | comma-separated languages |
| Contact | Short answer | name + email and/or phone |

**Category checkbox options:** Academic Achievement, Health Safety & Wellness,
Mental Health Services, Mentoring/Leadership, Science/Nature, Sports/Recreation,
Visual Arts/Performing Arts/Culture, Vocational Readiness.

Keep the questions in this order — it makes the formula in step 4 predictable.

### 2. Link the Form to the spreadsheet

In the Form: **Responses → Link to Sheets**. This creates a **"Form Responses 1"**
tab; every submission appends a row. Columns land as: A = Timestamp,
B = Organization name, C = Program name, … R = Contact.

### 3. Add the approval checkbox

In "Form Responses 1", click the header of the **first empty column to the right
(column S)** and title it **Show on site**. Select the whole column S →
Insert → Tick box. Leave it unchecked by default.

- ⚠️ Don't sort or reorder the Form Responses tab — sorting can detach the
  checkboxes from their rows.
- A submission appears on the site only once someone ticks its box.

### 4. Create the "Live listings" tab

Add a new tab named **Live listings**.

- In **row 1**, type these headers across columns A–Q, in this exact order:
  Organization name · Program name · Categorization · Description · Website ·
  Ages or grades · Age min · Age max · Session dates · Hours · Cost · Address ·
  Bus accessible? · Nearest bus route/stop · Staff language support ·
  Translation available · Contact
- In **cell A2**, paste:

  ```
  =IFERROR(FILTER('Form Responses 1'!B2:R, 'Form Responses 1'!S2:S=TRUE), )
  ```

This pulls every approved row (Show on site = TRUE), columns B–R, under your typed
headers. Tick a box → the row shows up here automatically; untick → it disappears.

> If you later add, remove, or reorder form questions, the column letters shift —
> update `B2:R`, the `S2:S` reference, and the header row to match.

### 5. Publish only the Live listings tab

File → Share → **Publish to web** → pick **Live listings** (not "Entire document")
→ **Comma-separated values (.csv)** → Publish. Copy the URL.

**Keep the spreadsheet itself private** — do not turn on "anyone with the link."
Publish-to-web exposes *only* the Live listings tab as CSV, so raw unapproved
responses stay private while approved rows are public.

### 6. Point the site at it

Send the developer the published CSV URL. They will:
- Repoint the site's programs source to the Live listings tab.
- Make the site read the comma-separated category format Google Forms produces
  (Forms joins checkbox answers with commas; the current sheet uses semicolons —
  the site will accept both).

---

## Day-to-day for staff

1. A new submission lands in "Form Responses 1" (unchecked = not on the site).
2. Review it; correct anything that needs fixing.
3. Tick **Show on site** → within a few minutes it appears on the site.
4. Untick to pull it back down.

## Good to know

- **Header names must match exactly** — the site finds columns by name; your
  Live listings header row controls that.
- **Caching** — the published CSV refreshes within ~5 minutes, and browsers cache
  too, so changes aren't always instant.
- **Spam** — because nothing shows until approved, form spam never reaches the site.
