const fs = require('fs/promises');
const nodeFs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const crypto = require('crypto');
const { fromRoot, writeJsonFile, writeTextFile } = require('../lib/files');
const { addHistory, analyze, groupFailures, workdayGroups } = require('../lib/failure-analysis');

async function main() {
  const option = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : process.argv[at + 1]; };
  const root = path.resolve(option('--data-root', fromRoot('data')));
  const output = path.resolve(option('--output-dir', path.join(root, 'jobs/reports')));
  const inputs = [], warnings = [], emptyBatches = [], history = new Map();
  async function read(file) {
    const buffer = await fs.readFile(file);
    inputs.push({ path: path.relative(root, file), bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
    return JSON.parse(buffer);
  }
  const state = await read(path.join(root, 'jobs/state/board-state.json'));
  const catalog = await read(path.join(root, 'catalogs/crawl/board-catalog.json'));
  if (!Array.isArray(state.Boards) || !Array.isArray(catalog)) throw new Error('Invalid state or catalog');
  const cutoff = Date.parse(state.GeneratedAt);
  if (!Number.isFinite(cutoff)) throw new Error('State has no valid GeneratedAt');
  const wanted = new Set(state.Boards.filter(row => row.Active && row.FetchEligible && row.CoverageStatus === 'FETCH_FAILED').map(row => row.BoardKey));
  const add = (row, source) => { if (wanted.has(row.BoardKey || `${row.ATS}|${row.CatalogSlug}`.toLowerCase())) addHistory(history, row, source, cutoff); };
  const ledgerRoot = path.join(root, 'jobs/index/history/fetch-events');
  let ledgers = [];
  try { ledgers = (await fs.readdir(ledgerRoot)).filter(file => file.endsWith('.jsonl.gz')).sort(); }
  catch(error) { if (error.code !== 'ENOENT') throw error; warnings.push('No compressed fetch-event history found.'); }
  for (const name of ledgers) {
    const file = path.join(ledgerRoot, name), hash = crypto.createHash('sha256');
    const source = path.relative(root,file), stream = nodeFs.createReadStream(file);
    let bytes = 0;
    stream.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
    const unzip = zlib.createGunzip();
    stream.on('error', error => unzip.destroy(error));
    const lines = readline.createInterface({ input: stream.pipe(unzip), crlfDelay: Infinity });
    try { for await (const line of lines) if (line.trim()) add(JSON.parse(line), source); }
    finally { lines.close(); stream.destroy(); unzip.destroy(); }
    inputs.push({ path: source, bytes, sha256: hash.digest('hex') });
  }
  const batchesRoot = path.join(root, 'jobs/batches');
  for (const entry of (await fs.readdir(batchesRoot, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(batchesRoot, entry.name), names = await fs.readdir(dir);
    if (!names.length) emptyBatches.push(entry.name);
    if (!names.includes('jobs-batch-fetch-log.json')) { warnings.push(`No fetch log: ${entry.name}`); continue; }
    const file = path.join(dir, 'jobs-batch-fetch-log.json');
    const rows = await read(file);
    if (!Array.isArray(rows)) throw new Error(`Invalid fetch log: ${file}`);
    for (const row of rows) add(row, path.relative(root, file));
  }
  const sample = path.join(root, 'jobs/sample/jobs-sample-fetch-log.json');
  try { for (const row of await read(sample)) add(row, path.relative(root,sample)); }
  catch(error) { if (error.code !== 'ENOENT') throw error; }
  const rows = analyze(state.Boards, catalog, history, cutoff), groups = groupFailures(rows);
  const count = predicate => rows.filter(predicate).length;
  const report = {
    schema_version: 1, derived: true, generated_at: new Date().toISOString(), state_generated_at: state.GeneratedAt,
    scope: 'Active, fetch-eligible boards with FETCH_FAILED in saved board state; no network requests.',
    limitations: ['Never succeeded means no success in the available saved history, not proof of no past success.',
      'Counts deduplicate successful observations by board key and fetch time; retained history can be incomplete.',
      'Legacy response bodies and redirect chains cannot be recovered. A constructed endpoint is not a saved request.',
      'ZIP archives are not read; compressed fetch-event ledgers and current batch/sample logs are read.',
      'FirstSeenAt is the local catalog observation date, not the board creation date.',
      'Retry actions are advice only. Retry schedules and board eligibility are unchanged.'],
    summary: { failed_boards: rows.length, never_succeeded: count(r => r.success_history === 'never succeeded'),
      previously_succeeded: count(r => r.success_history === 'previously succeeded'),
      with_response_evidence: count(r => r.response_evidence_available),
      workday_locale_shaped_site: count(r => r.workday?.locale_shaped_site),
      workday_422_host_shaped_tenant: count(r => r.ats === 'workday' && r.http_status === 422 && (r.saved_workday_request || r.workday)?.tenant_looks_like_host_segment) },
    workday_configuration_groups: workdayGroups(rows),
    groups, empty_batches: emptyBatches, warnings, inputs, boards: rows,
  };
  const cell = value => String(value ?? 'unknown').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
  const markdown = ['# Board failure analysis (derived)', '', `State: ${state.GeneratedAt}`, `Generated: ${report.generated_at}`, '', report.scope, '',
    ...Object.entries(report.summary).map(([name,value]) => `- ${name}: ${value}`), '',
    ...report.limitations.map(line => `- ${line}`), '',
    '## Failure groups', '', '| ATS | Specific class | Failure type | HTTP | Success history | Request pattern | Action | Boards |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: |',
    ...groups.map(g => `| ${[g.ats,g.specific_error_class,g.error_class,g.http_status,g.success_history,g.request_pattern,g.recommended_action,g.boards].map(cell).join(' | ')} |`), '',
    '## Workday configuration groups', '',
    'These are saved URL patterns. They do not prove the cause of an HTTP response.', '',
    '| HTTP | Success history | Host segment | Tenant looks like wdN | Boards |',
    '| --- | --- | --- | --- | ---: |',
    ...report.workday_configuration_groups.map(g => `| ${[g.http_status,g.success_history,g.host_segment,g.tenant_looks_like_host_segment,g.boards].map(cell).join(' | ')} |`), '',
    '## Empty batch folders', '', ...emptyBatches.map(name => `- ${name}`), '',
    '## Input gaps', '', ...warnings.map(line => `- ${line}`), '',
    'The JSON report contains per-board evidence, Workday configuration, group samples, and input hashes.', '' ].join('\n');
  await writeJsonFile(path.join(output, 'failure-analysis.json'), report);
  await writeTextFile(path.join(output, 'failure-analysis.md'), markdown);
  console.log(JSON.stringify({ ...report.summary, inputs: inputs.length, empty_batches: emptyBatches, output }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
