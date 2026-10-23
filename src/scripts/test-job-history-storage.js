const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { DuckDBInstance } = require('@duckdb/node-api');
const { scan, runHistory, query } = require('../lib/jobs-history');
const { rowsToCsv } = require('../lib/csv');
const { calculate, metricSnapshots, weeklyBaseline, loadPopulation } = require('../lib/historical-content-metrics');
const { renderReport } = require('../lib/jobs-history-report');
const { TOP, GOOD, PROJECTION, ExactCatalog, encodeRow, encodeContent, decode, createPrototype,
  reader, auditPrototype, sha256 } = require('../lib/job-history-storage');

const sql = value => `'${String(value).replace(/'/g, "''")}'`;
const base = { CanonicalURLKey: 'https://example.test/a', URL: 'https://example.test/a', JobKey: 'bamboohr:118',
  Title: 'Technical Writer', Company: 'Example', Location: 'US', Description: 'AI, API and docs-as-code\n"Quoted" text — 漢字 🦆',
  FetchedAt: '2026-01-01T12:00:00Z', RemoteStatus: 'Remote', USRemoteEligible: 'unknown', SalaryMin: 'not specified' };
const good = { 'Apply Link': base.URL, Title: base.Title, Company: base.Company, Location: 'US', 'Work Arrangement': 'Remote' };

async function fixture(root, id, top, exported, extraHeaders = []) {
  const folder = path.join(root, id); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, TOP), rowsToCsv([...new Set([...Object.keys(base), ...extraHeaders, ...top.flatMap(Object.keys)])], top));
  await fs.writeFile(path.join(folder, GOOD), rowsToCsv([...new Set([...Object.keys(good), ...exported.flatMap(Object.keys)])], exported));
}

async function scannedRoot(root, temp) {
  const stage = await fs.mkdtemp(path.join(temp, 'stage-'));
  const result = await scan(root, stage);
  assert.deepEqual(result.errors, []);
  return result;
}

async function compareV1(root, temp, prototype, readerFactory = reader) {
  const database = path.join(temp, 'v1-baseline.duckdb');
  const started = performance.now();
  const built = await runHistory('build', { root, database });
  const buildMs = performance.now() - started;
  const instance = await DuckDBInstance.create(database, { access_mode: 'READ_ONLY' });
  const c = await instance.connect();
  try {
    const snapshots = await metricSnapshots(c), read = await readerFactory(prototype.connection), metrics = [], roles = [];
    for (const snapshot of snapshots) {
      const population = await read.population(snapshot.snapshot_id);
      assert.deepEqual(population, await loadPopulation(c, snapshot.snapshot_id), 'Existing population reader parity');
      const baseline = weeklyBaseline(snapshot, snapshots);
      const before = baseline ? (await read.population(baseline.snapshot_id)).good : [];
      const result = calculate(snapshot, population.good, population.details, baseline, before, population.exceptions);
      // The production metric table stores TIMESTAMPs, whose reader removes
      // trailing fractional zeros. Compare the same typed value, not JS spelling.
      for (const key of ['observed_at', 'report_observed_at']) {
        result.metrics[key] = (await query(c, `SELECT CAST(${sql(result.metrics[key])} AS TIMESTAMP) AS typed_time`))[0].typed_time;
      }
      const saved = (await query(c, `SELECT * FROM historical_content_metrics WHERE snapshot_id=${sql(snapshot.snapshot_id)}`))[0];
      assert.deepEqual(saved, result.metrics, 'Existing metric parity');
      metrics.push(result.metrics); roles.push(...result.roles);
    }
    const savedMetrics = await query(c, 'SELECT * FROM historical_content_metrics');
    const savedRoles = await query(c, 'SELECT * FROM historical_role_metrics');
    const sortRoles = list => [...list].sort((a, b) => `${a.snapshot_id}/${a.role_group}`.localeCompare(`${b.snapshot_id}/${b.role_group}`));
    assert.deepEqual(sortRoles(roles), sortRoles(savedRoles), 'Role parity');
    assert.equal(renderReport({ metrics, roles, generatedAt: 'fixed' }).markdown,
      renderReport({ metrics: savedMetrics, roles: savedRoles, generatedAt: 'fixed' }).markdown, 'Full report parity');
    return { snapshots: snapshots.length, raw_top_rows: Number(built.raw_top_match_rows), raw_good_rows: Number(built.raw_good_job_rows),
      observations: Number(built.observations), exceptions: Number(built.good_job_exceptions),
      v1_closed_bytes: (await fs.stat(database)).size, v1_build_and_audit_ms: Math.round(buildMs),
      population_parity: 'passed', all_metric_values: 'passed', all_role_values: 'passed', full_report_parity: 'passed' };
  } finally { c.closeSync(); instance.closeSync(); }
}

