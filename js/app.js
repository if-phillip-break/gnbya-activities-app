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

// Toggle pills differ per tab: orgs don't carry bus/language flags, so their
// bar only offers affordability.
const PROGRAM_TOGGLES = [
  { key: "free", label: "Free or scholarship" },
  { key: "bus", label: "Bus accessible" },
  { key: "lang", label: "Language support" },
];
const ORG_TOGGLES = [{ key: "free", label: "Free or financial help" }];

const TABS = [
  { key: "summer", label: "Summer camps" },
  { key: "year", label: "Year-round programs" },
];

// ---------- element lookups ----------

const searchInput = document.getElementById("search-input");
const ageChipsEl = document.getElementById("age-chips");
const toggleRowEl = document.getElementById("toggle-row");
const clearAllBtn = document.getElementById("clear-all");
const categoryChipsEl = document.getElementById("category-chips");
const tabsEl = document.getElementById("tabs");
const resultCountEl = document.getElementById("result-count");
const cardGridEl = document.getElementById("card-grid");
const emptyStateEl = document.getElementById("empty-state");
const emptyClearBtn = document.getElementById("empty-clear");

// ---------- state ----------

let allPrograms = [];
let allOrganizations = [];
const dataReady = { summer: false, year: false };
const loadError = { summer: null, year: null };

let activeTab = "summer";
let query = "";
let ageLabel = "Any";
// Toggle + category selections are kept per tab so switching tabs is lossless.
const toggleState = {
  summer: { free: false, bus: false, lang: false },
  year: { free: false },
};
const selectedCategories = { summer: new Set(), year: new Set() };

// ---------- shared predicates ----------

function programIsFree(p) {
  return /free|scholarship/i.test(p.cost || "");
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
  const t = toggleState[activeTab];
  return (
    query.trim() !== "" ||
    ageLabel !== "Any" ||
    Object.values(t).some(Boolean) ||
    selectedCategories[activeTab].size > 0
  );
}

// ---------- filtering ----------

function filteredList() {
  const range = currentRange();
  const q = query.trim().toLowerCase();
  const t = toggleState[activeTab];
  const cats = selectedCategories[activeTab];

  if (activeTab === "summer") {
    return allPrograms.filter((p) => {
      const hay = `${p.programName} ${p.organizationName} ${p.description || ""} ${p.categories.join(" ")}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (!ageOverlaps(p.ageRange.min, p.ageRange.max, range)) return false;
      if (t.free && !programIsFree(p)) return false;
      if (t.bus && !p.busAccessible) return false;
      if (t.lang && !programHasLanguage(p)) return false;
      if (cats.size > 0 && !p.categories.some((c) => cats.has(c))) return false;
      return true;
    });
  }

  return allOrganizations.filter((o) => {
    const hay = `${o.name} ${o.description || ""} ${o.categories.join(" ")}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (!ageOverlaps(o.minAge, o.maxAge, range)) return false;
    if (t.free && !orgIsAffordable(o)) return false;
    if (cats.size > 0 && !o.categories.some((c) => cats.has(c))) return false;
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
  if (/free/i.test(p.cost || "")) badges.push(badge("Free", "info"));
  else if (/scholarship/i.test(p.cost || "")) badges.push(badge("Scholarships", "info"));
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
        ${factCell("Cost", p.cost, { big: true, free: programIsFree(p) })}
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

function renderToggles() {
  const defs = activeTab === "summer" ? PROGRAM_TOGGLES : ORG_TOGGLES;
  const t = toggleState[activeTab];
  toggleRowEl.innerHTML = defs
    .map(
      (f) =>
        `<button type="button" class="toggle-pill ${t[f.key] ? "active" : ""}" data-key="${f.key}">${f.label}</button>`
    )
    .join("");
  toggleRowEl.querySelectorAll(".toggle-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      t[key] = !t[key];
      btn.classList.toggle("active", t[key]);
      applyFilters();
    });
  });
}

function renderCategoryChips() {
  const source = activeTab === "summer" ? allPrograms : allOrganizations;
  const cats = new Set();
  for (const item of source) (item.categories || []).forEach((c) => cats.add(c));

  if (cats.size === 0) {
    categoryChipsEl.hidden = true;
    categoryChipsEl.innerHTML = "";
    return;
  }
  categoryChipsEl.hidden = false;
  const selected = selectedCategories[activeTab];
  categoryChipsEl.innerHTML =
    `<span class="chip-label">Categories</span>` +
    [...cats]
      .sort()
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

// ---------- main render ----------

function applyFilters() {
  clearAllBtn.hidden = !anyFilterActive();

  if (loadError[activeTab]) {
    cardGridEl.innerHTML = `<p class="loading">${loadError[activeTab]}</p>`;
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    return;
  }
  if (!dataReady[activeTab]) {
    cardGridEl.innerHTML = `<p class="loading">Loading…</p>`;
    emptyStateEl.hidden = true;
    resultCountEl.textContent = "";
    return;
  }

  const list = filteredList();
  const noun = activeTab === "summer" ? "program" : "organization";
  resultCountEl.textContent = `${list.length} ${noun}${list.length === 1 ? "" : "s"}`;

  if (list.length === 0) {
    cardGridEl.innerHTML = "";
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;
  const cardFn = activeTab === "summer" ? programCardHTML : organizationCardHTML;
  cardGridEl.innerHTML = list.map(cardFn).join("");
  wireDescriptionClamps();
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
  renderTabs();
  renderToggles();
  renderCategoryChips();
  applyFilters();
}

function clearAll() {
  query = "";
  searchInput.value = "";
  ageLabel = "Any";
  const t = toggleState[activeTab];
  Object.keys(t).forEach((k) => (t[k] = false));
  selectedCategories[activeTab].clear();
  renderAgeChips();
  renderToggles();
  renderCategoryChips();
  applyFilters();
}

// ---------- data loading (each tab loads independently) ----------

async function loadPrograms() {
  try {
    const records = await fetchRecords(PROGRAMS_CSV_URL);
    allPrograms = records.map(mapRecordToProgram);
    dataReady.summer = true;
  } catch (error) {
    console.error("Failed to load programs:", error);
    loadError.summer = "Sorry, we couldn't load programs right now. Please try again later.";
  }
  if (activeTab === "summer") {
    renderCategoryChips();
    applyFilters();
  }
}

async function loadOrganizations() {
  try {
    const records = await fetchRecords(ORGS_CSV_URL);
    allOrganizations = records.map(mapRecordToOrganization);
    dataReady.year = true;
  } catch (error) {
    console.error("Failed to load organizations:", error);
    loadError.year = "Sorry, we couldn't load organizations right now. Please try again later.";
  }
  if (activeTab === "year") {
    renderCategoryChips();
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

renderTabs();
renderAgeChips();
renderToggles();
renderCategoryChips();
applyFilters();

loadPrograms();
loadOrganizations();
