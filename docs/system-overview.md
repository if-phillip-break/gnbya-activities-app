# GNBYA Activities Guide — system overview

A complete description of what this tool is, what data it holds, and exactly how
it behaves. Written to be handed to someone (or some agent) with no prior context
who needs to reason about new features.

Accurate as of 2026-11-18 on the `forms-v2` branch, up to and including the
commit that set the Apps Script up for the production sheet (not yet
merged to `master` or deployed). Section 11's data was read from the production
feed on that date.

---

## 1. What it is and who it is for

A single-page public website that helps a **parent or caregiver in Greater New
Bedford, Massachusetts find a camp, after-school program, or youth organization
their child can actually join**. It is published by the Greater New Bedford Youth
Alliance (GNBYA), a coalition of local youth-serving organizations.

Three things define the product:

1. **The listings come from the partner organizations themselves**, through a
   Google Form, with a staff approval step before anything appears publicly.
2. **Staff update listings without touching code.** The site fetches a published
   Google Sheet as CSV on every page load. Editing a cell changes the live site
   within minutes; no deploy, no developer.
3. **The hard problem is not search, it is trust.** Most listings are incomplete
   or written in prose. Nearly every design decision in the app follows from one
   rule: *when the data is ambiguous, never hide a listing and never make a claim
   the data does not support.* An over-generous filter costs a parent one wasted
   click; a filter that hides a real program costs a child a place.

The primary audience is a parent on a phone, often arriving with one question:
"what can my kid do, starting soon, that I can afford and get them to?"

Secondary audiences: GNBYA staff (who curate the sheet) and partner organizations
(who submit listings and want their programs seen).

---

## 2. Stack, hosting, and repo layout

- **No framework, no build step, no package.json.** Plain HTML, CSS, and three
  classic `<script defer>` files. This is deliberate — the project must stay
  maintainable by whoever inherits it, and the data layer does the heavy lifting.
- **Hosted on GitHub Pages** at `https://if-phillip-break.github.io/gnbya-activities-app/`.
  **Pushing `master` is the deploy** — it goes live in roughly 30–90 seconds.
- Local development needs a static server (browsers block `fetch()` from
  `file://`). Any static server works.

```
index.html              Page skeleton; everything below the header is rendered by JS
css/style.css           All styling. Brand colors sampled from gnbya.org live in :root
js/csv.js               CSV parser (quoted cells, embedded commas and newlines)
js/data.js              Source URLs, CSV record -> app object mapping, category
                        taxonomy, session-date parsing
js/app.js               State, filtering, rendering, all UI behavior
apps-script/Code.gs     Google Apps Script that runs inside the intake spreadsheet
                        (edit links, emails). The site never loads it; see §4
data/                   Reference copies of both datasets + raw source CSV
docs/field-guide.md     Staff-facing column reference (what to type in the sheet)
docs/form-intake-setup.md     How Form -> Sheet -> approval -> site is wired
docs/planned-fields.md  Spec for filters parents asked for that need new columns
docs/org-engagement-playbook.md   Partner outreach guidance
docs/redesign-for-family-help-webpage/   Design handoff materials
```

There is no test suite. Verification has been done by driving a headless Chrome
over the real site and measuring the DOM.

---

## 3. The three tabs

The app presents **three tabs over two datasets**:

| Tab | Key | Dataset | Contains |
|---|---|---|---|
| **Current Activities** | `current` | programs feed | School-year programs — the default tab |
| **GNBYA Organizations** | `year` | organizations feed | 43 year-round organizations, one row each |
| **Summer Activities** | `summer` | programs feed | Summer camps and seasonal programs |

Current Activities and Summer Activities are **one CSV feed split by a single
field** (`Activity Type`, answered by the submitting organization). They share a
fetch, a card renderer, and a filter model. The Organizations tab is a separate
feed with a different shape — it describes *organizations*, not dated sessions,
so it has no dates, no session logic, and its own faceted filters.

Tab order is display order: Current leads because it answers "what can my kid do
now"; Summer trails because it is only relevant part of the year.

**Tab state is per-tab and lossless.** Each tab keeps its own category chips,
toggles, and date range, so switching tabs and back does not lose a parent's
work. Search text and the age chip are global — they apply to whichever tab is
open.

