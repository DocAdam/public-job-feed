'use strict';

// QA wrapper for the reviewed, trusted CommonJS dry-run script.
// This is a test harness. node:vm is not a security boundary.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = '/Users/adampugh/GitHub/public-job-feed';
const ASSESSMENT = 'docs/board-identity-state-assessment-2026-11-05.json';
const STATE = 'data/jobs/state/board-state.json';
const COVERAGE = 'data/jobs/reports/company-coverage.json';
const CONSUMER = 'data/jobs/consumers/job-finder/latest.json';
const RAW = 'data/jobs/batches/qa-fixture/jobs-batch-fetch-log.json';
const HISTORY = 'data/jobs/index/history/fetch-events/2026-11.jsonl';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const raw = /^data\/jobs\/batches\/[^/]+\/jobs-batch-fetch-log\.(json|jsonl|csv)(\.gz)?$/;
const history = /^data\/jobs\/index\/history\/fetch-events\/\d{4}-\d{2}\.(json|jsonl|csv)(\.gz)?$/;
const expectedFields = {
  'ashby|axiom-co': ['LastAttemptAt', 'LastSuccessAt'],
  'ashby|bland-ai': ['LastAttemptAt', 'LastSuccessAt'],
  'ashby|cside': ['LastAttemptAt'],
  'ashby|duckduckgo': ['LastAttemptAt', 'LastSuccessAt'],
  'ashby|finnihealth': ['LastAttemptAt', 'LastSuccessAt'],
  'ashby|focus-ai': ['LastSuccessAt'],
  'ashby|himsandhers': ['LastSuccessAt'],
  'ashby|meridian-ai': ['LastAttemptAt'],
  'ashby|paradigm-ai': ['LastSuccessAt'],
  'ashby|plaud-ai': ['LastSuccessAt'],
  'ashby|scrunch-ai': ['LastSuccessAt'],
  'ashby|workos-inc': ['LastSuccessAt'],
  'lever|beetalents': ['LastSuccessAt'],
  'lever|vevo-ai': ['LastSuccessAt']
};

function checkAssessment(a) {
  assert.equal(a.Kind, 'DERIVED_READ_ONLY_ASSESSMENT');
  const confirmed = a.Cases.filter(c => c.Classification === 'CONFIRMED_SAVED_FIELD_MISMATCH');
  const legacy = a.Cases.filter(c => c.Classification === 'UNKNOWN_LEGACY_IDENTITY_POLICY');
  const fields = confirmed.flatMap(c => c.DateChecks.filter(d => d.Result === 'DIFFERENT_BOARD_MATCH')
    .map(d => `${c.BoardKey}:${d.Field}`));
  assert.equal(confirmed.length, 14);
  assert.equal(fields.length, 18);
  assert.equal(new Set(fields).size, 18);
  assert.equal(legacy.length, 336);
  assert.equal(new Set([...confirmed, ...legacy].map(c => c.BoardKey)).size, 350);
  assert.deepEqual(Object.fromEntries(confirmed.map(c => [c.BoardKey,
    c.DateChecks.filter(d => d.Result === 'DIFFERENT_BOARD_MATCH').map(d => d.Field)])), expectedFields);
  for (const c of legacy) {
    assert.equal(c.SavedState.ATS, 'bamboohr');
    assert.equal(c.BoardKey, `bamboohr|${c.SavedState.CatalogSlug}`);
    assert.equal(c.SavedState.BoardKey, c.BoardKey);
    assert.equal(c.CurrentCompanyCoverage.ATS, 'bamboohr');
  }
  return { confirmed, legacy };
}

