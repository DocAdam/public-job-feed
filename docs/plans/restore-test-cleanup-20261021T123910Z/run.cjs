// One-time cleanup. Keep both production locks until all preservation checks end.
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const { withLease, noWal } = require(path.join(root, 'src/lib/job-history-access'));
const { withBatchMaintenance, assertHistoryIdle } = require(path.join(root, 'src/lib/batch-maintenance'));
const { inspect } = require(path.join(root, 'src/lib/job-history-runtime'));
const database = path.join(root, 'data/jobs/history/jobs-history.duckdb');
async function main() {
  await withLease(database, () => withBatchMaintenance(path.join(root, 'data/jobs/batches'), 'approved-restore-test-cleanup', async () => {
    await noWal(database);
    await assertHistoryIdle(path.join(root, 'data/jobs/index'));
    for (const [name, db, sources] of [
      ['production', database, path.join(root, 'data/jobs/gsheet-package')],
      ['restored', path.join(root, 'docs/plans/history-backup-20261021T120102Z/restore-test/history/jobs-history.duckdb'),
        path.join(root, 'docs/plans/history-backup-20261021T120102Z/restore-test/snapshots')],
    ]) {
      const checked = await inspect(db, sources);
      if (checked.result.errors.length || checked.result.pending_snapshots.length) throw new Error('Audit failed: ' + name);
      await fs.writeFile(path.join(__dirname, name + '-audit.json'), JSON.stringify(checked, null, 2) + '\n', { flag: 'wx' });
      console.log(name + ' audit passed.');
    }
    await new Promise((resolve, reject) => {
      const child = spawn('python3', [path.join(__dirname, 'cleanup.py')], {
        cwd: root, stdio: 'inherit', env: { ...process.env, RESTORE_CLEANUP_LOCK_OWNER: String(process.pid) },
      });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error('Cleanup stopped: ' + code)));
    });
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