function codecTests() {
  const texts = new ExactCatalog();
  const value = JSON.parse('{"Description":"line\\r\\nquote \\"🦆\\"","__proto__":"literal","text_ref":"literal","payload_hash":"literal","Empty":"","Null":null,"12":"numeric name"}');
  const encoded = encodeRow(value, texts);
  assert.equal(JSON.stringify(decode(encoded, texts.values)), JSON.stringify(value));
  assert.equal(texts.values.size, 1);
  const missing = encodeContent({}, texts), empty = encodeContent({ Description: '' }, texts), nullable = encodeContent({ Description: null }, texts);
  assert.equal(new Set([missing, empty, nullable]).size, 3);
  assert.deepEqual(decode(missing, texts.values, PROJECTION), {});
  assert.equal(decode(nullable, texts.values, PROJECTION).Description, null);
  assert.notEqual(encodeRow({ a: '1', b: '2' }, texts), encodeRow({ b: '2', a: '1' }, texts));
  assert.equal(encodeContent(base, texts), encodeContent({ ...base, FetchedAt: 'new', WriterFitScore: '50' }, texts));
  assert.notEqual(encodeContent(base, texts), encodeContent({ ...base, Title: 'Senior Writer' }, texts));
  assert.notEqual(encodeContent(base, texts), encodeContent({ ...base, SalaryMin: '150000' }, texts));
  assert.notEqual(encodeContent(base, texts), encodeContent({ ...base, Description: base.Description + ' ' }, texts));
  assert.throws(() => encodeRow({ x: undefined }, texts), /Unsupported/);
  assert.throws(() => decode(encoded, new Map()), /Missing text/);
  assert.throws(() => decode(JSON.stringify(['future', []]), new Map()), /Unsupported/);
  const long = { Description: ('A quoted "line", with Unicode 🦆\n').repeat(10000) };
  assert.deepEqual(decode(encodeRow(long, texts), texts.values), long);
  const collision = new ExactCatalog(() => 'collision');
  collision.put('first'); collision.put('first');
  assert.throws(() => collision.put('second'), /Hash collision/);
}

async function constraintAndCorruptionTests(prototype, scanned) {
  const c = prototype.connection;
  for (const statement of [
    'INSERT INTO history_v2_raw_rows SELECT * FROM history_v2_raw_rows LIMIT 1',
    'INSERT INTO history_v2_observations SELECT * FROM history_v2_observations LIMIT 1',
    "INSERT INTO history_v2_postings SELECT 'other-id',canonical_url_key FROM history_v2_postings LIMIT 1",
    "INSERT INTO history_v2_raw_rows VALUES ('missing','file',1,'missing','hash','{}')",
    "INSERT INTO history_v2_raw_rows SELECT snapshot_id,file_name,0,payload_hash,raw_hash,metadata FROM history_v2_raw_rows LIMIT 1",
  ]) await assert.rejects(c.run(statement), /Constraint/);
  for (const statement of [
    'DELETE FROM history_v2_good_job_exceptions',
    `DELETE FROM history_v2_raw_rows WHERE file_name=${sql(TOP)}`,
    'UPDATE history_v2_observations SET selected_raw_row_number=99999',
    "UPDATE history_v2_row_payloads SET encoding='[]'",
    "UPDATE history_v2_snapshots SET metadata='{}'",
    "UPDATE history_v2_text_blobs SET content='corrupt'",
  ]) {
    await c.run('BEGIN TRANSACTION');
    try { await c.run(statement); await assert.rejects(auditPrototype(c, scanned, prototype.model), /stored content mismatch/); }
    finally { await c.run('ROLLBACK'); }
  }
  await auditPrototype(c, scanned, prototype.model);
  await c.run('BEGIN TRANSACTION');
  try {
    await c.run("UPDATE history_metadata SET format='unknown-schema'");
    await assert.rejects(reader(c), /Unsupported prototype schema/);
  } finally { await c.run('ROLLBACK'); }
  // A failed write inside a transaction must leave no partial snapshot behind.
  await c.run('BEGIN TRANSACTION');
  await c.run("INSERT INTO history_v2_snapshots VALUES ('failed-run','{}')");
  await assert.rejects(c.run('INSERT INTO history_v2_observations SELECT * FROM history_v2_observations LIMIT 1'), /Constraint/);
  await c.run('ROLLBACK');
  assert.equal(Number((await query(c, "SELECT count(*) n FROM history_v2_snapshots WHERE snapshot_id='failed-run'"))[0].n), 0);
  return { constraint_rejections: 5, corruption_rejections: 6, unknown_schema_rejected: true, transaction_rollback: 'passed' };
}

