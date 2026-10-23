const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const runtime = require('./job-history-runtime');
const { withLease, noWal, regular, exists, assertLease } = require('./job-history-access');
const { fileHash } = require('./job-history-bounded-storage');
const { companions, closed } = require('./job-history-migration');
const { safeDirectory, syncDirectory } = require('./batch-maintenance');
const files = require('./history-backup-files');
const retention = require('./history-backup-retention');
const DRIVE = '/Volumes/1Pugh';
const DRIVE_UUID = 'A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1';
function validateDrive(info, mount, localDevice, driveDevice) {
  if (info.VolumeUUID !== DRIVE_UUID || info.MountPoint !== mount || info.Internal !== false ||
      !info.Writable || localDevice === driveDevice) throw new Error('1Pugh identity or writable external-device check failed');
}
async function probeDrive(project, mount = DRIVE) {
  if (!await exists(mount)) return null;
  await safeDirectory(mount);
  const xml = execFileSync('/usr/sbin/diskutil', ['info', '-plist', mount], { maxBuffer: 1024 * 1024 });
  const info = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: xml, encoding: 'utf8' }));
  validateDrive(info, mount, (await fs.stat(project)).dev, (await fs.stat(mount)).dev);
  return info;
}
async function inputs(project, database, source) {
  const selected = [], sourceManifest = await runtime.manifest(source);
  for (const id of sourceManifest.ids) for (const r of await files.inventory(path.join(source, id))) {
    selected.push({ ...r, path: 'snapshots/' + id + '/' + r.path, from: path.join(source, id, r.path) });
  }
  for (const name of ['src', 'launchers']) for (const r of await files.inventory(path.join(project, name))) {
    selected.push({ ...r, path: 'runtime/' + name + '/' + r.path, from: path.join(project, name, r.path) });
  }
  const single = { 'history/jobs-history.duckdb': database,
    'metadata/accepted-operation.json': database + '.history-operation.json',
    ...Object.fromEntries(Object.entries(companions(database)).map(([k, v]) => ['metadata/' + k, v])),
    'runtime/package.json': path.join(project, 'package.json'), 'runtime/package-lock.json': path.join(project, 'package-lock.json') };
  for (const [name, from] of Object.entries(single)) {
    await regular(from); selected.push({ path: name, from, bytes: (await fs.stat(from)).size, sha256: await fileHash(from) });
  }
  selected.sort((a, b) => a.path.localeCompare(b.path));
  return { sourceManifest, selected, fingerprint: files.digest(selected.map(({ from, ...r }) => r)) };
}
async function restoreAudit(directory, manifest, project) {
  const db = path.join(directory, 'history/jobs-history.duckdb'), source = path.join(directory, 'snapshots');
  const restoredRuntime = path.join(directory, 'runtime');
  const env = { ...process.env, NODE_PATH: path.join(project, 'node_modules') };
  const { stdout } = await run(process.execPath, ['--max-old-space-size=128', '--expose-gc',
    path.join(restoredRuntime, 'src/scripts/job-history-runtime-worker.js'), 'inspect', db, source], { env, maxBuffer: 8 * 1024 ** 2 });
  const audit = JSON.parse(stdout).result;
  if (audit.errors.length || audit.pending_snapshots.length) throw new Error('Restored history audit failed');
  // Use restored code and a fixed report timestamp. Retain its result with the proof.
  const script = `const fs=require('node:fs/promises'); const p=require('node:path');
    const r=process.argv[1],db=process.argv[2];
    const j=JSON.parse(require('node:fs').readFileSync(p.join(r,'metadata/accepted-operation.json'),'utf8'));
    require(p.join(r,'runtime/src/lib/jobs-history-report')).historyReport(db,j.created_at).then(async v=>{
      const text=v.markdown+'\\n<!-- history-generation: '+j.id+'; database-sha256: '+j.newHash+' -->\\n';
      if(text!==await fs.readFile(p.join(r,'metadata/report'),'utf8'))throw new Error('Restored report differs');
      console.log('PASS');
    }).catch(e=>{console.error(e);process.exitCode=1;});`;
  await run(process.execPath, ['--max-old-space-size=128', '-e', script, directory, db], { env, maxBuffer: 1024 ** 2 });
  if (await fileHash(db) !== manifest.databaseHash) throw new Error('Restore audit changed database');
  return audit;
}
async function createBackup({ project, database, source, directory, checkDrive, audit, lease, now = new Date(),
  restoreCheck = restoreAudit, at = async () => {} }) {
  await assertLease(lease, database); await closed(database); await noWal(database);
  const snapshot = await inputs(project, database, source);
  const j = JSON.parse(await fs.readFile(database + '.history-operation.json', 'utf8'));
  if (j.state !== 'accepted' || j.newHash !== await fileHash(database)) throw new Error('History is not an accepted generation');
  await checkDrive();
  const old = await retention.listVerified(directory);
  const matching = old.find(b => b.fingerprint === snapshot.fingerprint);
  if (matching) {
    if ((await inputs(project, database, source)).fingerprint !== snapshot.fingerprint) throw new Error('Source inventory changed during backup verification');
    await checkDrive();
    return { status: 'UNCHANGED', folder: matching.folder, verifiedAt: matching.proof.verifiedAt,
      databaseHash: j.newHash, snapshot: audit.latest.snapshot_id };
  }
  const total = snapshot.selected.reduce((n, r) => n + r.bytes, 0);
  const drive = await checkDrive();
  const local = await fs.statfs(os.tmpdir());
  if (drive.FreeSpace < total + 1024 ** 3 || local.bavail * local.bsize < total + 32 * 1024 ** 3) throw new Error('Insufficient space for backup and full restore test');
  await files.managedRoot(directory, true);
  const name = `daily-${now.toISOString().replace(/[-:.]/g, '')}-${crypto.randomUUID()}`;
  const pending = path.join(directory, '.pending-' + name), final = path.join(directory, name);
  await fs.mkdir(pending); await fs.mkdir(path.join(pending, 'payload'));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'feed-history-restore-'));
  try {
    const members = [];
    for (const [index, r] of snapshot.selected.entries()) {
      const stored = 'payload/' + String(index).padStart(6, '0') + '.gz';
      await files.compress(r.from, path.join(pending, stored));
      if (await fileHash(r.from) !== r.sha256) throw new Error('Backup source changed');
      members.push({ path: r.path, bytes: r.bytes, sha256: r.sha256, stored, storedHash: await fileHash(path.join(pending, stored)) });
    }
    const manifest = { format: files.FORMAT, createdAt: now.toISOString(), generation: j.id,
      databaseHash: j.newHash, fingerprint: snapshot.fingerprint, latestSnapshot: audit.latest.snapshot_id, files: members };
    await files.writeNew(path.join(pending, 'manifest.json'), manifest);
    await at('copied', pending);
    await files.restore(pending, temporary, manifest);
    const restored = await restoreCheck(temporary, manifest, project);
    if (JSON.stringify(restored) !== JSON.stringify(audit)) throw new Error('Restored audit differs from the live audit');
    if ((await inputs(project, database, source)).fingerprint !== snapshot.fingerprint) throw new Error('Source inventory changed during backup');
    await checkDrive(); await at('verified', pending);
    await files.writeNew(path.join(pending, 'VERIFIED.json'), { format: files.FORMAT, status: 'PASS',
      manifestHash: files.digest(manifest), databaseHash: j.newHash, fullRestore: true,
      verifiedAt: new Date().toISOString(), audit: restored, reportMatches: true });
    await files.verifyBundle(pending);
    await syncDirectory(path.join(pending, 'payload')); await syncDirectory(pending);
    await checkDrive(); await fs.rename(pending, final); await syncDirectory(directory);
    return { status: 'PASS', folder: final, verifiedAt: new Date().toISOString(), databaseHash: j.newHash, snapshot: audit.latest.snapshot_id };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
async function dailyHistory(options, dependencies = {}) {
  const { project, database, source, stateFile, runId } = options;
  const mount = options.mount || DRIVE;
  const directory = path.join(mount, 'Public Job Feed Archives', 'daily-history-v1');
  const probe = dependencies.probeDrive || (() => probeDrive(project, mount));
  const checkDrive = async () => { const drive = await probe(); if (!drive) throw new Error('1Pugh disconnected'); return drive; };
  const update = dependencies.update || (() => runtime.runHistory('update', { database, root: source }));
  const inspect = dependencies.inspect || (() => runtime.inspect(database, source));
  const backup = dependencies.createBackup || createBackup;
  const status = { RunId: runId, GeneratedAt: new Date().toISOString(), History: 'NOT_RUN', Backup: 'NOT_RUN', LastVerified: null, Warnings: [] };
  let state;
  try {
    state = await retention.loadState(stateFile); status.LastVerified = state.lastVerified;
    // Reclaim only managed, proven obsolete payloads before the writer's disk guard.
    try {
      const available = await probe();
      if (available) await withLease(database, lease => retention.retain({ database, lease, directory, state, stateFile, checkDrive }));
    } catch (error) { status.Warnings.push('Pre-update retention stopped: ' + error.message); }
    const changed = await update();
    await withLease(database, async lease => {
      if (changed.imported > 0) await retention.registerOperation(database, changed.generation, state, stateFile, lease);
      const checked = await inspect();
      if (checked.result.errors.length || checked.result.pending_snapshots.length) throw new Error('History audit did not pass');
      status.History = 'PASS'; status.Imported = changed.imported; status.LatestSnapshot = checked.result.latest.snapshot_id;
      const drive = await probe();
      if (!drive) { status.Backup = 'SKIPPED'; status.Warnings.push('1Pugh is not connected. No backup or retention ran.'); return; }
      const result = await backup({ project, database, source, directory, checkDrive, audit: checked.result, lease });
      status.Backup = result.status; status.LastVerified = state.lastVerified = result;
      await retention.saveState(stateFile, state);
      try { status.Retention = await retention.retain({ database, lease, directory, state, stateFile, checkDrive }); }
      catch (error) { status.Warnings.push('Retention stopped: ' + error.message); }
    });
  } catch (error) {
    if (status.History !== 'PASS') status.History = 'FAILED';
    else status.Backup = 'FAILED';
    status.Warnings.push(error.message);
  }
  status.GeneratedAt = new Date().toISOString();
  return status;
}
module.exports = { DRIVE, DRIVE_UUID, validateDrive, probeDrive, inputs, restoreAudit, createBackup, dailyHistory };
