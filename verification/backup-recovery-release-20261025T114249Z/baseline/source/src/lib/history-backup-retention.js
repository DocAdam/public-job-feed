const fs = require('node:fs/promises');
const path = require('node:path');
const { regular, exists, assertLease } = require('./job-history-access');
const { fileHash } = require('./job-history-bounded-storage');
const { writeAtomic } = require('./job-history-migration');
const { syncDirectory } = require('./batch-maintenance');
const { digest, inventory, verifyBundle, managedRoot, writeNew } = require('./history-backup-files');
const NAME = /^daily-[0-9]{8}T[0-9]{9}Z-[a-f0-9-]{36}$/;
async function listVerified(directory) {
  if (!await managedRoot(directory)) return [];
  const result = [];
  for (const name of (await fs.readdir(directory)).sort()) {
    if (!NAME.test(name)) continue; // Old, unknown, incomplete and interrupted folders stay untouched.
    result.push(await verifyBundle(path.join(directory, name)));
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.folder.localeCompare(a.folder));
}
function selectRetention(backups, pinnedHashes, now = new Date()) {
  const sorted = [...backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.folder.localeCompare(a.folder));
  const keep = new Set(sorted.slice(0, 14).map(b => b.folder));
  const months = new Set(Array.from({ length: 3 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7)));
  for (const b of sorted) {
    if (new Date(b.createdAt) > now || pinnedHashes.has(b.databaseHash)) keep.add(b.folder);
    const month = b.createdAt.slice(0, 7);
    if (months.has(month)) { keep.add(b.folder); months.delete(month); }
  }
  return { keep: sorted.filter(b => keep.has(b.folder)), retire: sorted.filter(b => !keep.has(b.folder)) };
}
async function loadState(file) {
  if (!await exists(file)) return { version: 1, operations: [], lastVerified: null };
  await regular(file);
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  if (state.version !== 1 || !Array.isArray(state.operations) || new Set(state.operations.map(r => r.id)).size !== state.operations.length) throw new Error('Invalid daily backup state');
  for (const r of state.operations) if (!/^[a-f0-9-]{36}$/.test(r.id) || !['owned', 'prepared', 'retired'].includes(r.state) ||
    !/^[a-f0-9]{64}$/.test(r.oldHash) || !/^[a-f0-9]{64}$/.test(r.newHash) || !/^[a-f0-9]{64}$/.test(r.manifestHash) || !Number.isFinite(Date.parse(r.createdAt))) throw new Error('Invalid recovery retention receipt');
  return state;
}
async function saveState(file, state) { await writeAtomic(file, JSON.stringify(state, null, 2) + '\n'); }
async function registerOperation(database, id, state, stateFile, lease) {
  await assertLease(lease, database);
  if (state.operations.some(r => r.id === id)) return;
  const j = JSON.parse(await fs.readFile(database + '.history-operation.json', 'utf8'));
  if (j.state !== 'accepted' || j.id !== id || !j.oldHash) throw new Error('Cannot register unaccepted history operation');
  const file = path.join(database + '.operations', id, 'manifest.json');
  await regular(file);
  if (JSON.stringify(JSON.parse(await fs.readFile(file, 'utf8'))) !== JSON.stringify(j)) throw new Error('Operation manifest differs');
  state.operations.push({ id, oldHash: j.oldHash, newHash: j.newHash, manifestHash: await fileHash(file), createdAt: j.created_at, state: 'owned' });
  await saveState(stateFile, state);
}
async function retain({ database, lease, directory, state, stateFile, checkDrive, now = new Date(), at = async () => {} }) {
  await assertLease(lease, database);
  const current = JSON.parse(await fs.readFile(database + '.history-operation.json', 'utf8'));
  if (current.state !== 'accepted') throw new Error('Pending history recovery blocks retention');
  await regular(database);
  if (await fileHash(database) !== current.newHash) throw new Error('Current database differs from its accepted generation');
  await checkDrive();
  const backups = await listVerified(directory); // Fresh hashes for every proof used below.
  if (!backups.length || !backups.some(b => b.databaseHash === current.newHash)) return { localRetired: [], externalRetired: [] };
  const hashes = new Set(backups.map(b => b.databaseHash));
  const ordered = [...state.operations].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const keepIds = new Set([current.id, ...ordered.slice(0, 2).map(r => r.id)]);
  const localRetired = [];
  for (const r of ordered) {
    if (r.state === 'retired' || keepIds.has(r.id) || !hashes.has(r.oldHash) || !hashes.has(r.newHash)) continue;
    const folder = path.join(database + '.operations', r.id), payload = path.join(folder, 'before.duckdb');
    const meta = path.join(folder, 'manifest.json'); await regular(meta);
    if (await fileHash(meta) !== r.manifestHash) throw new Error('Recovery operation changed');
    const journal = JSON.parse(await fs.readFile(meta, 'utf8'));
    if (journal.state !== 'accepted' || journal.id !== r.id || journal.database !== database || journal.oldHash !== r.oldHash || journal.newHash !== r.newHash) throw new Error('Unbound recovery receipt');
    const present = await exists(payload);
    if (!present && r.state !== 'prepared') throw new Error('Recovery payload missing without retirement record');
    if (present) {
      await regular(payload);
      if ((await fs.stat(payload)).nlink !== 1 || await fileHash(payload) !== r.oldHash) throw new Error('Recovery payload differs');
      await checkDrive(); await assertLease(lease, database);
      r.state = 'prepared'; await saveState(stateFile, state); await at('local-prepared');
      await fs.unlink(payload); await syncDirectory(folder); await at('local-unlinked');
    }
    r.state = 'retired'; r.retiredAt = now.toISOString();
    await saveState(stateFile, state); localRetired.push(r.id);
    // Keep all small operation, runtime, audit and companion records.
  }
  const pinned = new Set([current.newHash, current.oldHash]);
  for (const r of state.operations) if (r.state !== 'retired') { pinned.add(r.oldHash); pinned.add(r.newHash); }
  const plan = selectRetention(backups, pinned, now), externalRetired = [];
  for (const b of plan.retire) {
    if (!NAME.test(path.basename(b.folder)) || path.dirname(b.folder) !== directory) throw new Error('Unsafe retention path');
    await checkDrive(); await assertLease(lease, database);
    const fresh = await verifyBundle(b.folder);
    if (digest(fresh) !== digest(b)) throw new Error('Backup changed during retention');
    const record = path.join(path.dirname(stateFile), `daily-retired-${path.basename(b.folder)}.json`);
    if (!await exists(record)) await writeNew(record, { folder: b.folder, manifest: b, files: await inventory(b.folder), retiredAt: now.toISOString() });
    await syncDirectory(path.dirname(record));
    const tomb = path.join(directory, '.retired-' + path.basename(b.folder));
    if (await exists(tomb)) throw new Error('Interrupted backup retirement needs review');
    await fs.rename(b.folder, tomb);
    await syncDirectory(directory);
    await fs.rm(tomb, { recursive: true });
    await syncDirectory(directory);
    externalRetired.push(b.folder);
  }
  return { localRetired, externalRetired };
}
module.exports = { NAME, listVerified, selectRetention, loadState, saveState, registerOperation, retain };
