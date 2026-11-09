'use strict';
// Review only. Run from this repository with Node.js 26.x on macOS.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const ROOT = '/Users/adampugh/GitHub/public-job-feed';
const req = createRequire(path.join(ROOT, 'package.json'));
const Database = req('better-sqlite3');
const { parseCsvRecords } = req('./src/lib/csv.js');
const { getBambooHRSlugFromUrl } = req('./src/lib/ats/bamboohr.js');
const ASSESSMENT = 'docs/board-identity-state-assessment-2026-11-05.json';
const STATE = 'data/jobs/state/board-state.json';
const COVERAGE = 'data/jobs/reports/company-coverage.json';
const rawPattern = /^data\/jobs\/batches\/([^/]+)\/jobs-batch-fetch-log\.(json|jsonl|csv)(\.gz)?$/;
const historyPattern = /^data\/jobs\/index\/history\/fetch-events\/\d{4}-\d{2}\.(json|jsonl|csv)(\.gz)?$/;
const str = v => String(v ?? '').trim();
const lower = v => str(v).toLowerCase();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const validDate = v => /^\d{4}-\d\d-\d\dT.*Z$/.test(str(v)) && Number.isFinite(Date.parse(v));
const issue = [];
const sources = new Map();
const inputPaths = new Set([ASSESSMENT, STATE, COVERAGE]);
// Apple xnu bsd/sys/fcntl.h: reject symbolic links in every path component.
// Node does not export this Darwin flag. Do not substitute O_NOFOLLOW alone.
const DARWIN_O_NOFOLLOW_ANY = 0x20000000;
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | DARWIN_O_NOFOLLOW_ANY;
let db;

function schemaAllowed(p) {
  if (typeof p !== 'string' || !p || p.includes('\\') || p.includes('\0') ||
      path.posix.isAbsolute(p) || path.posix.normalize(p) !== p ||
      p.split('/').some(part => !part || part === '.' || part === '..')) return false;
  return p === ASSESSMENT || p === STATE || p === COVERAGE ||
    rawPattern.test(p) || historyPattern.test(p);
}
function allowed(p) {
  return schemaAllowed(p) && inputPaths.has(p);
}
function read(p) {
  assert(allowed(p), `Path outside the read scope: ${p}`);
  assert.equal(process.platform, 'darwin', 'Secure reads require macOS O_NOFOLLOW_ANY');
  const abs = path.join(ROOT, p);
  // The kernel resolves the path and rejects links in the same open operation.
  const fd = fs.openSync(abs, READ_FLAGS);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    assert(before.isFile(), `Input is not a regular file: ${p}`);
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(before[key], after[key], `Input changed during read: ${p}`);
    }
    assert.equal(BigInt(bytes.length), after.size, `Incomplete input read: ${p}`);
    const digest = sha(bytes);
    if (sources.has(p)) assert.equal(sources.get(p).sha256, digest, `Input changed: ${p}`);
    else sources.set(p, { path: p, sha256: digest, bytes: bytes.length });
    return bytes;
  } finally { fs.closeSync(fd); }
}
function decode(p, bytes) {
  const text = (p.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes)
    .toString('utf8').replace(/^\uFEFF/, '');
  const ext = p.replace(/\.gz$/, '');
  if (ext.endsWith('.jsonl')) {
    return text.split(/\r?\n/).flatMap((line, i) =>
      line.trim() ? [{ row: JSON.parse(line), location: `JSONL line ${i + 1}` }] : []);
  }
  if (ext.endsWith('.csv')) {
    return parseCsvRecords(text).rows.map((row, i) =>
      ({ row, location: `CSV data record ${i + 1}` }));
  }
  const rows = JSON.parse(text);
  assert(Array.isArray(rows), `Expected an event array: ${p}`);
  return rows.map((row, i) => ({ row, location: `JSON array item ${i + 1}` }));
}
function bambooKey(row) {
  // Use the same URL precedence and reader as board-state.js.
  const slug = getBambooHRSlugFromUrl(row.CareerSiteURL || row.EstimatedFetchURL || '');
  return slug ? `bamboohr|${lower(slug)}` : '';
}
function fallbackLookup(rows) {
  const byCompany = new Map(), byBoard = new Map();
  rows.forEach((row, i) => {
    if (lower(row.ATS) !== 'bamboohr') return;
    const date = row.LastChecked ? Date.parse(row.LastChecked) : 0;
    assert(Number.isFinite(date), 'Invalid coverage date');
    const item = { row, date, location: `JSON array item ${i + 1}`, board: bambooKey(row) };
    const company = lower(row.CompanyKey);
    if (!byCompany.has(company) || date >= byCompany.get(company).date) byCompany.set(company, item);
    if (item.board && (!byBoard.has(item.board) || date >= byBoard.get(item.board).date)) {
      byBoard.set(item.board, item);
    }
  });
  return { byCompany, byBoard };
}
function currentBasis(board, lookup) {
  if (!board) return { kind: 'CURRENT_BOARD_MISSING' };
  const exact = lookup.byBoard.get(board.BoardKey);
  if (exact) return { kind: 'EXACT_BOARD', coverage: exact };
  const company = lookup.byCompany.get(lower(board.CompanyKey));
  if (!company) return { kind: 'NO_COMPANY_COVERAGE' };
  return { kind: company.board ? 'KNOWN_DIFFERENT_BOARD' : 'COMPANY_ONLY', coverage: company };
}

