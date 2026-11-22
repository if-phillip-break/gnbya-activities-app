# Staff guide: running the Activities Guide day to day

The Activities Guide website (https://if-phillip-break.github.io/gnbya-activities-app/)
shows whatever is approved in one Google Sheet, the **GNBYA Activities Guide -
Data Sheet**. You never need to touch the website itself. Everything you do
happens in that sheet, and the **Start Here** tab inside it is a one-screen
version of this guide.

*Checked against the production sheet, forms and script on 21 November 2026.*

## The tabs

| Tab | What it is | Do you work in it? |
|---|---|---|
| **Activities** | Every program ever submitted: one row each | Yes: approve here (column Z, **Show on Site**) |
| **Organizations** | Every organization profile: one row each | Yes: approve here (column U, **Show on site**) |
| **Live Activities**, **Live Organizations** | Copies of the approved rows that feed the website | **No.** They update themselves. Editing them breaks the site |
| **Link Requests** | A log of "Get my listing links" requests | No, nothing to do there |

A padlock on a tab means it's protected. If Google warns you before an edit,
stop and check you're in the right place.

## Approving something new

Nothing appears on the website until a staff member ticks its box.

**A new activity**
1. New submissions arrive at the bottom of **Activities**. Rows waiting for
   approval are **yellow**.
2. Read it through. Check especially:
    - the organization name matches an organization exactly (see "When an
      organization goes inactive" below);
    - "Is the program free?" agrees with the cost;
    - "Activity Type" is right: Current Activities for the school year, Summer
      Activities for summer.
3. Tick **Show on Site** (column Z). It's on the website within about five
   minutes.

> **You are not emailed about new activities.** The script emails the partner
> a thank-you, but nothing comes to staff. Look at the Activities tab for
> yellow rows at least once a week.

**A new organization**
1. You'll get an email, "New organization waiting for approval: *name*", with a
   link to the row in **Organizations**.
2. Review it and tick **Show on site** (column U).

If something isn't fit to publish, just leave it unticked. There's no need to
delete the row.

## What the row colours mean

Only the **Activities** tab colours its rows. In Organizations, check the
**Show on site** box (column U) instead: its rows just have plain alternating
stripes.

- **Yellow**: waiting for approval (Show on Site isn't ticked).
- **Red**: the organization removed this listing itself by choosing "Remove
  from site". It has already gone from the website. Leave it unless they ask
  to come back.

## Staff emails and what to do about them

All of these go to the address set as `STAFF_EMAIL` in the script. Today that's
Phillip's personal Gmail. Moving it to a GNBYA inbox is on the handover
checklist in `maintainer-guide.md`.

| Subject | What it means | What to do |
|---|---|---|
| **New organization waiting for approval:** *name* | A new organization profile came in | Review it; tick Show on site (column U) |
| **Organization edited:** *name* | An organization changed its profile through its edit link. If it was already approved, the change is **already live**. The email shows its status | Skim the change. If it now says "Remove from site", it's already off the site |
| **Listing edited:** *organization – program* | A partner changed an activity through its edit link. If it was already approved, the change is **already live** | Skim the change and fix anything wrong (see "Making changes") |
| **Listing links requested for an unknown email** | Someone asked for their edit links, but no listing has that email | Reply to them. Find their rows, copy the links from the Edit Link column and send them yourself |
| **Activities Guide form script needs a look** | The script couldn't do its job, for example no edit link could be written, an email was invalid, or a column moved | Follow what the email says if it's simple (for example, send a link by hand). If it mentions columns or headers, call your maintainer |

## Making changes

**For a row that came in through a form** (it has a Timestamp in column A and a
link in the **Edit Link** column):
1. Open the link in its Edit Link column (Activities: column AA,
   Organizations: column T).
2. Change the answers and click **Submit**.
3. The row updates in place. You'll get the usual "edited" email, and if the
   row was approved, the change is live within minutes.

**Don't type over a form row's answers in the sheet.** The form still holds the
old answers, so the next time that partner edits, your typing is silently
replaced.

**Rows typed in by hand** (column A, Timestamp, is blank) have no form behind
them and no edit link. **Most activities on the site today are like this: 24 of
29.** For these, typing in the cell *is* the way to change them, and it's safe.
Never change the Organization Name cell without checking it still matches the
Organizations tab exactly.

Some form answers can't be resubmitted without filling in questions added since
the partner first submitted. If an edit link asks for answers you don't have,
ask the partner to do it, or check with your maintainer.

## Removing or hiding a listing

| You want to… | Do this | Undo |
|---|---|---|
| Hide an activity | Untick **Show on Site** (column Z) | Tick it again |
| Hide an organization | Untick **Show on site** (column U). Its activities hide too (below) | Tick it again |
| Show an activity as "not running" without hiding it | In its edit link, set **Listing Status** to "Not running this season". The card is greyed and moved to the bottom | Set it back to "Active" |

Partners can take things down themselves: "Remove from site" in Listing Status
(activities) or Organization status (organizations). It disappears at once and
the row turns red. You don't need to do anything.

## When an organization goes inactive

If an organization is unticked **or** marked "Remove from site", **every
activity under its name disappears from the site too.** Nothing on the
activities themselves changes, so ticking the organization again brings them
all back with no re-approval.

This depends on the activity's Organization Name matching the organization's
name exactly (capitals and extra spaces don't matter). An activity whose
organization isn't in the Organizations tab, such as a partner who chose
"Other" on the form, always shows. Two cases to know about:

- **YMCA - New Bedford** is left unmatched on purpose until GNBYA confirms
  whether it's the same organization as "YMCA SC Camp Frederick Douglass".
- Some names were corrected by typing in the cell (Child's Play Parent Joy, New
  Bedford Parks, Recreation & Beaches, and three activities). If one of those
  partners edits through their link, the old name can come back. You'll see it
  in the "edited" email: fix the name again. If you rename an organization by
  typing, ask your maintainer to run `syncActivityOrgChoices` so the Activities
  form's list matches.

## Sending a partner their links

- **One link:** copy it from the row's Edit Link column (Activities AA,
  Organizations T) and email it to that partner only. Anyone with the link can
  change the listing, so never post it publicly.
- **Self-service:** the "Lost your edit links?" form on the partners page
  (https://if-phillip-break.github.io/gnbya-activities-app/partners.html)
  emails every link for the address entered. It only finds rows whose
  **listing manager email** matches. **Today only 1 of 43 organizations has
  one, and no activity does** (the email question was added after they were
  submitted). Until each partner has edited once and added an email, send
  links by hand.
- **Never send an already-listed partner the blank form.** Filling it in again
  creates a duplicate rather than updating their entry.

## How long changes take

- **About five minutes** from ticking a box or submitting an edit to the
  website showing it.
- For about two minutes during that, some visitors may still see the old
  version. If you're checking, reload a couple of times.
- If something hasn't appeared after ten minutes, check the row really is
  ticked and isn't marked "Remove from site", and that its organization is
  ticked.

*Not verified: the red colour for removed rows is described on the Start Here
tab, but no row is currently marked "Remove from site", so it wasn't seen.
Yellow was seen on the one unapproved activity.*

## Where to get help

- Families and partners are pointed to **lead@gnbya.org**: in step 3 of
  "Getting started" and the footer on the website, the partners page footer,
  and the descriptions of the Activities form and "Get my listing links" form.
  (The Organizations form doesn't mention it.) Make sure someone at GNBYA
  reads that inbox.
- Anything technical: see `maintainer-guide.md` and its "Call a developer if…"
  list.
