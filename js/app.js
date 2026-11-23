// UI for the single-page Activities Guide: sticky filters, two tabs, cards.
// Data still comes from the CSV layer (see data.js); this file only filters
// and renders. Two datasets back the two tabs:
//   "summer" tab -> allPrograms      (Programs sheet)
//   "year"   tab -> allOrganizations (Year-Round Organizations directory)

// ---------- constants ----------

// Age is a set of ranges (design uses chips, not a number box). A listing
// matches a range when its [min,max] overlaps the selected range.
const AGES = [
  { label: "Any", min: 0, max: 99 },
  { label: "5–7", min: 5, max: 7 },
  { label: "8–10", min: 8, max: 10 },
  { label: "11–13", min: 11, max: 13 },
  { label: "14+", min: 14, max: 18 },
];

// Toggle pills for the two program tabs. Organizations get quick buttons
// instead (ORG_QUICK) because their filters are facet values, not flags.
const PROGRAM_TOGGLES = [
  { key: "free", label: "Free" },
  { key: "aid", label: "Financial aid" },
  { key: "bus", label: "Bus accessible" },
  { key: "lang", label: "Language support" },
];

// Summer listings are only actionable for part of the year: partners publish
// them in the spring and the last sessions finish in late August. Out of season
// the tab becomes an archive rather than disappearing — parents still use it to
// see what a summer here normally looks like, and to ask an organization about
// next year. Season runs March through August; the rest is archive.
const SUMMER_SEASON_FIRST_MONTH = 2; // March
const SUMMER_SEASON_LAST_MONTH = 7; // August

function summerIsArchived(date) {
  const m = date.getMonth();
  return m < SUMMER_SEASON_FIRST_MONTH || m > SUMMER_SEASON_LAST_MONTH;
}