function fixture(a, scenario) {
  const selected = a.Cases.filter(c => ['CONFIRMED_SAVED_FIELD_MISMATCH',
    'UNKNOWN_LEGACY_IDENTITY_POLICY'].includes(c.Classification));
  a = structuredClone({ ...a, Cases: selected });
  const events = new Map();
  for (const c of a.Cases) {
    const found = [c.LatestExactAttempt, c.LatestExactLive,
      ...c.DateChecks.flatMap(d => [...d.ExactMatches, ...d.DifferentBoardMatches])].filter(Boolean);
    for (const e of found) {
      const [ATS, CatalogSlug] = e.BoardKey.split('|');
      const row = { ...e, ATS, CatalogSlug, CompanyKey: c.CompanyKey, SourceBatch: 'qa-fixture' };
      delete row.Sources;
      events.set(JSON.stringify([row.BoardKey, row.FetchedAt, row.Status]), row);
    }
    for (const d of c.DateChecks) for (const e of d.DifferentBoardMatches) e.SourceBatch = 'qa-fixture';
  }
  a.Sources = [RAW, HISTORY].map(Path => ({ Path, SHA256: 'synthetic-fixture' }));
  const confirmed = a.Cases.filter(c => c.Classification === 'CONFIRMED_SAVED_FIELD_MISMATCH');
  const legacy = a.Cases.filter(c => c.Classification === 'UNKNOWN_LEGACY_IDENTITY_POLICY');
  if (scenario === 'count-13') a.Cases.splice(a.Cases.indexOf(confirmed[0]), 1);
  if (scenario === 'count-15') a.Cases.push({ ...structuredClone(confirmed[0]), BoardKey: 'ashby|extra' });
  if (scenario === 'fields-17') confirmed[0].DateChecks.pop();
  if (scenario === 'fields-19') confirmed[0].DateChecks.push(structuredClone(confirmed[0].DateChecks[0]));
  if (scenario === 'legacy-335') a.Cases.splice(a.Cases.indexOf(legacy[0]), 1);
  if (scenario === 'legacy-337') a.Cases.push({ ...structuredClone(legacy[0]), BoardKey: 'bamboohr|extra' });
  if (scenario === 'legacy-wrong-ats') legacy[0].SavedState.ATS = 'ashby';
  if (scenario === 'legacy-wrong-slug') legacy[0].SavedState.CatalogSlug = 'incorrect';
  if (scenario === 'legacy-wrong-company') legacy[0].SavedState.CompanyKey = 'incorrect';
  if (scenario === 'legacy-wrong-coverage-ats') legacy[0].CurrentCompanyCoverage.ATS = 'ashby';
  if (scenario === 'duplicate-case') confirmed[1].BoardKey = confirmed[0].BoardKey;
  if (scenario === 'duplicate-field') confirmed[0].DateChecks[1] = structuredClone(confirmed[0].DateChecks[0]);
  if (scenario === 'manifest-traversal') a.Sources.push({ Path: 'data/jobs/batches/../jobs-batch-fetch-log.json' });
  const logs = [...events.values()];
  const coverage = selected.filter(c => c.Classification === 'UNKNOWN_LEGACY_IDENTITY_POLICY')
    .map(c => c.CurrentCompanyCoverage);
  if (scenario === 'legacy-exact-coverage') coverage.push({ ATS: 'bamboohr', CompanyKey: 'qa-exact',
    CareerSiteURL: `https://${legacy[0].SavedState.CatalogSlug}.bamboohr.com`, LastChecked: a.StateGeneratedAt });
  return new Map([
    [ASSESSMENT, JSON.stringify(a)],
    [STATE, JSON.stringify({ GeneratedAt: a.StateGeneratedAt, Boards: selected.map(c => c.SavedState) })],
    [COVERAGE, JSON.stringify(coverage)],
    [RAW, JSON.stringify(logs)],
    [HISTORY, logs.map(e => JSON.stringify(e)).join('\n') + '\n']
  ]);
}

