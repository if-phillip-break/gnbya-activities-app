# Handoff: GNBYA Activities Guide (parent-facing redesign)

## Overview
A redesign of the Greater New Bedford Youth Alliance (GNBYA) Activities Guide — a directory where
parents find summer camps, after-school clubs, and year-round youth programs. The redesign puts the
decision-critical facts (availability, cost, ages, dates, hours, transportation, language support)
at the top of every listing and replaces the old checkbox filter row with large tap-friendly chips.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended
look and behavior, not production code to copy directly. The task is to **recreate this design in
the target codebase's existing environment** (React, Vue, Rails views, WordPress theme, etc.) using
its established components, styling approach, and data layer. If no environment exists yet, choose
an appropriate framework and implement there.

Note: `Activities Guide.dc.html` uses a custom streaming-template runtime (`<sc-for>`, `<sc-if>`,
`{{ }}` holes, a `Component` logic class). Treat it as pseudo-markup: `<sc-for>` is a list map,
`<sc-if>` is a conditional, and the logic class body is ordinary JS (filter/sort state) that ports
directly. All styling is inline so every value is visible in the markup.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interaction states are final. Recreate the UI
closely, but substitute the codebase's own primitives (Button, Input, Card, Chip) where they exist.

## Screens / Views

### 1. Activities Guide (single page, three regions)

**Purpose:** a parent searches/filters the directory and picks a program to sign up for.

**Page shell:** `min-height:100vh`, background `#F4F7F5`. All regions use a centered
`max-width:1180px` container with `32px` horizontal padding.

#### A. Header (white, `border-bottom:1px solid #DCE5DE`)
Two-column grid: `grid-template-columns: minmax(0,1.55fr) minmax(280px,1fr)`, `gap:40px`,
`align-items:center`, container padding `22px 32px 0`.
- **Left:** flex row, `gap:22px`, `align-items:center`, `padding-bottom:16px`.
  - GNBYA logo image, `height:96px`, `border-radius:8px`.
  - Eyebrow: "GREATER NEW BEDFORD YOUTH ALLIANCE" — 12px, weight 700, `letter-spacing:0.16em`,
    uppercase, `#157F3D`, `margin-bottom:8px`.
  - H1: "Find a camp or program for your child" — Montserrat 800, 42px, `line-height:1.06`,
    `letter-spacing:-0.02em`, `#12351F`.
- **Right — "Getting started" card:** background `#F1F7F3`, `1px solid #DCE5DE`,
  `border-radius:16px`, padding `18px 20px`, `margin-bottom:16px`. Label 12px/700 uppercase
  `#4F5F55`; three numbered lines (14.5px, `line-height:1.4`, `#2B3B31`, `gap:10px`) with the
  numeral in Montserrat 800 `#157F3D`:
  1. "Enter your child's age to hide programs they can't join."
  2. "Use the filters for free spots, bus routes, or language support."
  3. "Stuck? Call the family line at **(508) 555-0142**."

#### B. Filter bar (sticky, `top:0`, `z-index:20`)
`background:rgba(250,247,242,0.94)`, `backdrop-filter:blur(8px)`, `border-bottom:1px solid #DCE5DE`,
container padding `18px 32px 16px`, column flex `gap:14px`.
- **Row 1:** search input (flex `1 1 300px`, min-width 260px, padding `14px 16px 14px 42px`,
  `1.5px solid #CFDCD3`, `radius 12px`, white, 16px text, leading "⌕" glyph absolutely positioned
  at left 16px, `#6C7C72`; placeholder "Search camps, clubs, or organizations").
  Next to it, an age group: white pill container (`1.5px solid #CFDCD3`, radius 12px,
  padding `6px 6px 6px 14px`) with the label "Child's age" (13px/600 `#4F5F55`) and five chips —
  **Any, 5–7, 8–10, 11–13, 14+**. Chip: radius 9px, 14px/600, padding `9px 14px`,
  `transition:all .12s`; selected = `background:#157F3D; color:#FFFFFF`; unselected = transparent
  with `#3F4F45` text.
- **Row 2:** four toggle pills — **Spots available, Free or scholarship, Bus accessible,
  Language support**. Pill: radius 999px, 14px/600, padding `9px 16px`; off = white,
  `1.5px solid #CFDCD3`, `#3F4F45`; on = `#157F3D` fill, white text, matching border.
  When any filter/search/age is active, a "Clear all" text button appears (`#1B6FA8`, underlined).

#### C. Results
- Toolbar row: segmented tabs in a `#E7EEE9` track (padding 5px, radius 12px) — **Summer camps** /
  **Year-round programs**. Active tab = white fill, `#157F3D` text, `0 1px 3px rgba(22,48,43,0.12)`,
  radius 9px, padding `10px 18px`. Right side: result count ("12 programs"), 15px `#4F5F55`.
- Card grid: `repeat(auto-fill, minmax(345px, 1fr))`, `gap:18px`.

#### Program card
White, `1px solid #DCE5DE`, `border-radius:18px`, padding `22px 22px 18px`, column flex `gap:14px`,
`box-shadow:0 1px 2px rgba(22,48,43,0.04)`; hover `box-shadow:0 8px 24px rgba(22,48,43,0.10)`.
Order of content (this order is the point of the redesign):
1. **Header row** — org name (12px/700 uppercase, `letter-spacing:0.08em`, `#6C7C72`) over program
   name (Montserrat 700, 23px, `line-height:1.15`); right-aligned **status pill** (12.5px/700,
   padding `7px 12px`, radius 999px):
   - open → bg `#E1F3E7`, text `#0E6430` (label e.g. "Spots open", "Drop in, no signup")
   - almost full → bg `#FBEEDA`, text `#8A5A08` (e.g. "2 spots left")
   - filled → bg `#ECEFED`, text `#7E8A83` ("Filled")
