const fs = require('fs/promises');
const path = require('path');
const { packageIdentity } = require('./package-status');
const { fromRoot } = require('./files');
async function urlFailurePath(root) {
  const id = await packageIdentity(path.join(root, 'latest'));
  const file = path.join(root, id, '01_good_documentation_jobs-url-failures.csv');
  if (!(await fs.stat(file)).isFile()) throw new Error(`Required URL report is not a file: ${file}`);
  return file;
}
const reportedFiles = [
  'data/jobs/consumers/job-finder/latest.json',
  'data/jobs/reports/refresh-job-feed-status.md',
  'data/jobs/reports/project-status-dashboard.md',
  'data/jobs/reports/board-freshness-report.md',
  'data/jobs/reports/ats-anomaly-alert.md',
  'data/jobs/reports/unknown-title-category-analysis.md',
  'data/jobs/reports/us-remote-daily-report.md',
  'data/jobs/reports/international-remote-daily-report.md',
  'data/jobs/reports/all-remote-daily-report.md',
  'data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv',
  'data/jobs/gsheet-package/latest/PROJECT_STATUS_DASHBOARD.md',
];
async function checkReportedOutputs(root) {
  await urlFailurePath(path.join(root, 'data/jobs/gsheet-package'));
  for (const name of reportedFiles) {
    const file = path.join(root, name);
    if (!(await fs.stat(file)).isFile()) throw new Error(`Required output is not a file: ${file}`);
  }
}
if (require.main === module) (async () => {
  if (process.argv.includes('--check-all')) {
    await checkReportedOutputs(fromRoot());
    console.log('Reported output paths: PASS');
  } else console.log(await urlFailurePath(fromRoot('data/jobs/gsheet-package')));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { urlFailurePath, checkReportedOutputs, reportedFiles };
