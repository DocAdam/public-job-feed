const path = require('node:path');
const { withRefreshLock } = require('../lib/feed-refresh-lock');
const { activateDisposition, rollbackDisposition } = require('../lib/package-snapshot-disposition');

function argumentsFor(argv) {
  const [command, packageId, flag, ...rest] = argv;
  if (command === 'activate' && flag === '--reason' && rest.length === 1 && rest[0].trim()) {
    return { command, packageId, reason: rest[0] };
  }
  if (command === 'rollback' && flag === undefined && rest.length === 0) return { command, packageId };
  throw new Error('Use activate PACKAGE_ID --reason REASON or rollback PACKAGE_ID');
}

async function main() {
  const request = argumentsFor(process.argv.slice(2));
  const project = path.resolve(__dirname, '../..');
  const options = {
    packageRoot: path.join(project, 'data/jobs/gsheet-package'),
    database: path.join(project, 'data/jobs/history/jobs-history.duckdb'),
    packageId: request.packageId,
  };
  const result = await withRefreshLock(project, () => request.command === 'activate'
    ? activateDisposition({ ...options, reason: request.reason })
    : rollbackDisposition(options));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { argumentsFor };