function main() {
  assert.equal(process.versions.node.split('.')[0], '26', 'Use Node.js 26.x');
  assert.equal(process.platform, 'darwin', 'Secure reads require macOS O_NOFOLLOW_ANY');
  assert.equal(fs.realpathSync(process.cwd()), ROOT, 'Run from the stated repository');
  assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    'failure-evidence-sampling-v1', 'Wrong branch');
  const assessment = JSON.parse(read(ASSESSMENT));
  assert.equal(assessment.Kind, 'DERIVED_READ_ONLY_ASSESSMENT');
  assert(validDate(assessment.StateGeneratedAt), 'Invalid assessment cutoff');
  const cutoff = Date.parse(assessment.StateGeneratedAt);
  const confirmed = assessment.Cases.filter(c => c.Classification === 'CONFIRMED_SAVED_FIELD_MISMATCH');
  const legacy = assessment.Cases.filter(c => c.Classification === 'UNKNOWN_LEGACY_IDENTITY_POLICY');
  const fields = confirmed.flatMap(c => c.DateChecks.filter(d => d.Result === 'DIFFERENT_BOARD_MATCH')
    .map(d => ({ c, d })));
  assert.equal(confirmed.length, 14);
  assert.equal(fields.length, 18);
  assert.equal(legacy.length, 336);
  assert.equal(new Set([...confirmed, ...legacy].map(c => c.BoardKey)).size, 350);
  assert.equal(new Set(fields.map(({ c, d }) => `${c.BoardKey}:${d.Field}`)).size, 18,
    'Duplicate affected board-and-field pair');
  for (const c of [...confirmed, ...legacy]) {
    assert(c.SavedState && c.CompanyKey, 'Missing saved board identity');
    assert.equal(c.BoardKey, `${lower(c.SavedState.ATS)}|${lower(c.SavedState.CatalogSlug)}`,
      'Case identity differs from saved identity');
    assert.equal(c.SavedState.BoardKey, c.BoardKey, 'Saved board key differs from case');
    assert.equal(lower(c.SavedState.CompanyKey), lower(c.CompanyKey), 'Company keys differ');
  }
  for (const { c, d } of fields) {
    assert(['LastAttemptAt', 'LastSuccessAt'].includes(d.Field), 'Unknown affected date field');
    assert(validDate(d.SavedValue), 'Invalid saved date');
    assert.equal(c.SavedState[d.Field], d.SavedValue, 'Saved field differs from date check');
    assert(Array.isArray(d.DifferentBoardMatches) && d.DifferentBoardMatches.length,
      'Missing different-board evidence');
  }
  for (const c of legacy) {
    assert.equal(lower(c.SavedState.ATS), 'bamboohr', 'Legacy case is not BambooHR');
    assert(c.CurrentCompanyCoverage, 'Missing legacy coverage');
    assert.equal(lower(c.CurrentCompanyCoverage.ATS), 'bamboohr', 'Legacy coverage is not BambooHR');
    assert.equal(lower(c.CurrentCompanyCoverage.CompanyKey), lower(c.CompanyKey));
    assert.equal(bambooKey(c.CurrentCompanyCoverage), '', 'Legacy coverage has exact identity');
  }
  // Validate the complete source manifest before any state, coverage, or log read.
  assert(Array.isArray(assessment.Sources), 'Missing source manifest');
  for (const s of assessment.Sources) {
    assert(typeof s.Path === 'string' && s.Path.startsWith('data/') &&
      path.posix.normalize(s.Path) === s.Path &&
      !s.Path.split('/').some(part => !part || part === '.' || part === '..'),
      'Invalid source manifest path');
  }
  const manifest = assessment.Sources.filter(s => schemaAllowed(s.Path) &&
    (rawPattern.test(s.Path) || historyPattern.test(s.Path)));
  assert(manifest.length > 0, 'No event sources');
  assert.equal(new Set(manifest.map(s => s.Path)).size, manifest.length, 'Duplicate source paths');
  for (const s of manifest) inputPaths.add(s.Path);
  const state = JSON.parse(read(STATE));
  const coverage = JSON.parse(read(COVERAGE));
  assert(Array.isArray(state.Boards) && Array.isArray(coverage), 'Unexpected input schema');
  const current = new Map(state.Boards.map(b => [b.BoardKey, b]));
  assert.equal(current.size, state.Boards.length, 'Duplicate current board keys');
  const lookup = fallbackLookup(coverage);
  const wanted = new Set([...confirmed, ...legacy].map(c => c.BoardKey));
  for (const { d } of fields) for (const e of d.DifferentBoardMatches) wanted.add(e.BoardKey);

  // Only the assessment's source manifest supplies event paths.
  // Do not scan releases, consumers, exports, or Job Finder files.
  const events = new Map();
  for (const source of manifest) {
    let bytes;
    try { bytes = read(source.Path); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      issue.push({ kind: 'MISSING_SOURCE', path: source.Path });
      continue;
    }
    sources.get(source.Path).assessmentHashMatches = sha(bytes) === source.SHA256;
    const batchMatch = source.Path.match(rawPattern);
    const kind = batchMatch ? 'raw' : 'history';
    for (const { row, location } of decode(source.Path, bytes)) {
      const key = `${lower(row.ATS)}|${lower(row.CatalogSlug)}`;
      if (!wanted.has(key) && !wanted.has(str(row.BoardKey))) continue;
      assert(lower(row.ATS) && lower(row.CatalogSlug), `Missing exact identity: ${source.Path}:${location}`);
      assert(!row.BoardKey || str(row.BoardKey) === key, 'Conflicting board identity');
      assert(validDate(row.FetchedAt), 'Invalid event date');
      const at = new Date(row.FetchedAt).toISOString();
      if (Date.parse(at) > cutoff) continue;
      const batch = batchMatch ? batchMatch[1] : str(row.SourceBatch);
      assert(batch && (!batchMatch || !row.SourceBatch || str(row.SourceBatch) === batch), 'Conflicting batch');
      const status = lower(row.Status);
      if (!['success', 'empty', 'failed'].includes(status)) continue; // No skipped attempts.
      const id = JSON.stringify([batch, key, at, status]);
      const event = events.get(id) || { id, batch, board: key, at, status, variants: new Set(), sources: [] };
      event.variants.add(JSON.stringify([str(row.HttpStatus), str(row.JobCount), str(row.ErrorClass)]));
      event.sources.push({ path: source.Path, location, kind,
        sourceURL: row.BoardURL || row.FetchURL || row.FetchEndpoint || null, raw: row });
      events.set(id, event);
    }
  }
  const all = [...events.values()];
  const qualifies = (e, field) => field === 'LastAttemptAt' || ['success', 'empty'].includes(e.status);
  const exact = (board, field) => all.filter(e => e.board === board && qualifies(e, field));
  const paired = e => e.sources.some(s => s.kind === 'raw') && e.sources.some(s => s.kind === 'history');
  const supported = (board, field, value) => exact(board, field).filter(e => e.at === value);
  const guards = ['LastAttemptAt', 'LastSuccessAt', 'LastFetchStatus', 'LastError', 'LastErrorClass',
    'AttemptCount', 'ConsecutiveFailures', 'NextCheckAt', 'JobCount', 'GoodMatchCount', 'CoverageStatus'];

  // This is the only database connection. It has no file path or attachments.
  db = new Database(':memory:');
  db.pragma('temp_store = MEMORY');
  db.exec(`
    CREATE TABLE evidence (event_id TEXT PRIMARY KEY, event_json TEXT NOT NULL);
    CREATE TABLE date_proposals (
      board_key TEXT, field TEXT, saved_value TEXT, candidate_value TEXT,
      status TEXT, detail_json TEXT, PRIMARY KEY (board_key, field));
    CREATE TABLE legacy_quarantine (
      board_key TEXT PRIMARY KEY, snapshot_flag TEXT, current_flag TEXT, detail_json TEXT);
  `);
  const putEvent = db.prepare('INSERT INTO evidence VALUES (?, ?)');
  const putDate = db.prepare('INSERT INTO date_proposals VALUES (?, ?, ?, ?, ?, ?)');
  const putLegacy = db.prepare('INSERT INTO legacy_quarantine VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const e of all) putEvent.run(e.id, JSON.stringify({ ...e, variants: [...e.variants] }));
    for (const { c, d } of fields) {
      assert(['LastAttemptAt', 'LastSuccessAt'].includes(d.Field));
      assert.equal(c.SavedState[d.Field], d.SavedValue);
      const candidates = exact(c.BoardKey, d.Field).sort((a, b) => b.at.localeCompare(a.at));
      const latest = candidates.filter(e => e.at === candidates[0]?.at);
      const sibling = d.DifferentBoardMatches.flatMap(s =>
        all.filter(e => e.board === s.BoardKey && e.batch === s.SourceBatch &&
          e.at === d.SavedValue && e.status === lower(s.Status) && qualifies(e, d.Field)));
      const siblingOK = sibling.some(e => e.variants.size === 1 && paired(e) &&
        e.sources.some(s => s.kind === 'raw' && lower(s.raw.CompanyKey) === lower(c.CompanyKey)));
      const exactSaved = supported(c.BoardKey, d.Field, d.SavedValue);
      const sameTime = all.filter(e => e.board === c.BoardKey && e.at === latest[0]?.at);
      const conflict = sameTime.some(e => e.variants.size !== 1) ||
        new Set(sameTime.map(e => e.status)).size > 1 ||
        new Set(sameTime.flatMap(e => [...e.variants])).size > 1;
      const changed = current.has(c.BoardKey) ? guards.filter(k =>
        JSON.stringify(current.get(c.BoardKey)[k]) !== JSON.stringify(c.SavedState[k])) : ['BOARD_MISSING'];
      let status = 'RETAINED_EVIDENCE_CANDIDATE';
      if (issue.length) status = 'SOURCE_GAP_REVIEW_REQUIRED';
      else if (!siblingOK || exactSaved.length) status = 'MISMATCH_NOT_REPRODUCED';
      else if (!latest.length) status = 'NO_EXACT_EVENT_REVIEW_REQUIRED';
      else if (conflict) status = 'CONFLICT_REVIEW_REQUIRED';
      else if (!latest.every(paired)) status = 'UNPAIRED_EVIDENCE_REVIEW_REQUIRED';
      const candidate = status === 'RETAINED_EVIDENCE_CANDIDATE' ? latest[0].at : null;
      putDate.run(c.BoardKey, d.Field, d.SavedValue, candidate, status, JSON.stringify({
        snapshotState: c.SavedState, currentState: current.get(c.BoardKey) || null,
        currentGuard: changed.length ? 'STALE_SNAPSHOT' : 'MATCHES_SNAPSHOT_GUARD',
        changedFields: changed, exactSavedEventIds: exactSaved.map(e => e.id),
        candidateEventIds: latest.map(e => e.id), siblingEventIds: sibling.map(e => e.id),
        action: 'REVIEW_ONLY', nullMeans: 'NO_SUPPORTED_PROPOSAL; DO_NOT_CLEAR'
      }));
    }
    for (const c of legacy) {
      assert.equal(lower(c.SavedState.ATS), 'bamboohr');
      assert.equal(lower(c.CurrentCompanyCoverage.ATS), 'bamboohr');
      assert.equal(lower(c.CurrentCompanyCoverage.CompanyKey), lower(c.CompanyKey));
      assert.equal(bambooKey(c.CurrentCompanyCoverage), '', 'Snapshot coverage now has parsed identity');
      const basis = currentBasis(current.get(c.BoardKey), lookup);
      const dateSupport = ['LastAttemptAt', 'LastSuccessAt'].map(field => ({ field,
        savedValue: c.SavedState[field],
        eventIds: supported(c.BoardKey, field, c.SavedState[field]).map(e => e.id) }));
      putLegacy.run(c.BoardKey, 'LEGACY_UNRESOLVED',
        basis.kind === 'COMPANY_ONLY' ? 'LEGACY_UNRESOLVED' : null,
        JSON.stringify({ snapshotCoverage: c.CurrentCompanyCoverage, currentBasis: basis, dateSupport,
          scope: 'Quarantine company-only coverage. Preserve exact-board events and saved dates.' }));
    }
  })();
  const currentCompanyOnly = state.Boards.filter(b => lower(b.ATS) === 'bamboohr' &&
    currentBasis(b, lookup).kind === 'COMPANY_ONLY').map(b => b.BoardKey).sort();
  const original = new Set(legacy.map(c => c.BoardKey));
  // Check all read bytes again before emitting any proposal.
  for (const [p, s] of sources) assert.equal(sha(read(p)), s.sha256, `Input changed during run: ${p}`);
  for (const s of manifest) {
    if (!sources.has(s.Path)) {
      try {
        read(s.Path);
        throw new Error(`Missing input appeared during run: ${s.Path}`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const unpack = row => { const { detail_json, ...rest } = row; return { ...rest, detail: JSON.parse(detail_json) }; };
  const report = {
    kind: 'DRAFT_DERIVED_DRY_RUN', generatedAt: new Date().toISOString(),
    snapshotCutoff: assessment.StateGeneratedAt, currentStateGeneratedAt: state.GeneratedAt,
    activeHistoryOpened: false, filesystemWrites: 0, applyAvailable: false,
    scope: { confirmedBoards: confirmed.length, dateFields: fields.length, legacySnapshotBoards: legacy.length },
    limits: ['Retained evidence is incomplete. A candidate is not proof of a complete history.',
      'Two-read hashes cannot detect changed bytes restored before verification.',
      'Secure file opens require macOS O_NOFOLLOW_ANY.',
      'No counters, retries, job facts, coverage policy, or consumer files are changed.'],
    sourceIssuesFromAssessment: assessment.SourceIssues, sourceIssuesNow: issue,
    sourceManifest: [...sources.values()],
    currentLegacyCohort: { count: currentCompanyOnly.length,
      addedSinceAssessment: currentCompanyOnly.filter(k => !original.has(k)),
      noLongerCompanyOnly: [...original].filter(k => !currentCompanyOnly.includes(k)) },
    dateProposals: db.prepare('SELECT * FROM date_proposals ORDER BY board_key, field').all().map(unpack),
    legacyQuarantine: db.prepare('SELECT * FROM legacy_quarantine ORDER BY board_key').all().map(unpack),
    evidence: db.prepare('SELECT event_json FROM evidence ORDER BY event_id').all().map(r => JSON.parse(r.event_json))
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (issue.length || currentCompanyOnly.length !== legacy.length ||
      report.currentLegacyCohort.addedSinceAssessment.length ||
      report.currentLegacyCohort.noLongerCompanyOnly.length || report.dateProposals.some(p => p.status !== 'RETAINED_EVIDENCE_CANDIDATE' ||
      p.detail.currentGuard === 'STALE_SNAPSHOT')) process.exitCode = 2;
}
try { main(); }
catch (error) { console.error(`Dry run stopped: ${error.message}`); process.exitCode = 1; }
finally { if (db?.open) db.close(); }
