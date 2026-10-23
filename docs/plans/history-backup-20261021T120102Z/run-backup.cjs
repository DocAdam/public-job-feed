// One-time backup controller. Uses the same history lease as production updates.
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const database = path.join(root, 'data/jobs/history/jobs-history.duckdb');
const { withLease, noWal } = require(path.join(root, 'src/lib/job-history-access'));
withLease(database, async () => {
  await noWal(database);
  await new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(__dirname, 'backup.py')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, HISTORY_BACKUP_LEASE: database },
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Backup checks failed: ' + code)));
  });
}).catch(error => { console.error(error); process.exitCode = 1; });
