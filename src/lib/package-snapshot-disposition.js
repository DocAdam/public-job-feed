const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DIRECTORY = 'package-dispositions';
const ROLLBACK_DIRECTORY = 'package-disposition-rollbacks';
const FORMAT = 'public-job-feed-package-disposition/v1';
const ACTION = 'exclude_from_snapshot_consumers';
const CONSUMERS = Object.freeze(['history', 'trends']);
const PACKAGE_ID = /^\d{8}-\d{4}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_FILES = Object.freeze([
  '01_good_documentation_jobs.csv',
  '03_top_matches_full.csv',
  'PROJECT_STATUS_DASHBOARD.md',
  'gsheet-package-manifest.json',
]);

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const keys = value => Object.keys(value).sort();

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(keys(value)) !== JSON.stringify([...expected].sort())) {
    throw new Error(`Malformed package disposition ${label}`);
  }
}

async function regular(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Package disposition path is not a regular file: ${file}`);
  return stat;
}

async function directory(file) {
  const stat = await fs.lstat(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Package disposition path is not a regular directory: ${file}`);
}

async function optionalDirectory(file) {
  try { await directory(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function dashboardPackageRun(text) {
  return text.match(/^Package run: (.+)$/m)?.[1] || null;
}

async function evidence(packageRoot, packageId) {
  const folder = path.join(packageRoot, packageId);
  await directory(folder);
  const files = [];
  for (const name of EVIDENCE_FILES) {
    const file = path.join(folder, name);
    const stat = await regular(file);
    const data = await fs.readFile(file);
    files.push({ path: name, bytes: stat.size, sha256: hash(data) });
  }
  const dashboard = await fs.readFile(path.join(folder, 'PROJECT_STATUS_DASHBOARD.md'), 'utf8');
  return { dashboardPackageRun: dashboardPackageRun(dashboard), files };
}

function validateRecordShape(record, filePackageId) {
  exactKeys(record, ['format', 'action', 'consumers', 'packageId', 'reason', 'recordedAt', 'evidence'], filePackageId);
  if (record.format !== FORMAT) throw new Error(`Unknown package disposition format: ${filePackageId}`);
  if (record.action !== ACTION) throw new Error(`Unknown package disposition action: ${filePackageId}`);
  if (!Array.isArray(record.consumers) || JSON.stringify(record.consumers) !== JSON.stringify(CONSUMERS)) {
    throw new Error(`Malformed package disposition consumers: ${filePackageId}`);
  }
  if (record.packageId !== filePackageId || !PACKAGE_ID.test(record.packageId)) throw new Error(`Package disposition package ID mismatch: ${filePackageId}`);
  if (typeof record.reason !== 'string' || !record.reason.trim() || record.reason !== record.reason.trim()) throw new Error(`Malformed package disposition reason: ${filePackageId}`);
  if (typeof record.recordedAt !== 'string' || !Number.isFinite(Date.parse(record.recordedAt)) ||
      new Date(record.recordedAt).toISOString() !== record.recordedAt) throw new Error(`Malformed package disposition time: ${filePackageId}`);
  exactKeys(record.evidence, ['dashboardPackageRun', 'files'], `${filePackageId} evidence`);
  if (typeof record.evidence.dashboardPackageRun !== 'string' || !PACKAGE_ID.test(record.evidence.dashboardPackageRun)) {
    throw new Error(`Malformed package disposition dashboard identity: ${filePackageId}`);
  }
  if (!Array.isArray(record.evidence.files) || record.evidence.files.length !== EVIDENCE_FILES.length) {
    throw new Error(`Malformed package disposition evidence list: ${filePackageId}`);
  }
  record.evidence.files.forEach((item, index) => {
    exactKeys(item, ['path', 'bytes', 'sha256'], `${filePackageId} evidence file`);
    if (item.path !== EVIDENCE_FILES[index] || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !SHA256.test(item.sha256)) {
      throw new Error(`Malformed package disposition evidence file: ${filePackageId}`);
    }
  });
}

function summary(record) {
  return {
    packageId: record.packageId,
    action: record.action,
    consumers: record.consumers,
    reason: record.reason,
    recordedAt: record.recordedAt,
    dashboardPackageRun: record.evidence.dashboardPackageRun,
  };
}

async function resolveDispositions(packageRoot, packageIds, { at = async () => {} } = {}) {
  packageRoot = await fs.realpath(packageRoot);
  const active = path.join(packageRoot, DIRECTORY);
  const activePresent = await optionalDirectory(active);
  await at('active-directory-checked', { active, activePresent });
  if (!activePresent) return { ids: [...packageIds], skipped: [], records: new Map(), files: [] };
  const known = new Set(packageIds);
  const records = new Map(), files = [];
  const entries = (await fs.readdir(active, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  await at('active-entries-listed', { active, entries: entries.map(entry => entry.name) });
  for (const entry of entries) {
    const match = entry.name.match(/^(\d{8}-\d{4})\.json$/);
    if (!entry.isFile() || entry.isSymbolicLink() || !match) throw new Error(`Unknown package disposition entry: ${entry.name}`);
    const packageId = match[1], file = path.join(active, entry.name);
    await regular(file);
    let record, data;
    try { data = await fs.readFile(file); record = JSON.parse(data); }
    catch (error) { throw new Error(`Malformed package disposition JSON: ${entry.name}`, { cause: error }); }
    validateRecordShape(record, packageId);
    if (!known.has(packageId)) throw new Error(`Package disposition target does not exist: ${packageId}`);
    const actual = await evidence(packageRoot, packageId);
    if (JSON.stringify(actual) !== JSON.stringify(record.evidence)) throw new Error(`Package disposition evidence mismatch: ${packageId}`);
    records.set(packageId, record);
    files.push({ path: `${DIRECTORY}/${entry.name}`, bytes: data.length, sha256: hash(data) });
  }
  return {
    ids: packageIds.filter(id => !records.has(id)),
    skipped: [...records.values()].map(summary),
    records,
    files,
  };
}

async function buildRecord(packageRoot, packageId, reason, recordedAt = new Date().toISOString()) {
  if (!PACKAGE_ID.test(packageId)) throw new Error('Invalid package ID');
  const record = { format: FORMAT, action: ACTION, consumers: CONSUMERS, packageId, reason, recordedAt, evidence: await evidence(packageRoot, packageId) };
  validateRecordShape(record, packageId);
  return record;
}

async function syncDirectory(folder) {
  const handle = await fs.open(folder, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function activateDisposition({ packageRoot, database, packageId, reason, recordedAt, at = async () => {} }) {
  if (!PACKAGE_ID.test(packageId)) throw new Error('Invalid package ID');
  packageRoot = await fs.realpath(packageRoot);
  const { withLease } = require('./job-history-access');
  return withLease(database, async () => {
    if (await require('./job-history-access').exists(database)) {
      const imported = await require('./job-history-runtime').openRead(database, async connection =>
        (await connection.runAndReadAll(`SELECT snapshot_id FROM snapshots WHERE snapshot_id='${packageId}'`)).getRowObjectsJson());
      if (imported.length) throw new Error(`Package ${packageId} is already imported into history`);
    }
    const discovered = await require('./jobs-history').discover(packageRoot);
    await resolveDispositions(packageRoot, discovered.ids);
    if (!discovered.ids.includes(packageId)) throw new Error(`Package does not exist: ${packageId}`);
    const record = await buildRecord(packageRoot, packageId, reason, recordedAt);
    const folder = path.join(packageRoot, DIRECTORY), file = path.join(folder, `${packageId}.json`);
    await fs.mkdir(folder, { recursive: true });
    const handle = await fs.open(file, 'wx', 0o600);
    try { await at('active-file-opened', { file }); await handle.writeFile(JSON.stringify(record, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await syncDirectory(folder);
    const resolved = await resolveDispositions(packageRoot, discovered.ids);
    if (!resolved.records.has(packageId)) throw new Error('Package disposition activation did not verify');
    return { file, record };
  });
}

async function rollbackDisposition({ packageRoot, database, packageId, rolledBackAt = new Date().toISOString() }) {
  packageRoot = await fs.realpath(packageRoot);
  if (!PACKAGE_ID.test(packageId) || new Date(rolledBackAt).toISOString() !== rolledBackAt) throw new Error('Invalid rollback request');
  const { withLease } = require('./job-history-access');
  return withLease(database, async () => {
    const discovered = await require('./jobs-history').discover(packageRoot);
    const resolved = await resolveDispositions(packageRoot, discovered.ids);
    const record = resolved.records.get(packageId);
    if (!record) throw new Error(`No active package disposition: ${packageId}`);
    const source = path.join(packageRoot, DIRECTORY, `${packageId}.json`);
    const archiveDirectory = path.join(packageRoot, ROLLBACK_DIRECTORY);
    const archive = path.join(archiveDirectory, `${packageId}--${rolledBackAt.replace(/[:.]/g, '')}.json`);
    await fs.mkdir(archiveDirectory, { recursive: true });
    await fs.copyFile(source, archive, require('node:fs').constants.COPYFILE_EXCL);
    const handle = await fs.open(archive, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    if (hash(await fs.readFile(source)) !== hash(await fs.readFile(archive))) throw new Error('Package disposition rollback copy mismatch');
    await syncDirectory(archiveDirectory);
    await fs.unlink(source);
    await syncDirectory(path.dirname(source));
    return { archived: archive, record };
  });
}

module.exports = {
  DIRECTORY,
  ROLLBACK_DIRECTORY,
  FORMAT,
  ACTION,
  CONSUMERS,
  EVIDENCE_FILES,
  resolveDispositions,
  buildRecord,
  activateDisposition,
  rollbackDisposition,
};