function worker(config) {
  const req = createRequire(path.join(ROOT, 'package.json'));
  const NativeDatabase = req('better-sqlite3');
  const trusted = {
    './src/lib/csv.js': req('./src/lib/csv.js'),
    './src/lib/ats/bamboohr.js': req('./src/lib/ats/bamboohr.js')
  };
  const source = fs.readFileSync(config.target, 'utf8');
  assert.equal(hash(source), config.scriptSHA256, 'Target source changed');
  const logical = new Map(config.files);
  const audit = { reads: [], denied: [], databasePaths: [], eventReads: 0, opens: [], gates: [],
    databasesBeforeEventRead: 0, sqlite: [], symlinkReads: 0, pathReads: 0 };
  const handles = new Map();
  let gateUsed = false;
  let writesBlocked = true;
  function deny(operation) {
    audit.denied.push(operation);
    throw new Error(`QA_DENIED: ${operation}`);
  }
  function keyOf(p) {
    if (typeof p !== 'string') return deny('non-string file path');
    const key = path.relative(ROOT, p);
    if (!logical.has(key)) return deny(`read outside exact file list: ${p}`);
    return key;
  }
  function gate(kind) {
    if (gateUsed || !process.send) return;
    gateUsed = true;
    audit.gates.push(kind);
    process.send({ kind: 'gate', operation: kind });
    const ack = Buffer.alloc(1);
    assert.equal(fs.readSync(0, ack, 0, 1, null), 1, 'Missing parent acknowledgement');
  }
  const io = {
    constants: Object.freeze({ O_RDONLY: fs.constants.O_RDONLY, O_NONBLOCK: fs.constants.O_NONBLOCK }),
    openSync(p, flags) {
      if (flags !== (fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | 0x20000000)) {
        return deny('fs.openSync: unapproved flags');
      }
      const key = keyOf(p), physical = logical.get(key);
      if (key === RAW && ['symlink-race', 'symlink-parent-race'].includes(config.scenario)) gate(config.scenario);
      const entry = { path: key, flags, opened: false };
      audit.opens.push(entry);
      const fd = fs.openSync(physical, flags);
      entry.opened = true;
      handles.set(fd, { key, physical });
      if (key === RAW && config.scenario === 'symlink-after-open') gate('symlink-race');
      return fd;
    },
    fstatSync(fd, options) {
      if (!handles.has(fd)) return deny('fs.fstatSync: unknown descriptor');
      return fs.fstatSync(fd, options);
    },
    closeSync(fd) {
      if (!handles.has(fd)) return deny('fs.closeSync: unknown descriptor');
      const { key } = handles.get(fd);
      fs.closeSync(fd); handles.delete(fd);
      if (key === RAW && ['hash-change', 'change-restore'].includes(config.scenario)) gate(config.scenario);
    },
    realpathSync(p) {
      if (p === ROOT) return ROOT;
      const key = keyOf(p), physical = logical.get(key);
      const resolved = fs.realpathSync(physical);
      const result = resolved === physical ? p : path.join(ROOT, '__qa_symbolic_link__');
      if (key === RAW && config.scenario === 'symlink-race' && result === p) gate('symlink-race');
      return result;
    },
    readFileSync(p) {
      const handle = typeof p === 'number' ? handles.get(p) : null;
      if (typeof p === 'number' && !handle) return deny('fs.readFileSync: unknown descriptor');
      const key = handle ? handle.key : keyOf(p);
      const physical = handle ? handle.physical : logical.get(key);
      const bytes = fs.readFileSync(handle ? p : physical);
      if (!handle) audit.pathReads++;
      audit.reads.push(key);
      if (raw.test(key) || history.test(key)) {
        audit.eventReads++;
        if ((!handle && fs.realpathSync(physical) !== physical) || bytes.includes('QA_EXTERNAL_READ_MARKER')) audit.symlinkReads++;
      }
      if (key === RAW && config.scenario === 'during-read-change') gate('hash-change');
      return bytes;
    },
    existsSync(p) { return fs.existsSync(logical.get(keyOf(p))); }
  };
  const deniedPromises = new Proxy({}, { get: (_, name) => () => deny(`fs.promises.${String(name)}`) });
  const restrictedFs = new Proxy(io, { get: (obj, name) => name === 'promises' ? deniedPromises :
    Object.hasOwn(obj, name) ? obj[name] : () => deny(`fs.${String(name)}`) });
  function memoryDatabase(name) {
    audit.databasePaths.push(name);
    audit.databasesBeforeEventRead = audit.eventReads;
    if (name !== ':memory:') return deny('file-backed database');
    const native = new NativeDatabase(':memory:');
    const methods = {
      exec(sql) {
        for (const statement of sql.split(';').filter(s => s.trim())) {
          assert(/^\s*CREATE TABLE (evidence|date_proposals|legacy_quarantine)\s*\([\w\s,()]+\)\s*$/.test(statement),
            'SQL outside staging schema');
        }
        native.exec(sql);
      },
      pragma(sql) { assert.equal(sql, 'temp_store = MEMORY'); return native.pragma(sql); },
      prepare(sql) {
        assert(/^(INSERT INTO (evidence|date_proposals|legacy_quarantine) VALUES \([?, ]+\)|SELECT \* FROM date_proposals ORDER BY board_key, field|SELECT \* FROM legacy_quarantine ORDER BY board_key|SELECT event_json FROM evidence ORDER BY event_id)$/.test(sql),
          'SQL outside staging statements');
        const statement = native.prepare(sql);
        return Object.freeze({ run: (...args) => statement.run(...args), all: (...args) => statement.all(...args) });
      },
      transaction(fn) { return native.transaction(fn); },
      close() {
        audit.sqlite.push({ databases: native.prepare('PRAGMA database_list').all(),
          proposals: native.prepare('SELECT count(*) n FROM date_proposals').get().n,
          legacy: native.prepare('SELECT count(*) n FROM legacy_quarantine').get().n });
        native.close();
      }
    };
    return new Proxy(methods, { get: (obj, prop) => prop === 'open' ? native.open :
      Object.hasOwn(obj, prop) ? obj[prop] : () => deny(`database.${String(prop)}`) });
  }
  const projectRequire = name => {
    if (name === 'better-sqlite3') return memoryDatabase;
    if (Object.hasOwn(trusted, name)) {
      const fn = name.endsWith('/csv.js') ? 'parseCsvRecords' : 'getBambooHRSlugFromUrl';
      return Object.freeze({ [fn]: trusted[name][fn] });
    }
    return deny(`project require: ${name}`);
  };
  const load = name => {
    if (['fs', 'node:fs'].includes(name)) return restrictedFs;
    if (name === 'node:module') return { createRequire: p => {
      assert.equal(p, path.join(ROOT, 'package.json')); return projectRequire;
    } };
    if (name === 'node:child_process') return { execFileSync: (file, args) => {
      assert.equal(file, 'git'); assert.deepEqual(Array.from(args), ['branch', '--show-current']);
      return 'failure-evidence-sampling-v1\n';
    } };
    if (['node:path', 'node:zlib', 'node:crypto', 'node:assert/strict'].includes(name)) return require(name);
    return deny(`require: ${name}`);
  };
  let stdout = '', stderr = '';
  const fakeProcess = { versions: { node: process.versions.node },
    platform: config.scenario === 'unsupported-platform' ? 'linux' : process.platform, cwd: () => ROOT,
    stdout: { write: s => { stdout += s; } }, exitCode: 0 };
  const context = vm.createContext({ require: load, Buffer, URL, process: fakeProcess,
    console: { error: s => { stderr += String(s); } } }, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(source, { filename: config.target }).runInContext(context, { timeout: 120000 });
  let probe = null;
  if (config.probe) {
    const result = vm.runInContext(config.probe, context, { timeout: 2000 });
    probe = JSON.parse(JSON.stringify(result));
  }
  if (config.scenario === 'write-canaries') {
    for (const p of [STATE, CONSUMER, '../job-finder/generated/qa-never-write.json']) {
      for (const method of ['writeFileSync', 'appendFileSync', 'truncateSync', 'renameSync', 'unlinkSync',
        'rmSync', 'mkdirSync', 'rmdirSync', 'symlinkSync', 'linkSync', 'copyFileSync', 'cpSync',
        'chmodSync', 'chownSync', 'utimesSync', 'openSync', 'createWriteStream']) {
        const deniedBefore = audit.denied.length;
        try { vm.runInContext(`fs[${JSON.stringify(method)}](${JSON.stringify(path.resolve(ROOT, p))}, 'r+')`, context); }
        catch (e) { assert.match(e.message, /QA_DENIED/); }
        writesBlocked &&= audit.denied.length === deniedBefore + 1;
      }
    }
    for (const code of ['fs.promises.writeFile("x", "x")', 'require("node:fs/promises")',
      'require("/tmp/external-config.cjs")', 'req("./external-config.cjs")']) {
      assert.throws(() => vm.runInContext(code, context), /QA_DENIED/);
    }
    assert.throws(() => vm.runInContext('new Database("/tmp/qa-never-create.sqlite")', context), /QA_DENIED/);
    for (const code of ['db.exec("ATTACH DATABASE \'/tmp/qa-never-attach.sqlite\' AS external")',
      'db.exec("VACUUM INTO \'/tmp/qa-never-backup.sqlite\'")', 'db.loadExtension("/tmp/qa-never-load")']) {
      assert.throws(() => vm.runInContext(code, context), /SQL outside|QA_DENIED/);
    }
    assert.equal(process.permission.has('fs.write'), false);
    assert.throws(() => fs.writeFileSync(config.writeCanary, 'must be denied'), { code: 'ERR_ACCESS_DENIED' });
  }
  const report = stdout ? JSON.parse(stdout) : null;
  if (report) delete report.generatedAt;
  const review = config.scenario === 'live' && report ? {
    snapshotCutoff: report.snapshotCutoff, currentStateGeneratedAt: report.currentStateGeneratedAt,
    dateProposals: report.dateProposals,
    proposalEvidence: report.evidence.filter(e => report.dateProposals.some(p =>
      [...p.detail.candidateEventIds, ...p.detail.siblingEventIds].includes(e.id))),
    legacyDateSupport: report.legacyQuarantine.map(row => ({ boardKey: row.board_key,
      flag: row.current_flag, currentBasis: row.detail.currentBasis.kind,
      dates: row.detail.dateSupport.map(d => ({ field: d.field, value: d.savedValue,
        exactEventCount: d.eventIds.length })) })),
    sourceManifest: report.sourceManifest
  } : undefined;
  process.send({ kind: 'result', result: { scenario: config.scenario, targetExitCode: fakeProcess.exitCode,
    stderr, outputPresent: Boolean(stdout), canonicalReportSHA256: report ? hash(JSON.stringify(report)) : null,
    scope: report?.scope, proposals: report?.dateProposals.length, legacy: report?.legacyQuarantine.length,
    quarantineFlags: report?.legacyQuarantine.filter(r => r.current_flag === 'LEGACY_UNRESOLVED').length,
    candidateCount: report?.dateProposals.filter(r => r.status === 'RETAINED_EVIDENCE_CANDIDATE').length,
    missingEvidenceCount: report?.dateProposals.filter(r => r.status === 'NO_EXACT_EVENT_REVIEW_REQUIRED').length,
    reviewOnly: report?.dateProposals.every(r => r.detail.action === 'REVIEW_ONLY' &&
      (r.candidate_value !== null || r.detail.nullMeans === 'NO_SUPPORTED_PROPOSAL; DO_NOT_CLEAR')),
    writesBlocked, probe, audit, openDescriptorsAtEnd: handles.size, review } }, error => {
    if (error) { console.error(error); process.exitCode = 1; }
    process.disconnect();
  });
  process.exitCode = fakeProcess.exitCode;
}

async function parent() {
  assert.equal(process.versions.node.split('.')[0], '26', 'Use Node.js 26.x');
  assert.equal(process.platform, 'darwin', 'Use macOS for the O_NOFOLLOW_ANY verification');
  assert.equal(fs.realpathSync(process.cwd()), ROOT, 'Run from the Public Job Feed repository');
  const { execFileSync } = require('node:child_process');
  assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    'failure-evidence-sampling-v1');
  assert.equal(process.argv[2], '--script', 'Usage: node verify-board-reconciliation.cjs --script /absolute/script.cjs [--live]');
  const target = fs.realpathSync(process.argv[3]);
  const scriptSHA256 = hash(fs.readFileSync(target));
  const originalBytes = fs.readFileSync(path.join(ROOT, ASSESSMENT));
  const a = JSON.parse(originalBytes);
  checkAssessment(a);
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'board-reconciliation-qa-')));
  const protectedPaths = [STATE, CONSUMER].map(p => path.join(ROOT, p));
  const snapshot = () => protectedPaths.map(p => fs.existsSync(p) ? {
    path: p, sha256: hash(fs.readFileSync(p)), mode: fs.statSync(p).mode,
    inode: fs.statSync(p).ino, bytes: fs.statSync(p).size, mtimeMs: fs.statSync(p).mtimeMs
  } : { path: p, absent: true });
  const before = snapshot(), checks = [];
  let number = 0;
  async function run(scenario, probe) {
    const dir = path.join(work, String(++number)); fs.mkdirSync(dir);
    const files = fixture(a, scenario), mappings = [];
    if (scenario === 'live') {
      for (const p of [ASSESSMENT, STATE, COVERAGE, ...a.Sources.filter(s => raw.test(s.Path) || history.test(s.Path)).map(s => s.Path)]) {
        mappings.push([p, path.join(ROOT, p)]);
      }
    } else {
      for (const [key, text] of files) {
        const physical = path.join(dir, key);
        fs.mkdirSync(path.dirname(physical), { recursive: true });
        fs.writeFileSync(physical, text); mappings.push([key, physical]);
      }
    }
    const rawFile = new Map(mappings).get(RAW);
    const external = path.join(dir, 'external-config.json');
    fs.writeFileSync(external, JSON.stringify([{ QA_EXTERNAL_READ_MARKER: true }]));
    if (scenario === 'symlink-file') { fs.unlinkSync(rawFile); fs.symlinkSync(external, rawFile); }
    if (scenario === 'symlink-parent') {
      const moved = path.join(dir, 'external-directory');
      fs.renameSync(path.dirname(rawFile), moved); fs.symlinkSync(moved, path.dirname(rawFile));
    }
    const config = { target, scriptSHA256, scenario, probe, files: mappings, writeCanary: path.join(dir, 'canary') };
    const configPath = path.join(dir, 'config.json'); fs.writeFileSync(configPath, JSON.stringify(config));
    const args = ['--permission', '--allow-addons', `--allow-fs-read=${__filename}`,
      `--allow-fs-read=${target}`, `--allow-fs-read=${work}`,
      `--allow-fs-read=${path.join(ROOT, 'node_modules')}`, `--allow-fs-read=${path.join(ROOT, 'src/lib')}`];
    if (scenario === 'live') for (const [, p] of mappings) args.push(`--allow-fs-read=${p}`);
    const child = fork(__filename, ['--worker', configPath], { execArgv: args,
      env: { PATH: process.env.PATH, TMPDIR: work, TZ: 'UTC' }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    return await new Promise((resolve, reject) => {
      let result, errors = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Timeout: ${scenario}`)); }, 150000);
      child.stdout.on('data', () => {});
      child.stderr.on('data', b => { errors += b; });
      child.on('error', reject);
      child.on('message', message => {
        if (message.kind === 'result') result = message.result;
        if (message.kind === 'gate') {
          // Only the parent changes temporary fixture files.
          if (message.operation === 'symlink-race') { fs.unlinkSync(rawFile); fs.symlinkSync(external, rawFile); }
          else if (message.operation === 'symlink-parent-race') {
            const moved = path.join(dir, 'replaced-parent');
            fs.renameSync(path.dirname(rawFile), moved);
            const externalDir = path.join(dir, 'external-parent'); fs.mkdirSync(externalDir);
            fs.copyFileSync(external, path.join(externalDir, path.basename(rawFile)));
            fs.symlinkSync(externalDir, path.dirname(rawFile));
          }
          else {
            const bytes = fs.readFileSync(rawFile);
            fs.appendFileSync(rawFile, '\n ');
            if (message.operation === 'change-restore') fs.writeFileSync(rawFile, bytes);
          }
          child.stdin.write('x');
        }
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (!result) return reject(new Error(`Worker failed: ${scenario}: ${signal || code}: ${errors}`));
        assert.equal(code, result.targetExitCode, 'Actual child exit differs from target exit');
        resolve(result);
      });
    });
  }
  function check(name, result, test, boundary = false) {
    try { test(result); checks.push({ name, status: boundary ? 'BOUNDARY_CONFIRMED' : 'PASS', result }); }
    catch (e) { checks.push({ name, status: 'FAIL', reason: e.message, result }); }
  }
  try {
    const base = await run('baseline');
    check('Memory-only baseline', base, r => {
      assert.equal(r.targetExitCode, 2); assert.equal(r.proposals, 18); assert.equal(r.legacy, 336);
      assert.equal(r.quarantineFlags, 336); assert.deepEqual(r.audit.databasePaths, [':memory:']);
      assert.deepEqual(r.audit.sqlite[0].databases, [{ seq: 0, name: 'main', file: '' }]);
      assert.equal(r.audit.denied.length, 0);
      assert.equal(r.audit.pathReads, 0); assert.equal(r.openDescriptorsAtEnd, 0);
      assert.equal(r.candidateCount, 7); assert.equal(r.missingEvidenceCount, 11); assert.equal(r.reviewOnly, true);
    });
    check('Repeatable output with run time removed', await run('baseline'), r =>
      assert.equal(r.canonicalReportSHA256, base.canonicalReportSHA256));
    check('Unsupported platform stops before any source read', await run('unsupported-platform'), r => {
      assert.equal(r.targetExitCode, 1); assert.equal(r.outputPresent, false);
      assert.equal(r.audit.reads.length, 0); assert.equal(r.audit.databasePaths.length, 0);
    });
    check('Exact-board coverage takes precedence over quarantine', await run('legacy-exact-coverage'), r => {
      assert.equal(r.targetExitCode, 2); assert.equal(r.legacy, 336); assert.equal(r.quarantineFlags, 335);
      assert.equal(r.reviewOnly, true);
    });
    for (const scenario of ['count-13', 'count-15', 'fields-17', 'fields-19', 'legacy-335', 'legacy-337',
      'duplicate-case', 'duplicate-field', 'legacy-wrong-ats', 'legacy-wrong-slug',
      'legacy-wrong-company', 'legacy-wrong-coverage-ats']) {
      check(`Reject at startup: ${scenario}`, await run(scenario), r => {
        assert.equal(r.targetExitCode, 1); assert.equal(r.outputPresent, false);
        assert.equal(r.audit.eventReads, 0, 'Invalid cohort reached the event loop');
        assert.equal(r.audit.databasePaths.length, 0, 'Invalid cohort reached SQLite');
        assert.deepEqual(r.audit.reads, [ASSESSMENT], 'Invalid cohort reached state or coverage');
      });
    }
    for (const p of [ASSESSMENT, STATE, COVERAGE, RAW, HISTORY]) {
      check(`allowed accepts: ${p}`, await run('path-probe', `allowed(${JSON.stringify(p)})`), r => assert.equal(r.probe, true));
    }
    for (const p of [
      'data/jobs/batches/qa-fixture/jobs-batch-fetch-log.csv.gz',
      'data/jobs/batches/qa-fixture/jobs-batch-fetch-log.jsonl',
      'data/jobs/index/history/fetch-events/2026-11.jsonl.gz']) {
      check(`Schema permits format but read list rejects unlisted path: ${p}`,
        await run('path-probe', `[schemaAllowed(${JSON.stringify(p)}), allowed(${JSON.stringify(p)})]`),
        r => assert.deepEqual(r.probe, [true, false]));
    }
    const invalid = ['/etc/passwd', '../job-finder/generated/resume.json', CONSUMER,
      'package.json', '.env', 'data/jobs/history/jobs-history.duckdb',
      'data/jobs/batches/../jobs-batch-fetch-log.json', 'data/jobs/batches/./jobs-batch-fetch-log.json'];
    for (const p of invalid) check(`allowed rejects: ${p}`, await run('path-probe', `allowed(${JSON.stringify(p)})`), r => assert.equal(r.probe, false));
    for (const p of invalid.slice(0, 6)) {
      const probe = `(() => { try { read(${JSON.stringify(p)}); return 'READ'; } catch (e) { return e.message; } })()`;
      check(`read rejects before filesystem access: ${p}`, await run('read-probe', probe), r => {
        assert.match(r.probe, /Path outside the read scope/);
        assert.equal(r.audit.denied.length, 0, 'The wrapper had to enforce the target read rule');
      });
    }
    check('Manifest rejects traversal before event reads', await run('manifest-traversal'), r => {
      assert.equal(r.targetExitCode, 1); assert.equal(r.audit.eventReads, 0);
    });
    for (const scenario of ['symlink-file', 'symlink-parent', 'symlink-race', 'symlink-parent-race', 'symlink-after-open']) {
      check(`Reject links before file contents: ${scenario}`, await run(scenario), r => {
        assert.equal(r.targetExitCode, 1); assert.equal(r.outputPresent, false);
        assert.equal(r.audit.symlinkReads, 0, 'Read followed a symbolic link');
        assert.equal(r.openDescriptorsAtEnd, 0);
        if (scenario.includes('race') || scenario === 'symlink-after-open') assert.equal(r.audit.gates.length, 1);
      });
    }
    check('Persistent external log change exits 1 with no report', await run('hash-change'), r => {
      assert.equal(r.targetExitCode, 1); assert.equal(r.outputPresent, false);
      assert.match(r.stderr, /Input changed/); assert(r.audit.reads.filter(p => p === RAW).length >= 2);
    });
    check('Change and restore is outside the hash guarantee', await run('change-restore'), r => {
      assert.equal(r.targetExitCode, 2); assert.equal(r.outputPresent, true);
    }, true);
    check('Change during descriptor read stops before a report', await run('during-read-change'), r => {
      assert.equal(r.targetExitCode, 1); assert.equal(r.outputPresent, false);
      assert.match(r.stderr, /Input changed during read/); assert.equal(r.openDescriptorsAtEnd, 0);
    });
    check('Write canaries and external imports are denied', await run('write-canaries'), r => {
      assert.equal(r.writesBlocked, true); assert(r.audit.denied.length >= 55);
      assert.equal(r.targetExitCode, 2);
    });
    if (process.argv.includes('--live')) check('Saved-data integration run', await run('live'), r => {
      assert.deepEqual(r.scope, { confirmedBoards: 14, dateFields: 18, legacySnapshotBoards: 336 });
      assert.equal(r.proposals, 18); assert.equal(r.legacy, 336);
      assert.equal(r.audit.denied.length, 0); assert.equal(r.audit.symlinkReads, 0);
      assert.equal(r.audit.pathReads, 0); assert.equal(r.openDescriptorsAtEnd, 0);
      assert([0, 2].includes(r.targetExitCode));
    });
  } catch (error) {
    checks.push({ name: 'Harness execution', status: 'FAIL', reason: error.message });
  } finally {
    try { assert.deepEqual(snapshot(), before); checks.push({ name: 'Protected state and consumer unchanged', status: 'PASS' }); }
    catch (e) { checks.push({ name: 'Protected state and consumer unchanged', status: 'FAIL', reason: e.message }); }
    assert(work.startsWith(fs.realpathSync(os.tmpdir()) + path.sep + 'board-reconciliation-qa-'));
    fs.rmSync(work, { recursive: true });
  }
  const report = { kind: 'DERIVED_QA_VERIFICATION', script: target, scriptSHA256,
    wrapperSHA256: hash(fs.readFileSync(__filename)),
    assessmentSHA256: hash(originalBytes), node: process.versions.node,
    startupPopulation: { boards: 14, fields: 18, legacy: 336 },
    limits: ['Trusted script and trusted native addon only; no hostile-code security claim.',
      'No write permission is granted to workers. Parent writes only temporary fixtures.',
      'A two-read hash cannot detect a change that is restored before verification.',
      'Before/after hashes do not prove that another process never wrote a file.'], checks };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (checks.some(c => c.status === 'FAIL')) process.exitCode = 1;
}

if (process.argv[2] === '--worker') {
  try { worker(JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))); }
  catch (e) { console.error(e.stack); process.exitCode = 1; if (process.connected) process.disconnect(); }
} else {
  parent().catch(e => { console.error(e.stack); process.exitCode = 1; });
}
