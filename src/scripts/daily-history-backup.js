const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dailyHistory } = require('../lib/daily-history-backup');
const { withRefreshLock } = require('../lib/feed-refresh-lock');
const { writeAtomic } = require('../lib/job-history-migration');
async function main() {
  if (process.argv.length !== 2) throw new Error('This daily command uses the configured project and 1Pugh drive. No path overrides.');
  const project = path.resolve(__dirname, '../..');
  const status = await withRefreshLock(project, () => dailyHistory({
    project, database: path.join(project, 'data/jobs/history/jobs-history.duckdb'),
    source: path.join(project, 'data/jobs/gsheet-package'),
    stateFile: path.join(project, 'data/jobs/history/daily-backup-state.json'),
    runId: process.env.FEED_RUN_ID || crypto.randomUUID(),
  }), process.env.FEED_REFRESH_TOKEN);
  const base = path.join(project, 'data/jobs/reports');
  await writeAtomic(path.join(base, 'daily-history-backup.json'), JSON.stringify(status, null, 2) + '\n');
  const text = [`History: ${status.History}; 1Pugh backup: ${status.Backup}`,
    `Latest history snapshot: ${status.LatestSnapshot || 'unknown'}`,
    `Last verified backup: ${status.LastVerified?.verifiedAt || 'none recorded'}; snapshot: ${status.LastVerified?.snapshot || 'unknown'}`,
    ...status.Warnings.map(w => 'Warning: ' + w)].join('\n');
  await writeAtomic(path.join(base, 'daily-history-backup.md'), '# Daily history and backup\n\n' + text + '\n');
  if (process.env.FEED_RUN_ID) await fs.appendFile(path.join(base, 'refresh-job-feed-status.md'), '\n' + text + '\n');
  console.log(text);
  // Keep feed and backup results separate. The report explicitly records any failure.
}
main().catch(error => { console.error(error); process.exitCode = 1; });