// Which summer the archived listings ran: September onward points at the year
// just gone, January and February at the one before it.
function archivedSeasonYear(date) {
  return date.getMonth() >= SUMMER_SEASON_FIRST_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

// Read once at load. A parent does not leave the page open across a season
// boundary, and recomputing per render would only invite the two halves of the
// UI to disagree mid-session.
const SUMMER_ARCHIVED = summerIsArchived(new Date());
const ARCHIVED_SEASON_YEAR = archivedSeasonYear(new Date());

// Three tabs over two datasets. "summer" and "current" are two views of the
// same programs feed, split by the intake form's Activity Type answer; "year"
// is the organizations directory. `noun` labels the result count.
//
// Order here is display order: Current Activities leads (it's the default
// tab), Summer Activities trails at the far right since it's only relevant
// for part of the year.
const TABS = [
  { key: "current", label: "Current Activities", dataset: "programs", noun: "activity", nounPlural: "activities" },
  { key: "year", label: "GNBYA Organizations", dataset: "orgs", noun: "organization", nounPlural: "organizations" },
  { key: "summer", label: "Summer Activities", tag: SUMMER_ARCHIVED ? "Past" : null, dataset: "programs", noun: "activity", nounPlural: "activities" },
];

function tabDef(key) {
  return TABS.find((t) => t.key === key) || TABS[0];
}
function isProgramTab(key) {
  return tabDef(key).dataset === "programs";
}

// Faceted (multi-select dropdown) filters for the Organizations tab. Each reads a
// list-valued field on the org object; options are derived from the data, ordered
// by the canonical `order` when given (values outside it fall back to alphabetical).
// Data-driven on purpose: when the org intake form/feed is wired up later, any new
// values appear automatically — same architecture as the programs pipeline.
const ORG_FACETS = [
  { key: "programYear", label: "Program Year", field: "programYear",
    order: ["Full Year", "Full Year With Limited Winter Programs", "School Year", "School Holidays/ Breaks", "Summer"] },
  { key: "programModel", label: "Program Model", field: "programModel",
    order: ["Before School", "After School", "Full Day", "Partial Day", "Evening", "Weekend Only", "Summer Only"] },
  { key: "gradeLevels", label: "Grade Levels", field: "gradeLevels",
    order: ["Infant/Toddler", "Pre-K", "Elementary", "Middle", "High", "Out of School", "All Ages"] },
  { key: "cost", label: "Cost", field: "cost",
    order: ["Free", "Fee", "Financial Assistance", "Slide Scale Based on Income", "Accepts Child Care Subsidies"] },
  { key: "registration", label: "Registration", field: "registration",
    order: ["Drop In", "Application Required", "Restricted Access"] },
  { key: "transportation", label: "Transportation", field: "transportation" },
];

// Quick buttons for the Organizations tab. Seven dropdowns is a lot to read
// through, and parent feedback was that filters people wanted were already
// there but unnoticed — so the highest-traffic values get a one-click pill and
// the long tail stays in the menus. Each button is a shortcut into a facet, so
// clicking one ticks the matching boxes in the dropdown and the two stay in
// sync rather than becoming a second, competing filter.
const ORG_QUICK = [
  { label: "Free", facet: "cost", values: ["Free"] },
  { label: "Financial aid", facet: "cost",
    values: ["Financial Assistance", "Slide Scale Based on Income", "Accepts Child Care Subsidies"] },
  { label: "After school", facet: "programModel", values: ["After School"] },
  { label: "No application needed", facet: "registration", values: ["Drop In"] },
  { label: "On a bus route", facet: "transportation", values: ["Accessible From Public Transportation"] },
];

function quickIsActive(q) {
  const sel = selectedFacets[q.facet];
  return q.values.every((v) => sel.has(v));
}

// ---------- element lookups ----------

const searchInput = document.getElementById("search-input");
const ageChipsEl = document.getElementById("age-chips");
const toggleRowEl = document.getElementById("toggle-row");
const clearAllBtn = document.getElementById("clear-all");
const categoryChipsEl = document.getElementById("category-chips");
const facetMenusEl = document.getElementById("facet-menus");
const filtersToggleBtn = document.getElementById("filters-toggle");
const filtersCountEl = document.getElementById("filters-count");
const filterSheetEl = document.getElementById("filter-sheet");
const sheetBackdropEl = document.getElementById("sheet-backdrop");
const sheetCloseBtn = document.getElementById("sheet-close");
const sheetClearBtn = document.getElementById("sheet-clear");
const sheetApplyBtn = document.getElementById("sheet-apply");
const sheetCountEl = document.getElementById("sheet-count");
const tabsEl = document.getElementById("tabs");
const resultCountEl = document.getElementById("result-count");
const cardGridEl = document.getElementById("card-grid");
const emptyStateEl = document.getElementById("empty-state");
const emptyClearBtn = document.getElementById("empty-clear");
const emptyTitleEl = emptyStateEl.querySelector(".empty-title");
const emptyHelpEl = emptyStateEl.querySelector(".empty-help");
const dateFilterEl = document.getElementById("date-filter");
const archiveNoteEl = document.getElementById("archive-note");
const archiveSeasonEl = document.getElementById("archive-season");
const archiveNoteBtn = document.getElementById("archive-note-link");

// ---------- state ----------

let allPrograms = [];
let allOrganizations = [];
// Keyed by dataset, not by tab: the two program tabs share one fetch.
const dataReady = { programs: false, orgs: false };
const loadError = { programs: null, orgs: null };

let activeTab = "current";
let query = "";
let ageLabel = "Any";
// Toggle + category selections are kept per tab so switching tabs is lossless.
const toggleState = {
  summer: { free: false, aid: false, bus: false, lang: false },
  current: { free: false, aid: false, bus: false, lang: false },
  year: {},
};
// Categories are chips on every tab now — parents were missing them when they
// were buried in a dropdown on the Organizations tab.
const selectedCategories = {
  summer: new Set(),
  current: new Set(),
  year: new Set(),
};
// Per-facet selections for the Organizations tab (one Set per ORG_FACETS entry).
const selectedFacets = {};
ORG_FACETS.forEach((f) => (selectedFacets[f.key] = new Set()));

// Calendar date selection, per tab like everything else. `end` stays null while
// the parent has clicked only one day, which reads as "programs running that
// day" — a useful filter in its own right, not a half-finished range.
const dateRangeState = {
  summer: { start: null, end: null },
  current: { start: null, end: null },
  year: { start: null, end: null },
};
let calendarOpen = false;
let calendarCursor = null; // "YYYY-MM" of the month on screen

// ---------- shared predicates ----------

// The mapper resolves these from the form's Yes/No answers, falling back to the
// cost text for rows that predate those questions — so the UI just reads flags.
function programIsFree(p) {
  return p.isFree === true;
}
function programHasAid(p) {
  return p.scholarships === true;
}
// A program matches if any of its sessions overlaps the chosen days. A listing
// whose dates we couldn't read is never excluded — see the note in data.js:
// hiding a real program is worse than showing one the parent must double-check.
function programMatchesDates(p, range) {
  if (!range.start) return true;
  if (!p.sessionRanges || p.sessionRanges.length === 0) return true;
  const end = range.end || range.start;
  return p.sessionRanges.some((r) => r.s <= end && r.e >= range.start);
}
// Whether every session we could read for this program is already over. A
// listing with no parseable dates is never treated as ended — same
// "never hide/gray a listing we're unsure about" rule the date filter follows.
function programHasEnded(p) {
  if (!p.sessionRanges || p.sessionRanges.length === 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  return p.sessionRanges.every((r) => r.e < today);
}

// Staff write capacity into the free-text fields ("Filled (no availability)",
// "No availabilities"), so we read it back out the way session dates are read.
//
// Deliberately NOT matching a bare "full": the sheet is full of "Full summer",
// "Full day" and "Full Year", and greying out a program that has space is the
// expensive mistake here — it costs an organization enrolments. Missing a full
// one only costs a parent the click they would have made anyway, so the list
// stays strict and only grows when a real listing proves it needs to.
const AT_CAPACITY = /\bfilled\b|no availabilit|\bat capacity\b|\bsold out\b|\bno (?:openings|spots|space|slots|vacancies)\b|\bwait\s?list only\b|\bregistration (?:is )?closed\b/i;

function programAtCapacity(p) {
  return [p.sessionDates, p.cost, p.description].some(
    (field) => field && AT_CAPACITY.test(field)
  );
}

// Out-of-season summer listings. Deliberately a season check and nothing
// more: the sheet holds summer rows that genuinely run past August ("May -
// December"), so this greys and re-labels the card but never claims a
// session is over — programHasEnded() stays the only thing allowed to say
// that.
function programIsArchived(p) {
  return SUMMER_ARCHIVED && p.isSummerCamp;
}

// Nothing a parent can act on today: finished, full, or not running.
function programIsClosed(p) {
  return p.notRunning || programHasEnded(p) || programAtCapacity(p);
}
function programHasLanguage(p) {
  const staff =
    p.staffLanguageSupport && p.staffLanguageSupport.toLowerCase() !== "no";
  const trans =
    Array.isArray(p.translationAvailable) && p.translationAvailable.length > 0;
  return Boolean(staff || trans);
}
function orgIsAffordable(o) {
  return o.cost.some((c) =>
    /free|slide scale|financial assistance|subsidies/i.test(c)
  );
}
function ageOverlaps(min, max, range) {
  if (range.label === "Any") return true;
  // Listings without numeric ages (grade-based) can't be checked — treat as open.
  const lo = min == null ? 0 : min;
  const hi = max == null ? 99 : max;
  return lo <= range.max && hi >= range.min;
}
function currentRange() {
  return AGES.find((a) => a.label === ageLabel) || AGES[0];
}
function anyFilterActive() {
  if (query.trim() !== "" || ageLabel !== "Any") return true;
  if (selectedCategories[activeTab].size > 0) return true;
  if (isProgramTab(activeTab)) {
    if (dateRangeState[activeTab].start) return true;
    return Object.values(toggleState[activeTab]).some(Boolean);
  }
  return ORG_FACETS.some((f) => selectedFacets[f.key].size > 0);
}

// How many filters are currently applied, for the mobile "Filters (n)" badge.
// Search isn't counted — its box stays visible, so it's never hidden from view.
function activeFilterCount() {
  let n = ageLabel !== "Any" ? 1 : 0;
  n += selectedCategories[activeTab].size;
  if (isProgramTab(activeTab)) {
    n += Object.values(toggleState[activeTab]).filter(Boolean).length;
    // A date range is one filter however many days it spans.
    if (dateRangeState[activeTab].start) n += 1;
  } else {
    // Quick buttons are shortcuts into the facets, so counting the facet
    // selections already covers them — don't double-count.
    n += ORG_FACETS.reduce((sum, f) => sum + selectedFacets[f.key].size, 0);
  }
  return n;
}

// Order facet values by a canonical list when given; unknown values sort last,
// alphabetically.
function orderedValues(values, order) {
  const arr = [...values];
  if (!order) return arr.sort((a, b) => a.localeCompare(b));
  return arr.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ---------- filtering ----------

// Everything a search query is matched against. Both the parent-facing labels
// and the raw sheet values are included, so searching "mental health" still
// finds listings now displayed under the merged "Health & Wellness" label.
function searchHaystack(parts, item) {
  return `${parts.join(" ")} ${item.categories.join(" ")} ${(item.rawCategories || []).join(" ")}`.toLowerCase();
}

function filteredList() {
  const range = currentRange();
  const q = query.trim().toLowerCase();
  const cats = selectedCategories[activeTab];

  if (isProgramTab(activeTab)) {
    const t = toggleState[activeTab];
    // The two program tabs are one dataset split by the form's Activity Type.
    const wantSummerCamp = activeTab === "summer";
    const matches = allPrograms.filter((p) => {
      if (p.isSummerCamp !== wantSummerCamp) return false;
      const hay = searchHaystack(
        [p.programName, p.organizationName, p.description || ""], p
      );
      if (q && !hay.includes(q)) return false;
      if (!ageOverlaps(p.ageRange.min, p.ageRange.max, range)) return false;
      if (!programMatchesDates(p, dateRangeState[activeTab])) return false;
      if (t.free && !programIsFree(p)) return false;
      if (t.aid && !programHasAid(p)) return false;
      if (t.bus && !p.busAccessible) return false;
      if (t.lang && !programHasLanguage(p)) return false;
      if (cats.size > 0 && !p.categories.some((c) => cats.has(c))) return false;
      return true;
    });
    // Finished and full listings sink to the bottom so a parent scanning the
    // page hits everything still joinable first. Sort is stable, so the sheet's
    // order survives inside each group.
    return matches.sort(
      (a, b) => Number(programIsClosed(a)) - Number(programIsClosed(b))
    );
  }

  return allOrganizations.filter((o) => {
    const hay = searchHaystack([o.name, o.description || ""], o);
    if (q && !hay.includes(q)) return false;
    if (!ageOverlaps(o.minAge, o.maxAge, range)) return false;
    if (cats.size > 0 && !o.categories.some((c) => cats.has(c))) return false;
    // Facet menus: OR within a facet, AND across facets.
    for (const f of ORG_FACETS) {
      const sel = selectedFacets[f.key];
      if (sel.size === 0) continue;
      const vals = o[f.field] || [];
      if (!vals.some((v) => sel.has(v))) return false;
    }
    return true;
  });
}

// ---------- card rendering ----------

function ageBadgeText(minAge, maxAge, fallback) {
  if (minAge != null && maxAge != null) return `Ages ${minAge}-${maxAge}`;
  if (minAge != null) return `Ages ${minAge}+`;
  if (maxAge != null) return `Up to age ${maxAge}`;
  return fallback;
}

function factCell(label, value, opts = {}) {
  const cls = "fact-value" + (opts.big ? " big" : "") + (opts.free ? " cost-free" : "");
  return `
    <div class="fact-cell">
      <div class="fact-label">${label}</div>
      <div class="${cls}">${value || "—"}</div>
    </div>`;
}

function badge(label, tone) {
  return `<span class="badge ${tone === "info" ? "badge-info" : "badge-plain"}">${label}</span>`;
}

function tagRow(categories) {
  if (!categories.length) return "";
  return `<div class="tag-row">${categories
    .map((c) => `<span class="category-tag">${c}</span>`)
    .join("")}</div>`;
}

// A long description makes a card tall enough to push the next listing off the
// screen, so the text clamps to a two-line preview and opens on click. Only
// descriptions that actually overflow get the toggle — wireDescriptionClamps()
// measures each one after it is in the DOM.
function descriptionHTML(text, collapsible) {
  if (!text) return "";
  if (!collapsible) return `<p class="card-desc">${text}</p>`;
  return `<div class="desc-block"><p class="card-desc clampable">${text}</p><button type="button" class="see-more-btn" aria-expanded="false" hidden>See more</button></div>`;
}

// The arrow is its own span so it can nudge on hover; the link reads the same.
function actionLabel(text) {
  return `${text} <span class="card-action-arrow" aria-hidden="true">→</span>`;
}

function programCardHTML(p, i = 0) {
  const badges = [];
  // Not running, over, full, or out of season: greyed in every case, but the
  // badge says which, since a parent can still ask a full program about a
  // waitlist or next season. "Not running" is staff's own call, so it outranks
  // what we infer from dates and free text. The archive badge names the season
  // rather than claiming the listing is finished — only programHasEnded() knows
  // that.
  const notRunning = !!p.notRunning;
  const ended = programHasEnded(p);
  const atCapacity = programAtCapacity(p);
  const archived = programIsArchived(p);
  const closed = notRunning || ended || atCapacity || archived;
  if (notRunning) badges.push(badge("Not running this season", "plain"));
  else if (ended) badges.push(badge("Session ended", "plain"));
  else if (atCapacity) badges.push(badge("Currently full", "plain"));
  else if (archived) badges.push(badge("Summer " + ARCHIVED_SEASON_YEAR, "plain"));
  if (programIsFree(p)) badges.push(badge("Free", "info"));
  else if (programHasAid(p)) badges.push(badge("Financial aid", "info"));
  if (p.busAccessible) badges.push(badge("Bus accessible", "plain"));
  if (p.schoolPickup) badges.push(badge("School pickup", "plain"));
  if (programHasLanguage(p)) badges.push(badge("Language support", "plain"));

  return `
    <article class="card${closed ? " card-past" : ""}" style="--i:${i}">
      <div class="card-top">
        <div style="min-width:0">
          <p class="card-org">${p.organizationName}</p>
          <h2 class="card-title">${p.programName}</h2>
        </div>
      </div>

      <div class="fact-grid">
        ${factCell("Ages", p.ageRange.display, { big: true })}
        ${factCell("Cost", p.cost || (programIsFree(p) ? "Free" : null), { big: true, free: programIsFree(p) })}
        ${factCell("Dates", p.sessionDates)}
        ${factCell("Hours", p.hours)}
      </div>

      ${badges.length ? `<div class="badge-row">${badges.join("")}</div>` : ""}
      ${tagRow(p.categories)}
      ${descriptionHTML(p.description, activeTab === "current")}
      ${p.address ? `<div class="card-address"><span class="address-marker" aria-hidden="true">◆</span><span>${p.address}</span></div>` : ""}

      <div class="card-footer">
        <div class="card-contact">${p.contact || ""}</div>
        ${p.website ? `<a class="card-action" href="${p.website}" target="_blank" rel="noopener">${actionLabel(archived ? "Visit website" : "Sign up")}</a>` : ""}
      </div>
    </article>`;
}

function orgCostSummary(o) {
  if (o.cost.some((c) => /free/i.test(c))) return "Free";
  if (orgIsAffordable(o)) return "Aid available";
  if (o.cost.length) return "Fee";
  return "—";
}

function organizationCardHTML(o, i = 0) {
  const badges = [];
  if (o.cost.some((c) => /free/i.test(c))) badges.push(badge("Free options", "info"));
  else if (orgIsAffordable(o)) badges.push(badge("Financial aid", "info"));
  if (o.transportation.length) badges.push(badge("Transportation", "plain"));

  const whenValue = o.programYear.length ? o.programYear.join(" · ") : "Year-round";
  const schedValue = o.schedule || (o.programModel.length ? o.programModel.join(" · ") : "");
  const isFree = o.cost.some((c) => /free/i.test(c));

  return `
    <article class="card" style="--i:${i}">
      <div class="card-top">
        <div style="min-width:0">
          <h2 class="card-title">${o.name}</h2>
        </div>
      </div>

      <div class="fact-grid">
        ${factCell("Ages", ageBadgeText(o.minAge, o.maxAge, "All ages"), { big: true })}
        ${factCell("Cost", orgCostSummary(o), { big: true, free: isFree })}
        ${factCell("When", whenValue)}
        ${factCell("Schedule", schedValue)}
      </div>

      ${badges.length ? `<div class="badge-row">${badges.join("")}</div>` : ""}
      ${tagRow(o.categories)}
      ${descriptionHTML(o.description, true)}
      ${o.location ? `<div class="card-address"><span class="address-marker" aria-hidden="true">◆</span><span>${o.location}</span></div>` : ""}

      <div class="card-footer">
        <div class="card-contact">${o.registration.length ? "Registration: " + o.registration.join(", ") : ""}</div>
        ${o.website ? `<a class="card-action" href="${o.website}" target="_blank" rel="noopener">${actionLabel("Visit website")}</a>` : ""}
      </div>
    </article>`;
}

// ---------- filter-bar rendering ----------

function renderTabs() {
  // The white highlight behind the active tab is one element that slides
  // between tabs. Redrawing the buttons would drop it, so remember where it
  // was and glide it from there to the new tab.
  const old = tabsEl.querySelector(".seg-indicator");
  const from = old ? old.getAttribute("style") : null;
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button type="button" role="tab" class="seg-tab ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}" aria-selected="${t.key === activeTab}">${t.label}${t.tag ? `<span class="seg-tab-tag">${t.tag}</span>` : ""}</button>`
  ).join("");
  tabsEl.querySelectorAll(".seg-tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
  const indicator = document.createElement("span");
  indicator.className = "seg-indicator";
  indicator.setAttribute("aria-hidden", "true");
  if (from) indicator.setAttribute("style", from);
  tabsEl.prepend(indicator);
  placeSegIndicator(!!from);
}

function placeSegIndicator(animate) {
  const indicator = tabsEl.querySelector(".seg-indicator");
  const active = tabsEl.querySelector(".seg-tab.active");
  if (!indicator || !active) return;
  indicator.classList.toggle("glide", animate);
  if (animate) void indicator.offsetWidth; // start from the old spot
  indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  indicator.style.width = active.offsetWidth + "px";
  indicator.style.height = active.offsetHeight + "px";
}

function renderAgeChips() {
  ageChipsEl.innerHTML = AGES.map(
    (a) =>
      `<button type="button" class="age-chip ${a.label === ageLabel ? "active" : ""}" data-age="${a.label}">${a.label}</button>`
  ).join("");
  ageChipsEl.querySelectorAll(".age-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      ageLabel = btn.dataset.age;
      ageChipsEl.querySelectorAll(".age-chip").forEach((b) =>
        b.classList.toggle("active", b.dataset.age === ageLabel)
      );
      applyFilters();
    });
  });
}

// Every distinct value present in the loaded org data for one facet field.
function orgFacetValues(field) {
  const values = new Set();
  for (const o of allOrganizations) (o[field] || []).forEach((v) => values.add(v));
  return values;
}

function renderToggles() {
  if (isProgramTab(activeTab)) {
    const t = toggleState[activeTab];
    toggleRowEl.innerHTML = PROGRAM_TOGGLES.map(
      (f) =>
        `<button type="button" class="toggle-pill ${t[f.key] ? "active" : ""}" data-key="${f.key}">${f.label}</button>`
    ).join("");
    toggleRowEl.querySelectorAll(".toggle-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        t[key] = !t[key];
        btn.classList.toggle("active", t[key]);
        applyFilters();
      });
    });
    return;
  }

  // Organizations: quick buttons that drive facet selections. A button whose
  // values don't appear anywhere in the data is dropped rather than shown as a
  // pill that always returns nothing.
  const present = {};
  ORG_FACETS.forEach((f) => (present[f.key] = orgFacetValues(f.field)));
  const usable = ORG_QUICK.filter((q) =>
    q.values.some((v) => present[q.facet] && present[q.facet].has(v))
  );

  toggleRowEl.innerHTML = usable
    .map(
      (q) =>
        `<button type="button" class="toggle-pill ${quickIsActive(q) ? "active" : ""}" data-quick="${ORG_QUICK.indexOf(q)}">${q.label}</button>`
    )
    .join("");
  toggleRowEl.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = ORG_QUICK[Number(btn.dataset.quick)];
      const sel = selectedFacets[q.facet];
      const turningOff = quickIsActive(q);
      q.values.forEach((v) => (turningOff ? sel.delete(v) : sel.add(v)));
      renderFacetMenus(); // keep the dropdown's tick boxes in step
      refreshQuickStates();
      applyFilters();
    });
  });
}

// Cheap re-sync of the quick pills after a dropdown tick box changed, without
// re-rendering (and so closing) the open menu.
function refreshQuickStates() {
  toggleRowEl.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.classList.toggle("active", quickIsActive(ORG_QUICK[Number(btn.dataset.quick)]));
  });
}

// The listings the active tab draws from, before any filtering. Used to build
// the category chips so a tab only offers categories it can actually show.
function tabSource() {
  if (isProgramTab(activeTab)) {
    return allPrograms.filter((p) => p.isSummerCamp === (activeTab === "summer"));
  }
  return allOrganizations;
}

function renderCategoryChips() {
  // Categories are chips on every tab. They used to be a dropdown on the
  // Organizations tab, where parents reported not noticing filters that were
  // in fact already there.
  const cats = new Set();
  for (const item of tabSource()) (item.categories || []).forEach((c) => cats.add(c));

  if (cats.size === 0) {
    categoryChipsEl.hidden = true;
    categoryChipsEl.innerHTML = "";
    return;
  }
  categoryChipsEl.hidden = false;
  const selected = selectedCategories[activeTab];
  // Canonical order (see CATEGORY_DISPLAY in data.js); anything unrecognised
  // sorts alphabetically after it.
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => cats.has(c)),
    ...[...cats].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ];
  categoryChipsEl.innerHTML =
    `<span class="chip-label">Type of activity</span>` +
    ordered
      .map(
        (c) =>
          `<button type="button" class="cat-chip ${selected.has(c) ? "active" : ""}" data-category="${c}">${c}</button>`
      )
      .join("");
  categoryChipsEl.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const c = chip.dataset.category;
      if (selected.has(c)) selected.delete(c);
      else selected.add(c);
      chip.classList.toggle("active", selected.has(c));
      applyFilters();
    });
  });
}

// ---------- organizations: facet dropdown menus ----------

function closeAllFacetMenus() {
  [facetMenusEl, dateFilterEl].forEach((root) => {
    root.querySelectorAll(".facet-menu").forEach((m) => (m.hidden = true));
    root.querySelectorAll(".facet-btn").forEach((b) =>
      b.setAttribute("aria-expanded", "false")
    );
  });
  calendarOpen = false;
}

// ---------- calendar date filter ----------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

function isoOf(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}
function monthKey(iso) {
  return iso.slice(0, 7);
}
function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`;
}

// The programs the calendar describes: this tab's listings that have dates at
// all. Undated ones are deliberately excluded here — they're never filtered
// out, so counting them would make every day look equally busy.
function datedPool() {
  return allPrograms.filter(
    (p) => p.isSummerCamp === (activeTab === "summer") && p.sessionRanges.length > 0
  );
}

function renderDateFilter() {
  // Organizations have no session dates, so the control doesn't apply there.
  if (!isProgramTab(activeTab)) {
    dateFilterEl.hidden = true;
    dateFilterEl.innerHTML = "";
    return;
  }
  const pool = datedPool();
  if (pool.length === 0) {
    dateFilterEl.hidden = true;
    dateFilterEl.innerHTML = "";
    return;
  }

  // Only offer months the listings actually cover — paging through empty
  // Februaries is noise.
  let first = pool[0].sessionRanges[0].s;
  let last = first;
  pool.forEach((p) =>
    p.sessionRanges.forEach((r) => {
      if (r.s < first) first = r.s;
      if (r.e > last) last = r.e;
    })
  );
  const minMonth = monthKey(first);
  const maxMonth = monthKey(last);

  const sel = dateRangeState[activeTab];
  if (!calendarCursor || calendarCursor < minMonth || calendarCursor > maxMonth) {
    const today = new Date().toISOString().slice(0, 10);
    calendarCursor = sel.start
      ? monthKey(sel.start)
      : monthKey(today > last ? first : today < first ? first : today);
  }

  const [cy, cm] = calendarCursor.split("-").map(Number);
  const monthIndex = cm - 1;
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const leading = new Date(Date.UTC(cy, monthIndex, 1)).getUTCDay();
  const rangeEnd = sel.end || sel.start;

  let cells = "";
  for (let i = 0; i < leading; i++) cells += `<span class="cal-day blank"></span>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = isoOf(cy, monthIndex, day);
    const count = pool.filter((p) =>
      p.sessionRanges.some((r) => r.s <= iso && r.e >= iso)
    ).length;
    const classes = ["cal-day"];
    if (count === 0) classes.push("cal-none");
    if (sel.start && iso === sel.start) classes.push("cal-start");
    if (rangeEnd && iso === rangeEnd) classes.push("cal-end");
    if (sel.start && rangeEnd && iso > sel.start && iso < rangeEnd) classes.push("cal-mid");
    cells += `<button type="button" class="${classes.join(" ")}" data-date="${iso}" title="${count} running">${day}</button>`;
  }

  const label = sel.start
    ? sel.end && sel.end !== sel.start
      ? `${prettyDate(sel.start)} – ${prettyDate(sel.end)}`
      : prettyDate(sel.start)
    : "Any dates";

  const hint = !sel.start
    ? "Pick a day, then a second day for a range."
    : !sel.end
      ? "Pick a second day for a range, or leave it for one day."
      : "";

  dateFilterEl.innerHTML = `
    <span class="chip-label">When</span>
    <div class="facet date-facet">
      <button type="button" class="facet-btn ${sel.start ? "active" : ""}" aria-expanded="false" aria-haspopup="true">
        <span aria-hidden="true">🗓</span> ${label}<span class="facet-caret" aria-hidden="true">▾</span>
      </button>
      <div class="facet-menu cal-menu" hidden>
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1" ${calendarCursor <= minMonth ? "disabled" : ""} aria-label="Previous month">‹</button>
          <span class="cal-title">${MONTH_NAMES[monthIndex]} ${cy}</span>
          <button type="button" class="cal-nav" data-nav="1" ${calendarCursor >= maxMonth ? "disabled" : ""} aria-label="Next month">›</button>
        </div>
        <div class="cal-grid cal-dow">${DAY_INITIALS.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal-grid cal-days">${cells}</div>
        <div class="cal-foot">
          <span class="cal-hint">${hint}</span>
          <button type="button" class="cal-clear" ${sel.start ? "" : "disabled"}>Clear dates</button>
        </div>
      </div>
    </div>`;
  dateFilterEl.hidden = false;
  wireDateFilter();
}

function wireDateFilter() {
  const btn = dateFilterEl.querySelector(".facet-btn");
  const menu = dateFilterEl.querySelector(".cal-menu");
  if (!btn || !menu) return;

  // Re-rendering replaces the DOM, so restore whatever was open before.
  if (calendarOpen) {
    // Already open before this redraw: show it without replaying the pop-in.
    menu.classList.add("reopen");
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closeAllFacetMenus();
    menu.hidden = !willOpen;
    calendarOpen = willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      menu.classList.remove("align-right");
      if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
        menu.classList.add("align-right");
      }
    }
  });
  menu.addEventListener("click", (e) => e.stopPropagation());

  menu.querySelectorAll(".cal-nav").forEach((nav) => {
    nav.addEventListener("click", () => {
      if (nav.disabled) return;
      calendarCursor = shiftMonth(calendarCursor, Number(nav.dataset.nav));
      renderDateFilter();
    });
  });

  menu.querySelectorAll(".cal-day[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const iso = cell.dataset.date;
      const sel = dateRangeState[activeTab];
      if (!sel.start || sel.end) {
        // Nothing chosen yet, or a complete range — start a new one.
        sel.start = iso;
        sel.end = null;
      } else if (iso < sel.start) {
        sel.start = iso; // clicked earlier than the anchor: move the anchor
      } else {
        sel.end = iso;
      }
      calendarCursor = monthKey(iso);
      applyFilters();
    });
  });

  const clear = menu.querySelector(".cal-clear");
  clear.addEventListener("click", () => {
    dateRangeState[activeTab] = { start: null, end: null };
    applyFilters();
  });
}

function renderFacetMenus() {
  // Facet menus only exist on the Organizations tab.
  if (activeTab !== "year") {
    facetMenusEl.hidden = true;
    facetMenusEl.innerHTML = "";
    return;
  }

  const html = ORG_FACETS.map((f) => {
    const values = new Set();
    for (const o of allOrganizations) (o[f.field] || []).forEach((v) => values.add(v));
    const opts = orderedValues([...values], f.order);
    if (opts.length === 0) return ""; // nothing to filter on → no menu
    const sel = selectedFacets[f.key];
    const optionsHTML = opts
      .map(
        (v) =>
          `<label class="facet-option"><input type="checkbox" value="${v}" ${sel.has(v) ? "checked" : ""}><span>${v}</span></label>`
      )
      .join("");
    return `
      <div class="facet" data-facet="${f.key}">
        <button type="button" class="facet-btn ${sel.size ? "active" : ""}" aria-expanded="false" aria-haspopup="true">
          ${f.label}<span class="facet-count">${sel.size ? ` (${sel.size})` : ""}</span><span class="facet-caret" aria-hidden="true">▾</span>
        </button>
        <div class="facet-menu" hidden>${optionsHTML}</div>
      </div>`;
  }).join("");

  facetMenusEl.innerHTML = html
    ? `<span class="chip-label">More filters</span>${html}`
    : "";
  facetMenusEl.hidden = html.trim() === "";
  wireFacetMenus();
}

function wireFacetMenus() {
  facetMenusEl.querySelectorAll(".facet").forEach((facetEl) => {
    const key = facetEl.dataset.facet;
    const btn = facetEl.querySelector(".facet-btn");
    const menu = facetEl.querySelector(".facet-menu");
    const count = facetEl.querySelector(".facet-count");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      closeAllFacetMenus();
      menu.hidden = !willOpen;
      btn.setAttribute("aria-expanded", String(willOpen));
      // Flip alignment if the menu would spill past the right edge.
      if (willOpen) {
        menu.classList.remove("align-right");
        if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) {
          menu.classList.add("align-right");
        }
      }
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const sel = selectedFacets[key];
        if (cb.checked) sel.add(cb.value);
        else sel.delete(cb.value);
        btn.classList.toggle("active", sel.size > 0);
        count.textContent = sel.size ? ` (${sel.size})` : "";
        refreshQuickStates();
        applyFilters();
      });
    });
  });
}

// ---------- filter sheet ----------

// The refinements open as a sheet over the results at every width; the bar
// keeps only search, the Filters button and age. Opening and closing is just
// a class, never a re-render, so nothing is lost on the way in or out.
let sheetOpen = false;

function openSheet() {
  sheetOpen = true;
  filterSheetEl.classList.add("open");
  sheetBackdropEl.classList.add("open");
  document.body.classList.add("sheet-lock");
  filtersToggleBtn.setAttribute("aria-expanded", "true");
  // Announced as a dialog only while it is one — on desktop the same element
  // is display:contents and has no box to be a dialog.
  filterSheetEl.setAttribute("role", "dialog");
  filterSheetEl.setAttribute("aria-modal", "true");
  filterSheetEl.setAttribute("aria-label", "Filters");
  // A frame later: the sheet is still computed visibility:hidden on the tick
  // the class lands, and focus() is a no-op on a hidden element.
  requestAnimationFrame(() => sheetCloseBtn.focus());
}

function closeSheet(restoreFocus) {
  if (!sheetOpen) return;
  sheetOpen = false;
  closeAllFacetMenus();
  filterSheetEl.classList.remove("open");
  sheetBackdropEl.classList.remove("open");
  document.body.classList.remove("sheet-lock");
  filtersToggleBtn.setAttribute("aria-expanded", "false");
  filterSheetEl.removeAttribute("role");
  filterSheetEl.removeAttribute("aria-modal");
  filterSheetEl.removeAttribute("aria-label");
  if (restoreFocus) filtersToggleBtn.focus();
}

// The apply button doubles as the result count, so a parent ticking filters
// sees what they are about to get before dismissing the sheet.
function setSheetCount(text) {
  sheetCountEl.textContent = text;
}

// ---------- archive notice ----------

// The "these already ran" claim lives here, on the tab, rather than on each
// card — it is the one place we can say it and be right about every listing
// underneath.
function renderArchiveNote() {
  const show = activeTab === "summer" && SUMMER_ARCHIVED;
  archiveNoteEl.hidden = !show;
  if (show) archiveSeasonEl.textContent = "Summer " + ARCHIVED_SEASON_YEAR;
}

// ---------- main render ----------

// How the next redraw of the cards should move. Purely visual:
//   "enter"  a new tab or freshly loaded data: cards rise in, one after another
//   "filter" a filter changed: a quick crossfade
//   "none"   typing in search: no motion, so results don't flicker per key
let nextMotion = "enter";
let lastCountText = "";

// Shown while a feed loads: grey card shapes in place of the listings, so the
// page doesn't jump when they arrive. Screen readers still hear "Loading…".
const SKELETON_HTML =
  `<p class="loading visually-hidden">Loading…</p>` +
  Array.from({ length: 6 }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <span class="sk sk-org"></span>
      <span class="sk sk-title"></span>
      <span class="sk sk-facts"></span>
      <span class="sk sk-line"></span>
      <span class="sk sk-line short"></span>
    </div>`).join("");

function applyFilters() {
  clearAllBtn.hidden = !anyFilterActive();
  sheetClearBtn.disabled = !anyFilterActive();
  const activeCount = activeFilterCount();
  filtersCountEl.textContent = activeCount ? String(activeCount) : "";
  filtersToggleBtn.classList.toggle("has-active", activeCount > 0);
  // Redrawn every pass so the button label and the highlighted days follow the
  // selection; wireDateFilter() puts the popover back if it was open.
  renderDateFilter();
  // Ahead of the loading/error/empty returns below: the notice explains the
  // tab itself, so it belongs on screen even when no cards sit under it.
  renderArchiveNote();

  const def = tabDef(activeTab);
  const ds = def.dataset;

  if (loadError[ds]) {
    cardGridEl.innerHTML = `<p class="loading">${loadError[ds]}</p>`;
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    setSheetCount("results");
    return;
  }
  if (!dataReady[ds]) {
    cardGridEl.innerHTML = SKELETON_HTML;
    nextMotion = "enter"; // the real cards rise in once they arrive
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    setSheetCount("results");
    return;
  }

  const list = filteredList();
  const countText = `${list.length} ${list.length === 1 ? def.noun : def.nounPlural}`;
  resultCountEl.textContent = countText;
  setSheetCount(countText);
  if (countText !== lastCountText && lastCountText !== "") {
    // A small pulse so a changed count is noticed without being read.
    resultCountEl.classList.remove("bump");
    void resultCountEl.offsetWidth;
    resultCountEl.classList.add("bump");
  }
  lastCountText = countText;

  const motion = nextMotion;
  nextMotion = "filter";
  cardGridEl.dataset.motion = motion;

  if (list.length === 0) {
    cardGridEl.innerHTML = "";
    showEmptyState(def);
    return;
  }
  emptyStateEl.hidden = true;
  const cardFn = isProgramTab(activeTab) ? programCardHTML : organizationCardHTML;
  cardGridEl.innerHTML = list.map((item, i) => cardFn(item, i)).join("");
  wireDescriptionClamps();
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Two different kinds of "nothing here": the tab has no listings at all (so
// there's nothing to clear — offering a Clear button would just be confusing),
// or the filters excluded everything.
function showEmptyState(def) {
  emptyStateEl.hidden = false;
  if (tabSource().length === 0) {
    emptyTitleEl.textContent = `No ${def.nounPlural} listed yet`;
    emptyHelpEl.textContent =
      "Nothing has been published in this section so far. The GNBYA Organizations tab lists programs that run year-round.";
    emptyClearBtn.hidden = true;
    return;
  }
  emptyTitleEl.textContent = "No matches for those filters";
  emptyHelpEl.textContent =
    activeTab === "summer" && SUMMER_ARCHIVED
      ? "Nothing in the summer archive matches those filters. Try clearing one."
      : "Try widening the age range or clearing a filter.";
  emptyClearBtn.hidden = false;
}

// After cards are in the DOM, reveal a "See more" toggle only on descriptions
// that actually overflow their clamped height — short ones show in full.
function wireDescriptionClamps() {
  cardGridEl.querySelectorAll(".desc-block").forEach((block) => {
    const desc = block.querySelector(".card-desc.clampable");
    const btn = block.querySelector(".see-more-btn");
    if (!desc || !btn) return;
    if (desc.scrollHeight <= desc.clientHeight + 2) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.addEventListener("click", () => {
      const before = desc.offsetHeight;
      const expanded = desc.classList.toggle("expanded");
      btn.textContent = expanded ? "See less" : "See more";
      btn.setAttribute("aria-expanded", String(expanded));
      // Glide between the two heights instead of jumping.
      const after = desc.offsetHeight;
      if (!reduceMotion.matches && desc.animate && before !== after) {
        desc.animate(
          [{ height: before + "px", overflow: "hidden" }, { height: after + "px", overflow: "hidden" }],
          { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
        );
      }
    });
  });
}

function setActiveTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  closeAllFacetMenus();
  // Each tab keeps its own dates, so the visible month has to follow the tab.
  calendarCursor = null;
  nextMotion = "enter";
  renderTabs();
  renderToggles();
  renderCategoryChips();
  renderFacetMenus();
  applyFilters();
}

function clearAll() {
  query = "";
  searchInput.value = "";
  ageLabel = "Any";
  const t = toggleState[activeTab];
  Object.keys(t).forEach((k) => (t[k] = false));
  selectedCategories[activeTab].clear();
  dateRangeState[activeTab] = { start: null, end: null };
  ORG_FACETS.forEach((f) => selectedFacets[f.key].clear());
  renderAgeChips();
  renderToggles();
  renderCategoryChips();
  renderFacetMenus();
  applyFilters();
}

// ---------- data loading (each tab loads independently) ----------

async function loadPrograms() {
  try {
    const records = await fetchRecords(PROGRAMS_CSV_URL);
    allPrograms = records.map(mapRecordToProgram);
    dataReady.programs = true;
  } catch (error) {
    console.error("Failed to load programs:", error);
    loadError.programs = "Sorry, we couldn't load programs right now. Please try again later.";
  }
  // Both program tabs are served by this one fetch.
  if (isProgramTab(activeTab)) {
    renderCategoryChips();
    applyFilters();
  }
}

async function loadOrganizations() {
  try {
    const records = await fetchRecords(ORGS_CSV_URL);
    allOrganizations = records.map(mapRecordToOrganization);
    dataReady.orgs = true;
  } catch (error) {
    console.error("Failed to load organizations:", error);
    loadError.orgs = "Sorry, we couldn't load organizations right now. Please try again later.";
  }
  if (activeTab === "year") {
    renderToggles();
    renderCategoryChips();
    renderFacetMenus();
    applyFilters();
  }
}

// ---------- init ----------

searchInput.addEventListener("input", () => {
  query = searchInput.value;
  nextMotion = "none";
  applyFilters();
});

// Purely visual: the sticky bar gets a soft shadow once the page scrolls
// under it, and the tab highlight follows the tabs if their size changes.
const filterBarEl = document.querySelector(".filter-bar");
const markScrolled = () => filterBarEl.classList.toggle("scrolled", window.scrollY > 4);
window.addEventListener("scroll", markScrolled, { passive: true });
markScrolled();
if (window.ResizeObserver) new ResizeObserver(() => placeSegIndicator(false)).observe(tabsEl);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeSegIndicator(false));
clearAllBtn.addEventListener("click", clearAll);
archiveNoteBtn.addEventListener("click", () => setActiveTab("current"));
emptyClearBtn.addEventListener("click", clearAll);

// The Filters button is the only way into the refinements, at every width.
filtersToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllFacetMenus();
  if (sheetOpen) closeSheet(false);
  else openSheet();
});

// Four ways out, because a sheet that is hard to dismiss is worse than the
// panel it replaced: the X, the dimmer, Escape, and the apply button (which
// only closes — filtering already happened as each control was touched).
sheetCloseBtn.addEventListener("click", () => closeSheet(true));
sheetApplyBtn.addEventListener("click", () => closeSheet(true));
sheetBackdropEl.addEventListener("click", () => closeSheet(false));
sheetClearBtn.addEventListener("click", clearAll);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheetOpen) closeSheet(true);
});
// Close any open facet dropdown when clicking elsewhere (menu/button clicks
// stopPropagation, so this only fires for outside clicks).
document.addEventListener("click", closeAllFacetMenus);
// A tap inside the sheet is not an outside click. Without this the document
// listener above would collapse an accordion the moment it was opened.
filterSheetEl.addEventListener("click", (e) => e.stopPropagation());

// The suggest-a-program link only appears once a form URL is configured.
const suggestLinkEl = document.getElementById("suggest-link");
if (SUGGEST_FORM_URL) {
  suggestLinkEl.href = SUGGEST_FORM_URL;
  suggestLinkEl.hidden = false;
}

renderTabs();
renderAgeChips();
renderToggles();
renderCategoryChips();
renderFacetMenus();
applyFilters();

loadPrograms();
loadOrganizations();