async function syntheticTests() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-fixtures-'));
  const root = path.join(temp, 'snapshots'); let prototype, second;
  try {
    const b = { ...base, CanonicalURLKey: 'https://example.test/b', URL: 'https://example.test/b' };
    const missing = { ...good, 'Apply Link': 'https://example.test/missing', Title: 'Unmatched', 'Additional Apply Links': base.URL };
    await fixture(root, '20260101-1200', [base, b], [good, good, missing]);
    await fixture(root, '20260102-1200', [
      { ...base, FetchedAt: 'bad', Description: 'invalid date' },
      { ...base, FetchedAt: '2026-01-02T12:00:00Z', Title: 'Senior Technical Writer' },
      { ...base, FetchedAt: '2026-01-02T12:00:00Z', Description: 'tie loses' },
      { ...base, FetchedAt: '2026-01-02T08:00:00Z', Description: 'last raw row: no topic text' },
    ], [good]);
    await fixture(root, '20260103-1200', [{ ...base, FetchedAt: '2026-01-03T12:00:00Z', NewField: '' }], []);
    await fixture(root, '20260104-1200', [], []);
    await fixture(root, '20260105-1200', [{ ...base, CanonicalURLKey: missing['Apply Link'], URL: missing['Apply Link'] }], [missing]);
    const scanned = await scannedRoot(root, temp);
    prototype = await createPrototype(scanned);
    const audit = await auditPrototype(prototype.connection, scanned, prototype.model);
    assert.equal(audit.exception_rows_reconstructed, 1);
    assert.equal(prototype.model.identities.values.size, 3, 'Shared JobKey does not merge identities');
    const versions = await query(prototype.connection, `SELECT content_id FROM history_v2_observations WHERE canonical_url_key=${sql(base.CanonicalURLKey)} ORDER BY snapshot_id`);
    assert.equal(versions[0].content_id, versions[2].content_id, 'A→B→A reuses A');
    assert.notEqual(versions[0].content_id, versions[1].content_id);
    const selected = await query(prototype.connection, "SELECT * FROM history_v2_observations WHERE snapshot_id='20260102-1200'");
    assert.equal(selected[0].selected_raw_row_number, 2);
    assert.equal(selected[0].canonical_group_row_count, 4);
    const constraints = await constraintAndCorruptionTests(prototype, scanned);
    const parity = await compareV1(root, temp, prototype);
    second = await createPrototype(scanned);
    assert.deepEqual(second.model.raws, prototype.model.raws);
    assert.deepEqual(second.model.observations, prototype.model.observations);
    await auditPrototype(second.connection, scanned, prototype.model);
    // Real parser/scanner errors must block the prototype before a DB is built.
    for (const [field, value, message] of [['CanonicalURLKey', '', /Missing canonical/], ['snapshot_id', 'collision', /collide/]]) {
      const badRoot = path.join(temp, `bad-${field}`);
      await fixture(badRoot, '20260101-1200', [{ ...base, [field]: value }], []);
      const stage = await fs.mkdtemp(path.join(temp, 'bad-stage-'));
      await assert.rejects(createPrototype(await scan(badRoot, stage)), message);
    }
    // Reopen the checkpointed file: the result must not depend on encoder caches.
    await prototype.connection.run('CHECKPOINT'); await prototype.close();
    const disk = await DuckDBInstance.create(prototype.database, { access_mode: 'READ_ONLY' });
    const c = await disk.connect();
    try { await auditPrototype(c, scanned, prototype.model); } finally { c.closeSync(); disk.closeSync(); }
    return { audit, constraints, parity, deterministic_rebuild: 'passed', checkpoint_reopen: 'passed' };
  } finally { await second?.dispose(); await prototype?.dispose(); await fs.rm(temp, { recursive: true, force: true }); }
}

