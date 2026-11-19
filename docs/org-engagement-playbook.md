# Keeping listings fresh: an ops playbook

Everything in here happens in Google Forms and Sheets, not in the site's code.
It covers the half of the parent feedback that isn't a filter: how organizations
update their listings, how staff nudge them, and how you tell whether it's
working.

The site can only ever be as good as the freshness of what's behind it. A
directory that's 80% accurate and trusted beats one that's 95% complete and
quietly stale.

---

## 1. Let organizations edit what they already submitted

Today an org that wants to change a detail has to fill in the whole form again,
which produces a duplicate row someone has to notice and reconcile. Google Forms
can hand each submitter a private link that reopens *their* response for
editing.

**Turn it on:** in the Form, Settings → Responses → **Allow response editing**.

That only helps people who kept the confirmation email, so pull the links into
the sheet where staff can find them:

1. In the spreadsheet: **Extensions → Apps Script**.
2. Paste the script below, replacing `PASTE_FORM_ID_HERE` with the long id from
   the form's edit URL (`docs.google.com/forms/d/`**`THIS_PART`**`/edit`).
3. Run it once, accept the permission prompt, then set it on a daily trigger
   (the clock icon → Add Trigger → Time-driven → Day timer).

```javascript
function addEditUrls() {
  const FORM_ID = 'PASTE_FORM_ID_HERE';
  const COLUMN  = 'Edit link';

  const sheet = SpreadsheetApp.getActive().getSheetByName('Activities');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let col = headers.indexOf(COLUMN) + 1;
  if (col === 0) {
    col = headers.length + 1;
    sheet.getRange(1, col).setValue(COLUMN);
  }

  // Each response's timestamp (to the second) identifies its row.
  const urls = {};
  FormApp.openById(FORM_ID).getResponses().forEach(function (r) {
    urls[Math.floor(r.getTimestamp().getTime() / 1000)] = r.getEditResponseUrl();
  });

  const last = sheet.getLastRow();
  if (last < 2) return;
  const rows = sheet.getRange(2, 1, last - 1, 1).getValues().map(function (row) {
    const ts = row[0];
    if (!(ts instanceof Date)) return [''];
    return [urls[Math.floor(ts.getTime() / 1000)] || ''];
  });
  sheet.getRange(2, col, rows.length, 1).setValues(rows);
}
```

> ⚠️ **Keep the `Edit link` column out of the published range.** Anyone holding
> one of these URLs can edit that submission with no password. Put the column to
> the right of `Show on site`, and never widen the Live Activities FILTER to
> include it. If an edit link ever reaches the public CSV, strangers can rewrite
> your listings.

Once this is running, "update your listing" is one email with one link, and
edits land on the existing row instead of creating a duplicate.

## 2. Don't make orgs retype a season that hasn't changed

Fall and spring programming is often identical. With edit links in place the
seasonal refresh becomes:

- **Unchanged?** The org opens their edit link, changes the dates, resubmits.
- **Changed?** Same link, they edit the details that moved.
- **Not running this season?** Staff untick `Show on site`. The listing drops off
  the site but stays in the sheet, ready to be re-ticked next time.

That last one matters most. Unticking is reversible and costs nothing, so
there's never a reason to delete a row — which means next season's work is
re-approval rather than re-entry.

## 3. Confirm before you publish a timeline

Anything with a date attached — registration windows, session start dates — is
worth a quick confirmation before it goes live, because a wrong date sends
parents somewhere that isn't open. Suggested bar: **don't tick `Show on site`
on a dated listing until someone has eyes on the org's own page or has heard
back from them.** Undated evergreen listings don't need this.

## 4. Reminders and incentives

Reminders work when they're specific and rare. Two a year, tied to when parents
are actually looking:

- **Late July** — "the school-year guide publishes in three weeks, here's your
  edit link."
- **Early February** — "summer camp listings go live in March, here's your edit
  link."

What makes orgs respond isn't the reminder, it's what they get back:

- Tell them how many parents viewed their listing. Nothing else lands like it.
- Publish a "recently updated" marker on cards, so keeping current is visible.
- Give complete listings better placement than sparse ones, and say so.
- Let them know when they're the only org offering something in a category.

## 5. Capacity and real-time availability

This is the hardest ask in the feedback and the easiest to get wrong. See
`planned-fields.md` for the field design; the operational question is simply
**who updates it and how often.**

Be honest about the answer before switching it on. An availability filter nobody
maintains actively misleads parents — worse than not having it. If monthly
updates aren't realistic, a better version of the same idea is a "typically
fills by March" note, which is true all year and needs no upkeep.

## 6. Sequencing across the year

From the feedback: parents plan seasonally and start at back-to-school.

- **August** — school-year programming goes live. This is the anchor.
- **October** — check in, fix what's wrong, chase gaps.
- **February** — summer intake opens.
- **March/April** — summer listings live, the highest-traffic moment.
- **June** — vacation-week and school-break coverage.

Staggering like this also spreads the staff approval load, instead of stacking
every listing into one week.

---

## The staff dashboard

Metrics live on a new tab in the intake spreadsheet, not on the website. The
site is on GitHub Pages, which has no login — anything published there is
readable by anyone with the URL. The spreadsheet is already private and already
has the right people in it, so a tab there is genuinely staff-only with no
hosting, no code, and nothing that can leak.

Add a tab called **Dashboard** and paste these in.

> Column letters assume the layout in `form-intake-setup.md`: A = Timestamp,
> B = Organization name, D = Categorization, E = Description, L = Cost,
> R = Contact, S = Show on site. **If you've added columns, these shift** —
> check the letters before trusting a number.

**Headline counts**

```
Total submissions      =COUNTA(Activities!A2:A)
Live on the site       =COUNTIF(Activities!S:S, TRUE)
Awaiting review        =COUNTA(Activities!A2:A)-COUNTIF(Activities!S:S,TRUE)
Organizations live     =COUNTUNIQUE(FILTER(Activities!B2:B,Activities!S2:S=TRUE))
```

**Data completeness** — live listings that have a category, a description, a
cost and a contact:

```
=COUNTIFS(Activities!$S:$S,TRUE,Activities!$D:$D,"<>",
          Activities!$E:$E,"<>",Activities!$L:$L,"<>",
          Activities!$R:$R,"<>")
```

Divide by the "Live on the site" figure for the percentage. This is the single
number worth watching — it's what decides whether a parent's filter returns
anything useful.

**Going stale** — live listings untouched in six months:

```
=COUNTIFS(Activities!S:S,TRUE,Activities!A:A,"<"&TODAY()-180)
```

**Per-organization view** — listing count and last update, oldest first, so the
top of the list is your call sheet:

```
=QUERY({Activities!B2:B,Activities!A2:A,Activities!S2:S},
  "select Col1, count(Col2), max(Col2)
   where Col3 = TRUE
   group by Col1
   order by max(Col2)
   label count(Col2) 'Listings', max(Col2) 'Last updated'", 0)
```

**Submissions by month** — shows whether reminders actually moved anything:

```
=QUERY({TEXT(Activities!A2:A,"yyyy-mm"),Activities!A2:A},
  "select Col1, count(Col2) where Col1 <> '' group by Col1 order by Col1
   label count(Col2) 'Submissions'", 0)
```

Treat these as starting points rather than finished reporting — run each one and
sanity-check it against a number you can count by hand before anyone makes a
decision on it.
