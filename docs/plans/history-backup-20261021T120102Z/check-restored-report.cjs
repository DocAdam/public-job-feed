const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const restored = path.join(__dirname, 'restore-test');
// Run the backed-up report code. NODE_PATH supplies the installed, locked dependencies.
const { historyReport } = require(path.join(restored, 'runtime/src/lib/jobs-history-report'));
const { withLease } = require(path.join(restored, 'runtime/src/lib/job-history-access'));
const { openRead } = require(path.join(restored, 'runtime/src/lib/job-history-runtime'));
const { query } = require(path.join(restored, 'runtime/src/lib/jobs-history'));
const { fileHash } = require(path.join(restored, 'runtime/src/lib/job-history-bounded-storage'));
async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(__dirname, 'backup-manifest.json'), 'utf8'));
  const backup = manifest.backup;
  const journal = JSON.parse(await fs.readFile(path.join(backup, 'metadata/accepted-operation.json'), 'utf8'));
  const database = path.join(restored, 'history/jobs-history.duckdb');
  const report = await historyReport(database, journal.created_at);
  const rendered = report.markdown + `\n<!-- history-generation: ${journal.id}; database-sha256: ${journal.newHash} -->\n`;
  assert.equal(rendered, await fs.readFile(path.join(backup, 'metadata/jobs-history-report.md'), 'utf8'));
  const lifecycle = await withLease(database, () => openRead(database, c => query(c,
    'SELECT count(*) canonical_keys, min(first_seen) first_seen, max(last_seen) last_seen FROM posting_lifecycle')));
  assert.equal(await fileHash(database), manifest.database_sha256);
  await fs.writeFile(path.join(__dirname, 'restored-report.md'), rendered, { flag: 'wx' });
  await fs.writeFile(path.join(__dirname, 'restored-report-check.json'), JSON.stringify({
    status: 'PASS', report_matches_accepted_generation: true, lifecycle,
    database_sha256: manifest.database_sha256, database_unchanged: true,
    runtime_source: 'Restored from the external runtime archive; installed dependencies supplied through NODE_PATH',
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('Restored report matches the accepted report. Lifecycle query passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
