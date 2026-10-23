const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { DuckDBInstance } = require('@duckdb/node-api');
const { parseCsvRecords } = require('./csv');
const { normalizeCompanyKey } = require('./company-key');
const { jobKey } = require('./us-remote-daily-report');
const { refreshMetrics, auditMetrics } = require('./historical-content-metrics');

const FILES = ['03_top_matches_full.csv', '01_good_documentation_jobs.csv'];
const OPTIONAL = ['gsheet-package-manifest.json', 'SOURCE_SUMMARY.md', '09_ats_health.csv', 'README_GSHEET_PACKAGE.md', '00_start_here.csv'];
const REQUIRED = 'CanonicalURLKey JobKey CompanyTitleLocationKey DuplicateGroupKey RawJobId Source ATS Company CompanyKey Title Location RemoteStatus RemoteSignal RemoteConfidence USRemoteEligible LocationRisk LocationReviewReason SalaryDetected SalaryMin SalaryMax SalaryCurrency SalaryPeriod SalaryText Department DatePosted URL Description CatalogSlug BoardURL FetchURL FetchedAt RawJobURL RawLocation RawDepartment WriterFitVersion WriterFitBaseScore WriterFitScore WriterFitTier WriterFitReasons WriterFitPositiveSignals WriterFitNegativeSignals WriterFitPenaltySignals WriterFitDemotionReason WriterFitGuardrailApplied TitleMatchType TitleMatchCategory MatchedWatchlistTitle TitleMatchScore TitleConfidence PossibleDuplicate DuplicateReason DedupeSelected DedupeSelectionReason DedupeGroupSize'.split(' ');
const BOOL = new Set('USRemoteEligible SalaryDetected WriterFitGuardrailApplied PossibleDuplicate DedupeSelected CrossATSDuplicate'.split(' '));
const NUM = new Set('SalaryMin SalaryMax WriterFitBaseScore WriterFitScore TitleMatchScore'.split(' '));
const INT = new Set(['DedupeGroupSize', 'SourceATSCount']);
const sql = value => `'${String(value).replace(/'/g, "''")}'`;
const ident = value => `"${String(value).replace(/"/g, '""')}"`;
const snake = value => value.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
const type = column => BOOL.has(column) ? 'BOOLEAN' : NUM.has(column) ? 'DOUBLE' : INT.has(column) ? 'INTEGER' : 'VARCHAR';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const normalizeUrl = value => String(value || '').trim() ? jobKey({ 'Apply Link': value }) : '';
const query = async (connection, statement) => (await connection.runAndReadAll(statement)).getRowObjectsJson();
function observedAt(id) {
  if (!/^\d{8}-\d{4}$/.test(id)) return null;
  const value = `${id.slice(0,4)}-${id.slice(4,6)}-${id.slice(6,8)}T${id.slice(9,11)}:${id.slice(11,13)}:00`;
  const date = new Date(`${value}Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0,19) === value ? value.replace('T', ' ') : null;
}
async function discover(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  return { ids: directories.filter(observedAt), malformed: directories.filter(name => /^\d/.test(name) && !observedAt(name)) };
}
// The project parser handles quoted multiline fields. Check record widths first,
// because its general-purpose reader otherwise pads/truncates damaged records.
function checkCsv(text, label) {
  let quoted = false, width = 1, expected = null, cellStart = true;
  const widths = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else if (quoted || cellStart) quoted = !quoted;
    } else if (!quoted && c === ',') { width++; cellStart = true; continue; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (width > 1 || !cellStart) widths.push(width);
      width = 1; cellStart = true; continue;
    }
    cellStart = false;
  }
  if (width > 1 || !cellStart) widths.push(width);
  expected = widths[0];
  if (quoted || widths.some(n => n !== expected)) throw new Error(`${label}: malformed CSV record`);
  const header = parseCsvRecords(text.split(/\r?\n/, 1)[0]).headers;
  if (!header.length || header.some(h => /_\d+$/.test(h))) throw new Error(`${label}: missing or duplicate headers`);
}
// Valid ISO timestamps with an explicit zone rank above missing or invalid values.
// Equal timestamps (or no valid timestamp) use the first CSV data row.
function fetchedTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return -Infinity;
  const time = Date.parse(text);
  const day = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) && Number.isFinite(+day) && day.toISOString().slice(0, 10) === text.slice(0, 10) ? time : -Infinity;
}
const RESOLUTION = 'latest_valid_fetched_at_then_lowest_raw_row_number';
const RAW_TYPES = { snapshot_id: 'VARCHAR', raw_row_number: 'INTEGER', canonical_url_key: 'VARCHAR', job_key: 'VARCHAR', raw_values: 'VARCHAR', selected_for_observation: 'BOOLEAN', selected_raw_row_number: 'INTEGER', canonical_group_row_count: 'INTEGER' };
const GOOD_TYPES = { snapshot_id: 'VARCHAR', raw_row_number: 'INTEGER', apply_link: 'VARCHAR', title: 'VARCHAR', company: 'VARCHAR', location: 'VARCHAR', raw_values: 'VARCHAR', matched_canonical_url_key: 'VARCHAR' };
const EXCEPTION_TYPES = { ...GOOD_TYPES, reason: 'VARCHAR' };
const META_TYPES = { snapshot_id: 'VARCHAR', included_in_good_jobs: 'BOOLEAN', raw_values: 'VARCHAR', selected_raw_row_number: 'INTEGER', canonical_group_row_count: 'INTEGER', duplicate_canonical_row_count: 'INTEGER', source_anomaly: 'VARCHAR', selection_rule: 'VARCHAR' };
const jsonSource = (file, types) => `read_json(${sql(file)}, format='newline_delimited', columns={${Object.entries(types).map(([k,v]) => `${sql(k)}:${sql(v)}`).join(',')}})`;
const stageRows = async (file, rows) => fs.writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
function observationSelect(s, headers) {
  const types = Object.fromEntries([...headers].map(h => [h, 'VARCHAR']));
  return `SELECT ${[...headers].map(h => `try_cast(nullif(${ident(h)}, '') AS ${type(h)}) AS ${ident(snake(h))}`).join(',')}, ${Object.keys(META_TYPES).map(ident).join(',')} FROM ${jsonSource(s.staged, {...types, ...META_TYPES})}`;
}
async function scan(root, stage, { parseCsv = parseCsvRecords } = {}) {
  const discovery = await discover(root);
  const result = { ...discovery, snapshots: [], headers: new Set(REQUIRED), variants: {}, warnings: [], errors: [] };
  if (discovery.malformed.length) result.errors.push(`Malformed snapshot names: ${discovery.malformed.join(', ')}`);
  if (!discovery.ids.length) result.errors.push('No dated snapshots found');
  for (const id of discovery.ids) {
    try {
      const sources = [];
      for (const file of FILES) {
        const data = await fs.readFile(path.join(root, id, file));
        checkCsv(data.toString('utf8'), `${id}/${file}`);
        const parsed = parseCsv(data.toString('utf8'));
        const variant = JSON.stringify(parsed.headers);
        ((result.variants[file] ||= {})[variant] ||= []).push(id);
        sources.push({ file, sha256: hash(data), ...parsed });
      }
      const [top, good] = sources;
      for (const key of ['CanonicalURLKey', 'URL']) if (!top.headers.includes(key)) throw new Error(`03 missing ${key} header`);
      if (!good.headers.includes('Apply Link')) throw new Error('01 missing Apply Link header');
      top.headers.forEach(h => result.headers.add(h));
      const groups = new Map(), urls = new Map(), companies = new Set(), slugs = new Set(), ats = new Set();
      const raw = top.rows.map((row, index) => {
        const key = row.CanonicalURLKey;
        const url = normalizeUrl(row.URL);
        if (!key?.trim() || !url) throw new Error('Missing canonical URL key or URL');
        if (urls.has(url) && urls.get(url) !== key) throw new Error(`Normalized URL has conflicting canonical identities: ${url}`);
        urls.set(url, key);
        const item = { snapshot_id: id, raw_row_number: index + 1, canonical_url_key: key, job_key: row.JobKey || null, raw_values: JSON.stringify(row) };
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ row, item });
        const company = row.CompanyKey || normalizeCompanyKey(row.Company);
        if (company) companies.add(company);
        if (row.CatalogSlug?.trim()) slugs.add(row.CatalogSlug.trim());
        if (row.ATS?.trim()) ats.add(row.ATS.trim());
        return item;
      });
      const goodRows = good.rows.map((row, index) => ({ snapshot_id: id, raw_row_number: index + 1,
        apply_link: row['Apply Link'], title: row.Title || null, company: row.Company || null, location: row.Location || null,
        raw_values: JSON.stringify(row), matched_canonical_url_key: urls.get(normalizeUrl(row['Apply Link'])) || null }));
      const exceptions = goodRows.filter(row => !row.matched_canonical_url_key).map(row => ({ ...row, reason: 'no_matching_top_match_url' }));
      const membership = new Set(goodRows.map(row => row.matched_canonical_url_key).filter(Boolean));
      const records = [];
      for (const [key, siblings] of groups) {
        siblings.sort((a, b) => {
          const left = fetchedTime(a.row.FetchedAt), right = fetchedTime(b.row.FetchedAt);
          return left === right ? a.item.raw_row_number - b.item.raw_row_number : left > right ? -1 : 1;
        });
        const selected = siblings[0];
        for (const sibling of siblings) Object.assign(sibling.item, { selected_for_observation: sibling === selected,
          selected_raw_row_number: selected.item.raw_row_number, canonical_group_row_count: siblings.length });
        records.push({ ...selected.row, CompanyKey: selected.row.CompanyKey || normalizeCompanyKey(selected.row.Company) || '',
          snapshot_id: id, included_in_good_jobs: membership.has(key), raw_values: selected.item.raw_values,
          selected_raw_row_number: selected.item.raw_row_number, canonical_group_row_count: siblings.length,
          duplicate_canonical_row_count: siblings.length - 1, source_anomaly: siblings.length > 1 ? 'resolved_duplicate_canonical_rows' : null,
          selection_rule: RESOLUTION });
      }
      const staged = path.join(stage, `${id}.jsonl`), rawStaged = path.join(stage, `${id}-raw.jsonl`),
        goodStaged = path.join(stage, `${id}-good.jsonl`), exceptionStaged = path.join(stage, `${id}-exceptions.jsonl`);
      await stageRows(staged, records); await stageRows(rawStaged, raw);
      await stageRows(goodStaged, goodRows); await stageRows(exceptionStaged, exceptions);
      if (raw.length > records.length) result.warnings.push(`${id}: ${raw.length - records.length} duplicate canonical rows resolved; all ${raw.length} raw rows preserved`);
      if (exceptions.length) result.warnings.push(`${id}: ${exceptions.length} unmatched good-job rows preserved as exceptions`);
      const artifacts = [];
      for (const file of OPTIONAL) {
        try { const body = await fs.readFile(path.join(root, id, file), 'utf8'); artifacts.push({ file, body, sha256: hash(body) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; result.warnings.push(`${id}: optional ${file} absent`); }
      }
      result.snapshots.push({ id, staged, rawStaged, goodStaged, exceptionStaged, resolved: records.length, duplicates: raw.length - records.length, unmatched: exceptions.length, matched: membership.size, top: top.rows.length, good: good.rows.length, companies: companies.size, slugs: slugs.size, ats: ats.size, sources: sources.map(({ rows, ...source }) => ({ ...source, row_count: rows.length })), artifacts });
    } catch (error) { result.errors.push(`${id}: ${error.message}`); }
  }
  const names = [...result.headers].map(snake);
  if (new Set(names).size !== names.length || names.some(n => Object.keys(META_TYPES).includes(n))) result.errors.push('CSV column names collide with warehouse columns');
  for (const [file, variants] of Object.entries(result.variants)) if (Object.keys(variants).length > 1) result.warnings.push(`${file}: ${Object.keys(variants).length} header variants (union by name)`);
  return result;
}
async function schema(c, headers) {
  await c.run(`CREATE TABLE IF NOT EXISTS snapshots (snapshot_id VARCHAR PRIMARY KEY, observed_at TIMESTAMP, top_match_count INTEGER, good_job_count INTEGER, inclusion_rate DOUBLE, company_count INTEGER, catalog_slug_count INTEGER, ats_type_count INTEGER, imported_at TIMESTAMP, raw_top_match_row_count INTEGER, resolved_observation_count INTEGER, duplicate_canonical_row_count INTEGER, unmatched_good_job_count INTEGER);
    CREATE TABLE IF NOT EXISTS posting_observations (snapshot_id VARCHAR, canonical_url_key VARCHAR, included_in_good_jobs BOOLEAN, raw_values JSON, selected_raw_row_number INTEGER, canonical_group_row_count INTEGER, duplicate_canonical_row_count INTEGER, source_anomaly VARCHAR, selection_rule VARCHAR, PRIMARY KEY(snapshot_id, canonical_url_key));
    CREATE TABLE IF NOT EXISTS snapshot_files (snapshot_id VARCHAR, file_name VARCHAR, sha256 VARCHAR, row_count INTEGER, headers JSON, PRIMARY KEY(snapshot_id, file_name));
    CREATE TABLE IF NOT EXISTS source_artifacts (snapshot_id VARCHAR, file_name VARCHAR, sha256 VARCHAR, content VARCHAR, PRIMARY KEY(snapshot_id, file_name));`);
  for (const [table, types] of [['raw_top_match_rows', RAW_TYPES], ['raw_good_job_rows', GOOD_TYPES], ['good_job_exceptions', EXCEPTION_TYPES]]) {
    await c.run(`CREATE TABLE IF NOT EXISTS ${table} (${Object.entries(types).map(([k,v]) => `${ident(k)} ${k === 'raw_values' ? 'JSON' : v}`).join(',')}, PRIMARY KEY(snapshot_id, raw_row_number))`);
  }
  const existing = new Set((await query(c, "PRAGMA table_info('posting_observations')")).map(row => row.name));
  for (const h of headers) if (!existing.has(snake(h))) await c.run(`ALTER TABLE posting_observations ADD COLUMN ${ident(snake(h))} ${type(h)}`);
}
async function views(c) {
  await c.run(`CREATE OR REPLACE VIEW snapshot_summary AS SELECT * EXCLUDE(imported_at) FROM snapshots;
    CREATE OR REPLACE VIEW posting_lifecycle AS SELECT canonical_url_key, min(observed_at) first_seen, max(observed_at) last_seen, count(*) snapshots_seen,
    first(title ORDER BY observed_at, snapshot_id) first_observed_title, last(title ORDER BY observed_at, snapshot_id) latest_observed_title,
    first(company ORDER BY observed_at, snapshot_id) first_observed_company, last(company ORDER BY observed_at, snapshot_id) latest_observed_company,
    first(location ORDER BY observed_at, snapshot_id) first_observed_location, last(location ORDER BY observed_at, snapshot_id) latest_observed_location
    FROM posting_observations JOIN snapshots USING(snapshot_id) GROUP BY canonical_url_key;
    CREATE OR REPLACE VIEW daily_market_metrics AS SELECT s.snapshot_id, s.observed_at, count(p.canonical_url_key) total_postings,
    count(*) FILTER(WHERE included_in_good_jobs) good_postings,
    count(*) FILTER(WHERE remote_status = 'Remote') remote_postings,
    count(*) FILTER(WHERE remote_status = 'Hybrid') hybrid_postings,
    count(*) FILTER(WHERE remote_status = 'Onsite') onsite_postings,
    count(*) FILTER(WHERE us_remote_eligible) us_remote_eligible_count,
    s.company_count, s.catalog_slug_count, s.ats_type_count
    FROM snapshots s LEFT JOIN posting_observations p USING(snapshot_id) GROUP BY ALL;`);
}
async function ingest(c, snapshot, headers) {
  const s = snapshot;
  await c.run(`INSERT INTO snapshots VALUES (${sql(s.id)}, ${sql(observedAt(s.id))}, ${s.top}, ${s.good}, ${s.top ? s.good / s.top : 'NULL'}, ${s.companies}, ${s.slugs}, ${s.ats}, current_timestamp, ${s.top}, ${s.resolved}, ${s.duplicates}, ${s.unmatched})`);
  if (s.resolved) await c.run(`INSERT INTO posting_observations (${[...headers].map(h => ident(snake(h))).join(',')}, ${Object.keys(META_TYPES).map(ident).join(',')}) ${observationSelect(s, headers)}`);
  for (const [table, file, types, count] of [['raw_top_match_rows', s.rawStaged, RAW_TYPES, s.top], ['raw_good_job_rows', s.goodStaged, GOOD_TYPES, s.good], ['good_job_exceptions', s.exceptionStaged, EXCEPTION_TYPES, s.unmatched]]) {
    if (count) await c.run(`INSERT INTO ${table} SELECT * FROM ${jsonSource(file, types)}`);
  }
  for (const f of s.sources) await c.run(`INSERT INTO snapshot_files VALUES (${sql(s.id)}, ${sql(f.file)}, ${sql(f.sha256)}, ${f.row_count}, ${sql(JSON.stringify(f.headers))})`);
  for (const f of s.artifacts) await c.run(`INSERT INTO source_artifacts VALUES (${sql(s.id)}, ${sql(f.file)}, ${sql(f.sha256)}, ${sql(f.body)})`);
}
async function audit(c, scanResult) {
  const errors = [...scanResult.errors];
  const stored = await query(c, 'SELECT * FROM snapshots ORDER BY snapshot_id');
  const counts = await query(c, 'SELECT * FROM daily_market_metrics');
  const files = await query(c, 'SELECT * FROM snapshot_files');
  const artifacts = await query(c, 'SELECT snapshot_id, file_name, sha256, sha256(content) content_hash FROM source_artifacts');
  for (const s of scanResult.snapshots) {
    const row = stored.find(r => r.snapshot_id === s.id), count = counts.find(r => r.snapshot_id === s.id);
    if (!row) { errors.push(`${s.id}: not imported`); continue; }
    if (Number(row.top_match_count) !== s.top || Number(row.good_job_count) !== s.good || Number(count?.total_postings) !== s.resolved || Number(count?.good_postings) !== s.matched || row.raw_top_match_row_count !== s.top || row.resolved_observation_count !== s.resolved || row.duplicate_canonical_row_count !== s.duplicates || row.unmatched_good_job_count !== s.unmatched) errors.push(`${s.id}: row-count mismatch`);
    if (row.observed_at !== observedAt(s.id) || row.company_count !== s.companies || row.catalog_slug_count !== s.slugs || row.ats_type_count !== s.ats || (s.top ? row.inclusion_rate === null || Math.abs(row.inclusion_rate - s.good / s.top) > Number.EPSILON : row.inclusion_rate !== null)) errors.push(`${s.id}: snapshot metadata mismatch`);
    for (const f of s.artifacts) {
      const saved = artifacts.find(r => r.snapshot_id === s.id && r.file_name === f.file);
      if (!saved || saved.sha256 !== f.sha256 || saved.content_hash !== f.sha256) errors.push(`${s.id}/${f.file}: artifact mismatch`);
    }
    const targets = [
      ['raw_top_match_rows', s.rawStaged, RAW_TYPES, s.top],
      ['raw_good_job_rows', s.goodStaged, GOOD_TYPES, s.good],
      ['good_job_exceptions', s.exceptionStaged, EXCEPTION_TYPES, s.unmatched],
      ['posting_observations', s.staged, null, s.resolved],
    ];
    for (const [table, file, types, expectedCount] of targets) {
      const columns = types ? Object.keys(types) : [...[...scanResult.headers].map(snake), ...Object.keys(META_TYPES)];
      const actual = `SELECT ${columns.map(k => k === 'raw_values' ? 'raw_values::VARCHAR AS raw_values' : ident(k)).join(',')} FROM ${table} WHERE snapshot_id=${sql(s.id)}`;
      const size = await query(c, `SELECT count(*) n FROM (${actual})`);
      if (Number(size[0].n) !== expectedCount) errors.push(`${s.id}: ${table} row-count mismatch`);
      if (!expectedCount) continue;
      const expected = types ? `SELECT * FROM ${jsonSource(file, types)}` : observationSelect(s, scanResult.headers);
      const differences = await query(c, `SELECT count(*) n FROM ((${actual} EXCEPT ALL ${expected}) UNION ALL (${expected} EXCEPT ALL ${actual}))`);
      if (Number(differences[0].n)) errors.push(`${s.id}: ${table} content, selection or membership mismatch`);
    }
    for (const f of s.sources) {
      const saved = files.find(r => r.snapshot_id === s.id && r.file_name === f.file);
      if (!saved || saved.sha256 !== f.sha256 || Number(saved.row_count) !== f.row_count || (typeof saved.headers === 'string' ? saved.headers : JSON.stringify(saved.headers)) !== JSON.stringify(f.headers)) errors.push(`${s.id}/${f.file}: source hash, header or count mismatch; rebuild required`);
    }
  }
  for (const s of stored) if (!scanResult.ids.includes(s.snapshot_id)) errors.push(`${s.snapshot_id}: source snapshot absent`);
  for (const [label, statement] of [
    ['duplicate observation identity', 'SELECT snapshot_id, canonical_url_key FROM posting_observations GROUP BY ALL HAVING count(*) > 1'],
    ['missing canonical URL', "SELECT snapshot_id FROM posting_observations WHERE nullif(trim(canonical_url_key),'') IS NULL OR nullif(trim(url),'') IS NULL"],
    ['orphan observation', 'SELECT p.snapshot_id FROM posting_observations p ANTI JOIN snapshots s USING(snapshot_id)'],
  ]) if ((await query(c, statement)).length) errors.push(label);
  for (const table of ['raw_top_match_rows', 'raw_good_job_rows', 'good_job_exceptions', 'snapshot_files', 'source_artifacts']) {
    if ((await query(c, `SELECT t.snapshot_id FROM ${table} t ANTI JOIN snapshots s USING(snapshot_id)`)).length) errors.push(`${table}: orphan rows`);
  }
  errors.push(...await auditMetrics(c));
  return errors;
}
async function summary(c) {
  // One scalar per query bounds wide compatibility-view plans at full history.
  const result={};
  for(const [name,table,expression] of [
    ['observations','posting_observations','count(*)'],['canonical_urls','posting_observations','count(DISTINCT canonical_url_key)'],
    ['job_keys','posting_observations','count(DISTINCT job_key)'],['company_keys','posting_observations','count(DISTINCT company_key)'],
    ['raw_top_match_rows','raw_top_match_rows','count(*)'],['raw_job_keys','raw_top_match_rows','count(DISTINCT job_key)'],
    ['good_job_exceptions','good_job_exceptions','count(*)'],['raw_good_job_rows','raw_good_job_rows','count(*)'],
    ['duplicate_canonical_rows','snapshots','coalesce(sum(duplicate_canonical_row_count),0)'],['snapshots','snapshots','count(*)']]){
    try{result[name]=(await query(c,`SELECT ${expression} n FROM ${table}`))[0].n;}
    catch(e){throw new Error(`Summary ${name}: ${e.message}`,{cause:e});}
  }
  const latest=(await query(c,'SELECT max(snapshot_id) id FROM snapshots'))[0].id;
  result.latest=latest?(await query(c,`SELECT * FROM daily_market_metrics WHERE snapshot_id=${sql(latest)}`))[0]:undefined;
  return result;
}
// Programmatic controls let tests isolate the original scan and bound DuckDB.
// Normal commands retain the same scanner and database settings.
async function runLegacyHistory(mode, { root = path.resolve('data/jobs/gsheet-package'), database = path.resolve('data/jobs/history/jobs-history.duckdb'), databaseOptions = {}, scanSource = scan, lease } = {}) {
  if (!['build', 'update', 'audit'].includes(mode)) throw new Error('Expected build, update or audit');
  root = path.resolve(root); database = path.resolve(database);
  if (database === root || database.startsWith(root + path.sep)) throw new Error('Database must be outside the snapshot archive');
  await fs.mkdir(path.dirname(database), { recursive: true });
  await require('./job-history-access').assertLease(lease,database);
  if(!['v1','absent'].includes(await require('./job-history-runtime').detect(database)))throw new Error('Legacy writer requires v1');
  let stage, instance, c;
  const target = mode === 'build' ? `${database}.build-${crypto.randomUUID()}` : database;
  try {
    stage = await fs.mkdtemp(path.join(os.tmpdir(), 'jobs-history-'));
    const scanned = await scanSource(root, stage);
    if (scanned.errors.length) throw new Error(scanned.errors.join('\n'));
    if (mode !== 'build') await fs.access(database);
    instance = await DuckDBInstance.create(target, { ...databaseOptions, ...(mode === 'audit' ? { access_mode: 'READ_ONLY' } : {}) });
    c = await instance.connect();
    let imported = 0, metricsRefreshed = 0;
    if (mode !== 'audit') {
      await c.run('BEGIN TRANSACTION');
      try {
        await schema(c, scanned.headers);
        const existing = new Set((await query(c, 'SELECT snapshot_id FROM snapshots')).map(r => r.snapshot_id));
        for (const s of scanned.snapshots) if (!existing.has(s.id)) { await ingest(c, s, scanned.headers); imported++; }
        await views(c);
        metricsRefreshed = await refreshMetrics(c);
        const errors = await audit(c, scanned);
        if (errors.length) throw new Error(errors.join('\n'));
        await c.run('COMMIT');
      } catch (error) { await c.run('ROLLBACK'); throw error; }
    }
    const errors = await audit(c, scanned);
    const result = { mode, imported, metrics_refreshed: metricsRefreshed, ...await summary(c), header_variants: Object.fromEntries(Object.entries(scanned.variants).map(([f,v]) => [f, Object.entries(v).map(([h, ids]) => ({ headers: JSON.parse(h), snapshots: ids.length, first: ids[0], last: ids.at(-1) }))])), warnings: scanned.warnings, errors };
    if (errors.length) throw new Error(errors.join('\n'));
    if (mode !== 'audit') await c.run('CHECKPOINT');
    c.closeSync(); c = null; instance.closeSync(); instance = null;
    if (mode === 'build') await fs.rename(target, database);
    return result;
  } finally {
    c?.closeSync(); instance?.closeSync();
    if (mode === 'build') { await fs.rm(target, { force: true }); await fs.rm(`${target}.wal`, { force: true }); }
    if (stage) await fs.rm(stage, { recursive: true, force: true });

  }
}
async function runHistory(mode,options={}) { return require('./job-history-runtime').runHistory(mode,options); }
module.exports = { runLegacyHistory, audit, summary, fetchedTime, discover, normalizeUrl, observedAt, runHistory, query, scan, snake, views, REQUIRED, RAW_TYPES, GOOD_TYPES, EXCEPTION_TYPES, META_TYPES, type, ident };
