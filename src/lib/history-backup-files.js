const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');
const { regular, exists } = require('./job-history-access');
const { safeDirectory, syncDirectory } = require('./batch-maintenance');
const { fileHash } = require('./job-history-bounded-storage');
const FORMAT = 'public-job-feed-daily-history-v1';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const relative = value => typeof value === 'string' && value !== '' && !path.isAbsolute(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..') && !value.includes('\\');
async function writeNew(file, value) {
  await regular(file, { missing: true });
  const h = await fs.open(file, 'wx', 0o600);
  try { await h.writeFile(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); await h.sync(); }
  finally { await h.close(); }
}
async function inventory(root) {
  await safeDirectory(root);
  const result = [];
  async function walk(dir) {
    for (const name of (await fs.readdir(dir)).sort()) {
      const file = path.join(dir, name), s = await fs.lstat(file);
      if (s.isSymbolicLink()) throw new Error('Symlink in backup input: ' + file);
      if (s.isDirectory()) await walk(file);
      else {
        await regular(file);
        result.push({ path: path.relative(root, file), bytes: s.size, sha256: await fileHash(file) });
      }
    }
  }
  await walk(root); return result;
}
async function compress(from, to) {
  await regular(from); await regular(to, { missing: true });
  await pipeline(createReadStream(from), createGzip(), createWriteStream(to, { flags: 'wx', mode: 0o600 }));
  const h = await fs.open(to, 'r'); try { await h.sync(); } finally { await h.close(); }
}
async function restore(folder, destination, manifest) {
  await safeDirectory(destination);
  for (const r of manifest.files) {
    if (!relative(r.path) || !relative(r.stored)) throw new Error('Unsafe restore path');
    const to = path.join(destination, r.path);
    await safeDirectory(path.dirname(to), true);
    await regular(path.join(folder, r.stored));
    await pipeline(createReadStream(path.join(folder, r.stored)), createGunzip(), createWriteStream(to, { flags: 'wx', mode: 0o600 }));
    if ((await fs.stat(to)).size !== r.bytes || await fileHash(to) !== r.sha256) throw new Error('Restored file mismatch: ' + r.path);
  }
}
async function verifyBundle(folder) {
  await safeDirectory(folder);
  for (const name of ['manifest.json', 'VERIFIED.json']) await regular(path.join(folder, name));
  const m = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  const proof = JSON.parse(await fs.readFile(path.join(folder, 'VERIFIED.json'), 'utf8'));
  if (m.format !== FORMAT || proof.format !== FORMAT || proof.status !== 'PASS' ||
      proof.manifestHash !== digest(m) || !Array.isArray(m.files) || !m.files.length ||
      !Number.isFinite(Date.parse(m.createdAt)) || !/^[a-f0-9]{64}$/.test(m.databaseHash) ||
      !/^[a-f0-9-]{36}$/.test(m.generation) || !/^[a-f0-9]{64}$/.test(m.fingerprint) ||
      proof.databaseHash !== m.databaseHash || proof.fullRestore !== true || proof.reportMatches !== true) throw new Error('Invalid verified backup');
  const logical = new Set(), stored = new Set();
  for (const r of m.files) {
    if (!relative(r.path) || !/^payload\/[0-9]{6}\.gz$/.test(r.stored) || logical.has(r.path) || stored.has(r.stored) ||
        !/^[a-f0-9]{64}$/.test(r.sha256) || !/^[a-f0-9]{64}$/.test(r.storedHash) || !Number.isSafeInteger(r.bytes) || r.bytes < 0) throw new Error('Invalid backup member');
    logical.add(r.path); stored.add(r.stored);
  }
  if (m.files.find(r => r.path === 'history/jobs-history.duckdb')?.sha256 !== m.databaseHash) throw new Error('Backup database identity mismatch');
  const actual = await inventory(folder);
  if (actual.length !== m.files.length + 2 || actual.some(r => !stored.has(r.path) && !['manifest.json', 'VERIFIED.json'].includes(r.path))) throw new Error('Unexpected backup files');
  const byName = new Map(actual.map(r => [r.path, r]));
  for (const r of m.files) if (byName.get(r.stored)?.sha256 !== r.storedHash) throw new Error('Backup checksum mismatch: ' + r.stored);
  return { ...m, folder, proof };
}
async function managedRoot(directory, create = false) {
  if (!await exists(directory)) {
    if (!create) return false;
    await safeDirectory(path.dirname(directory)); await fs.mkdir(directory);
    await writeNew(path.join(directory, 'OWNER.json'), { format: FORMAT });
    await syncDirectory(directory); await syncDirectory(path.dirname(directory));
  }
  await safeDirectory(directory); await regular(path.join(directory, 'OWNER.json'));
  if (JSON.parse(await fs.readFile(path.join(directory, 'OWNER.json'), 'utf8')).format !== FORMAT) throw new Error('Unknown backup directory owner');
  return true;
}
module.exports = { FORMAT, digest, relative, writeNew, inventory, compress, restore, verifyBundle, managedRoot };
