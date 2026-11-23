// Tests for apps-script/Translate.gs. Run from anywhere:  node apps-script/tests/Translate.test.js
//
// Loads Code.gs, OrgForm.gs and Translate.gs into one shared scope (as one
// Apps Script project does) against mock Sheets, LanguageApp, Properties,
// Lock, Utilities and ScriptApp services.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const REPO = path.resolve(__dirname, '..', '..') + '/';

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail === undefined ? '' : '  -> ' + detail)); }
}

const ACT_HEADERS = ['Organization Name', 'Program Name', 'Categorization', 'Description', 'Website', 'Ages or Grades', 'Age Minimum', 'Age Maximum',
  'Session Dates', 'Hours', 'Cost', 'Address', 'How can kids get to this program?', 'Nearest Bus Route/Stop', 'Staff Language Support',
  'Translation Available', 'Contact', 'Program Enrollment Cost', 'Scholarships Provided?', 'Is the program free?', 'Activity type', 'Listing Status',
  'Do staff speak other languages?'];
const ORG_HEADERS = ['Organization name', 'Website', 'Min age', 'Max age', 'Grade levels served', 'Early education services', 'Youth development services',
  'Program year', 'Program model', 'Cost', 'Registration', 'Transportation', 'Location', 'Schools served', 'Schedule', 'Description'];

function actRow(o) { return ACT_HEADERS.map((h) => (h in o ? o[h] : '')); }
function orgRow(o) { return ORG_HEADERS.map((h) => (h in o ? o[h] : '')); }

function world(opts = {}) {
  const log = { writes: [], blockWrites: [], logs: [], translateCalls: [], triggers: [] };
  function makeSheet(name, rows) {
    // Each world gets its own copy, so one test's edits never leak into the next.
    const s = { name, rows: rows.map((r) => r.slice()) };
    s.api = {
      getName: () => s.name,
      getLastRow: () => s.rows.length,
      getLastColumn: () => Math.max(0, ...s.rows.map((r) => r.length)),
      getDataRange: () => ({ getValues: () => { const w = s.api.getLastColumn(); return s.rows.map((r) => Array.from({ length: w }, (_, i) => (r[i] === undefined ? '' : r[i]))); } }),
      getRange: (r1, c1, nr, nc) => ({
        setValues: (block) => {
          if (block.length !== nr || block.some((row) => row.length !== nc)) throw new Error('test mock: setValues block does not match its range');
          log.blockWrites.push({ sheet: s.name, r1, c1, nr, nc });
          for (let r = 0; r < nr; r++) {
            while (s.rows.length < r1 + r) s.rows.push([]);
            for (let c = 0; c < nc; c++) s.rows[r1 - 1 + r][c1 - 1 + c] = block[r][c];
          }
        },
        setValue: () => { throw new Error('test mock: Translate.gs should write blocks, not single cells'); },
      }),
    };
    return s;
  }
  const live = makeSheet('Live Activities', opts.liveActivities || [ACT_HEADERS.slice()]);
  const liveOrgs = makeSheet('Live Organizations', opts.liveOrgs || [ORG_HEADERS.slice()]);
  const actTr = makeSheet('Activities Translations', opts.actTr || []);
  const orgTr = makeSheet('Organizations Translations', opts.orgTr || []);
  const others = [makeSheet('Activities', [['Timestamp']]), makeSheet('Organizations', [['Timestamp']])];
  const sheets = [live, liveOrgs, actTr, orgTr, ...others].filter((s) => !(opts.drop || []).includes(s.name));
  const ss = { getSheetByName: (n) => (sheets.find((s) => s.name === n) || {}).api || null, getSheets: () => sheets.map((s) => s.api) };

  const props = Object.assign({ ORG_FORM_ID: 'FORM-123' }, opts.props || {});
  const failOn = new Set(opts.failOn || []);
  const triggers = (opts.triggers || []).map((h) => ({ h }));
  const g = {
    console,
    Logger: { log: (m) => log.logs.push(String(m)) },
    SpreadsheetApp: { getActive: () => ss },
    LanguageApp: {
      translate: (text, from, to, o) => {
        log.translateCalls.push({ text, from, to, o });
        if (failOn.has(text)) throw new Error('Service invoked too many times for one day: translate.');
        return `[${to}] ${text}`;
      },
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => Object.assign({}, props),
      getProperty: (k) => (k in props ? props[k] : null),
      setProperties: (p, deleteOthers) => { if (deleteOthers) throw new Error('test mock: must never delete other properties'); Object.assign(props, p); },
      setProperty: (k, v) => { props[k] = v; },
      deleteProperty: (k) => { delete props[k]; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.locked, waitLock() {}, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, text) => [...crypto.createHash('md5').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('base64'),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.h, _t: t })),
      deleteTrigger: (tr) => { const i = triggers.indexOf(tr._t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (h) => { const t = { h }; return { timeBased: () => ({ everyMinutes: (m) => ({ create: () => { t.every = m; triggers.push(t); } }) }), forSpreadsheet: () => ({ onFormSubmit: () => ({ create: () => triggers.push(t) }) }) }; },
    },
  };
  vm.createContext(g);
  // All three files, one realm: a duplicate top-level name would throw here.
  vm.runInContext(fs.readFileSync(REPO + 'apps-script/Code.gs', 'utf8'), g, { filename: 'Code.gs' });
  vm.runInContext(fs.readFileSync(REPO + 'apps-script/OrgForm.gs', 'utf8'), g, { filename: 'OrgForm.gs' });
  vm.runInContext(fs.readFileSync(REPO + 'apps-script/Translate.gs', 'utf8'), g, { filename: 'Translate.gs' });
  return { g, log, props, triggers, live, liveOrgs, actTr, orgTr, others };
}

