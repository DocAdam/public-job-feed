const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fixture, job, exported } = require('./test-job-history-lifecycle');
const runtime = require('../lib/job-history-runtime');
const { withLease } = require('../lib/job-history-access');
const { fileHash } = require('../lib/job-history-bounded-storage');
const migration = require('../lib/job-history-migration');
const B = require('../lib/daily-history-backup');
const F = require('../lib/history-backup-files');
const R = require('../lib/history-backup-retention');
const lock = require('../lib/feed-refresh-lock');
const project = path.resolve(__dirname, '../..');
const drive = async () => ({ FreeSpace: 1024 ** 4 });
async function tinyBundle(directory, text, createdAt, id = crypto.randomUUID()) {
  const folder = path.join(directory, `daily-${createdAt.replace(/[-:.]/g, '')}-${id}`);
  await fs.mkdir(folder); await fs.mkdir(path.join(folder, 'payload'));
  const source = path.join(path.dirname(directory), crypto.randomUUID()); await fs.writeFile(source, text);
  const hash = await fileHash(source), stored = 'payload/000000.gz';
  await F.compress(source, path.join(folder, stored)); await fs.unlink(source);
  const manifest = { format: F.FORMAT, generation: id, createdAt, databaseHash: hash, fingerprint: F.digest(text),
    files: [{ path: 'history/jobs-history.duckdb', bytes: Buffer.byteLength(text), sha256: hash, stored, storedHash: await fileHash(path.join(folder, stored)) }] };
  await F.writeNew(path.join(folder, 'manifest.json'), manifest);
  await F.writeNew(path.join(folder, 'VERIFIED.json'), { format: F.FORMAT, status: 'PASS', databaseHash: hash, manifestHash: F.digest(manifest), fullRestore: true, reportMatches: true });
  return F.verifyBundle(folder);
}
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-history-backup-test-'));
  const mark = name => console.log('PASS ' + name);
  try {
    const source = path.join(temp, 'snapshots'), database = path.join(temp, 'history/jobs-history.duckdb');
    await fixture(source, '20260101-1200', [job], [exported]);
    await runtime.runHistory('build', { root: source, database, format: 'v2' });
    const initialHash = await fileHash(database);
    const mount = path.join(temp, 'drive'); await fs.mkdir(path.join(mount, 'Public Job Feed Archives'), { recursive: true });
    const directory = path.join(mount, 'Public Job Feed Archives/daily-history-v1');
    const stateFile = path.join(temp, 'history/daily-backup-state.json');
    const options = { project, source, database, mount, stateFile, runId: 'fixture' };
    const absent = path.join(temp, 'absent-drive');
    const missing = await B.dailyHistory({ ...options, mount: absent }, { probeDrive: async () => null });
    assert.equal(missing.History, 'PASS'); assert.equal(missing.Backup, 'SKIPPED');
    assert.equal(await fs.access(absent).then(() => true, () => false), false);
    assert.equal(await fileHash(database), initialHash); mark('missing drive: history passes, no mount folder or backup is created');

    const info = { VolumeUUID: B.DRIVE_UUID, MountPoint: mount, Internal: false, Writable: true };
    B.validateDrive(info, mount, 1, 2);
    for (const patch of [{ VolumeUUID: 'wrong' }, { MountPoint: '/wrong' }, { Internal: true }, { Writable: false }])
      assert.throws(() => B.validateDrive({ ...info, ...patch }, mount, 1, 2));
    assert.throws(() => B.validateDrive(info, mount, 1, 1));
    const wrong = await B.dailyHistory(options, { probeDrive: async () => { throw new Error('Wrong volume'); } });
    assert.equal(wrong.History, 'PASS'); assert.equal(wrong.Backup, 'FAILED');
    assert.equal(await fs.access(directory).then(() => true, () => false), false); mark('wrong drive and same-device placeholder refuse backup');

    const first = await B.dailyHistory(options, { probeDrive: drive });
    assert.equal(first.History, 'PASS'); assert.equal(first.Backup, 'PASS', first.Warnings.join('\n'));
    const bundle = await F.verifyBundle(first.LastVerified.folder);
    const keepInventory = await F.inventory(bundle.folder);
    assert.equal(bundle.databaseHash, initialHash);
    const repeat = await B.dailyHistory(options, { probeDrive: drive });
    assert.equal(repeat.Backup, 'UNCHANGED'); assert.equal(repeat.LastVerified.folder, bundle.folder);
    assert.deepEqual(await F.inventory(bundle.folder), keepInventory); mark('real v2 backup: full restored audit, exact report, stable no-op reuse');
    const exec = require('node:util').promisify(require('node:child_process').execFile);
    await assert.rejects(exec(process.execPath, [path.join(project, 'src/scripts/restore-history-backup.js'), bundle.folder, path.join(bundle.folder, 'restore')]), /outside the backup/);
    assert.deepEqual(await F.inventory(bundle.folder), keepInventory);

    const skipped = await B.dailyHistory(options, { probeDrive: async () => null });
    assert.equal(skipped.LastVerified.folder, bundle.folder); assert.equal(skipped.Backup, 'SKIPPED');
    const failedHistory = await B.dailyHistory(options, { probeDrive: async () => null, update: async () => { throw new Error('Failed history'); } });
    assert.equal(failedHistory.History, 'FAILED'); assert.equal(failedHistory.Backup, 'NOT_RUN');
    await withLease(database, async () => assert.equal((await B.dailyHistory(options, { probeDrive: async () => null })).History, 'FAILED'));
    mark('failure status and active writer preserve the last verified backup');

    const audit = (await runtime.inspect(database, source)).result;
    const create = extra => withLease(database, lease => B.createBackup({ project, database, source, directory,
      audit, lease, checkDrive: drive, ...extra }));
    // New destination forces a fresh copy while preserving the existing verified bundle.
    const makeDir = async name => { const p = path.join(mount, name); return p; };
    await assert.rejects(create({ directory: await makeDir('low-space'), checkDrive: async () => ({ FreeSpace: 1 }) }), /Insufficient space/);
    let driveChecks = 0;
    await assert.rejects(create({ directory: await makeDir('disconnect'), checkDrive: async () => { if (++driveChecks > 2) throw new Error('Disconnected'); return drive(); } }), /Disconnected/);
    await assert.rejects(create({ directory: await makeDir('corrupt'), at: async (phase, folder) => {
      if (phase === 'copied') await fs.writeFile(path.join(folder, 'payload/000000.gz'), 'truncated');
    } }), /header|gzip|data|end|mismatch/i);
    const sourceFile = path.join(source, '20260101-1200', '01_good_documentation_jobs.csv'), original = await fs.readFile(sourceFile);
    try {
      await assert.rejects(create({ directory: await makeDir('changed-source'), at: async phase => {
        if (phase === 'copied') await fs.appendFile(sourceFile, '\n');
      } }), /changed/);
    } finally { await fs.writeFile(sourceFile, original); }
    assert.deepEqual(await F.inventory(bundle.folder), keepInventory);
    mark('low space, disconnect, corrupt copy and source change cannot replace a verified backup');

    const member = path.join(bundle.folder, bundle.files[0].stored), originalGzip = await fs.readFile(member);
    await fs.appendFile(member, 'damage'); await assert.rejects(F.verifyBundle(bundle.folder), /checksum/);
    await fs.writeFile(member, originalGzip);
    const alias = path.join(bundle.folder, 'unexpected'); await fs.symlink(database, alias);
    await assert.rejects(F.verifyBundle(bundle.folder), /Symlink/); await fs.unlink(alias);
    mark('stored checksum corruption and unexpected symlinks fail verification');

    // Keep current history recoverable while testing older daily-owned payload expiry.
    await fixture(source, '20260102-1200', [{ ...job, Title: 'Changed' }], [exported]);
    const withoutDrive = await B.dailyHistory(options, { probeDrive: async () => null });
    assert.equal(withoutDrive.History, 'PASS'); assert.equal(withoutDrive.Imported, 1);
    assert.equal(withoutDrive.Backup, 'SKIPPED');
    assert.equal(withoutDrive.LastVerified.folder, bundle.folder);
    const updated = { generation: JSON.parse(await fs.readFile(database + '.history-operation.json', 'utf8')).id };
    const state = await R.loadState(stateFile);
    await withLease(database, lease => R.registerOperation(database, updated.generation, state, stateFile, lease));
    const newBackup = await B.dailyHistory(options, { probeDrive: drive }); assert.equal(newBackup.Backup, 'PASS');
    const current = JSON.parse(await fs.readFile(database + '.history-operation.json', 'utf8'));
    const legacyFolder = path.join(database + '.operations', crypto.randomUUID()); await fs.mkdir(legacyFolder);
    await fs.writeFile(path.join(legacyFolder, 'before.duckdb'), 'legacy keep');
    const owned = await R.loadState(stateFile);
    async function oldOperation(oldText, newText, date) {
      const old = await tinyBundle(directory, oldText, date), next = await tinyBundle(directory, newText, date);
      const id = crypto.randomUUID(), folder = path.join(database + '.operations', id); await fs.mkdir(folder);
      await fs.writeFile(path.join(folder, 'before.duckdb'), oldText);
      const j = { id, state: 'accepted', database, oldHash: old.databaseHash, newHash: next.databaseHash };
      await F.writeNew(path.join(folder, 'manifest.json'), j);
      const r = { ...j, manifestHash: await fileHash(path.join(folder, 'manifest.json')), createdAt: date, state: 'owned' };
      owned.operations.push(r); return { r, folder, payload: path.join(folder, 'before.duckdb') };
    }
    const older = await oldOperation('older-before', 'older-after', '2025-12-01T00:00:00.000Z');
    await oldOperation('recent-before', 'recent-after', '2026-01-01T00:00:00.000Z');
    await R.saveState(stateFile, owned);
    const retain = at => withLease(database, lease => R.retain({ database, lease, directory, state: owned, stateFile, checkDrive: drive, at }));
    await fs.writeFile(older.payload, 'unexpected');
    await assert.rejects(retain(), /payload differs/);
    await fs.writeFile(older.payload, 'older-before');
    await fs.rename(older.payload, older.payload + '.saved'); await fs.symlink(older.payload + '.saved', older.payload);
    await assert.rejects(retain(), /symlink/); await fs.unlink(older.payload); await fs.rename(older.payload + '.saved', older.payload);
    await assert.rejects(retain(async phase => { if (phase === 'local-unlinked') throw new Error('Crash after unlink'); }), /Crash/);
    assert.equal(older.r.state, 'prepared');
    const restarted = await R.loadState(stateFile);
    await withLease(database, lease => R.retain({ database, lease, directory, state: restarted, stateFile, checkDrive: drive }));
    assert.equal(restarted.operations.find(r => r.id === older.r.id).state, 'retired');
    assert.equal(await fs.readFile(path.join(legacyFolder, 'before.duckdb'), 'utf8'), 'legacy keep');
    assert.ok(await fs.stat(path.join(older.folder, 'manifest.json')));
    assert.ok(await fs.stat(path.join(database + '.operations', current.id, 'before.duckdb')));
    assert.equal((await migration.recoverHistory(database)).state, 'accepted');
    mark('local expiry keeps legacy/current backups and records; interrupted retirement resumes; current recovery passes');

    const retentionRoot = path.join(temp, 'retention'); await F.managedRoot(retentionRoot, true);
    const samples = [];
    for (let day = 1; day <= 18; day++) samples.push(await tinyBundle(retentionRoot, 'day-' + day, `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`));
    samples.push(await tinyBundle(retentionRoot, 'september', '2026-09-30T00:00:00.000Z'));
    samples.push(await tinyBundle(retentionRoot, 'august', '2026-08-31T00:00:00.000Z'));
    const plan = R.selectRetention(samples, new Set([samples[0].databaseHash]), new Date('2026-10-21T00:00:00Z'));
    assert.equal(plan.keep.length, 17); assert.equal(plan.retire.length, 3);
    assert.ok(plan.keep.some(b => b.folder === samples[0].folder));
    assert.deepEqual(R.selectRetention([...samples].reverse(), new Set([samples[0].databaseHash]), new Date('2026-10-21T00:00:00Z')), plan);
    // Bind a synthetic accepted current generation to the latest fixture proof.
    const fakeDb = path.join(temp, 'retention-history/db'); await fs.mkdir(path.dirname(fakeDb)); await fs.writeFile(fakeDb, 'day-18');
    await F.writeNew(fakeDb + '.history-operation.json', { state: 'accepted', id: crypto.randomUUID(), newHash: samples[17].databaseHash, oldHash: samples[0].databaseHash });
    await fs.mkdir(path.join(retentionRoot, 'legacy-keep')); await fs.writeFile(path.join(retentionRoot, 'legacy-keep/evidence'), 'keep');
    await fs.mkdir(path.join(retentionRoot, '.pending-keep')); await fs.writeFile(path.join(retentionRoot, '.pending-keep/evidence'), 'keep');
    const bad = path.join(samples[2].folder, 'payload/000000.gz'), good = await fs.readFile(bad); await fs.appendFile(bad, 'bad');
    const retainExternal = () => withLease(fakeDb, lease => R.retain({ database: fakeDb, lease, directory: retentionRoot,
      state: { version: 1, operations: [] }, stateFile: path.join(temp, 'retention-state.json'), checkDrive: drive, now: new Date('2026-10-21T00:00:00Z') }));
    await assert.rejects(retainExternal(), /checksum/); assert.equal((await fs.readdir(retentionRoot)).filter(n => R.NAME.test(n)).length, 20);
    await fs.writeFile(bad, good);
    await fs.writeFile(fakeDb, 'unexpected change');
    await assert.rejects(retainExternal(), /accepted generation/);
    assert.equal((await R.listVerified(retentionRoot)).length, 20);
    await fs.writeFile(fakeDb, 'day-18');
    const retired = await retainExternal(); assert.equal(retired.externalRetired.length, 3);
    assert.equal((await R.listVerified(retentionRoot)).length, 17);
    assert.equal(await fs.readFile(path.join(retentionRoot, 'legacy-keep/evidence'), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(retentionRoot, '.pending-keep/evidence'), 'utf8'), 'keep');
    mark('external retention preserves 14 latest, monthly and pinned backups; corruption blocks deletion; unknown/partial folders stay');

    const token = await lock.acquire(temp);
    await assert.rejects(lock.acquire(temp), /lock exists/);
    await assert.rejects(lock.release(temp, 'wrong'), /owner changed/);
    await lock.release(temp, token);
    const { buildDashboard, buildMarkdown } = require('./build-status-dashboard');
    const view = buildDashboard({ refreshRun: { RunId: 'fixture' }, historyBackup: missing });
    assert.equal(view.HistoryBackup.Backup, 'SKIPPED'); assert.match(buildMarkdown(view), /Backup: SKIPPED/);
    assert.equal(buildDashboard({ refreshRun: { RunId: 'other' }, historyBackup: first }).HistoryBackup, null);
    mark('whole-refresh exclusion and run-bound dashboard status');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
  console.log('Daily history backup tests passed. Only isolated fixtures were changed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
