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

// Column letter -> 1-based number ("AA" -> 27).
const colNum = (L) => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

// The Activities tab's production layout (confirmed from the sheet).
const ACT = { email: colNum('W'), show: colNum('Z'), link: colNum('AA') };

function world(opts = {}) {
  const csvText = opts.csvText || fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8');
  // CODE_GS=<path> runs the whole suite against another Code.gs (e.g. master's).
  const codeSource = opts.codeSource || fs.readFileSync(process.env.CODE_GS || REPO + 'apps-script/Code.gs', 'utf8');
  const log = { mails: [], mailFull: [], logs: [], triggers: [], writes: [], submits: 0 };
  let nextId = 1, clock = Date.UTC(2026, 10, 19, 15, 0, 0);

  // ----- sheets -----
  function makeSheet(name, rows, formUrl) {
    const s = { name, rows, formUrl, id: nextId++ };
    s.api = {
      getName: () => s.name, setName: (n) => { log.writes.push(`rename "${s.name}" -> "${n}"`); s.name = n; return s.api; },
      getFormUrl: () => s.formUrl, getSheetId: () => s.id,
      getLastRow: () => s.rows.length, getLastColumn: () => Math.max(0, ...s.rows.map((r) => r.length)),
      getDataRange: () => ({ getValues: () => { const w = s.api.getLastColumn(); return s.rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] === undefined ? '' : r[i]))); } }),
      // Both ways Apps Script addresses a range: "B5" / "AA2:AA44", or
      // (row, col[, numRows, numCols]). Writes are single cells only: neither
      // script should ever write a block.
      getRange: (a, b, nr, nc) => {
        let r1, c1, r2, c2;
        if (typeof a === 'number') {
          r1 = a; c1 = b; r2 = a + (nr || 1) - 1; c2 = b + (nc || 1) - 1;
        } else {
          const m = String(a).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
          if (!m) throw new Error('test mock: unsupported range ' + a);
          c1 = colNum(m[1]); r1 = +m[2]; c2 = m[3] ? colNum(m[3]) : c1; r2 = m[4] ? +m[4] : r1;
        }
        const at = (r, c) => { const v = (s.rows[r - 1] || [])[c - 1]; return v === undefined ? '' : v; };
        return {
          getColumn: () => c1, getRow: () => r1,
          getValue: () => at(r1, c1),
          getValues: () => { const out = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(at(r, c)); out.push(row); } return out; },
          setValue: (v) => {
            if (r1 !== r2 || c1 !== c2) throw new Error('test mock: setValue on a multi-cell range');
            while (s.rows.length < r1) s.rows.push([]);
            s.rows[r1 - 1][c1 - 1] = v;
            log.writes.push(`${s.name}!R${r1}C${c1} <- ${String(v).slice(0, 40)}`);
          },
          setValues: () => { throw new Error('test mock: block writes are not expected'); },
        };
      },
    };
    return s;
  }
  // Activities header row in production's layout and capitals.
  const actHeader = Array.from({ length: ACT.link }, () => '');
  actHeader[0] = 'Timestamp'; actHeader[1] = 'Organization Name'; actHeader[2] = 'Program Name';
  actHeader[ACT.email - 1] = 'Listing Manager Email'; actHeader[ACT.show - 1] = 'Show on Site'; actHeader[ACT.link - 1] = 'Edit Link';
  const sheets = [
    makeSheet('Activities', [actHeader], 'https://forms.test/listings'),
    makeSheet('Link Requests', [['Timestamp', 'Email']], 'https://forms.test/lookup'),
    makeSheet('Live Activities', [['Organization Name']], null),
  ];
  const activities = sheets[0], linkRequests = sheets[1];
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
            // r.ts, not ts: an edit moves the timestamp (see editOrg below).
            r.api = { getItemResponses: () => answers, getEditResponseUrl: () => r.url, getTimestamp: () => r.ts };
            f.responses.push(r);
            // Forms writes the row: Timestamp, then one cell per question; checkbox answers joined with ", ".
            const row = [ts, ...f.items.map((it) => {
              const a = answers.find((x) => x.getItem().getId() === it.id);
              if (!a) return '';
              const v = a.getResponse(); return Array.isArray(v) ? v.join(', ') : v;
            })];
            f.sheet.rows.push(row);
            r.rowNum = f.sheet.rows.length;
            // The installable trigger from Code.gs fires for every linked form.
            fire(f.sheet, r.rowNum);
            return r.api;
          },
        };
        return b;
      },
    };
    f.api = api; forms['id:' + f.id] = f; return f;
  }
  // The listings form: enough for Code.gs to match rows to responses, plus its
  // "Organization Name" question. By default it's multiple choice as just
  // converted in the editor (one placeholder option, no Other);
  // opts.orgQuestionType = 'TEXT' leaves it a short answer.
  const orgQ = { type: opts.orgQuestionType || 'MULTIPLE_CHOICE', choices: ['Option 1'], other: false };
  log.formWrites = [];
  const orgQTyped = {
    getChoices: () => orgQ.choices.map((v) => ({ getValue: () => v })),
    hasOtherOption: () => orgQ.other,
    setChoiceValues: (vals) => { orgQ.choices = vals.slice(); log.formWrites.push('choices'); return orgQTyped; },
    showOtherOption: (b) => { orgQ.other = b; log.formWrites.push('other=' + b); return orgQTyped; },
  };
  const orgQItem = {
    getId: () => 9001, getTitle: () => 'Organization Name', getType: () => orgQ.type,
    asMultipleChoiceItem: () => { if (orgQ.type !== 'MULTIPLE_CHOICE') throw new Error('Item is a ' + orgQ.type + ' item'); return orgQTyped; },
    asTextItem: () => { if (orgQ.type !== 'TEXT') throw new Error('Item is a ' + orgQ.type + ' item'); return {}; },
  };
  const listingForm = { responses: [] };
  listingForm.api = {
    getId: () => 'F-LISTINGS', getResponses: () => listingForm.responses.map((r) => r.api),
    getItems: () => [{ getId: () => 9000, getTitle: () => 'Program Name', getType: () => 'TEXT' }, orgQItem],
  };
  forms['https://forms.test/listings'] = listingForm;
  forms['https://forms.test/lookup'] = { api: { getId: () => 'F-LOOKUP' } };

  // What the installable form-submit trigger does: call Code.gs for that row.
  function fire(sheet, rowNum) {
    log.triggers.push(sheet.name);
    g.handleFormSubmit({ range: { getSheet: () => sheet.api, getRow: () => rowNum } });
  }
  function listingResponse(ts, email, url) {
    listingForm.responses.push({ api: {
      getTimestamp: () => ts, getEditResponseUrl: () => url,
      getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'Listing Manager Email' }), getResponse: () => email }],
    } });
  }
  function listingRow({ ts = '', org, prog, email = '', link = '' }) {
    const row = Array.from({ length: ACT.link }, () => '');
    row[0] = ts; row[1] = org; row[2] = prog; row[ACT.email - 1] = email; row[ACT.show - 1] = false; row[ACT.link - 1] = link;
    activities.rows.push(row);
    return activities.rows.length;
  }
  // A new listing, as Forms delivers it: response, row, trigger.
  function submitListing({ org, prog, email }) {
    clock += 1000;
    const ts = new Date(clock), url = 'https://forms.test/F-LISTINGS/edit?r=' + (listingForm.responses.length + 1);
    listingResponse(ts, email, url);
    const row = listingRow({ ts, org, prog, email });
    fire(activities, row);
    return { row, url };
  }
  // A "Get my listing links" submission.
  function lookup(email) {
    clock += 1000;
    linkRequests.rows.push([new Date(clock), email]);
    fire(linkRequests, linkRequests.rows.length);
  }
  // A new organization through the Organizations form.
  function submitOrg(answers) {
    const f = log.created, b = f.api.createResponse();
    for (const [title, value] of Object.entries(answers)) b.withItemResponse(f.items.find((i) => i.title === title).api.createResponse(value));
    return b.submit();
  }
  // An organization editing its response through its edit link: Forms rewrites
  // the same row with a new timestamp, then the trigger fires for that row.
  function editOrg(index, changes) {
    const f = log.created, r = f.responses[index];
    for (const [title, value] of Object.entries(changes)) {
      const it = f.items.find((i) => i.title === title);
      const k = r.answers.findIndex((a) => a.getItem().getId() === it.id);
      const next = it.api.createResponse(value);
      if (k >= 0) r.answers[k] = next; else r.answers.push(next);
    }
    clock += 1000; r.ts = new Date(clock);
    const row = f.sheet.rows[r.rowNum - 1];
    row[0] = r.ts;
    f.items.forEach((it, i) => {
      const a = r.answers.find((x) => x.getItem().getId() === it.id);
      const v = a ? a.getResponse() : '';
      row[i + 1] = Array.isArray(v) ? v.join(', ') : v;
    });
    fire(f.sheet, r.rowNum);
    return r.rowNum;
  }

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
      ItemType: { TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', CHECKBOX: 'CHECKBOX', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE' },
      create: (t) => { const f = makeForm(t); log.created = f; return f.api; },
      openById: (id) => forms['id:' + id].api,
      openByUrl: (u) => forms[u].api,
      createTextValidation: validation,
    },
    UrlFetchApp: { fetch: (u) => { assert.strictEqual(u, CSV_URL); return { getResponseCode: () => (opts.httpFail ? 404 : 200), getContentText: () => csvText }; } },
    Utilities: { parseCsv: (t) => parseCSV(t), sleep: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    MailApp: { sendEmail: (to, subj, body) => { log.mails.push(to + ' :: ' + subj); log.mailFull.push({ to, subj, body: String(body) }); } },
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
    vm.runInContext(codeSource, ctx, { filename: 'Code.gs' });
    vm.runInContext(src, ctx, { filename: 'OrgForm.gs' });
    return ctx;
  };
  load(g, orgSource);
  return {
    g, log, sheets, props, form: () => log.created, tab: () => sheets.find((s) => s.name === 'Organizations'),
    activities, linkRequests, fire, listingResponse, listingRow, submitListing, lookup, submitOrg, editOrg,
    orgQ, // the Activities form's "Organization Name" question, for inspection
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

// ===================================================================
// Code.gs and the Organizations tab (follow-up C)
// ===================================================================

// A production-like spreadsheet after OrgForm.gs ran: the form, 43 backfilled
// organizations with links, and staff's Show on site column (all ticked).
const SHOW_COL = 21; // the column staff added after Edit link (T)
function orgWorld(opts) {
  const w = world(opts);
  w.g.createOrgForm();
  w.g.backfillOrgs();
  const tab = w.tab();
  tab.rows[0][SHOW_COL - 1] = 'Show on site';
  tab.rows.slice(1).forEach((r) => (r[SHOW_COL - 1] = true));
  w.mark = () => ({ mails: w.log.mails.length, writes: w.log.writes.length });
  w.since = (m) => ({ mails: w.log.mailFull.slice(m.mails), writes: w.log.writes.slice(m.writes) });
  return w;
}
const LINK_COL = 20, EMAIL_COL = 18;
const newOrg = (name, email) => ({ 'Organization name': name, 'Website': 'https://' + name.replace(/\W+/g, '').toLowerCase() + '.test',
  'Listing manager email': email, 'Organization status': 'Active' });

console.log('\n# 12. The 43 backfilled organizations trigger no email (new Code.gs)');
{
  const w = world();
  w.g.createOrgForm();
  const err = tryRun(() => w.g.backfillOrgs());
  check('backfill runs to the end: Code.gs never throws on a backfilled row', err === null, err);
  check('trigger fired 43 times on Organizations', w.log.triggers.filter((t) => t === 'Organizations').length === 43);
  check('ZERO emails', w.log.mails.length === 0, w.log.mails.join(' | '));
  const orgWrites = w.log.writes.filter((x) => x.startsWith('Organizations!'));
  check('Code.gs wrote nothing: the only writes are backfillOrgs\'s 43 links + header', orgWrites.length === 44, orgWrites.length + ' writes');
  check('each row was recognised as a backfilled organization', w.log.logs.filter((l) => /no listing manager email \(a backfilled organization\)/.test(l)).length === 43);
}

console.log('\n# 13. A new organization');
{
  const w = orgWorld();
  const m = w.mark();
  const resp = w.submitOrg(newOrg('Brand New Org', 'bob@org.test'));
  const tab = w.tab(), rowNum = tab.rows.length, d = w.since(m);
  check('its edit link is written into its own row', tab.rows[rowNum - 1][LINK_COL - 1] === resp.getEditResponseUrl());
  check('exactly one write, to that one cell', d.writes.length === 1 && d.writes[0].startsWith(`Organizations!R${rowNum}C${LINK_COL} `), d.writes.join(' | '));
  check('Show on site is never written', !w.log.writes.some((x) => new RegExp(`^Organizations!R\\d+C${SHOW_COL} `).test(x)));
  const thanks = d.mails.find((x) => x.to === 'bob@org.test');
  check('the listing manager is thanked, with their link and the review note', thanks && /Brand New Org/.test(thanks.subj) &&
    thanks.body.includes(resp.getEditResponseUrl()) && /review it before it appears/.test(thanks.body), JSON.stringify(thanks));
  const staff = d.mails.find((x) => x.to === 'philliptrah2015@gmail.com');
  check('staff are told it is waiting for approval, with a link to its row', staff && staff.subj === 'New organization waiting for approval: Brand New Org' &&
    staff.body.includes('range=A' + rowNum) && /Show on site/.test(staff.body), JSON.stringify(staff));
  check('exactly those two emails', d.mails.length === 2, d.mails.map((x) => x.to + ' :: ' + x.subj).join(' | '));
}

console.log('\n# 14. An organization edits its profile');
{
  const w = orgWorld();
  const tab = w.tab(), firstLink = tab.rows[1][LINK_COL - 1];
  let m = w.mark();
  w.editOrg(0, { 'Listing manager email': 'mgr@3rdeye.test', 'Description': 'Updated.' });
  let d = w.since(m);
  check('a backfilled org adding its email = an edit: one email, to staff only', d.mails.length === 1 && d.mails[0].to === 'philliptrah2015@gmail.com', d.mails.map((x) => x.to).join(', '));
  check('...subject names it, body gives its status and row', d.mails[0]?.subj === 'Organization edited: 3rd EyE Youth Empowerment' &&
    /Organization status: Active/.test(d.mails[0]?.body) && d.mails[0]?.body.includes('range=A2'), d.mails[0]?.subj);
  check('...link refreshed in place (same link), nothing else written', tab.rows[1][LINK_COL - 1] === firstLink && d.writes.length === 1 && d.writes[0].startsWith(`Organizations!R2C${LINK_COL} `), d.writes.join(' | '));
  m = w.mark();
  w.editOrg(0, { 'Organization status': 'Remove from site' });
  d = w.since(m);
  check('choosing "Remove from site": staff email says so', d.mails.length === 1 && /Organization status: Remove from site/.test(d.mails[0].body));
  w.submitOrg(newOrg('Brand New Org', 'bob@org.test'));
  m = w.mark();
  w.editOrg(w.form().responses.length - 1, { 'Description': 'Now with a description.' });
  d = w.since(m);
  check('editing a new organization: one staff email, no second thank-you', d.mails.length === 1 && d.mails[0].subj === 'Organization edited: Brand New Org', d.mails.map((x) => x.to + ' :: ' + x.subj).join(' | '));
  check('Show on site still untouched after all of it', !w.log.writes.some((x) => new RegExp(`^Organizations!R\\d+C${SHOW_COL} `).test(x)) && tab.rows.slice(1, 44).every((r) => r[SHOW_COL - 1] === true));
}

console.log('\n# 15. Edge cases on the Organizations tab');
{
  const w = orgWorld(), tab = w.tab();
  const blankRow = () => Array.from({ length: SHOW_COL }, () => '');
  // Hand-typed: no Timestamp.
  let m = w.mark();
  const hand = blankRow(); hand[1] = 'Hand Typed Org'; hand[EMAIL_COL - 1] = 'hand@org.test';
  tab.rows.push(hand); w.fire(tab, tab.rows.length);
  let d = w.since(m);
  check('hand-typed row: nothing written, nobody emailed', d.writes.length === 0 && d.mails.length === 0);
  // A row with no form response behind it.
  m = w.mark();
  const orphan = blankRow(); orphan[0] = new Date(Date.UTC(2030, 0, 1)); orphan[1] = 'Orphan Org'; orphan[EMAIL_COL - 1] = 'orphan@org.test';
  tab.rows.push(orphan); w.fire(tab, tab.rows.length);
  d = w.since(m);
  check('no matching response: staff problem email, nothing written', d.writes.length === 0 && d.mails.length === 1 &&
    /Couldn't match Organizations row/.test(d.mails[0].body), d.mails.map((x) => x.body.split('\n')[0]).join(' | '));
  // Edit link column renamed.
  const w2 = orgWorld(), tab2 = w2.tab();
  tab2.rows[0][LINK_COL - 1] = 'Links';
  m = w2.mark();
  w2.submitOrg(newOrg('Another Org', 'ann@org.test'));
  d = w2.since(m);
  check('no "Edit link" column: staff problem email naming it, nothing written, no thank-you', d.writes.length === 0 && d.mails.length === 1 &&
    d.mails[0].to === 'philliptrah2015@gmail.com' && /no "Edit link" column/.test(d.mails[0].body), d.mails.map((x) => x.to + ': ' + x.body.split('\n')[0]).join(' | '));
  // Same-second responses: the email breaks the tie.
  const w3 = orgWorld({ sameSecond: true }), tab3 = w3.tab();
  const a = w3.submitOrg(newOrg('Twin One', 'one@org.test')), b = w3.submitOrg(newOrg('Twin Two', 'two@org.test'));
  const rowOf = (name) => tab3.rows.find((r) => r[1] === name);
  check('45 responses in one second: each new row still gets its own link', rowOf('Twin One')[LINK_COL - 1] === a.getEditResponseUrl() && rowOf('Twin Two')[LINK_COL - 1] === b.getEditResponseUrl());
  const t1 = w3.log.mailFull.find((x) => x.to === 'one@org.test'), t2 = w3.log.mailFull.find((x) => x.to === 'two@org.test');
  check('...and each manager is sent their own link, not the other\'s', !!t1 && !!t2 && t1.body.includes(a.getEditResponseUrl()) &&
    t2.body.includes(b.getEditResponseUrl()) && !t1.body.includes(b.getEditResponseUrl()));
}

console.log('\n# 16. "Get my listing links" searches organizations too');
{
  const w = orgWorld(), tab = w.tab();
  const T = (s) => new Date(Date.UTC(2026, 9, 1, 9, 0, s));
  w.listingResponse(T(1), 'alice@org.test', 'https://forms.test/F-LISTINGS/edit?r=alice');
  w.listingRow({ ts: T(1), org: 'Alice Org', prog: 'Alice Camp', email: 'alice@org.test', link: 'https://forms.test/F-LISTINGS/edit?r=alice' });
  w.listingResponse(T(2), 'carol@org.test', 'https://forms.test/F-LISTINGS/edit?r=carol');
  w.listingRow({ ts: T(2), org: 'Carol Org', prog: 'Carol Club', email: 'carol@org.test', link: 'https://forms.test/F-LISTINGS/edit?r=carol' });
  const bob = w.submitOrg(newOrg('Bob Org', 'bob@org.test'));
  const carol = w.submitOrg(newOrg('Carol Org', 'carol@org.test'));
  const ask = (email) => { const m = w.mark(); w.lookup(email); return w.since(m); };

  let d = ask('alice@org.test');
  check('listing only: one email, the listing, no "Organization profile"', d.mails.length === 1 && d.mails[0].to === 'alice@org.test' &&
    /Alice Org – Alice Camp/.test(d.mails[0].body) && !/Organization profile/.test(d.mails[0].body));
  d = ask('bob@org.test');
  check('organization only: "Bob Org – Organization profile" with its link', d.mails.length === 1 && d.mails[0].to === 'bob@org.test' &&
    d.mails[0].body.includes('Bob Org – Organization profile') && d.mails[0].body.includes(bob.getEditResponseUrl()), d.mails[0] && d.mails[0].body);
  d = ask('carol@org.test');
  check('both: ONE email holding the listing and the profile', d.mails.length === 1 && /Carol Org – Carol Club/.test(d.mails[0].body) &&
    d.mails[0].body.includes('Carol Org – Organization profile') && d.mails[0].body.includes(carol.getEditResponseUrl()));
  d = ask('dave@org.test');
  check('neither: staff are told, dave gets nothing', d.mails.length === 1 && d.mails[0].to === 'philliptrah2015@gmail.com' && /unknown email/.test(d.mails[0].subj));
  // An organization row with an email but no link yet.
  const noLink = Array.from({ length: SHOW_COL }, () => '');
  noLink[0] = T(9); noLink[1] = 'Erin Org'; noLink[EMAIL_COL - 1] = 'erin@org.test';
  tab.rows.push(noLink);
  d = ask('erin@org.test');
  check('org row missing its link: staff told to run backfillOrgs, erin gets nothing', d.mails.length === 1 && d.mails[0].to === 'philliptrah2015@gmail.com' &&
    /Organizations row\(s\) \d+/.test(d.mails[0].body) && /backfillOrgs/.test(d.mails[0].body), d.mails.map((x) => x.to + ': ' + x.body.split('\n')[0]).join(' | '));
  // A hand-typed organization row is never offered.
  const handOrg = Array.from({ length: SHOW_COL }, () => '');
  handOrg[1] = 'Frank Org'; handOrg[EMAIL_COL - 1] = 'frank@org.test'; handOrg[LINK_COL - 1] = 'not a real link';
  tab.rows.push(handOrg);
  d = ask('frank@org.test');
  check('hand-typed org row: frank gets nothing, staff get the no-match note', d.mails.length === 1 && d.mails[0].to === 'philliptrah2015@gmail.com');
  check('the lookup wrote nothing anywhere', !w.log.writes.slice(-50).some((x) => /Link Requests!|Activities!/.test(x)));
}

console.log('\n# 17. Activities and Link Requests behave exactly as before');
{
  // The Code.gs from just before the new-activity staff email (b80be02), so this
  // still compares old and new behaviour after that change reached master.
  const masterCode = require('child_process').execSync('git show b80be02~1:apps-script/Code.gs', { cwd: REPO }).toString();
  const scenario = (w) => {
    const T = (s) => new Date(Date.UTC(2026, 9, 1, 10, 0, s));
    w.listingResponse(T(0), 'a@org.test', 'https://forms.test/F-LISTINGS/edit?r=A');
    w.listingRow({ ts: T(0), org: 'Org A', prog: 'Prog A', email: 'a@org.test' });                  // no link yet
    const hand = w.listingRow({ org: 'Hand Org', prog: 'Hand Prog', email: 'alice@org.test', link: 'see staff note' });
    w.listingResponse(T(1), 'alice@org.test', 'https://forms.test/F-LISTINGS/edit?r=B');
    const edited = w.listingRow({ ts: T(1), org: 'Org B', prog: 'Prog B', email: 'alice@org.test', link: 'https://forms.test/F-LISTINGS/edit?r=B' });
    w.g.backfillEditLinks();                                       // fills Org A
    w.fire(w.activities, hand);                                    // hand-typed: nothing
    w.fire(w.activities, edited);                                  // edited listing: staff email
    w.submitListing({ org: 'Org C', prog: 'Prog C', email: 'c@org.test' }); // new: link + thank-you
    w.lookup('alice@org.test');                                    // her listing link
    w.lookup('nobody@org.test');                                   // staff no-match
    return JSON.stringify({ writes: w.log.writes, mails: w.log.mailFull });
  };
  // The one intended difference from master: a new activity also tells staff.
  // Set those emails aside and everything else must match byte for byte.
  const isNewActivity = (m) => /^New activity waiting for approval: /.test(m.subj);
  const withoutNew = (j) => { const o = JSON.parse(j); o.mails = o.mails.filter((m) => !isNewActivity(m)); return JSON.stringify(o); };
  const before = scenario(world({ codeSource: masterCode })), after = scenario(world());
  check('without an Organizations tab: identical writes and emails to master\'s Code.gs, apart from the new-activity staff email',
    withoutNew(before) === withoutNew(after) && JSON.parse(before).mails.every((m) => !isNewActivity(m)));
  check('...and that difference is exactly one email, for the one new activity (Prog C)',
    JSON.parse(after).mails.filter(isNewActivity).map((m) => m.subj).join('|') === 'New activity waiting for approval: Org C – Prog C');
  const parsed = JSON.parse(after);
  check('...and that scenario really exercises them (link written, thank-you, edit notice, lookup, no-match)',
    parsed.writes.some((x) => x.startsWith(`Activities!R2C${ACT.link} `)) &&
    parsed.mails.some((x) => /Thanks for submitting Prog C/.test(x.subj)) && parsed.mails.some((x) => /Listing edited: Org B/.test(x.subj)) &&
    parsed.mails.some((x) => x.to === 'alice@org.test') && parsed.mails.some((x) => /unknown email/.test(x.subj)), JSON.stringify(parsed.mails.map((x) => x.subj)));
  const orgBefore = scenario(orgWorld({ codeSource: masterCode })), orgAfter = scenario(orgWorld());
  check('with the Organizations tab and its 43 backfilled rows: still identical, apart from that email', withoutNew(orgBefore) === withoutNew(orgAfter));
}

console.log('\n# 18. The Activities form\'s organization list follows the Organizations tab');
{
  const csvNames = rowsToRecords(parseCSV(fs.readFileSync(REPO + 'data/organizations_placeholder_sheet.csv', 'utf8')).filter((r) => r.some((c) => c.trim())))
    .map((r) => r['Organization name'].trim()).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const inOrder = (a) => a.every((x, i) => i === 0 || a[i - 1].localeCompare(x, 'en', { sensitivity: 'base' }) <= 0);
  const w = orgWorld();
  check('the 43 backfilled rows do not touch the list', JSON.stringify(w.orgQ.choices) === '["Option 1"]' && w.log.formWrites.length === 0);
  let m = w.mark();
  const err = tryRun(() => w.g.syncActivityOrgChoices());
  let d = w.since(m);
  check('run by hand: all 43 names, sorted, with Other on', err === null && JSON.stringify(w.orgQ.choices) === JSON.stringify(csvNames) && w.orgQ.other === true, err || w.orgQ.choices.slice(0, 3).join(' | '));
  check('...writing to no sheet and emailing nobody', d.writes.length === 0 && d.mails.length === 0, d.writes.join(' | ') + ' ' + d.mails.map((x) => x.subj).join(' | '));
  const fw = w.log.formWrites.length;
  tryRun(() => w.g.syncActivityOrgChoices());
  check('run again with nothing changed: the form is not rewritten', w.log.formWrites.length === fw);

  w.submitOrg(newOrg('Aardvark Arts', 'aa@org.test'));
  check('a new organization joins the list, which stays in order', w.orgQ.choices.includes('Aardvark Arts') && w.orgQ.choices.length === 44 && inOrder(w.orgQ.choices), w.orgQ.choices.slice(0, 3).join(' | '));
  w.editOrg(w.form().responses.length - 1, { 'Organization name': 'Zebra Arts' });
  check('renaming it through its edit link replaces it in the list, still in order', !w.orgQ.choices.includes('Aardvark Arts') && w.orgQ.choices.includes('Zebra Arts') && w.orgQ.choices.length === 44 && inOrder(w.orgQ.choices), w.orgQ.choices.slice(-3).join(' | '));
  // Staff typed names: a hand-typed row, and an untidy duplicate of one already there.
  const tab = w.tab();
  const hand = Array.from({ length: SHOW_COL }, () => ''); hand[1] = 'Hand Typed Partner';
  const dup = Array.from({ length: SHOW_COL }, () => ''); dup[1] = '  buttonwood   park ZOO ';
  tab.rows.push(hand, dup);
  tryRun(() => w.g.syncActivityOrgChoices());
  check('hand-typed organizations are included', w.orgQ.choices.includes('Hand Typed Partner'));
  check('a name differing only in case or spaces is not listed twice', w.orgQ.choices.filter((c) => c.toLowerCase().replace(/\s+/g, ' ') === 'buttonwood park zoo').length === 1);
  check('the sync never wrote to a sheet', !w.log.writes.some((x) => /Activities!|Live/.test(x)));

  // Still a short answer on the form: staff are told, nothing changes, org handling carries on.
  const w2 = orgWorld({ orgQuestionType: 'TEXT' });
  m = w2.mark();
  const e2 = tryRun(() => w2.submitOrg(newOrg('Short Answer Org', 'sa@org.test')));
  d = w2.since(m);
  check('short-answer question: no throw, the new org still gets its link and both emails', e2 === null &&
    d.mails.some((x) => x.to === 'sa@org.test') && d.mails.some((x) => /waiting for approval/.test(x.subj)), e2);
  check('...plus one staff problem email saying it needs to be multiple choice, and no form change', d.mails.filter((x) => /needs a look/.test(x.subj)).length === 1 &&
    d.mails.some((x) => /needs to be multiple choice/.test(x.body)) && w2.log.formWrites.length === 0);
  // No Organizations tab yet.
  const w3 = world();
  m = { mails: w3.log.mails.length };
  const e3 = tryRun(() => w3.g.syncActivityOrgChoices());
  check('no Organizations tab: no throw, staff told, form untouched', e3 === null && w3.log.mailFull.length === 1 &&
    /no "Organizations" tab/.test(w3.log.mailFull[0].body) && w3.log.formWrites.length === 0, e3 || JSON.stringify(w3.log.mailFull.map((x) => x.body)));
}

console.log('\n# 19. A new activity tells staff it is waiting for approval');
{
  const STAFF = 'philliptrah2015@gmail.com';
  const staffNew = (d) => d.filter((m) => /^New activity waiting for approval: /.test(m.subj));
  const w = world();
  const from = () => w.log.mailFull.length;
  // A normal new activity.
  let m = from();
  const { row } = w.submitListing({ org: 'Org N', prog: 'Prog N', email: 'n@org.test' });
  let d = w.log.mailFull.slice(m);
  const s1 = staffNew(d);
  check('one staff email, to STAFF_EMAIL, subject "New activity waiting for approval: Org N – Prog N"',
    s1.length === 1 && s1[0].to === STAFF && s1[0].subj === 'New activity waiting for approval: Org N – Prog N', JSON.stringify(d.map((x) => x.to + ' :: ' + x.subj)));
  check('its body links to that row and says to tick Show on Site',
    s1.length === 1 && s1[0].body.includes('#gid=') && s1[0].body.includes('&range=A' + row) && s1[0].body.includes('(row ' + row + ')') && /tick Show on Site/.test(s1[0].body), s1[0] && s1[0].body);
  check('the partner still gets their thank-you with the edit link, sent first',
    d.length === 2 && d[0].to === 'n@org.test' && /Thanks for submitting Prog N/.test(d[0].subj) && d[0].body.includes('F-LISTINGS/edit'));
  check('the script still never writes Show on Site', !w.log.writes.some((x) => x.startsWith('Activities!R' + row + 'C' + ACT.show + ' ')));
  // The same activity edited through its link: the edit notice only.
  m = from();
  w.fire(w.activities, row);
  d = w.log.mailFull.slice(m);
  check('an edit sends "Listing edited" and no new-activity email',
    staffNew(d).length === 0 && d.length === 1 && /^Listing edited: Org N/.test(d[0].subj), JSON.stringify(d.map((x) => x.subj)));
  // A hand-typed row: nothing at all.
  const hand = w.listingRow({ org: 'Hand Org', prog: 'Hand Prog', email: 'h@org.test' });
  m = from();
  w.fire(w.activities, hand);
  check('a hand-typed row (no Timestamp) sends nothing', w.log.mailFull.length === m);
  // A new activity whose manager email is unusable: staff still hear it is waiting.
  m = from();
  w.submitListing({ org: 'Org Bad', prog: 'Prog Bad', email: 'not an email' });
  d = w.log.mailFull.slice(m);
  check('bad manager email: the problem email as before, then the waiting email',
    d.length === 2 && /needs a look/.test(d[0].subj) && staffNew(d).length === 1 && staffNew(d)[0].to === STAFF, JSON.stringify(d.map((x) => x.subj)));
  // A new row the script can't match to a form response.
  const ghost = w.listingRow({ ts: new Date(Date.UTC(2020, 0, 1)), org: 'Org Ghost', prog: 'Prog Ghost', email: 'g@org.test' });
  m = from();
  w.fire(w.activities, ghost);
  d = w.log.mailFull.slice(m);
  check('unmatched new row: no link written, the problem email, then the waiting email',
    d.length === 2 && /needs a look/.test(d[0].subj) && staffNew(d).length === 1 &&
    !w.log.writes.some((x) => x.startsWith('Activities!R' + ghost + 'C' + ACT.link + ' ')), JSON.stringify(d.map((x) => x.subj)));
  // Organizations are unchanged: their own waiting email, never the activity one.
  const o = orgWorld();
  const om = o.log.mailFull.length;
  const oe = tryRun(() => o.submitOrg(newOrg('Staff Test Org', 'st@org.test')));
  const od = o.log.mailFull.slice(om);
  check('a new organization sends its own waiting email and no activity one',
    oe === null && od.some((x) => /^New organization waiting for approval: Staff Test Org/.test(x.subj)) && staffNew(od).length === 0, oe || JSON.stringify(od.map((x) => x.subj)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
