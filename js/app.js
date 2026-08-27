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

// Three tabs over two datasets. "summer" and "current" are two views of the
// same programs feed, split by the sheet's "Summer camp?" tick box; "year" is
// the organizations directory. `noun` labels the result count.
const TABS = [
  { key: "summer", label: "Summer Camps", dataset: "programs", noun: "camp", nounPlural: "camps" },
  { key: "current", label: "Current Activities", dataset: "programs", noun: "activity", nounPlural: "activities" },
  { key: "year", label: "GNBYA Organizations", dataset: "orgs", noun: "organization", nounPlural: "organizations" },
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
const filterBarEl = document.querySelector(".filter-bar");
const tabsEl = document.getElementById("tabs");
const resultCountEl = document.getElementById("result-count");
const cardGridEl = document.getElementById("card-grid");
const emptyStateEl = document.getElementById("empty-state");
const emptyClearBtn = document.getElementById("empty-clear");
const emptyTitleEl = emptyStateEl.querySelector(".empty-title");
const emptyHelpEl = emptyStateEl.querySelector(".empty-help");

// ---------- state ----------

let allPrograms = [];
let allOrganizations = [];
// Keyed by dataset, not by tab: the two program tabs share one fetch.
const dataReady = { programs: false, orgs: false };
const loadError = { programs: null, orgs: null };

let activeTab = "summer";
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

// ---------- shared predicates ----------

// The mapper resolves these from the form's Yes/No answers, falling back to the
// cost text for rows that predate those questions — so the UI just reads flags.
function programIsFree(p) {
  return p.isFree === true;
}
function programHasAid(p) {
  return p.scholarships === true;
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
    // The two program tabs are one dataset split by the sheet's tick box.
    const wantSummerCamp = activeTab === "summer";
    return allPrograms.filter((p) => {
      if (p.isSummerCamp !== wantSummerCamp) return false;
      const hay = searchHaystack(
        [p.programName, p.organizationName, p.description || ""], p
      );
      if (q && !hay.includes(q)) return false;
      if (!ageOverlaps(p.ageRange.min, p.ageRange.max, range)) return false;
      if (t.free && !programIsFree(p)) return false;
      if (t.aid && !programHasAid(p)) return false;
      if (t.bus && !p.busAccessible) return false;
      if (t.lang && !programHasLanguage(p)) return false;
      if (cats.size > 0 && !p.categories.some((c) => cats.has(c))) return false;
      return true;
    });
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

function programCardHTML(p) {
  const badges = [];
  if (programIsFree(p)) badges.push(badge("Free", "info"));
  else if (programHasAid(p)) badges.push(badge("Financial aid", "info"));
  if (p.busAccessible) badges.push(badge("Bus accessible", "plain"));
  if (programHasLanguage(p)) badges.push(badge("Language support", "plain"));

  return `
    <article class="card">
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
      ${p.description ? `<p class="card-desc">${p.description}</p>` : ""}
      ${p.address ? `<div class="card-address"><span class="address-marker" aria-hidden="true">◆</span><span>${p.address}</span></div>` : ""}

      <div class="card-footer">
        <div class="card-contact">${p.contact || ""}</div>
        ${p.website ? `<a class="card-action" href="${p.website}" target="_blank" rel="noopener">Sign up →</a>` : ""}
      </div>
    </article>`;
}

function orgCostSummary(o) {
  if (o.cost.some((c) => /free/i.test(c))) return "Free";
  if (orgIsAffordable(o)) return "Aid available";
  if (o.cost.length) return "Fee";
  return "—";
}

function organizationCardHTML(o) {
  const badges = [];
  if (o.cost.some((c) => /free/i.test(c))) badges.push(badge("Free options", "info"));
  else if (orgIsAffordable(o)) badges.push(badge("Financial aid", "info"));
  if (o.transportation.length) badges.push(badge("Transportation", "plain"));

  const whenValue = o.programYear.length ? o.programYear.join(" · ") : "Year-round";
  const schedValue = o.schedule || (o.programModel.length ? o.programModel.join(" · ") : "");
  const isFree = o.cost.some((c) => /free/i.test(c));

  return `
    <article class="card">
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
      ${o.description ? `<div class="desc-block"><p class="card-desc clampable">${o.description}</p><button type="button" class="see-more-btn" hidden>See more</button></div>` : ""}
      ${o.location ? `<div class="card-address"><span class="address-marker" aria-hidden="true">◆</span><span>${o.location}</span></div>` : ""}

      <div class="card-footer">
        <div class="card-contact">${o.registration.length ? "Registration: " + o.registration.join(", ") : ""}</div>
        ${o.website ? `<a class="card-action" href="${o.website}" target="_blank" rel="noopener">Visit website →</a>` : ""}
      </div>
    </article>`;
}

// ---------- filter-bar rendering ----------

function renderTabs() {
  tabsEl.innerHTML = TABS.map(
    (t) =>
      `<button type="button" role="tab" class="seg-tab ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}" aria-selected="${t.key === activeTab}">${t.label}</button>`
  ).join("");
  tabsEl.querySelectorAll(".seg-tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
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
  facetMenusEl.querySelectorAll(".facet-menu").forEach((m) => (m.hidden = true));
  facetMenusEl.querySelectorAll(".facet-btn").forEach((b) =>
    b.setAttribute("aria-expanded", "false")
  );
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

// ---------- main render ----------

function applyFilters() {
  clearAllBtn.hidden = !anyFilterActive();
  const activeCount = activeFilterCount();
  filtersCountEl.textContent = activeCount ? ` (${activeCount})` : "";
  filtersToggleBtn.classList.toggle("has-active", activeCount > 0);

  const def = tabDef(activeTab);
  const ds = def.dataset;

  if (loadError[ds]) {
    cardGridEl.innerHTML = `<p class="loading">${loadError[ds]}</p>`;
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    return;
  }
  if (!dataReady[ds]) {
    cardGridEl.innerHTML = `<p class="loading">Loading…</p>`;
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    return;
  }

  const list = filteredList();
  resultCountEl.textContent = `${list.length} ${list.length === 1 ? def.noun : def.nounPlural}`;

  if (list.length === 0) {
    cardGridEl.innerHTML = "";
    showEmptyState(def);
    return;
  }
  emptyStateEl.hidden = true;
  const cardFn = isProgramTab(activeTab) ? programCardHTML : organizationCardHTML;
  cardGridEl.innerHTML = list.map(cardFn).join("");
  wireDescriptionClamps();
}

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
  emptyHelpEl.textContent = "Try widening the age range or clearing a filter.";
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
      const expanded = desc.classList.toggle("expanded");
      btn.textContent = expanded ? "See less" : "See more";
    });
  });
}

function setActiveTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  closeAllFacetMenus();
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
  applyFilters();
});
clearAllBtn.addEventListener("click", clearAll);
emptyClearBtn.addEventListener("click", clearAll);

// Mobile: expand/collapse the filter panel. (On wider screens the button is
// hidden by CSS and every control is always visible.)
filtersToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllFacetMenus();
  const open = filterBarEl.classList.toggle("filters-open");
  filtersToggleBtn.setAttribute("aria-expanded", String(open));
});
// Close any open facet dropdown when clicking elsewhere (menu/button clicks
// stopPropagation, so this only fires for outside clicks).
document.addEventListener("click", closeAllFacetMenus);

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
