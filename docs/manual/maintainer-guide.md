# Maintainer guide

This guide is for whoever looks after the Activities Guide technically. The full
technical reference is `docs/system-overview.md`. This guide covers what you
need to keep it running and hand it over safely.

*Checked against production on 21 November 2026.*

## How it fits together

```
Partner fills a Google Form
  -> row lands in the sheet (Activities or Organizations tab)
  -> Apps Script writes the row's edit link and sends emails
  -> staff tick Show on site
  -> Live Activities / Live Organizations (formulas) copy the approved rows
  -> those two tabs are "published to web" as CSV
  -> the website (GitHub Pages) fetches the CSVs on every page load
```

| Piece | Where |
|---|---|
| Spreadsheet | "GNBYA Activities Guide - Data Sheet": https://docs.google.com/spreadsheets/d/1oYJed7Vtqe3TbaG0d1rhDHn796ZOZYnXo3ZpoDYMdC0/edit |
| Forms | GNBYA Activities Intake Form · GNBYA Organizations Intake Form · GNBYA Activities: Get Listing Links (public links on `partners.html`) |
| Script | Extensions → Apps Script in the spreadsheet: `Code.gs` + `OrgForm.gs` in one project. Repo copies in `apps-script/` |
| Website | https://github.com/if-phillip-break/gnbya-activities-app. **Pushing `master` deploys** in 30–90 seconds |
| Feeds | Set in `js/data.js`: `PROGRAMS_CSV_URL` (Live Activities, gid 1329653144) and `ORGS_CSV_URL` (Live Organizations, gid 1960834970) |

## Rules that keep the site working

1. **Never insert, move or delete columns** in Activities or Organizations. The
   script and both Live formulas use fixed column letters, and a shift breaks
   things **silently**: listings vanish or cards go blank, with no error.
2. **Never rename a tab** without updating the script first. `Code.gs` routes
   form submissions by tab name (`Activities`, `Link Requests`, and
   `Organizations` from `OrgForm.gs`), and the formulas refer to tabs by name.
3. **Never edit Live Activities or Live Organizations** except their formula,
   and only deliberately. Both are protected.
4. **Keep the spreadsheet private.** Only the two Live tabs are published. The
   other tabs hold partners' emails and edit links, and an edit link lets anyone
   rewrite that listing.
5. **Never add an Organizations checkbox option containing a comma.** The site
   splits those cells on commas.
6. **Header names matter.** The site finds columns by exact, case-sensitive
   header text, and the script checks row-1 headers before writing.

### The column letters in use today

| Activities | | Organizations | |
|---|---|---|---|
| A | Timestamp | B–Q | the 16 public fields (B = Organization name) |
| W | Listing Manager Email | R | Listing manager email |
| X | Listing Status | S | Organization status |
| Y | Do staff speak other languages? (no longer on the form; still published, unused) | T | Edit link |
| Z | Show on Site | U | Show on site |
| AA | Edit Link | | |

### The two formulas

`Live Activities!A2` (row 1 holds typed headers: B–V, then X, Y):

```
=IFERROR(FILTER(HSTACK(Activities!B2:V, Activities!X2:X, Activities!Y2:Y),
  Activities!Z2:Z=TRUE,
  Activities!X2:X<>"Remove from site",
  ISNA(MATCH(TRIM(Activities!B2:B),
    IFERROR(FILTER(TRIM(Organizations!B2:B), Organizations!B2:B<>"",
      (Organizations!U2:U<>TRUE)+(Organizations!S2:S="Remove from site")),
      "§none§"), 0))), "")
```

The last condition hides activities whose organization is unticked or removed.

`Live Organizations!A1` (headers included):

```
=VSTACK(Organizations!B1:Q1, SORT(FILTER(Organizations!B2:Q,
  Organizations!U2:U=TRUE, Organizations!S2:S<>"Remove from site"), 1, TRUE))
```

## Adding a form question safely

Google Forms adds the new question's column to the response tab itself, and it
can push the staff columns (Show on site, Edit link) to the right. Plan for
that.

1. **File → Version history → Name current version** on the spreadsheet first.
2. Add the question in the form. **Title it exactly** as you want the header.
3. In the response tab, find where the new column landed, and which letters
   Show on site, Edit link, email and status are now in.
4. **Activities:** if Z/AA/W moved, update the letters at the top of `Code.gs`
   (`MANAGER_EMAIL_COLUMN`, `SHOW_ON_SITE_COLUMN`, `EDIT_LINK_COLUMN`) and
   re-paste it. **Organizations:** `Code.gs` finds these by header, so nothing
   to change.
5. Update the matching Live formula: every range and letter that moved, plus
   the new column if it should be public. For Live Activities, also add its
   header to row 1 in the same position. Never publish an email or edit-link
   column.
6. If the website should use the field, change `js/data.js` (read it with
   `pick()` under every spelling) and push.
7. Check: submit a test response, check the published CSV (read it a few times
   over two minutes), then remove the test row's tick.

For Activities, also keep `syncActivityOrgChoices` in mind: "Organization Name"
must stay a multiple-choice question with Other on.

## Updating the Apps Script

1. Change `apps-script/Code.gs` or `OrgForm.gs` in the repo, and run
   `node apps-script/tests/OrgForm.test.js` (all checks must pass).
2. In the spreadsheet: **Extensions → Apps Script**, replace the file's whole
   contents with the repo copy, and **Save**. Both files share one project,
   and a name declared twice stops the whole project loading.
3. The existing trigger keeps working; you don't need to re-run `setup()`
   unless the trigger is missing (**Triggers**, the clock icon, should show
   one `handleFormSubmit` "On form submit").
