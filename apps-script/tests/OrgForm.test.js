// Tests for apps-script/OrgForm.gs. Run from anywhere:  node apps-script/tests/OrgForm.test.js
//
// Apps Script cannot run outside Google, so this loads Code.gs and OrgForm.gs
// into one shared scope (as one Apps Script project does) against mock Forms,
// Sheets, Mail and UrlFetch services, and records every write, email and
// trigger firing. The mocks follow the real API where it has bitten us:
// form.getItems() returns generic Items, so typed methods such as
// setRequired() fail unless the code casts with asTextItem() first.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..') + '/';
const CSV_URL = 'https://if-phillip-break.github.io/gnbya-activities-app/data/organizations_placeholder_sheet.csv';

// The site's own CSV parser stands in for Utilities.parseCsv.
const site = {}; vm.createContext(site);
vm.runInContext(fs.readFileSync(REPO + 'js/csv.js', 'utf8'), site);
vm.runInContext(fs.readFileSync(REPO + 'js/data.js', 'utf8'), site);
vm.runInContext('globalThis.__s = { parseCSV, rowsToRecords, mapRecordToOrganization };', site);
const { parseCSV, rowsToRecords, mapRecordToOrganization } = site.__s;

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}

function world(opts = {}) {
  const csvText = opts.csvText || fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8');
  const log = { mails: [], logs: [], triggers: [], writes: [], submits: 0 };
  let nextId = 1, clock = Date.UTC(2026, 10, 19, 15, 0, 0);

  // ----- sheets -----
  function makeSheet(name, rows, formUrl) {
    const s = { name, rows, formUrl, id: nextId++ };
    s.api = {
      getName: () => s.name, setName: (n) => { log.writes.push(`rename "${s.name}" -> "${n}"`); s.name = n; return s.api; },
      getFormUrl: () => s.formUrl, getSheetId: () => s.id,
      getLastRow: () => s.rows.length, getLastColumn: () => Math.max(0, ...s.rows.map((r) => r.length)),
      getDataRange: () => ({ getValues: () => { const w = s.api.getLastColumn(); return s.rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] === undefined ? '' : r[i]))); } }),
      getRange: (a, b) => {
        if (typeof a !== 'number') {
          // Code.gs addresses cells as "B5". Support single cells only.
          const m = String(a).match(/^([A-Z]+)(\d+)$/);
          if (!m) throw new Error('test mock: unsupported range ' + a);
          b = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); a = +m[2];
        }
        return {
          getColumn: () => b, getRow: () => a,
          getValue: () => (s.rows[a - 1] || [])[b - 1] ?? '',
          setValue: (v) => { while (s.rows.length < a) s.rows.push([]); s.rows[a - 1][b - 1] = v; log.writes.push(`${s.name}!R${a}C${b} <- ${String(v).slice(0, 40)}`); },
        };
      },
    };
    return s;
  }
  const sheets = [
    makeSheet('Activities', [['Timestamp', 'Organization Name']], 'https://forms.test/listings'),
    makeSheet('Link Requests', [['Timestamp', 'Email']], 'https://forms.test/lookup'),
    makeSheet('Live Activities', [['Organization Name']], null),
  ];
  if (opts.preexistingOrganizationsTab) sheets.push(makeSheet('Organizations', [['x']], null));
  const ss = {
    getId: () => 'SS-PROD', getUrl: () => 'https://sheets.test/prod',
    getSheets: () => sheets.map((s) => s.api),
    getSheetByName: (n) => (sheets.find((s) => s.name === n) || {}).api || null,
  };

  // ----- forms -----
  const forms = {};
  function makeForm(title) {
    const f = { id: 'F' + nextId++, title, items: [], responses: [], settings: {}, sheet: null };
    const choiceObjs = (vals) => vals.map((v) => ({ getValue: () => v }));
    const addItem = (type) => {
      const it = { id: nextId++, type, title: '', required: false, help: '', choices: null, validation: null };
      const api = {
        getId: () => it.id, getTitle: () => it.title, getType: () => it.type, isRequired: () => it.required,
        setTitle: (t) => { it.title = t; return api; }, setRequired: (r) => { it.required = r; return api; },
        setHelpText: (h) => { it.help = h; return api; }, setValidation: (v) => { it.validation = v; return api; },
        setChoiceValues: (vals) => { it.choices = vals.slice(); return api; }, getChoices: () => choiceObjs(it.choices || []),
        createResponse: (value) => {
          if (it.type === 'CHECKBOX') {
            if (!Array.isArray(value)) throw new Error('checkbox needs an array');
            value.forEach((v) => { if (!it.choices.includes(v)) throw new Error('Invalid response: ' + v); });
          }
          if (it.type === 'MULTIPLE_CHOICE' && !it.choices.includes(value)) throw new Error('Invalid response: ' + value);
          return { getItem: () => generic, getResponse: () => value };
        },
      };
      // What form.getItems() and ItemResponse.getItem() really return: a
      // generic Item. It has only the Item methods; setRequired, setValidation,
      // getChoices and createResponse live on the typed item, reached through
      // asTextItem() etc., and a cast to the wrong type throws.
      const generic = {
        getId: api.getId, getTitle: api.getTitle, getType: api.getType,
        getHelpText: () => it.help, getIndex: () => f.items.indexOf(it),
        setTitle: (t) => { it.title = t; return generic; }, setHelpText: (h) => { it.help = h; return generic; },
      };
      const CAST = { asTextItem: 'TEXT', asParagraphTextItem: 'PARAGRAPH_TEXT', asCheckboxItem: 'CHECKBOX', asMultipleChoiceItem: 'MULTIPLE_CHOICE' };
      for (const [method, wanted] of Object.entries(CAST)) {
        generic[method] = () => {
          if (it.type !== wanted) throw new Error(`Exception: Item "${it.title}" is a ${it.type} item, not ${wanted}.`);
          return api;
        };
      }
      it.api = api; it.generic = generic; f.items.push(it); return api;
    };
    const api = {
      getId: () => f.id, getEditUrl: () => `https://forms.test/${f.id}/edit`, getPublishedUrl: () => `https://forms.test/${f.id}/viewform`,
      setDescription: (d) => { f.settings.description = d; return api; },
      setAllowResponseEdits: (b) => { f.settings.allowEdits = b; return api; },
      setCollectEmail: (b) => { f.settings.collectEmail = b; return api; },
      addTextItem: () => addItem('TEXT'), addParagraphTextItem: () => addItem('PARAGRAPH_TEXT'),
      addCheckboxItem: () => addItem('CHECKBOX'), addMultipleChoiceItem: () => addItem('MULTIPLE_CHOICE'),
      getItems: () => f.items.map((i) => i.generic),
      setDestination: (type, ssId) => {
        assert.strictEqual(ssId, 'SS-PROD');
        let n = 1; while (sheets.some((s) => s.name === 'Form Responses ' + n)) n++;
        f.sheet = makeSheet('Form Responses ' + n, [['Timestamp', ...f.items.map((i) => i.title)]], `https://forms.test/${f.id}`);
        sheets.push(f.sheet); forms[`https://forms.test/${f.id}`] = f; return api;
      },
      getResponses: () => f.responses.map((r) => r.api),
      createResponse: () => {
        const answers = [];
        const b = {
          withItemResponse: (ir) => { answers.push(ir); return b; },
          submit: () => {
            log.submits++;
            if (opts.failAtSubmit && log.submits === opts.failAtSubmit) throw new Error('Simulated Forms outage on submit #' + log.submits);
            clock += opts.sameSecond ? 0 : 1000;
            const ts = new Date(clock);
            const r = { answers, ts, url: `https://forms.test/${f.id}/edit?r=${f.responses.length + 1}` };
            r.api = { getItemResponses: () => answers, getEditResponseUrl: () => r.url, getTimestamp: () => ts };
            f.responses.push(r);
            // Forms writes the row: Timestamp, then one cell per question; checkbox answers joined with ", ".
            const row = [ts, ...f.items.map((it) => {
              const a = answers.find((x) => x.getItem().getId() === it.id);
              if (!a) return '';
              const v = a.getResponse(); return Array.isArray(v) ? v.join(', ') : v;
            })];
            f.sheet.rows.push(row);
            // The installable trigger from Code.gs fires for every linked form.
            const sheetApi = f.sheet.api, rowNum = f.sheet.rows.length;
            log.triggers.push(sheetApi.getName());
            g.handleFormSubmit({ range: { getSheet: () => sheetApi, getRow: () => rowNum } });
            return r.api;
          },
        };
        return b;
      },
    };
    f.api = api; forms['id:' + f.id] = f; return f;
  }
  forms['https://forms.test/listings'] = { api: { getId: () => 'F-LISTINGS' } };
  forms['https://forms.test/lookup'] = { api: { getId: () => 'F-LOOKUP' } };

  const props = {};
  const validation = () => { const v = { kind: null, help: '' }; const b = {
    setHelpText: (h) => { v.help = h; return b; }, requireTextIsUrl: () => { v.kind = 'url'; return b; },
    requireTextIsEmail: () => { v.kind = 'email'; return b; }, requireTextMatchesPattern: (p) => { v.kind = 'pattern:' + p; return b; },
    build: () => v }; return b; };

  const g = {
    console,
    Logger: { log: (m) => log.logs.push(String(m)) },
    SpreadsheetApp: { getActive: () => ss, flush: () => {} },
    FormApp: {
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
      create: (t) => { const f = makeForm(t); log.created = f; return f.api; },
      openById: (id) => forms['id:' + id].api,
      openByUrl: (u) => forms[u].api,
      createTextValidation: validation,
    },
    UrlFetchApp: { fetch: (u) => { assert.strictEqual(u, CSV_URL); return { getResponseCode: () => (opts.httpFail ? 404 : 200), getContentText: () => csvText }; } },
    Utilities: { parseCsv: (t) => parseCSV(t), sleep: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    MailApp: { sendEmail: (to, subj) => log.mails.push(to + ' :: ' + subj) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    ScriptApp: {},
  };
  const services = { ...g }; // the mocks alone, before any script is loaded
  const orgSource = opts.orgSource || fs.readFileSync(REPO + 'apps-script/OrgForm.gs', 'utf8');
  const load = (ctx, src) => {
    vm.createContext(ctx);
    // Two separate scripts in one realm, like two .gs files in one project:
    // a duplicate top-level const/function would throw here.
    vm.runInContext(fs.readFileSync(REPO + 'apps-script/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });
    vm.runInContext(src, ctx, { filename: 'OrgForm.gs' });
    return ctx;
  };
  load(g, orgSource);
  return {
    g, log, sheets, props, form: () => log.created, tab: () => sheets.find((s) => s.name === 'Organizations'),
    // Paste a different OrgForm.gs into the same spreadsheet: same forms, tabs and
    // script properties, new code.
    reload: (src) => load({ ...services }, src),
  };
}

const tryRun = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ===================================================================
console.log('\n# 1. Both files load into one project scope');
check('Code.gs + OrgForm.gs load together with no duplicate names', tryRun(() => world()) === null, tryRun(() => world()));

console.log('\n# 2. createOrgForm()');
{
  const w = world();
  const err = tryRun(() => w.g.createOrgForm());
  check('runs without error', err === null, err);
  const f = w.form();
  const items = f.items;
  check('18 questions', items.length === 18, items.length);
  const csvHeaders = parseCSV(fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8'))[0].map((h) => h.trim());
  check('first 16 titles are the CSV headers, in order, verbatim', JSON.stringify(items.slice(0, 16).map((i) => i.title)) === JSON.stringify(csvHeaders));
  check('then "Listing manager email" and "Organization status"', items[16].title === 'Listing manager email' && items[17].title === 'Organization status');
  const byT = Object.fromEntries(items.map((i) => [i.title, i]));
  const checkboxes = items.filter((i) => i.type === 'CHECKBOX').map((i) => i.title);
  check('exactly the 8 site list fields are checkboxes', JSON.stringify(checkboxes) === JSON.stringify(['Grade levels served', 'Early education services', 'Youth development services', 'Program year', 'Program model', 'Cost', 'Registration', 'Transportation']), checkboxes.join(', '));
  check('Location, Schools served, Description are paragraphs; Schedule is short text',
    ['Location', 'Schools served', 'Description'].every((t) => byT[t].type === 'PARAGRAPH_TEXT') && byT['Schedule'].type === 'TEXT');
  const optionCount = items.filter((i) => i.type === 'CHECKBOX').reduce((n, i) => n + i.choices.length, 0);
  check('41 checkbox options in total', optionCount === 41, optionCount);
  check('Cost options in filter order', JSON.stringify(byT['Cost'].choices) === JSON.stringify(['Free', 'Fee', 'Financial Assistance', 'Slide Scale Based on Income', 'Accepts Child Care Subsidies']), byT['Cost'].choices.join(' | '));
  check('Website: required + URL validation', byT['Website'].required && byT['Website'].validation.kind === 'url');
  check('Min/Max age: optional + 0-99 whole-number pattern', ['Min age', 'Max age'].every((t) => !byT[t].required && byT[t].validation.kind === 'pattern:^[0-9]{1,2}$'));
  check('Listing manager email: email validation, NOT required yet', byT['Listing manager email'].validation.kind === 'email' && !byT['Listing manager email'].required);
  check('Organization status: required, Active / Remove from site', byT['Organization status'].required && JSON.stringify(byT['Organization status'].choices) === '["Active","Remove from site"]');
  check('Organization name: required', byT['Organization name'].required);
  check('response editing on, email collection off', f.settings.allowEdits === true && f.settings.collectEmail === false);
  check('linked as a new "Form Responses N" tab, then renamed "Organizations"', w.log.writes.some((x) => /^rename "Form Responses \d+" -> "Organizations"$/.test(x)), w.log.writes.join(' | '));
  check('tab now named "Organizations"; the other tabs untouched', JSON.stringify(w.sheets.map((s) => s.name)) === '["Activities","Link Requests","Live Activities","Organizations"]');
  check('tab headers = Timestamp + 18 question titles', JSON.stringify(w.tab().rows[0]) === JSON.stringify(['Timestamp', ...items.map((i) => i.title)]));
  check('form ID saved', w.props.ORG_FORM_ID === f.id);
  check('no email sent', w.log.mails.length === 0);
  const again = tryRun(() => w.g.createOrgForm());
  check('second run refuses, no second form', again && /already exists/.test(again), again);
}

console.log('\n# 3. createOrgForm() refuses before creating anything');
{
  const w = world({ preexistingOrganizationsTab: true });
  const err = tryRun(() => w.g.createOrgForm());
  check('an existing "Organizations" tab stops it', err && /already has a tab/.test(err) && !w.form(), err);
  const w2 = world({ csvText: fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8').replace('Min age', 'Minimum age') });
  const err2 = tryRun(() => w2.g.createOrgForm());
  check('changed CSV headers stop it', err2 && /aren't the ones/.test(err2) && !w2.form(), err2);
  const w3 = world({ httpFail: true });
  const err3 = tryRun(() => w3.g.createOrgForm());
  check('a failed download stops it', err3 && /HTTP 404/.test(err3) && !w3.form(), err3);
}

console.log('\n# 4. backfillOrgs()');
{
  const w = world();
  w.g.createOrgForm();
  const err = tryRun(() => w.g.backfillOrgs());
  check('runs without error', err === null, err);
  const f = w.form(), tab = w.tab();
  check('43 responses', f.responses.length === 43, f.responses.length);
  check('43 rows in the Organizations tab', tab.rows.length - 1 === 43, tab.rows.length - 1);
  const hdr = tab.rows[0]; const linkCol = hdr.indexOf('Edit link');
  check('"Edit link" header in column T (20th)', linkCol === 19, 'index ' + linkCol);
  const links = tab.rows.slice(1).map((r) => r[linkCol]);
  check('every row has its own edit link', links.every((l) => /^https:\/\/forms\.test\/.+edit\?r=\d+$/.test(l)) && new Set(links).size === 43);
  const nameCol = hdr.indexOf('Organization name');
  const right = tab.rows.slice(1).every((r) => {
    const resp = f.responses.find((x) => x.url === r[linkCol]);
    return resp && resp.answers.find((a) => a.getItem().getTitle() === 'Organization name').getResponse() === r[nameCol];
  });
  check("each row's link is that organization's own response", right);
  check('every response has status Active, email blank', tab.rows.slice(1).every((r) => r[hdr.indexOf('Organization status')] === 'Active' && r[hdr.indexOf('Listing manager email')] === ''));
  check('"Listing manager email" became required at the end', f.items.find((i) => i.title === 'Listing manager email').required === true);
  check('ZERO emails sent', w.log.mails.length === 0, w.log.mails.join(' | '));
  check('Code.gs trigger fired 43 times, all on "Organizations"', w.log.triggers.length === 43 && w.log.triggers.every((n) => n === 'Organizations'));
  const other = w.log.writes.filter((x) => !x.startsWith('Organizations!') && !x.startsWith('rename'));
  check('nothing written to any other tab', other.length === 0, other.join(' | '));
  check('Activities and Link Requests unchanged', w.sheets[0].rows.length === 1 && w.sheets[1].rows.length === 1);

  // Run again: nothing new.
  const writesBefore = w.log.writes.length, subsBefore = w.log.submits;
  const err2 = tryRun(() => w.g.backfillOrgs());
  check('second run: no error, 0 submitted, nothing rewritten', err2 === null && w.log.submits === subsBefore && w.log.writes.length === writesBefore, err2);
  check('second run log says skipped 43', /Submitted 0, skipped 43/.test(w.log.logs[w.log.logs.length - 1]), w.log.logs[w.log.logs.length - 1]);
}

console.log('\n# 5. A run that stops part way, then is run again');
{
  const w = world({ failAtSubmit: 20 });
  w.g.createOrgForm();
  const err = tryRun(() => w.g.backfillOrgs());
  check('first run stops at submit #20 with 19 in', err && /outage/.test(err) && w.form().responses.length === 19, err);
  const err2 = tryRun(() => w.g.backfillOrgs());
  const names = w.form().responses.map((r) => r.answers[0].getResponse());
  check('rerun finishes: 43 responses, no duplicates', err2 === null && names.length === 43 && new Set(names).size === 43, err2 || names.length);
  const linkCol = w.tab().rows[0].indexOf('Edit link');
  check('all 43 rows linked after the rerun', w.tab().rows.slice(1).every((r) => r[linkCol]));
  check('still zero emails', w.log.mails.length === 0);
}

console.log('\n# 6. Bad data stops the backfill before anything is submitted');
{
  const good = fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8');
  const w = world();
  w.g.createOrgForm();
  // Same headers and row count, but one Cost value the form doesn't offer.
  w.g.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => good.replace('Free; Fee', 'Free; Donations') });
  const err = tryRun(() => w.g.backfillOrgs());
  check('unknown checkbox value -> error, 0 submitted', err && /Nothing was submitted/.test(err) && /Donations/.test(err) && w.log.submits === 0, err);
}

console.log('\n# 7. Hand-typed rows and existing links are left alone');
{
  const w = world();
  w.g.createOrgForm();
  const tab = w.tab();
  tab.rows.push(['', 'Hand Typed Org', 'https://x.test']); // no Timestamp
  w.g.backfillOrgs();
  const linkCol = tab.rows[0].indexOf('Edit link');
  const hand = tab.rows.find((r) => r[1] === 'Hand Typed Org');
  check('hand-typed row: no link written', !hand[linkCol]);
  check('hand-typed row not reported as unmatched', !/Hand Typed Org/.test(w.log.logs.join(' ')), w.log.logs.join(' '));
  const writes = w.log.writes.filter((x) => /Organizations!R(\d+)/.test(x) && +x.match(/R(\d+)/)[1] === tab.rows.indexOf(hand) + 1);
  check('nothing written to its row at all', writes.length === 0, writes.join(' | '));
}

console.log('\n# 8. Submissions in the same second (real backfills will do this)');
{
  const w = world({ sameSecond: true });
  w.g.createOrgForm();
  const err = tryRun(() => w.g.backfillOrgs());
  const linkCol = w.tab().rows[0].indexOf('Edit link');
  check('all 43 linked correctly despite identical timestamps', err === null && w.tab().rows.slice(1).every((r) => {
    const resp = w.form().responses.find((x) => x.url === r[linkCol]);
    return resp && resp.answers[0].getResponse() === r[1];
  }), err);
}

console.log('\n# 9. Round trip: does the site read the new tab like the CSV?');
{
  const w = world();
  w.g.createOrgForm(); w.g.backfillOrgs();
  const tab = w.tab();
  const asCsv = tab.rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString() : String(c))));
  const fromTab = rowsToRecords(asCsv).map(mapRecordToOrganization);
  const fromCsv = rowsToRecords(parseCSV(fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8')).filter((r) => r.some((c) => c.trim()))).map(mapRecordToOrganization);
  const LIST = ['gradeLevels', 'programYear', 'programModel', 'cost', 'registration', 'transportation', 'categories'];
  const SCALAR = ['id', 'name', 'website', 'minAge', 'maxAge', 'location', 'schoolsServed', 'schedule', 'description'];
  const scalarDiffs = [];
  fromCsv.forEach((o, i) => SCALAR.forEach((k) => { if (JSON.stringify(o[k]) !== JSON.stringify(fromTab[i][k])) scalarDiffs.push(o.name + '.' + k); }));
  check('all 9 non-list fields identical for all 43 orgs (no site change needed)', scalarDiffs.length === 0, scalarDiffs.slice(0, 5).join(', '));
  const brokenToday = fromCsv.filter((o, i) => LIST.some((k) => JSON.stringify(o[k].slice().sort()) !== JSON.stringify(fromTab[i][k].slice().sort()))).length;
  console.log(`  INFO with today's ";"-only split, ${brokenToday}/43 orgs read their list fields wrong (e.g. cost ${JSON.stringify(fromTab.find((o) => o.cost.length)?.cost)})`);
  // The planned site change: split list fields on ";" or ",".
  const split2 = (v) => (v ? v.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : []);
  const fixed = rowsToRecords(asCsv).map((rec) => {
    const o = mapRecordToOrganization(rec);
    ['gradeLevels', 'programYear', 'programModel', 'cost', 'registration', 'transportation'].forEach((k, j) => {
      o[k] = split2(rec[['Grade levels served', 'Program year', 'Program model', 'Cost', 'Registration', 'Transportation'][j]]);
    });
    return o;
  });
  const listDiffs = [];
  fromCsv.forEach((o, i) => ['gradeLevels', 'programYear', 'programModel', 'cost', 'registration', 'transportation'].forEach((k) => {
    if (JSON.stringify(o[k].slice().sort()) !== JSON.stringify(fixed[i][k].slice().sort())) listDiffs.push(o.name + '.' + k);
  }));
  check('with the planned comma split, every list field matches the CSV for all 43', listDiffs.length === 0, listDiffs.slice(0, 5).join(', '));
}

console.log('\n# 10. Control: the rename is what keeps Code.gs out of it');
{
  // Same backfill, but the tab carries the name Code.gs uses for the lookup
  // form. If the mock trigger really runs Code.gs, it should now react.
  const w = world();
  w.g.createOrgForm();
  w.tab().name = 'Link Requests';
  w.g.ORG_TAB_NAME_OVERRIDE = true;
  const orig = w.g.SpreadsheetApp.getActive().getSheetByName;
  const ss = w.g.SpreadsheetApp.getActive();
  w.g.SpreadsheetApp.getActive = () => ({ ...ss, getSheetByName: (n) => ss.getSheetByName(n === 'Organizations' ? 'Link Requests' : n) });
  tryRun(() => w.g.backfillOrgs());
  const reacted = w.log.logs.filter((l) => /Lookup|lookup/.test(l)).length;
  check('with the lookup tab name, Code.gs handles every one of the 43 submissions', reacted === 43, reacted + ' lookup log lines: ' + w.log.logs.slice(0, 2).join(' | '));
}

console.log('\n# 11. The production failure, reproduced, then recovered from');
{
  const oldSrc = require('child_process').execSync('git show 4c82531:apps-script/OrgForm.gs', { cwd: REPO }).toString();
  const w = world({ orgSource: oldSrc });
  w.g.createOrgForm();
  const err = tryRun(() => w.g.backfillOrgs());
  check('the committed 4c82531 now fails the way production did', err && /setRequired is not a function/.test(err), err);
  const f = w.form(), tab = w.tab(), linkCol = tab.rows[0].indexOf('Edit link');
  const emailItem = () => f.items.find((i) => i.title === 'Listing manager email');
  check('...at the last step: 43 submitted and all 43 rows already linked', f.responses.length === 43 && tab.rows.slice(1).every((r) => r[linkCol]),
    f.responses.length + ' responses');
  check('...leaving Listing manager email not required (production\'s state now)', emailItem().required === false);

  const g2 = w.reload(fs.readFileSync(REPO + 'apps-script/OrgForm.gs', 'utf8'));
  const subs = w.log.submits, writes = w.log.writes.length;
  const err2 = tryRun(() => g2.backfillOrgs());
  check('re-running backfillOrgs() from the fixed file completes', err2 === null, err2);
  check('...submitting nothing and rewriting no link', w.log.submits === subs && w.log.writes.length === writes,
    (w.log.submits - subs) + ' submits, ' + (w.log.writes.length - writes) + ' writes');
  check('...and Listing manager email is now required', emailItem().required === true);
  const names = f.responses.map((r) => r.answers[0].getResponse());
  check('...still exactly 43 responses, no duplicates, zero emails', names.length === 43 && new Set(names).size === 43 && w.log.mails.length === 0);
  check('...log reports it', /Submitted 0, skipped 43 already in the form\. Wrote 0 edit link\(s\)\. "Listing manager email" is now required\./.test(w.log.logs[w.log.logs.length - 1]), w.log.logs[w.log.logs.length - 1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
