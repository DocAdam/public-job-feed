// All cooperating batch commands use this lock before they read or write inputs.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const LOCK_NAME = '.batch-maintenance.lock';

async function safeDirectory(dir, create = false) {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (create) {
      try { await fs.mkdir(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    const stat = await fs.lstat(current);
    const systemAlias = process.platform === 'darwin' && ['/var', '/tmp'].includes(current) &&
      await fs.realpath(current) === '/private' + current;
    if (!stat.isDirectory() && !systemAlias) throw new Error('Unsafe directory: ' + current);
  }
}

async function syncDirectory(dir) {
  const handle = await fs.open(dir, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function withBatchMaintenance(batchesRoot, operation, action) {
  await safeDirectory(batchesRoot, true);
  const file = path.join(batchesRoot, LOCK_NAME);
  const owner = { version: 1, pid: process.pid, host: os.hostname(), nonce: crypto.randomUUID(),
    operation, startedAt: new Date().toISOString() };
  const handle = await fs.open(file, 'wx', 0o600).catch(e => {
    if (e.code === 'EEXIST') throw new Error('Batch maintenance lock exists. Wait for its owner; an interrupted run needs manual review.');
    throw e;
  });
  let recorded = false;
  try {
    await handle.writeFile(JSON.stringify(owner) + '\n');
    await handle.sync(); recorded = true;
    await syncDirectory(batchesRoot);
    return await action(owner);
  } finally {
    await handle.close();
    if (recorded) {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() ||
          JSON.parse(await fs.readFile(file, 'utf8')).nonce !== owner.nonce) {
        throw new Error('Batch lock ownership changed; manual review required');
      }
      await fs.unlink(file);
      await syncDirectory(batchesRoot);
    }
  }
}

async function assertHistoryIdle(indexDir) {
  for (const name of ['.fetch-history.lock', '.fetch-history-recovery.lock']) {
    try { await fs.lstat(path.join(indexDir, name)); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    throw new Error('History write or recovery is pending; manual review required');
  }
}
module.exports = { LOCK_NAME, safeDirectory, syncDirectory, withBatchMaintenance, assertHistoryIdle };
