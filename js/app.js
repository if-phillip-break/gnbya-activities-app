// UI: tab switching, filtering, and rendering for both directory views.

// ---------- element lookups ----------

const tabPrograms = document.getElementById("tab-programs");
const tabOrgs = document.getElementById("tab-orgs");
const programsView = document.getElementById("programs-view");
const orgsView = document.getElementById("orgs-view");

const programsGrid = document.getElementById("programs-grid");
const searchInput = document.getElementById("search-input");
const ageInput = document.getElementById("age-input");
const freeOnlyCheckbox = document.getElementById("free-only");
const busOnlyCheckbox = document.getElementById("bus-only");
const languageOnlyCheckbox = document.getElementById("language-only");
const clearFiltersButton = document.getElementById("clear-filters");
const programCategoryChips = document.getElementById("program-category-chips");

const orgsGrid = document.getElementById("orgs-grid");
const orgSearchInput = document.getElementById("org-search-input");
const orgAgeInput = document.getElementById("org-age-input");
const orgYearSelect = document.getElementById("org-year-select");
const orgModelSelect = document.getElementById("org-model-select");
const orgFreeOnlyCheckbox = document.getElementById("org-free-only");
const orgClearFiltersButton = document.getElementById("org-clear-filters");
const orgCategoryChips = document.getElementById("org-category-chips");

let allPrograms = [];
let allOrganizations = [];
let selectedProgramCategories = new Set();
let selectedCategories = new Set();

// ---------- tab switching ----------

function showView(view) {
  const isPrograms = view === "programs";
  programsView.hidden = !isPrograms;
  orgsView.hidden = isPrograms;
  tabPrograms.classList.toggle("active", isPrograms);
  tabOrgs.classList.toggle("active", !isPrograms);
  tabPrograms.setAttribute("aria-selected", String(isPrograms));
  tabOrgs.setAttribute("aria-selected", String(!isPrograms));
}

tabPrograms.addEventListener("click", () => showView("programs"));
tabOrgs.addEventListener("click", () => showView("orgs"));

// ---------- data loading (each view loads independently so one failure doesn't kill both) ----------

async function loadPrograms() {
  try {
    const records = await fetchRecords(PROGRAMS_CSV_URL);
    allPrograms = records.map(mapRecordToProgram);
    buildProgramFilterOptions();
    applyProgramFilters();
  } catch (error) {
    console.error("Failed to load programs:", error);
    programsGrid.innerHTML = `<p class="empty-state">Sorry, we couldn't load programs right now. Please try again later.</p>`;
  }
}

async function loadOrganizations() {
  try {
    const records = await fetchRecords(ORGS_CSV_URL);
    allOrganizations = records.map(mapRecordToOrganization);
    buildOrgFilterOptions();
    applyOrgFilters();
  } catch (error) {
    console.error("Failed to load organizations:", error);
    orgsGrid.innerHTML = `<p class="empty-state">Sorry, we couldn't load organizations right now. Please try again later.</p>`;
  }
}

// ---------- programs: filters ----------