2. **Fact grid** — 2×2, 1px gaps over a `#E4EBE6` background acting as hairlines, cells `#F8FBF9`,
   padding `11px 13px`, outer radius 12px. Labels 11px/700 uppercase `#6C7C72`; values:
   Ages and Cost in Montserrat 700 19px (Cost turns `#0E6430` when free), Dates and Hours 14px/600.
3. **Badges** — 12.5px/600, padding `5px 10px`, radius 8px. "Free"/"Scholarships" = `#E3F0F8` bg,
   `#1B6FA8` text; "Bus accessible"/"Language support" = `#EAF1EC` bg, `#4A5A52` text.
4. **Description** — 14.5px, `line-height:1.55`, `#3F4F45` (hidden when `showDescriptions` is off).
5. **Address** — 13.5px `#4F5F55` with a `#1B6FA8` "◆" marker.
6. **Footer** — `border-top:1px solid #E7EEE9`, `padding-top:14px`: contact name/email 13px
   `#6C7C72` on the left; "Sign up →" button on the right (`#157F3D` fill, white, 14px/600,
   padding `10px 16px`, radius 10px; hover `#0E6430`).

#### Empty state
Dashed `1.5px #CFDCD3` border, radius 18px, white, padding `64px 20px`, centered: Montserrat 700
22px "No programs match those filters", 15px `#4F5F55` help line, and a green "Clear all filters"
button.

#### Footer
`background:#EAF1EC`, `border-top:1px solid #DCE5DE`, padding `28px 32px`: help-line sentence
(14.5px `#3F4F45`) left, "Listings updated weekly by participating organizations." (13px `#6C7C72`)
right.

## Interactions & Behavior
- **Search** — case-insensitive substring match across program name + organization + description.
- **Age** — five ranges; a program matches when its `[ageMin, ageMax]` overlaps the selected range.
  "Any" disables the constraint.
- **Toggles** (AND-combined with search/age):
  - Spots available → `spots !== "full"`
  - Free or scholarship → `free || scholarship`
  - Bus accessible → `bus`
  - Language support → `lang`
- **Tabs** — filter on `tab === "summer" | "year"`.
- **Sort** — default "Availability first": open → almost full → filled, then price ascending.
  Alternatives: price ascending, name A–Z.
- **Clear all** — resets query, age to "Any", and all toggles.
- All filtering is client-side and instantaneous (no submit button); chip and card hover
  transitions are `all .12s`.
- Responsive: header grid and card grid both collapse naturally; on narrow screens the card grid
  becomes a single column (auto-fill minmax 345px) and the filter rows wrap.

## State Management
```
query: string          // search text
age: "Any"|"5–7"|"8–10"|"11–13"|"14+"
filters: { available?, free?, bus?, lang?: boolean }
tab: "summer" | "year"
```
Derived per render: filtered + sorted list, result count label, per-card status pill style,
per-card badge list. Two configuration props: `showDescriptions` (boolean, default true) and
`sortBy` (enum, default "Availability first").

**Data fetching:** the prototype hard-codes a `PROGRAMS` array. In production this should come from
the listings source (CMS/API). Fields per program:
`id, tab, name, org, ages (display), ageMin, ageMax, cost (display), price (number, for sort),
free, scholarship, bus, lang, dates, hours, spots ("open"|"few"|"full"), spotsText, address, desc,
contact`. Content in the prototype is representative, not authoritative — replace with real data.

## Design Tokens
**Brand (from the GNBYA logo/site)**
- Green primary `#157F3D`, dark green `#0E6430`, deepest green `#0E4F27` / ink green `#12351F`
- Harbor blue accent (links, informational badges) `#1B6FA8`, hover `#14547E`

**Neutrals**
- Page bg `#F4F7F5`, surface `#FFFFFF`, subtle surface `#F1F7F3` / `#F8FBF9`, footer `#EAF1EC`
- Borders `#DCE5DE`, `#CFDCD3`, hairline `#E4EBE6`, divider `#E7EEE9`
- Text: primary `#1C2B21`, secondary `#3F4F45`, muted `#4F5F55`, faint `#6C7C72`

**Status**
- Open `#E1F3E7` / `#0E6430` · Almost full `#FBEEDA` / `#8A5A08` · Filled `#ECEFED` / `#7E8A83`

**Typography** — Montserrat (500/600/700/800) for headings, numerals, and card titles;
Open Sans (400/500/600/700) for body. Both from Google Fonts.
Scale: 42 / 23 / 19 / 17 / 15 / 14.5 / 14 / 13.5 / 13 / 12.5 / 12 / 11.5 / 11 px.

**Radii** 8, 9, 10, 12, 14, 16, 18, 999px · **Spacing** 4, 5, 6, 8, 10, 12, 14, 18, 22, 26, 32, 40px
**Shadows** `0 1px 2px rgba(22,48,43,0.04)` (rest), `0 8px 24px rgba(22,48,43,0.10)` (hover),
`0 1px 3px rgba(22,48,43,0.12)` (active tab)

## Assets
- `assets/gnbya-logo.avif` — official GNBYA logo, supplied by the user (also on gnbya.org).
  Use the organization's own asset in production; do not recolor it.
- No icons are used beyond two text glyphs ("⌕" search, "◆" location marker) — swap these for the
  codebase's icon set.

## Files
- `Activities Guide.dc.html` — the full design prototype (markup + filter/sort logic).
- `assets/gnbya-logo.avif` — logo used in the header.
