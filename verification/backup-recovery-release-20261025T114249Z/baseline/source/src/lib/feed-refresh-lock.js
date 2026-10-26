const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeDirectory } = require('./batch-maintenance');
const fileFor = root => path.join(root, 'data/jobs/state/feed-refresh.lock');
async function acquire(root, pid = process.pid) {
  await safeDirectory(path.dirname(fileFor(root)), true);
  const token = crypto.randomUUID();
  const handle = await fs.open(fileFor(root), 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('A feed refresh lock exists. Wait for its owner; an interrupted run needs manual review.');
    throw error;
  });
  try { await handle.writeFile(JSON.stringify({ pid, token, startedAt: new Date().toISOString() })); await handle.sync(); }
  finally { await handle.close(); }
  return token;
}
async function check(root, token) {
  const stat = await fs.lstat(fileFor(root));
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe refresh lock');
  const owner = JSON.parse(await fs.readFile(fileFor(root), 'utf8'));
  if (owner.token !== token || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Refresh lock owner changed');
  process.kill(owner.pid, 0);
}
async function release(root, token) { await check(root, token); await fs.unlink(fileFor(root)); }
async function withRefreshLock(root, action, token) {
  if (token) { await check(root, token); return action(); }
  const owned = await acquire(root);
  try { return await action(); } finally { await release(root, owned); }
}
module.exports = { acquire, check, release, withRefreshLock, fileFor };