function matchesSearch(program, query) {
  if (!query) return true;
  const haystack =
    `${program.programName} ${program.organizationName} ${program.description || ""} ${program.categories.join(" ")}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesAge(min, max, age) {
  if (age === null) return true;
  // Entries without numeric ages (grade-based, "all ages") can't be checked
  // numerically — show them rather than hide them incorrectly.
  if (min === null && max === null) return true;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
}

function matchesFreeOnly(program) {
  return /free|scholarship/i.test(program.cost || "");
}

function matchesLanguageOnly(program) {
  const hasStaffSupport =
    program.staffLanguageSupport && program.staffLanguageSupport.toLowerCase() !== "no";
  const hasTranslation =
    Array.isArray(program.translationAvailable) && program.translationAvailable.length > 0;
  return hasStaffSupport || hasTranslation;
}

// Builds the category filter chips from the values actually present in the
// program data, so categories staff add in the sheet appear automatically
// without a code change. The chip row stays hidden until at least one program
// has a category — otherwise it'd render as an empty bordered strip.
function buildProgramFilterOptions() {
  const categories = new Set();
  for (const program of allPrograms) {
    program.categories.forEach((c) => categories.add(c));
  }

  if (categories.size === 0) {
    programCategoryChips.hidden = true;
    return;
  }
  programCategoryChips.hidden = false;

  programCategoryChips.innerHTML = [...categories]
    .sort()
    .map((cat) => `<button type="button" class="chip" data-category="${cat}">${cat}</button>`)
    .join("");

  programCategoryChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.category;
      if (selectedProgramCategories.has(cat)) {
        selectedProgramCategories.delete(cat);
        chip.classList.remove("active");
      } else {
        selectedProgramCategories.add(cat);
        chip.classList.add("active");
      }
      applyProgramFilters();
    });
  });
}

function applyProgramFilters() {
  const query = searchInput.value.trim();
  const age = ageInput.value === "" ? null : Number(ageInput.value);

  const filtered = allPrograms.filter((program) => {
    if (!matchesSearch(program, query)) return false;
    if (!matchesAge(program.ageRange.min, program.ageRange.max, age)) return false;
    if (freeOnlyCheckbox.checked && !matchesFreeOnly(program)) return false;
    if (busOnlyCheckbox.checked && !program.busAccessible) return false;
    if (languageOnlyCheckbox.checked && !matchesLanguageOnly(program)) return false;
    // Category chips combine as OR (same as organizations): picking two
    // categories shows programs in either, which stays useful as you add more.
    if (selectedProgramCategories.size > 0 && !program.categories.some((c) => selectedProgramCategories.has(c))) {
      return false;
    }
    return true;
  });

  renderCards(programsGrid, filtered, programCardHTML);
}

// ---------- organizations: filters ----------

// Builds the Program Year / Schedule type dropdowns and the category chips
// from the values actually present in the data, so new values added by staff
// appear automatically without a code change.
function buildOrgFilterOptions() {
  const years = new Set();
  const models = new Set();
  const categories = new Set();
  for (const org of allOrganizations) {
    org.programYear.forEach((y) => years.add(y));
    org.programModel.forEach((m) => models.add(m));
    org.categories.forEach((c) => categories.add(c));
  }

  for (const year of [...years].sort()) {
    orgYearSelect.insertAdjacentHTML("beforeend", `<option value="${year}">${year}</option>`);
  }
  for (const model of [...models].sort()) {
    orgModelSelect.insertAdjacentHTML("beforeend", `<option value="${model}">${model}</option>`);
  }
  orgCategoryChips.innerHTML = [...categories]
    .sort()
    .map((cat) => `<button type="button" class="chip" data-category="${cat}">${cat}</button>`)
    .join("");

  orgCategoryChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.category;
      if (selectedCategories.has(cat)) {
        selectedCategories.delete(cat);
        chip.classList.remove("active");
      } else {
        selectedCategories.add(cat);
        chip.classList.add("active");
      }
      applyOrgFilters();
    });
  });
}

// "Free or financial help" covers everything except plain fee-only listings.
function orgHasAffordableOption(org) {
  return org.cost.some((c) =>
    /free|slide scale|financial assistance|subsidies/i.test(c)
  );
}

function applyOrgFilters() {
  const query = orgSearchInput.value.trim().toLowerCase();
  const age = orgAgeInput.value === "" ? null : Number(orgAgeInput.value);
  const year = orgYearSelect.value;
  const model = orgModelSelect.value;

  const filtered = allOrganizations.filter((org) => {
    if (query) {
      const haystack = `${org.name} ${org.description || ""} ${org.categories.join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!matchesAge(org.minAge, org.maxAge, age)) return false;
    if (year && !org.programYear.includes(year)) return false;
    if (model && !org.programModel.includes(model)) return false;
    if (orgFreeOnlyCheckbox.checked && !orgHasAffordableOption(org)) return false;
    // Category chips combine as OR: picking "Sports" and "Science" means
    // "show orgs offering either", which stays useful as selections grow —
    // AND-ing tags across only 43 orgs empties the list almost immediately.
    if (selectedCategories.size > 0 && !org.categories.some((c) => selectedCategories.has(c))) {
      return false;
    }
    return true;
  });

  renderCards(orgsGrid, filtered, organizationCardHTML);
}

// ---------- rendering ----------

function renderCards(grid, items, cardFn) {
  if (items.length === 0) {
    grid.innerHTML = `<p class="empty-state">No matches for these filters. Try clearing some.</p>`;
    return;
  }
  grid.innerHTML = items.map(cardFn).join("");
}