const tryRun = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const ACTS = [
  actRow({ 'Organization Name': "Our Sisters' School", 'Program Name': 'School-Time SPARK ', Description: 'A FREE 6-week program.', 'Ages or Grades': '3rd-5th grade girls',
    'Session Dates': 'Mondays Nov 2-Dec 7', Hours: '4:00-5:30pm', Cost: '', 'Is the program free?': 'Yes', Contact: 'tpires@example.org' }),
  actRow({ 'Organization Name': 'Buttonwood Park Zoo', 'Program Name': 'ZooCrew', Description: 'A week at the zoo.', 'Ages or Grades': 'Ages 10-12',
    'Session Dates': 'Filled (no availability)', Hours: '9am-4pm', Cost: '$350/week' }),
];
const ORGS = [
  orgRow({ 'Organization name': '3rd EyE Youth Empowerment', Schedule: '7 Days', Description: 'Year-round programs.' }),
  orgRow({ 'Organization name': 'Alma del Mar Charter Schools', Schedule: 'Monday-Friday', Description: '' }),
];

console.log('\n# 1. Loads with Code.gs and OrgForm.gs in one project');
check('all three files load together with no duplicate names', tryRun(() => world()) === null, tryRun(() => world()));

console.log('\n# 2. First run fills both tabs');
{
  const w = world({ liveActivities: [ACT_HEADERS.slice(), ...ACTS, actRow({})], liveOrgs: [ORG_HEADERS.slice(), ...ORGS],
    actTr: [['Organization Name', 'Program Name', 'es:Program Name'], ['=ARRAYFORMULA(...)', '=ARRAYFORMULA(...)', '=MAP(...)']] });
  const err = tryRun(() => w.g.translateListings());
  check('runs without error', err === null, err);
  const a = w.actTr.rows;
  const wantHeader = ['Organization Name', 'Program Name',
    'es:Description', 'es:Ages or Grades', 'es:Session Dates', 'es:Hours', 'es:Cost', 'es:Program Enrollment Cost',
    'pt:Description', 'pt:Ages or Grades', 'pt:Session Dates', 'pt:Hours', 'pt:Cost', 'pt:Program Enrollment Cost'];
  check('activities header: the two keys, then es: and pt: columns for each field (no program-name column)', JSON.stringify(a[0]) === JSON.stringify(wantHeader), JSON.stringify(a[0]));
  check('one row per listing; the empty source row is skipped', a.length === 3, a.length);
  check('keys are copied exactly, trailing space included (the website matches on them)', a[1][0] === "Our Sisters' School" && a[1][1] === 'School-Time SPARK ', JSON.stringify(a[1].slice(0, 2)));
  check('fields are translated into their language columns', a[1][2] === '[es] A FREE 6-week program.' && a[1][8] === '[pt] A FREE 6-week program.' && a[2][6] === '[es] $350/week', JSON.stringify(a[1]));
  check('blank source text stays blank and is never sent to Google', a[1][6] === '' && !w.log.translateCalls.some((c) => c.text === ''), JSON.stringify(a[1]));
  check('the formulas that were there are gone: plain text only', !a.flat().some((v) => String(v).startsWith('=')), JSON.stringify(a));
  check('LanguageApp gets plain text, English to each language', w.log.translateCalls.every((c) => c.from === 'en' && ['es', 'pt'].includes(c.to) && c.o && c.o.contentType === 'text'));
  const o = w.orgTr.rows;
  check('organizations: header, keys and translated schedule/description', JSON.stringify(o[0]) === JSON.stringify(['Organization name', 'es:Schedule', 'es:Description', 'pt:Schedule', 'pt:Description']) &&
    o.length === 3 && o[1][1] === '[es] 7 Days' && o[2][3] === '[pt] Monday-Friday' && o[2][2] === '', JSON.stringify(o));
  check('each tab is written in exactly one block (never empty in between)', w.log.blockWrites.filter((b) => b.sheet === 'Activities Translations').length === 1 &&
    w.log.blockWrites.filter((b) => b.sheet === 'Organizations Translations').length === 1, JSON.stringify(w.log.blockWrites));
  check('nothing else is written: not the Live tabs, not Activities or Organizations', w.log.blockWrites.every((b) => /Translations$/.test(b.sheet)));
  check('other script properties (OrgForm.gs\'s form ID) are untouched', w.props.ORG_FORM_ID === 'FORM-123');

  console.log('\n# 3. Second run with nothing changed translates nothing');
  const before = JSON.stringify([w.actTr.rows, w.orgTr.rows]);
  const calls = w.log.translateCalls.length;
  w.g.translateListings();
  check('no calls to Google the second time', w.log.translateCalls.length === calls, w.log.translateCalls.length - calls);
  check('and the tabs read exactly the same', JSON.stringify([w.actTr.rows, w.orgTr.rows]) === before);

  console.log('\n# 4. An edited description is retranslated; the old one is forgotten');
  const oldKeys = Object.keys(w.props).filter((k) => k.startsWith('tr1:')).length;
  w.live.rows[2][ACT_HEADERS.indexOf('Description')] = 'A week behind the scenes at the zoo.';
  const c0 = w.log.translateCalls.length;
  w.g.translateListings();
  const newCalls = w.log.translateCalls.slice(c0);
  check('exactly two calls: the new text, into es and pt', newCalls.length === 2 && newCalls.every((c) => c.text === 'A week behind the scenes at the zoo.'), JSON.stringify(newCalls.map((c) => c.to + ':' + c.text)));
  check('the tab shows the new translation', w.actTr.rows[2][2] === '[es] A week behind the scenes at the zoo.');
  check('the old text\'s remembered translations were removed (store stays the same size)', Object.keys(w.props).filter((k) => k.startsWith('tr1:')).length === oldKeys);
  check('form ID still untouched', w.props.ORG_FORM_ID === 'FORM-123');

  console.log('\n# 5. Fewer listings than before: leftovers cleared in the same block');
  w.live.rows.splice(2, 1); // the zoo listing leaves the site
  w.g.translateListings();
  const last = w.log.blockWrites.filter((b) => b.sheet === 'Activities Translations').pop();
  check('the block still covers the old height, so the removed row is blanked, not left behind', last.nr === 3 && w.actTr.rows[2].every((v) => v === ''), JSON.stringify(w.actTr.rows[2]));
}

