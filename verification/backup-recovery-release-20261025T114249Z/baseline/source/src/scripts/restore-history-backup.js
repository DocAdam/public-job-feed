const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyBundle, restore } = require('../lib/history-backup-files');
const { restoreAudit } = require('../lib/daily-history-backup');
const { safeDirectory } = require('../lib/batch-maintenance');
async function main() {
  const [backup, destination, ...extra] = process.argv.slice(2);
  if (!backup || !destination || extra.length) throw new Error('Use BACKUP_FOLDER NEW_EMPTY_DESTINATION');
  const source = path.resolve(backup), target = path.resolve(destination);
  if (target === source || target.startsWith(source + path.sep)) throw new Error('Restore destination must be outside the backup folder');
  const manifest = await verifyBundle(source);
  await safeDirectory(path.dirname(target)); await fs.mkdir(target); // Never overwrite a restore.
  await restore(source, target, manifest);
  const audit = await restoreAudit(target, manifest, path.resolve(__dirname, '../..'));
  console.log(JSON.stringify({ status: 'PASS', destination: target, snapshots: audit.snapshots, latest: audit.latest.snapshot_id }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
