# Planned fields (the filters parents asked for)

Six filters came out of parent feedback that the site can't build yet, because
there's no data behind them. This is the spec for those columns: what to add,
what the options are, and what each one unlocks.

Nothing here is urgent all at once — it's tiered. **Tier 1 is done**, as a
question on the intake form. Work down only as far as you have appetite for; each
tier stands on its own and the site degrades gracefully, hiding any filter whose
column is empty rather than showing a broken one.

> **Two rules carry over from `field-guide.md`:** column headers must match
> exactly (the site finds columns by name), and a blank cell must never be
> ambiguous. Both still apply to everything below.

---

## Tier 1 — done

### `Activity Type`

The switch that decides which of the two program tabs a listing shows up in.
Originally specced as a staff tick box (`Summer camp?`); it ships instead as a
question the submitting organization answers, so nobody has to classify
listings after the fact.

| Column | Type | Notes |
|---|---|---|
| `Activity Type` | Multiple choice, required | `Summer Activities` → Summer Activities tab. `Current Activities` → Current Activities tab. |

**To wire it up:** add the question to the Form titled exactly `Activity Type`,
then follow "Adding a column without breaking the site" below — the answer does
nothing until the column is in the Live Activities header row *and* inside its
FILTER range.

⚠️ Google decides where the new column lands in "Activities", and it may
push `Show on site` to a different letter. Submit one test response and check
both letters before ticking anything, or the FILTER will read the wrong column.

A blank answer counts as Summer Activities, so every listing approved before the
question existed stayed put. Backfill the ones that actually run year-round by
typing `Current Activities` into the cell. The old `Summer camp?` and `Season`
columns are still read if a row has them, but Activity Type wins.

---

## Tier 2 — the two parents asked for most

### `Availability` + `Availability checked`

Parents wanted to see what still has spots, and wanted waitlists surfaced rather
than hidden.

| Column | Type | Options |
|---|---|---|
| `Availability` | Dropdown | `Open` · `Waitlist` · `Full` |
| `Availability checked` | Date | The day someone last confirmed the value above |

**Why the second column matters.** A stale "Open" is worse than no filter at
all — a parent trusts it, rearranges their week, drives across town, and the
program filled a month ago. The site will show this as *"Openings as of Aug 20"*
rather than a bare "Available" badge, and once the date is more than about two
weeks old it stops making the claim and says "Check with the program" instead.

That means the availability filter is only ever as good as how often someone
updates it. If nobody will realistically touch it monthly, **skip this pair** —
an honest absence beats a confident wrong answer.

### `Session start` + `Session end`

| Column | Type | Notes |
|---|---|---|
| `Session start` | Date | First day of the session |
| `Session end` | Date | Last day |

Keep the existing free-text `Session Dates` column too — it's what parents read
on the card ("July 1 – Aug 28"). These two are the machine-readable version.

**The calendar filter already ships**, working off dates parsed out of the
free-text column — 20 of the 22 listings read correctly, and the two that don't
say "Filled (no availability)", which contains no dates to find. So these
columns are now an accuracy upgrade rather than a prerequisite. What they'd buy:

- **Certainty.** Parsing prose is a heuristic; a date column is a fact. Listings
  we can't parse are shown rather than hidden, so today the failure mode is a
  filter that's slightly too generous.
- **Sorting by start date**, so the soonest options come first. This one really
  does need the columns — you can't reliably order listings by a guess.

Two date columns beat a "weeks offered" checkbox list, which would have to be
rebuilt on the form every year; dates never go stale.

---

## Tier 3 — nice to have

### `Day length`

| Column | Type | Options |
|---|---|---|
| `Day length` | Dropdown | `Full work day (8+ hours)` · `Full school day (about 6 hours)` · `Partial day (under 6 hours)` · `Varies by week` |

The feedback flagged that "full day" is ambiguous, and it is: six hours is a
full day to a school and half a problem to a working parent. So the filter names
both rather than picking one. A parent covering a workday picks the first
option; a parent looking for enrichment after school picks the third.

### `Registration opens` + `Registration closes`

| Column | Type | Notes |
|---|---|---|
| `Registration opens` | Date | Leave blank if registration is always open |
| `Registration closes` | Date | Leave blank if there's no deadline |

Mainly for programs that fill. Lets the site show "Registration opens Mar 1" on
something that isn't bookable yet, instead of a parent clicking through to a
dead end — and warn when a deadline is close.

### `Cost amount` + `Cost period`

| Column | Type | Notes |
|---|---|---|
| `Cost amount` | Number | Digits only — `150`, not `$150/week`. `0` for free. |
| `Cost period` | Dropdown | `per week` · `per session` · `per month` · `one time` |

Needed for the draggable cost slider. The existing `Cost` column stays exactly
as it is — it's free text (`"$50/week"`, `"Scholarships available"`) and it's
what parents read on the card. A slider can't be built on free text, hence the
split: one column for humans, one for the filter.

Where a program has a range, put the lowest number a family could actually pay
in `Cost amount`, and explain the range in `Cost`.

**Free and financial-aid buttons don't need these columns** — they already work
off the existing `Cost` text, and they'll keep working for any listing that
leaves the numeric columns blank.

### `Vacation weeks`

| Column | Type | Options |
|---|---|---|
| `Vacation weeks` | Checkboxes | `February break` · `April break` · `Thanksgiving week` · `December break` · `Summer` |

The one field here that genuinely can't be derived from dates, because school
break weeks move around and don't line up with session ranges. Parents plan
around these specifically, and they're the hardest weeks to find coverage for.

---

## Adding a column without breaking the site

The Live Activities tab is a FILTER formula over a fixed column range, so a new
column doesn't flow through on its own. Each time you add one:

1. Add it in **"Activities"** (as a form question, or as a staff-only
   column to the right).
2. Add the same header text to **row 1 of "Live Activities"**.
3. Update the FILTER range in `'Live Activities'!A2` so the new column is inside it,
   and check that the `Show on site` reference still points at the right column
   — adding columns shifts the letters.
4. Tell the developer the column is live so the matching filter gets switched on.

Step 3 is the one that bites. After any column change, glance at the site: if
listings vanish or a card goes blank, the range is wrong.