function ageBadgeText(minAge, maxAge, fallback) {
  if (minAge !== null && maxAge !== null) return `Ages ${minAge}-${maxAge}`;
  if (minAge !== null) return `Ages ${minAge}+`;
  if (maxAge !== null) return `Up to age ${maxAge}`;
  return fallback;
}

function truncate(text, limit) {
  if (!text || text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

function programCardHTML(program) {
  return `
    <article class="activity-card">
      <div class="card-header">
        <h2>${program.programName}</h2>
        <p class="org-name">${program.organizationName}</p>
      </div>

      <div class="badge-row">
        <span class="badge">${program.ageRange.display}</span>
        ${program.cost ? `<span class="badge badge-cost">${program.cost}</span>` : ""}
        ${program.busAccessible ? `<span class="badge badge-green">🚌 Bus accessible</span>` : ""}
      </div>

      ${program.categories.length ? `
      <div class="tag-row">
        ${program.categories.map((c) => `<span class="category-tag">${c}</span>`).join("")}
      </div>` : ""}

      <div class="card-details">
        <p>${program.sessionDates}</p>
        ${program.hours ? `<p>${program.hours}</p>` : ""}
        ${program.address ? `<p class="muted">${program.address}</p>` : ""}
        ${program.description ? `<p class="description">${truncate(program.description, 180)}</p>` : ""}
      </div>

      <div class="card-footer">
        <p class="contact">${program.contact}</p>
        ${program.website ? `<a href="${program.website}" target="_blank" rel="noopener">Program Website →</a>` : ""}
      </div>
    </article>
  `;
}

function organizationCardHTML(org) {
  // Each cost type gets its own badge — one combined badge with nowrap text
  // grows wider than a phone screen and forces horizontal scrolling.
  const costBadges = org.cost
    .map((c) =>
      c === "Free"
        ? `<span class="badge badge-green">Free options</span>`
        : `<span class="badge badge-cost">${c}</span>`
    )
    .join("");

  return `
    <article class="activity-card">
      <div class="card-header">
        <h2>${org.name}</h2>
      </div>

      <div class="badge-row">
        <span class="badge">${ageBadgeText(org.minAge, org.maxAge, "All ages")}</span>
        ${costBadges}
      </div>

      ${org.categories.length ? `
      <div class="tag-row">
        ${org.categories.map((c) => `<span class="category-tag">${c}</span>`).join("")}
      </div>` : ""}

      <div class="card-details">
        ${org.programModel.length ? `<p>${org.programModel.join(" · ")}</p>` : ""}
        ${org.schedule ? `<p>${org.schedule}</p>` : ""}
        ${org.location ? `<p class="muted">${org.location}</p>` : ""}
        ${org.description ? `<p class="description">${truncate(org.description, 180)}</p>` : ""}
      </div>

      <div class="card-footer">
        ${org.registration.length ? `<p class="contact">Registration: ${org.registration.join(", ")}</p>` : ""}
        ${org.website ? `<a href="${org.website}" target="_blank" rel="noopener">Visit website →</a>` : ""}
      </div>
    </article>
  `;
}

// ---------- event wiring ----------

searchInput.addEventListener("input", applyProgramFilters);
ageInput.addEventListener("input", applyProgramFilters);
freeOnlyCheckbox.addEventListener("change", applyProgramFilters);
busOnlyCheckbox.addEventListener("change", applyProgramFilters);
languageOnlyCheckbox.addEventListener("change", applyProgramFilters);

clearFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  ageInput.value = "";
  freeOnlyCheckbox.checked = false;
  busOnlyCheckbox.checked = false;
  languageOnlyCheckbox.checked = false;
  selectedProgramCategories.clear();
  programCategoryChips.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
  applyProgramFilters();
});

orgSearchInput.addEventListener("input", applyOrgFilters);
orgAgeInput.addEventListener("input", applyOrgFilters);
orgYearSelect.addEventListener("change", applyOrgFilters);
orgModelSelect.addEventListener("change", applyOrgFilters);
orgFreeOnlyCheckbox.addEventListener("change", applyOrgFilters);

orgClearFiltersButton.addEventListener("click", () => {
  orgSearchInput.value = "";
  orgAgeInput.value = "";
  orgYearSelect.value = "";
  orgModelSelect.value = "";
  orgFreeOnlyCheckbox.checked = false;
  selectedCategories.clear();
  orgCategoryChips.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
  applyOrgFilters();
});

loadPrograms();
loadOrganizations();