4. Test with a real submission, then commit the repo copy.

Handy functions to run by hand: `syncActivityOrgChoices` (after renaming an
organization in the sheet) and `backfillEditLinks` (fills missing activity
links, sends no email). Don't run `createOrgForm` or `backfillOrgs` again: they
built the Organizations form and are done.

## Rolling back

- **Sheet:** File → Version history → pick a named version → **Restore**. This
  restores formulas and ticks as well as data, so note any submissions since
  then. Form responses themselves stay in the form.
- **Forms:** there is no version history. Write down a question's exact
  settings before changing it.
- **Script:** re-paste the previous version from git (`git log apps-script/`,
  `git show <commit>:apps-script/Code.gs`).
- **Website:** `git revert <commit>` then `git push origin master`. It's live
  again in about a minute. Visitors' browsers may cache styles for up to 10
  minutes.

## Known gaps

1. **24 of 29 activities were typed in by hand**: no Timestamp, no edit link.
   Partners can't edit those themselves. They'd need to resubmit, and staff
   would then untick the old row. **None of the 29 has a listing manager
   email**, so "Get my listing links" finds no activities yet. Activity links
   go out by hand, and only 5 exist.
2. **42 of 43 organizations have no listing manager email.** Their edit links
   exist but must be sent by hand, and "Get my listing links" can't find them.
3. **Approved edits go live without re-approval.** Staff are told, not asked.
4. **Names typed over form answers can revert** on the partner's next edit
   (Child's Play Parent Joy, New Bedford Parks, Recreation & Beaches, Learn to
   Ride, SuperART, Teen Ambassador). YMCA - New Bedford is unmatched on purpose.
5. **"Is the program free?" overrides the cost text.** If it says Yes beside a
   price, the card shows Free. Little Kids Basketball 3v3 used to do this. It
   says No in production now (checked 21 November), but watch for it on new
   listings.
6. **Dates assume the current year**, so annual programs can show as ended late
   in the year.
7. **No availability, registration dates or numeric cost.** Specs are in
   `docs/planned-fields.md`.
8. **The site reads headers case-sensitively.** A renamed header (even just its
   capitals) can silently drop a field.
9. **A hidden tab, "Activities List"**, is linked to a form. It isn't used by
    the script or the site. Leave it alone until someone confirms what it is.

## Call a developer if…

- Listings or organizations vanish from the site, or cards go blank.
- You get an "Activities Guide form script needs a look" email mentioning
  columns or headers, or a "should say … but says …" message.
- You need a new form question that should show on the website.
- You want to rename a tab, add a column, or change either Live formula.
- Partners stop receiving their thank-you or links emails.
- The website shows "Sorry, we couldn't load programs right now".
- You're moving ownership (below).

## Ownership transfer checklist

Today everything is owned by Phillip's personal Google account and the GitHub
account `if-phillip-break`. Do it in this order, and test after each step.

**Google (spreadsheet, forms, script)**
- [ ] Name a version of the spreadsheet (File → Version history).
- [ ] Make the GNBYA account an **Editor** on the spreadsheet and all three
      forms, then **Share → Transfer ownership** of each. Don't **copy** them:
      a copy gets new IDs, breaks the form links and changes the published CSV
      URLs.
- [ ] Check after transfer: both Live tabs are still under File → Share →
      Publish to web, and the two feed URLs in `js/data.js` still load.
- [ ] Move the trigger. Signed in as GNBYA, open Extensions → Apps Script and
      run `setup()`. This installs a trigger that runs as GNBYA, so emails are
      sent from GNBYA's account. Then have Phillip open **Triggers** and delete
      **his** trigger, otherwise every submission is handled twice.
- [ ] Set `STAFF_EMAIL` at the top of `Code.gs` to a GNBYA inbox. Save, update
      the repo copy, and commit.
- [ ] Test: submit a test activity and organization (thank-you emails arrive),
      edit one (staff email arrives at the new inbox), and request links. Then
      untick or clear the test rows.
- [ ] Remove Phillip's access when GNBYA is happy.

**GitHub and the web address**
- [ ] Decide the long-term address first. Today it's
      `if-phillip-break.github.io/gnbya-activities-app`. A GNBYA domain, such as
      `activities.gnbya.org`, stays the same through any future move: add it
      under the repo's Settings → Pages, and a CNAME record at GNBYA's DNS
      provider.
- [ ] Transfer the repo to a GNBYA GitHub organization (Settings → Transfer).
      Re-check Settings → Pages is on, from `master`.
- [ ] Update links that name the old address: the partner emails and anything
      GNBYA has published, and `ORG_CSV_URL` in `OrgForm.gs` (only used if the
      form is ever rebuilt).
- [ ] Confirm the live site shows the same counts as before (Current, Summer,
      Organizations).

## Not verified

These came from documents or behaviour that couldn't be checked without
changing production:

- **Red rows** ("removed by the organization") are described on the Start Here
  tab, but no row is currently marked "Remove from site", so the colour wasn't
  seen. Yellow was seen on the one unapproved activity. The conditional
  formatting rules weren't opened, because opening that panel can create a
  rule.
- **Where Google puts a new question's column**, and whether it pushes the
  staff columns, wasn't tested. Check after every form change.
- **Whether ownership transfer is allowed** between Phillip's personal account
  and a GNBYA Google Workspace account. Google limits transfers across
  organizations. If it's refused, call a developer before copying anything.
- **Whether the old github.io address redirects** after a repo transfer. Assume
  it doesn't.
- **Live Activities' formula** was read when it was installed earlier on 21
  November, not re-read for this guide. Live Organizations' formula was read
  directly.
