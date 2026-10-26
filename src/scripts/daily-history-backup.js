const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dailyHistory, backupOnly } = require('../lib/daily-history-backup');
const { withRefreshLock } = require('../lib/feed-refresh-lock');
const { writeAtomic } = require('../lib/job-history-migration');
async function main() {
  const only = process.argv.length === 3 && process.argv[2] === '--backup-only';
  if (process.argv.length !== 2 && !only) throw new Error('Use no arguments or --backup-only. Configured project and 1Pugh drive only.');
  const project = path.resolve(__dirname, '../..');
  const status = await withRefreshLock(project, () => (only ? backupOnly : dailyHistory)({
    project, database: path.join(project, 'data/jobs/history/jobs-history.duckdb'),
    source: path.join(project, 'data/jobs/gsheet-package'),
    stateFile: path.join(project, 'data/jobs/history/daily-backup-state.json'),
    runId: process.env.FEED_RUN_ID || crypto.randomUUID(),
  }), process.env.FEED_REFRESH_TOKEN);
  const base = path.join(project, 'data/jobs/reports');
  const reportName = only ? 'history-backup-only' : 'daily-history-backup';
  await writeAtomic(path.join(base, reportName + '.json'), JSON.stringify(status, null, 2) + '\n');
  const text = [`History: ${status.History}; 1Pugh backup: ${status.Backup}`,
    `Latest history snapshot: ${status.LatestSnapshot || 'unknown'}`,
    `Last verified backup: ${status.LastVerified?.verifiedAt || 'none recorded'}; snapshot: ${status.LastVerified?.snapshot || 'unknown'}`,
    ...status.Warnings.map(w => 'Warning: ' + w)].join('\n');
  await writeAtomic(path.join(base, reportName + '.md'), '# ' + (only ? 'Backup-only verification' : 'Daily history and backup') + '\n\n' + text + '\n');
  if (process.env.FEED_RUN_ID && !only) await fs.appendFile(path.join(base, 'refresh-job-feed-status.md'), '\n' + text + '\n');
  console.log(text);
  if (only && (status.History !== 'PASS' || !['PASS', 'UNCHANGED'].includes(status.Backup))) process.exitCode = 1;
  // Keep feed and backup results separate. The report explicitly records any failure.
}
main().catch(error => { console.error(error); process.exitCode = 1; });