async function repeatedPostingTest() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-repeated-'));
  const root = path.join(temp, 'snapshots'); let prototype;
  try {
    for (let day = 0; day < 60; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString();
      const id = date.slice(0, 10).replaceAll('-', '') + '-1200';
      await fixture(root, id, [{ ...base, FetchedAt: date, SourceBatch: `run-${day}` }], [good]);
    }
    const scanned = await scannedRoot(root, temp);
    prototype = await createPrototype(scanned);
    const audit = await auditPrototype(prototype.connection, scanned, prototype.model);
    assert.equal(prototype.model.observations.length, 60);
    assert.equal(prototype.model.identities.values.size, 1);
    assert.equal(prototype.model.versions.values.size, 1);
    assert.equal(prototype.model.texts.values.size, 1);
    assert.equal(prototype.model.raws.length, 120);
    return { observations: 60, posting_identities: 1, content_versions: 1, description_values: 1, audit };
  } finally { await prototype?.dispose(); await fs.rm(temp, { recursive: true, force: true }); }
}

// Fixed, bounded sample: all four 01 header variants, all three exception URLs,
// the duplicate snapshot, the old warehouse endpoint, and the latest reviewed run.
const SAMPLE_IDS = ['20260602-1810', '20260602-2051', '20260714-1607', '20260715-0556',
  '20260809-0543', '20260827-0518', '20260928-0552', '20261019-0616'];
async function savedSample() {
  const source = path.resolve(__dirname, '../../data/jobs/gsheet-package');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-saved-sample-'));
  const root = path.join(temp, 'snapshots'), before = new Map(); let prototype;
  try {
    for (const id of SAMPLE_IDS) {
      const destination = path.join(root, id); await fs.mkdir(destination, { recursive: true });
      const files = [TOP, GOOD, 'gsheet-package-manifest.json', 'SOURCE_SUMMARY.md', '09_ats_health.csv', 'README_GSHEET_PACKAGE.md', '00_start_here.csv'];
      for (const name of files) {
        const sourceFile = path.join(source, id, name);
        let bytes;
        try { bytes = await fs.readFile(sourceFile); }
        catch (error) { if (error.code === 'ENOENT' && ![TOP, GOOD].includes(name)) continue; throw error; }
        before.set(sourceFile, sha256(bytes));
        await fs.writeFile(path.join(destination, name), bytes);
      }
    }
    const scanned = await scannedRoot(root, temp);
    assert.equal(Object.keys(scanned.variants[GOOD]).length, 4);
    const started = performance.now();
    prototype = await createPrototype(scanned);
    const audit = await auditPrototype(prototype.connection, scanned, prototype.model);
    const buildAuditMs = Math.round(performance.now() - started);
    const parity = await compareV1(root, temp, prototype);
    const counts = {};
    for (const name of ['texts', 'payloads', 'identities', 'versions']) counts[name] = prototype.model[name].values.size;
    const deepnote = await query(prototype.connection, "SELECT count(*) observations, count(DISTINCT content_id) content_versions FROM history_v2_observations WHERE canonical_url_key='https://jobs.ashbyhq.com/deepnote/eb00d9b0-0dfc-4ff7-9aa4-19cf22e9644c'");
    assert.equal(Number(deepnote[0].observations), SAMPLE_IDS.length); assert.equal(Number(deepnote[0].content_versions), 1);
    const duplicate = scanned.snapshots.find(s => s.id === '20260715-0556');
    assert.equal(duplicate.duplicates, 10);
    assert.equal(scanned.snapshots.reduce((sum, s) => sum + s.unmatched, 0), 3);
    await prototype.connection.run('CHECKPOINT'); await prototype.close();
    const bytes = (await fs.stat(prototype.database)).size;
    return { snapshot_ids: SAMPLE_IDS, source_files_checked: before.size, header_variants: 4, audit, parity,
      catalog_counts: counts, deepnote: deepnote[0], duplicate_raw_excess_retained: 10,
      prototype_closed_bytes: bytes, prototype_build_and_audit_ms: buildAuditMs,
      size_comparison_limit: 'Same CSV/artifact population, but prototype lacks v1 wide SQL views, lifecycle views and stored metric tables. This is not a final migration size forecast.',
      sources_unchanged: true };
  } finally {
    try { for (const [file, hash] of before) assert.equal(sha256(await fs.readFile(file)), hash, `Source changed: ${file}`); }
    finally { await prototype?.dispose(); await fs.rm(temp, { recursive: true, force: true }); }
  }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--saved-sample')) throw new Error('Only --saved-sample is supported; no database output path is accepted');
  codecTests();
  const synthetic = await syntheticTests();
  const repeated_posting = await repeatedPostingTest();
  const saved_sample = process.argv.includes('--saved-sample') ? await savedSample() : null;
  console.log(JSON.stringify({ status: 'passed', codec: 'passed', synthetic, repeated_posting, saved_sample, peak_rss_bytes: process.resourceUsage().maxRSS * 1024 }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { codecTests, syntheticTests, savedSample, compareV1, SAMPLE_IDS };