### The Summer tab is a self-flipping archive

Summer listings stay published all year. Out of season the tab becomes an archive
rather than disappearing:

- **March–August**: normal, live tab.
- **September–February**: the tab label gains a **Past** pill; a notice appears
  above the grid reading "Summer &lt;year&gt; · finished" with an explanation and
  a *See what's running now →* button that jumps to Current Activities; every
  card is greyed; every card's action link changes from **Sign up →** to
  **Visit website →**.

This flips itself from the system clock (`SUMMER_ARCHIVED`, read once at load).
Nothing to toggle. The archived-season year follows too: in January it says
"Summer 2025", not 2026.

Crucially, the archive notice makes the "these already ran" claim **at the tab
level, not per card**, because that is the only level at which it is certainly
true. An individual card still only says **Session ended** when its own parsed
dates prove it — a summer listing that genuinely runs "May – December" is greyed
with the season's name but never called finished.

---

## 4. The data pipeline

### Programs (Current + Summer)

```
Partner org fills a Google Form
   -> "Form Responses 1" tab (raw, unreviewed — never read by the site)
   -> staff ticks "Show on site" = TRUE
   -> "Live listings" tab: a FILTER formula over the approved rows
   -> published to the web as CSV
   -> fetched by js/data.js on page load
```

The approval gate lives **in the sheet, not in the app**, and that is deliberate:
anything the app fetches is downloadable by every visitor, so unapproved
submissions (which contain people's contact details) must never reach the
published CSV.

**The sharpest operational edge in the whole system:** the "Live listings" tab is
a `FILTER` formula over a *fixed column range*. Adding a column to the form does
not flow through on its own. A new column requires (1) adding it in Form
Responses, (2) adding the same header text to row 1 of Live listings, and (3)
widening the FILTER range in `Live listings!A2` — and checking that the
`Show on site` reference still points at the right column, because adding columns
shifts letters. When this is wrong, **listings silently vanish or cards go blank
rather than erroring**. Any feature that depends on a new column must budget for
this step.

### The intake Apps Script (edit links and emails)

`apps-script/Code.gs` runs **inside the intake spreadsheet**, not on the site;
it lives in the repo only so there is a record of it. Its settings are for the
**production** intake spreadsheet, and staff notices go to
`philliptrah2015@gmail.com` (`STAFF_EMAIL`). Committing it here does not install
it: someone has to paste it into the production spreadsheet's Apps Script
editor and run `setup()` once. It does three jobs off one
installable "on form submit" trigger, routing on which tab the response landed
in:

1. **New listing submitted** → writes that response's Google Forms *edit link*
   into the `Edit link` column, and emails the listing manager a thank-you with
   that link ("keep it, it's unique to your listing").
2. **Existing listing edited** (an org used its edit link) → refreshes the link
   and emails staff that the listing changed, with a link to the row.
3. **"Get my listing links" form** (a second form, `Form Responses 2`) → if the
   address entered manages any listings, emails that address all its edit links;
   if it manages none, emails *staff* instead. The person asking sees the same
   confirmation either way, so the form cannot be used to discover which
   addresses have listings. One email per address per 10 minutes.

What it deliberately refuses to do:

- **It never writes `Show on site`.** Approval stays a staff decision.
- **It checks row-1 headers before writing.** Column letters are hard-coded
  (manager email `W`, `Show on site` `Z`, `Edit link` `AA`; `Listing Status` in
  `X` is never read or written); if a form change
  shifts columns and the expected headers are no longer there, it stops and
  emails staff rather than writing into the wrong column.
- **It will not guess a match.** A sheet row is matched to its form response by
  timestamp; if two responses share a second, it breaks the tie on the manager
  email, and if that still is not unique it writes nothing, because a wrong
  guess would send someone else's edit link.

- **It never touches a row with no Timestamp.** Those rows were typed straight
  into the sheet by staff and have no form response behind them. The submit
  handler, the backfill and the link lookup all skip them: nothing is written,
  nothing is matched, and no email is sent about them. The backfill writes only
  the individual cells it fills, so a formula or note in a hand-typed row's
  `Edit link` cell survives.

Header comparison ignores capitals and extra spaces, so the production headers
"Listing Manager Email", "Show on Site" and "Edit Link" all satisfy the
script's checks.

`setup()` installs the trigger once; `backfillEditLinks()` fills links for rows
that predate the script, without sending email.

**Consequence worth knowing:** an edit made through an edit link updates the
same sheet row. If that row is already ticked `Show on site`, **the edit is live
on the site at once, with no re-approval**. The staff email says so. Staff are
told, but they are not asked.

### Organizations

Currently read from a **local file** (`data/organizations_placeholder_sheet.csv`),
not a live sheet, because link sharing on the source spreadsheet has not been
enabled. The code is otherwise identical in shape; swapping it to a live URL is a
one-constant change in `js/data.js`. Original data came from GNBYA's own
resource-guide database (43 published organizations); the full printed guide has
about 60, so staff can add the rest as rows.

### Loading behavior

Both feeds are fetched independently and in parallel at startup. Each tab renders
`Loading…` until its dataset arrives, and a failed fetch shows a per-dataset
message ("Sorry, we couldn't load programs right now") rather than an empty page.
The two program tabs are served by the single programs fetch.

---

## 5. Fields and how they are read

Column headers are matched **by name**. Because the intake form has been revised
over time and the published sheet can carry either generation of header for a
while, most fields are read through a `pick()` helper that accepts a list of
names in preference order. This is why the site rides through a form change
instead of going blank on whichever half has not caught up.

### Program object (one per listing)

| App field | Source column(s), in order of preference | Notes |
|---|---|---|
| `id` | slug of org + program name | |
| `organizationName` | `Organization Name` | |
| `programName` | `Program Name` | |
| `gnbyaMember` | `GNBYA member?` | Parsed but not surfaced in the UI |
| `isSummerCamp` | `Activity Type`, `Activity type`, `Summer camp?`, `Season` | Decides the tab. **Blank counts as Summer** |
| `categories` | `Categorization` | Translated to parent-facing labels (§6) |
| `rawCategories` | `Categorization` | Kept so search matches what staff typed |
| `website` | `Website` | Drives the card's action button |
| `ageRange.min/.max` | `Age Minimum` / `Age Maximum` | Numbers; blank allowed |
| `ageRange.display` | `Ages or Grades` | Free text, shown on the card |
| `sessionDates` | `Session Dates` | Free text, shown on the card |
| `sessionRanges` | `Session start`/`Session end` if present, else parsed from `Session Dates` prose | Machine-readable (§7) |
| `hours` | `Hours` | |
| `cost` | `Cost`, `Program Enrollment Cost` | Free text, shown on the card |
| `isFree` | `Is the program free?` if present, **else a `/\bfree\b/i` regex on the cost text** | Drives the Free filter |
| `scholarships` | `Scholarships Provided?` if present, **else a regex on the cost text** for scholarship / financial aid / sliding scale | Drives the Financial aid filter |
| `address` | `Address` | |
| `busAccessible` | `How can kids get to this program?`, `Transportation Accessible?`, `Bus Accessible?` | True when the answer contains "near a/an SRTA bus route", **or** is a legacy Yes / TRUE / Y / X. Drives the Bus accessible filter |
| `schoolPickup` | same transport answer | True when it contains "pick(s) kids up from school". Badge only; there is no filter for it |
| `notRunning` | `Listing status`, `Listing Status` | Staff-set. True only for the exact answer "Not running this season"; blank or "Active" is a normal listing. Both spellings are read because production capitalises the header and the test sheet does not |
| `nearestBusRoute` | `Nearest Bus Route/Stop` | Parsed but not shown on the card |
| `staffLanguageSupport` | `Translation Available?`, `Staff Language Support` | |
| `translationAvailable` | `Languages Provided`, `Translation Available` | Comma-separated list |
| `contact` | `Contact` | Free text: name, email, phone |
| `description` | `Description` | Shown on the card, collapsed to 2 lines |
| `season` | `Season` | Legacy; defaults to "summer" |

Free and financial aid are **separate flags on purpose**: a $300 camp with
scholarships is not free, but it is not out of reach either, and collapsing the
two hid that from exactly the parents who needed to see it.

**Transport is on its third generation of question.** `Bus Accessible?` became
`Transportation Accessible?` (both Yes/No), which became a checkbox list,
`How can kids get to this program?`, with answers such as "The organization is
near a SRTA bus route", "The organization picks kids up from school", and "The
organization picks kids up from home/another location". Several boxes can be
ticked, so one answer can make a listing both bus accessible and school pickup.
The app matches **key phrases, not whole option labels**, because the wording has
already shifted once ("We pick kids up" became "The organization picks kids up",
"an SRTA" became "a SRTA") and an exact match went silently false. A legacy
Yes still counts as bus access. Home/other-location pickup is not read into any
flag today.

The form also now asks `Do staff speak other languages?`. **The app does not read
that column**; language support still comes from the two older columns above.

### Organization object

`name`, `website`, `minAge`, `maxAge`, `gradeLevels[]`, `categories[]` (youth
development + early education services combined), `programYear[]`,
`programModel[]`, `cost[]`, `registration[]`, `transportation[]`, `location`,
`schoolsServed`, `schedule`, `description`.

Multi-value cells use `;` as the separator. Categorization accepts `;` or `,`
(Google Forms joins checkbox answers with commas).

---

## 6. The category taxonomy

Two generations of taxonomy feed the app and neither is plain language:

- The **organizations** directory uses GNBYA's resource-guide names, which are
  coarse and institutional ("Visual Arts/Performing Arts/Culture", "Health Safety
  & Wellness" vs "Mental Health Services").
- The **intake form** now asks for granular values (Music, Art, Theatre, Science,
  Nature, Mentoring, Leadership).

Both are translated **for display only** — nothing upstream changes — into one
shared set of parent-facing labels with emoji:

📚 Homework & Tutoring · 🎨 Arts & Culture · 🎵 Music · 🖌️ Art · 🎭 Theater ·
🌍 Culture · ⚽ Sports & Recreation · 🔬 Science & Nature · 💚 Health & Wellness ·
🤝 Mentoring & Leadership · 💼 Jobs & Career Skills · 👶 Infant & Toddler Care ·
🧸 Preschool Care · 🎒 School-Age Care

Three rules govern this mapping, all enforced in `CATEGORY_DISPLAY` in
`js/data.js`:

- **Several raw values merge into one label** (both health categories; Science
  with Nature), so families are not asked to reason about distinctions that
  matter to funders rather than to them. This is why the app **filters on the
  translated labels, not the raw values**.
- **Music/Art/Theater stay separate** for programs because parents asked for them
  by name; organizations keep one combined "Arts & Culture" chip because one
  coarse value cannot be split into three. This is safe because chips are built
  from whatever the current tab's data contains, so no tab offers a chip that
  matches nothing.
- **Order matters twice**: `CATEGORY_DISPLAY` is in *match precedence* order
  (coarse patterns first, so "Visual Arts" is not stolen by the anchored `^art$`
  rule), while `CATEGORY_ORDER` is in *display* order.

An unrecognised value is **not dropped** — it appears as its own chip without an
emoji. That is the signal that someone invented a new category upstream.

---

## 7. Session dates: prose in, ranges out

Parents asked to filter by date, but the sheet only has a free-text
`Session Dates` column written for humans. So the app reads dates back out of
that text (`parseSessionRanges` in `js/data.js`).

It applies seven patterns, most specific first, each blanking out what it
consumed so a looser pattern cannot re-read the same characters:

`July 1 - Aug 28` · `July 7-9` · `6/24-8/28` · `7/13-17` · `May - December`
(expands to whole months) · bare `July 13` · bare `8/25`.

Supporting behavior: en/em dashes normalise to hyphens; weekday names are
stripped as noise ("Monday, July 13 to Friday, July 17" works); `to`, `through`,
`thru` and `until` all work as separators; **the current calendar year is
assumed**; a range whose end falls before its start rolls the end into the next
year. If a listing yields only lone days and no real range, the earliest and
latest are spanned, so "starting June 16, ending week of 8/25" does not collapse
to two single days.

**A listing whose dates cannot be read is never hidden by the date filter and is
never marked as ended.** Real date columns (`Session start` / `Session end`)
would win outright if they existed, and the parsing would not run.

---

## 8. Derived state on a listing

| Derived | Rule | Effect in the UI |
|---|---|---|
| **Not running** | staff set `Listing status` to "Not running this season" | Card greyed, **Not running this season** badge, sorted to the bottom |
| **Ended** | every parsed range ends before today; a listing with no parsed ranges is never ended | Card greyed, **Session ended** badge, sorted to the bottom |
| **At capacity** | regex over `Session Dates`, `Cost` and `Description` for `filled`, `no availabilit`, `at capacity`, `sold out`, `no openings/spots/space/slots/vacancies`, `wait list only`, `registration closed` | Card greyed, **Currently full** badge, sorted to the bottom |
| **Archived** | out of summer season AND the listing is a summer listing | Card greyed, **Summer &lt;year&gt;** badge, action link becomes *Visit website* |
| **Free** | `isFree` flag | **Free** badge; matched by the Free toggle |
| **Has aid** | `scholarships` flag | **Financial aid** badge (only when not already free) |
| **Bus accessible** | `busAccessible` flag (§5) | **Bus accessible** badge; matched by the toggle |
| **School pickup** | `schoolPickup` flag (§5) | **School pickup** badge. Not filterable |
| **Language support** | staff language text that is not "no", OR a non-empty translation list | **Language support** badge; matched by the toggle |

The capacity regex **deliberately does not match a bare "full"** — the sheet is
full of "Full summer", "Full day" and "Full Year", and greying out a program that
has space costs an organization enrolments. Missing a full one only costs a
parent a click they would have made anyway.

"Not running" is the one status that comes from a staff decision rather than an
inference, so it **outranks everything the app works out from dates and free
text**.

Badge precedence on a card: not running > ended > full > archived (only one of
the four shows), then Free *or* Financial aid, then Bus accessible, then School
pickup, then Language support.

---

## 9. Filtering model

### Controls

| Control | Where | Applies to | Semantics |
|---|---|---|---|
| **Search** | always visible in the sticky bar | all tabs | substring match over program name, organization name, description, translated category labels **and** raw category values |
| **Child's age** | always visible in the sticky bar | all tabs | 5 chips: Any / 5–7 / 8–10 / 11–13 / 14+ |
| **Type of activity** | filter sheet | all tabs | multi-select chips, OR within the set |
| **Free / Financial aid / Bus accessible / Language support** | filter sheet | program tabs | toggle pills, AND across them |
| **When (calendar)** | filter sheet | program tabs only | single day or a two-click range |
| **6 facet dropdowns** | filter sheet | Organizations only | Program Year, Program Model, Grade Levels, Cost, Registration, Transportation. **OR within a facet, AND across facets** |
| **5 quick pills** | filter sheet | Organizations only | Free, Financial aid, After school, No application needed, On a bus route |

The organizations quick pills are **shortcuts into the facets**, not a competing
filter: clicking one ticks the matching boxes in the dropdown and the two stay in
sync. A quick pill whose values appear nowhere in the loaded data is dropped
rather than shown as a pill that always returns nothing. The same data-driven
rule applies to the facet dropdowns and the category chips — every option is
derived from the data actually loaded for the active tab.

### Two rules that recur

- **Age**: a listing matches when its `[min, max]` overlaps the chosen range. A
  listing with no numeric ages (grade-based text like "3rd, 4th, 5th grade
  girls") is **treated as open to everyone** rather than guessed at.
- **Dates**: a listing matches when any of its sessions overlaps the chosen days.
  A listing with no parsed dates always shows.

### The calendar

Built from the active tab's dated listings only. It offers **only the months the
listings actually cover**, shows a per-day count of how many programs run that
day (in the `title` attribute), greys days with nothing running, and opens on
today — or on the first covered month if today falls outside the range. First
click sets the start, second sets the end, clicking earlier than the anchor moves
the anchor, and a complete range starts over on the next click. One clicked day
is a legitimate filter in its own right ("programs running that day"), not a
half-finished range.

### Sorting

Program tabs sort **closed listings (not running, ended, or full) to the
bottom**, so a parent
scanning hits everything still joinable first. The sort is stable, so the sheet's
own order survives inside each group. There is no other sort — sorting by start
date is explicitly blocked on having real date columns, because you cannot
reliably order listings by a parsed guess.

### Clearing

`Clear all` resets search, age, and the active tab's categories, toggles and
dates, plus all organization facets. It is hidden/disabled until something is
actually set. The empty state offers the same button.

---

## 10. The interface, top to bottom

1. **Header** — the page title ("Find a camp or program for your child") beside a
   *Getting started* card with three numbered steps. No logo and no organization
   name: both were removed to buy back vertical space on phones, and the heading
   now scales with its column (`clamp(34px, 4.1vw, 54px)`) so the two columns
   finish level.
2. **Sticky filter bar** — one compact row at every width: search box, a
   **Filters** button carrying a count badge, and the age chips. ~87px tall on
   desktop, ~168px on a phone (where it wraps).
3. **Filter sheet** — everything else lives behind the Filters button, **at every
   width**, as a sheet over the results with a dimmer behind it. Full-bleed on a
   phone, capped at 620px and centred above 760px. It has a grab handle, a title,
   a close ×, a **Clear all**, and an apply button that doubles as a live result
   count ("Show 6 activities"). Four ways out: the ×, the dimmer, Escape, and the
   apply button. Filtering happens as each control is touched, so the apply
   button only dismisses. The body scroll locks while it is open.
4. **Results toolbar** — the three tabs (segmented control) and a live result
   count with `aria-live="polite"`.
5. **Archive notice** — only on the Summer tab, out of season (§3).
6. **Card grid** — responsive; about 3 up on a wide desktop, 1 up on a phone.
7. **Empty state** — two different messages: "this tab has nothing published at
   all" (no Clear button, since there is nothing to clear) versus "your filters
   excluded everything" (offers Clear all). The summer archive gets its own
   wording.
8. **Footer** — a help line pointing at the Alliance family line, a
   "Know a program we're missing?" link that stays hidden until
   `SUGGEST_FORM_URL` is set in `js/data.js`, and "Listings updated weekly by
   participating organizations."

### A program card, in order

- Organization name (small caps) and program name
- A 2×2 **fact grid**: Ages, Cost, Dates, Hours. Missing values show an em dash.
  The card is a **CSS container**, and the grid drops to one fact per row when
  the *card* is too narrow for two — keyed to the card, not the viewport, because
  a card is ~314px in the 3-up desktop layout and ~290px on a phone.
- Badge row (§8)
- Category tags
- **Description**, clamped to a two-line preview with a **See more / See less**
  toggle. The toggle only appears when the text actually overflows; it is
  measured in the DOM after render. Current Activities and Organizations have
  this; the Summer archive keeps full text (its descriptions are short).
- Address with a diamond marker
- Footer: contact text on the left, and on the right a **Sign up →** link to the
  organization's website — which becomes **Visit website →** on an archived
  summer listing, because an archived listing cannot keep a sign-up promise.

### Responsive and accessibility notes

- Verified from 320px to 1600px: no horizontal scroll, nothing past the viewport,
  no clipped text on any tab.
- Tab labels wrap two per row below 600px ("Organizations" is 101px of
  unbreakable word and no readable font size fits a third of a 320px strip).
- The sheet takes `role="dialog"` / `aria-modal` only while open, moves focus to
  its close button, and restores focus to the Filters button on Escape or ×.
- Tabs use `role="tablist"` / `aria-selected`; filter dropdowns and the
  description toggle carry `aria-expanded`; the result count is a live region.
- Dropdown menus flip to right-alignment when they would overflow the viewport.

---

## 11. What is actually in the data today (2026-11-18, production feed)

**28 programs** (6 Current, 22 Summer) and **43 organizations**.
The Summer tab is currently in archive mode, labelled "Summer 2026 · finished".

The production sheet now publishes **23 columns**, up from 18. Alongside the
originals it carries `Program Enrollment Cost`, `Scholarships Provided?`,
`Is the program free?`, `Activity type`, `Listing Status` and
`Do staff speak other languages?`. It still uses `Bus Accessible?`, not the new
transport checkbox question. The test feed (30 programs, 8 Current) already has
`How can kids get to this program?` and `Listing status`.

The six Current Activities listings:

| Program | Organization | Ages | Cost (as written) | Free flag | Dates (as written) | State today |
|---|---|---|---|---|---|---|
| Learn to Ride | Youth Opportunities Unlimited | 7–14 | $80/week, scholarships available | no (aid: yes) | 4 clinics, Sept 14 → Oct 8 | ended |
| School-Time SPARK | Our Sisters' School | "3rd, 4th, 5th grade girls" (no numbers) | blank | **Yes** | Mondays Nov 2–Dec 7 or Tuesdays Jan 26–Mar 9 | open |
| SuperART | Zeiterion Theatre | 11–14 | blank | **Yes** | Tuesdays 9/29–11/17 | ended |
| Teen Ambassador | The Zeiterion Theatre | 13–19 | blank | **Yes** | "Monthly sessions January to June" | parsed as ended (§12) |
| Little Kids Basketball 3v3 | NB Parks, Recreation & Beaches | 5–10 | $130 (residents) | **Yes — contradicts cost (§12)** | Saturdays 10/3–11/21 | open |
| Girls Basketball Clinic | NB Parks, Recreation & Beaches | Grades 4–12 (9–18) | Free | from cost text | Wednesdays 9/2–11/4 | ended |

Only **two** of the six are still joinable today; the other four are greyed and
sorted to the bottom. No listing has a `Listing Status` value yet.

Categories present on this tab: Sports & Recreation, Health & Wellness, Homework
& Tutoring, Art, Science & Nature, Theater, Culture, Mentoring & Leadership,
Music, Jobs & Career Skills.

Every Current listing has a website; one (Girls Basketball Clinic) has no
contact; three of six have no cost text at all, so their Cost cell shows "—"
even when they are flagged free. Descriptions range from 141 to 1,288
characters.

**The thin Current Activities tab — six listings, two still joinable —
is a partner-outreach problem, not a code problem.** No amount of UI work makes
six listings feel like a directory. `docs/org-engagement-playbook.md` is the
companion piece.

---

## 12. Known gaps and sharp edges

These are real, verified against the live feed today. Several are good feature
candidates.

1. **Header matching is exact and case-sensitive** (`rowsToRecords` in
   `js/csv.js`). Capitals already drift: production publishes `Listing Status`
   where the test sheet has `Listing status`, and both sheets publish
   `Activity type` where the form setup docs say `Activity Type`. A field read
   under only one spelling can work in testing and
   silently does nothing on production. `Listing status` hit exactly this and is
   now read under both spellings; any new column should be read through `pick()`
   with every spelling either sheet is known to use. A case-insensitive lookup in
   `rowsToRecords` would remove the whole class of bug, at the cost of touching
   every field at once.
2. **An explicit Yes/No beats the cost text, even when they contradict.**
   Production now fills `Is the program free?` for several listings, which fixed
   the old problem of free programs with a blank cost being missed by the Free
   filter (SuperART, School-Time SPARK and Teen Ambassador now match it). But
   Little Kids Basketball 3v3 answers **Yes** while its cost reads "$130
   (residents)", so the live card shows a **Free** badge beside $130 and the Free
   filter includes it. This is a sheet fix. A feature idea follows from it:
   flag rows whose Yes/No contradicts the cost text, for staff to review.
3. **Financial aid is still inferred.** `Scholarships Provided?` exists on
   production but every value is blank, so aid still comes from a regex over the
   cost text. Only Learn to Ride ("scholarships available") matches among the
   Current listings.
4. **Production has not moved to the new transport question.** It still
   publishes `Bus Accessible?`, so the legacy Yes fallback is what drives bus
   access there, and **School pickup can never appear on production** until the
   `How can kids get to this program?` column is published. School pickup is
   also badge-only: a parent cannot filter for it.
5. **`Do staff speak other languages?` is collected but ignored.** It is on both
   feeds and no code reads it. (All values are blank today.)
6. **Edits to approved listings go live without re-approval** (§4). Fine for
   fixing a typo; it also means an organization can change a live listing's
   content at any time, and staff find out only from an email.
7. **The Apps Script's column letters are hard-coded and only guarded, not
   found.** They match production as confirmed on 2026-11-18 (W, Z, AA). The
   header check stops it writing into a moved column, but the fix is still a
   manual edit of the letters at the top of the script. Adding a form question
   can shift columns. Re-check the letters after any form change, and the script
   must be re-pasted into the spreadsheet after any change to the repo copy.
8. **The date parser assumes the current calendar year.** A listing written for a
   previous year parses into this year, and a recurring annual program described
   as "Monthly sessions January to June" reads as January–June *this* year —
   which, late in the year, marks it **Session ended** and greys it. Teen
   Ambassador is in exactly this state today. There is no notion of a recurring
   or annual program.
9. **No availability data.** Nothing says whether a program has spots. Capacity is
   only detected when someone happens to type "filled" or "no availability" into
   a free-text field.
10. **No registration dates.** A parent cannot tell that something opens in March
   rather than being bookable now.
11. **No numeric cost**, so no cost slider and no "under $X" filter. `Cost` is
   free text written for humans.
12. **No sort control.** Closed listings sink; nothing else is ordered. Sorting by
   start date needs real date columns.
13. **Organizations are a local file**, so that tab does not update without a
   deploy until sheet sharing is enabled.
14. **No deep links.** Filter state and the active tab live only in memory — there
   is no URL state, so a parent cannot share "free programs for a 9-year-old".
15. **No analytics.** Nothing records what parents search for or filter by, so
    there is no evidence base for what to build next.
16. **Expanded descriptions collapse on re-render.** Any filter change rebuilds
    the grid, so an opened description closes. Acceptable today; worth knowing.
17. **`gnbyaMember` and `nearestBusRoute` are parsed but never displayed.**
18. **The FILTER-range gotcha** in §4 is the single most likely way for this site
    to break silently.

---

## 13. Already specced but not built

`docs/planned-fields.md` holds the full spec. Summary:

- **Tier 1 — done.** `Activity Type`, the Current/Summer split.
- **Tier 2 — the two parents asked for most.**
  - `Availability` (Open / Waitlist / Full) **plus `Availability checked`, a
    date.** The second column is the point: a stale "Open" is worse than no
    filter at all, so the UI would say "Openings as of Aug 20" and stop making
    the claim after about two weeks. If nobody will update it monthly, the spec
    says skip it — an honest absence beats a confident wrong answer.
  - `Session start` / `Session end` as real date columns. The calendar already
    ships on parsed prose, so these are an accuracy upgrade — but they are a hard
    prerequisite for sorting by start date.
- **Tier 3 — nice to have.** `Day length` (naming both "full work day" and "full
  school day", because six hours is a full day to a school and half a problem to
  a working parent), `Registration opens` / `Registration closes`, `Cost amount`
  + `Cost period` (for a slider; the human-readable `Cost` column stays), and
  `Vacation weeks` (February / April / Thanksgiving / December breaks — the one
  field that genuinely cannot be derived from dates, and the weeks parents find
  hardest to cover).

Every tier degrades gracefully: a filter whose column is empty is hidden rather
than shown broken.

---

## 14. Design principles to respect when adding features

These are not style preferences; each one was paid for by a real failure.

1. **Never hide a listing you are unsure about.** Unparseable dates, missing
   ages, unknown capacity — all show. Over-showing costs a click; under-showing
   costs a place.
2. **Never make a claim the data does not support.** Tab-level statements for
   tab-level truths; card-level statements only when that card's own data proves
   them.
3. **Translate for parents, at the display layer only.** Nothing upstream is
   rewritten to suit the UI.
4. **Build options from the data.** Chips, facet values, quick pills and calendar
   months are all derived from what is loaded, so no control ever offers
   something that matches nothing.
5. **One layout, not two.** The single filter sheet at all widths deleted three
   workarounds that only existed to keep a mobile and a desktop layout in step.
   Prefer collapsing a split over maintaining both halves.
6. **Measure against the deployed build before claiming an improvement.** A
   recent "fix" for clipped text measured worse than production and was backed
   out; the container-query approach that replaced it was verified the same way.
7. **Assume a phone first**, and assume the parent is scrolling with one hand.
8. **Keep staff out of the code.** If a feature can be a sheet column plus a
   display rule, it should be.
