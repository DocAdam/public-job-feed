const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { runHistory } = require(path.join(root, 'src/lib/job-history-runtime'));
const { fileHash } = require(path.join(root, 'src/lib/job-history-bounded-storage'));
async function main() {
  const database = path.join(root, 'data/jobs/history/jobs-history.duckdb');
  const before = await fileHash(database);
  const journal = await fs.readFile(database + '.history-operation.json', 'utf8');
  const result = await runHistory('update', { database, root: path.join(root, 'data/jobs/gsheet-package') });
  assert.equal(result.imported, 0);
  assert.equal(await fileHash(database), before);
  assert.equal(await fs.readFile(database + '.history-operation.json', 'utf8'), journal);
  await fs.writeFile(path.join(__dirname, 'no-op-result.json'), JSON.stringify({
    status: 'PASS', imported: result.imported, database_sha256: before,
    database_unchanged: true, operation_journal_unchanged: true,
  }, null, 2) + '\n', { flag: 'wx' });
  console.log('No-op update passed. Database and accepted operation are unchanged.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