console.log('\n# 6. Old formula columns wider than the new layout are cleared');
{
  const wide = [['Organization Name', 'Program Name', ...Array.from({ length: 14 }, (_, i) => 'old' + i)], ['=x', '=y', ...Array.from({ length: 14 }, () => '=MAP(...)')]];
  const w = world({ liveActivities: [ACT_HEADERS.slice(), ...ACTS], actTr: wide });
  w.g.translateListings();
  const b = w.log.blockWrites.find((x) => x.sheet === 'Activities Translations');
  check('the block is 16 columns wide (the old width) and columns 15-16 end up empty', b.nc === 16 && w.actTr.rows.every((r) => r[14] === '' && r[15] === ''), JSON.stringify(b));
}

console.log('\n# 7. A translation failure leaves that cell blank and is retried next run');
{
  const w = world({ liveActivities: [ACT_HEADERS.slice(), ...ACTS], failOn: ['A week at the zoo.'] });
  const err = tryRun(() => w.g.translateListings());
  check('no throw; the failed cells are blank, everything else is translated', err === null && w.actTr.rows[2][2] === '' && w.actTr.rows[2][8] === '' && w.actTr.rows[1][2] === '[es] A FREE 6-week program.', err || JSON.stringify(w.actTr.rows[2]));
  check('the failure is logged', w.log.logs.some((l) => /Couldn't translate/.test(l)));
  const w2 = world({ liveActivities: [ACT_HEADERS.slice(), ...ACTS], props: Object.assign({}, w.props) });
  w2.g.translateListings();
  check('next run (quota back) translates the text that failed, and only that', w2.actTr.rows[2][2] === '[es] A week at the zoo.' &&
    w2.log.translateCalls.every((c) => c.text === 'A week at the zoo.'), JSON.stringify(w2.log.translateCalls.map((c) => c.text)));
}

console.log('\n# 8. A missing tab or column writes nothing');
{
  const w = world({ drop: ['Activities Translations'], liveOrgs: [ORG_HEADERS.slice(), ...ORGS] });
  const err = tryRun(() => w.g.translateListings());
  check('missing Activities Translations tab: no throw, logged, organizations still done', err === null && w.log.logs.some((l) => /no tab named "Activities Translations"/.test(l)) && w.orgTr.rows.length === 3, err);
  const w2 = world({ liveActivities: [ACT_HEADERS.filter((h) => h !== 'Hours'), ...ACTS] });
  w2.g.translateListings();
  check('Live Activities without an "Hours" column: that tab is left alone, and it says why', w2.actTr.rows.length === 0 && w2.log.logs.some((l) => /has no column Hours/.test(l)), JSON.stringify(w2.log.logs));
  const w3 = world({ locked: true, liveActivities: [ACT_HEADERS.slice(), ...ACTS] });
  w3.g.translateListings();
  check('a run already in progress: this one skips, writes nothing', w3.log.blockWrites.length === 0 && w3.log.logs.some((l) => /still going/.test(l)));
}

console.log('\n# 9. The trigger');
{
  const w = world({ triggers: ['handleFormSubmit'] });
  w.g.setupTranslationTrigger();
  w.g.setupTranslationTrigger();
  const tr = w.triggers.filter((t) => t.h === 'translateListings');
  check('run twice: exactly one translateListings trigger, every 15 minutes', tr.length === 1 && tr[0].every === 15, JSON.stringify(w.triggers));
  check('the form-submit trigger is left alone', w.triggers.some((t) => t.h === 'handleFormSubmit'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
