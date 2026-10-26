const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { fixture, job, exported } = require('./test-job-history-lifecycle');
const runtime = require('../lib/job-history-runtime');
const { withLease } = require('../lib/job-history-access');
const { fileHash } = require('../lib/job-history-bounded-storage');
const { syncDashboard } = require('../lib/package-status');
const { withMutablePackage } = require('../lib/package-history-guard');
const { manifestHeaders, manifestCsv } = require('../lib/package-manifest');
const { parseCsvRecords } = require('../lib/csv');
const { dailyHistory } = require('../lib/daily-history-backup');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'history-finalization-'));
  const project = path.join(temp, 'project');
  const source = path.join(project, 'data/jobs/gsheet-package');
  const database = path.join(project, 'data/jobs/history/jobs-history.duckdb');
  const reports = path.join(project, 'data/jobs/reports');
  const original = path.resolve(__dirname, '../..');
  try {
    await fs.mkdir(project);
    for (const folder of ['src', 'launchers']) await fs.cp(path.join(original, folder), path.join(project, folder), { recursive: true });
    for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(original, name), path.join(project, name));
    await fs.symlink(path.join(original, 'node_modules'), path.join(project, 'node_modules'));
    await fs.mkdir(reports, { recursive: true });
    await fs.writeFile(path.join(reports, 'refresh-run.json'), JSON.stringify({ RunId: 'fixture', Status: 'RUNNING' }));
    const status = (...args) => run(process.execPath, [path.join(project, 'src/scripts/build-status-dashboard.js'), ...args], { cwd: project });
    async function snapshot(id) {
      await fixture(source, id, [job], [exported]);
      const dir = path.join(source, id);
      await fs.writeFile(path.join(dir, 'PROJECT_STATUS_DASHBOARD.md'), 'Package run: 20251231-1200\nOld copied status\n');
      const rows = [];
      for (const name of ['01_good_documentation_jobs.csv', '03_top_matches_full.csv', 'PROJECT_STATUS_DASHBOARD.md']) {
        const row = { FileName: name, OutputPath: path.join(dir, name), Exists: true, SizeBytes: (await fs.stat(path.join(dir, name))).size };
        if (name.startsWith('03_')) row.RecommendedSheetTabName = 'Top matches';
        rows.push(row);
      }
      await fs.writeFile(path.join(dir, 'gsheet-package-manifest.json'), JSON.stringify(rows, null, 2) + '\n');
      await fs.writeFile(path.join(dir, 'gsheet-package-manifest.csv'), manifestCsv(rows));
      await fs.rm(path.join(source, 'latest'), { recursive: true, force: true });
      await fs.cp(dir, path.join(source, 'latest'), { recursive: true });
    }
    const id = '20260101-1200';
    await snapshot(id);
    await status('--sync-package');
    const archived = await fs.readFile(path.join(source, id, 'PROJECT_STATUS_DASHBOARD.md'), 'utf8');
    assert.match(archived, /Package run: 20260101-1200\n/);
    assert.match(archived, /History and backup run after this snapshot/);
    assert.doesNotMatch(archived, /Package run: 20251231/);
    const csv = parseCsvRecords(await fs.readFile(path.join(source, id, 'gsheet-package-manifest.csv'), 'utf8'));
    assert.deepEqual(csv.headers, manifestHeaders);
    assert.equal(csv.rows[1].RecommendedSheetTabName, 'Top matches');
    await runtime.runHistory('build', { root: source, database, format: 'v2' });

    const mount = path.join(temp, 'drive');
    await fs.mkdir(path.join(mount, 'Public Job Feed Archives'), { recursive: true });
    const options = { project, source, database, mount, stateFile: path.join(project, 'data/jobs/history/daily-backup-state.json'), runId: 'fixture' };
    const dependencies = { probeDrive: async () => ({ FreeSpace: 1024 ** 4 }) };
    const first = await dailyHistory(options, dependencies);
    assert.equal(first.History, 'PASS', first.Warnings.join('\n'));
    assert.equal(first.Backup, 'PASS', first.Warnings.join('\n'));
    const bundle = JSON.parse(await fs.readFile(path.join(first.LastVerified.folder, 'manifest.json'), 'utf8'));
    const member = bundle.files.find(row => row.path === 'snapshots/' + id + '/PROJECT_STATUS_DASHBOARD.md');
    assert.equal(zlib.gunzipSync(await fs.readFile(path.join(first.LastVerified.folder, member.stored))).toString(), archived);
    const sealed = (await runtime.manifest(source)).files;
    const manifestCsvHash = await fileHash(path.join(source, id, 'gsheet-package-manifest.csv'));
    await fs.writeFile(path.join(reports, 'daily-history-backup.json'), JSON.stringify(first));
    await status();
    assert.match(await fs.readFile(path.join(reports, 'project-status-dashboard.md'), 'utf8'), /Backup: PASS/);
    assert.deepEqual((await runtime.manifest(source)).files, sealed);
    assert.equal(await fs.readFile(path.join(source, id, 'PROJECT_STATUS_DASHBOARD.md'), 'utf8'), archived);
    await assert.rejects(status('--sync-package'), /already imported into history/);
    await assert.rejects(syncDashboard(source, archived), /already imported into history/);
    let entered = false;
    await assert.rejects(withMutablePackage(source, id, () => { entered = true; }), /already imported into history/);
    assert.equal(entered, false, 'Package rebuild must stop before its first write');
    assert.deepEqual((await runtime.manifest(source)).files, sealed);
    assert.equal(await fileHash(path.join(source, id, 'gsheet-package-manifest.csv')), manifestCsvHash);

    const next = '20260102-1200';
    await withLease(database, async () => {
      await assert.rejects(withMutablePackage(source, next, () => { entered = true; }), /EEXIST/);
    });
    await snapshot(next);
    const priorDatabaseHash = await fileHash(database);
    const notFinalized = await dailyHistory(options, dependencies);
    assert.equal(notFinalized.History, 'FAILED');
    assert.equal(notFinalized.Backup, 'NOT_RUN');
    assert.match(notFinalized.Warnings.join('\n'), /Package dashboard is not finalized/);
    assert.equal(await fileHash(database), priorDatabaseHash);
    const nextDashboard = path.join(source, next, 'PROJECT_STATUS_DASHBOARD.md');
    const oldDashboard = await fs.readFile(nextDashboard);
    await fs.unlink(nextDashboard);
    assert.match((await dailyHistory(options, dependencies)).Warnings.join('\n'), /dashboard is missing/);
    await fs.writeFile(nextDashboard, `Package run: ${next}\nSize has not been updated in the manifest.\n`);
    assert.match((await dailyHistory(options, dependencies)).Warnings.join('\n'), /Package dashboard is not finalized/);
    assert.equal(await fileHash(database), priorDatabaseHash);
    await fs.writeFile(nextDashboard, oldDashboard);
    await status('--sync-package');
    const second = await dailyHistory(options, dependencies);
    assert.equal(second.History, 'PASS', second.Warnings.join('\n'));
    assert.equal(second.Backup, 'PASS', second.Warnings.join('\n'));
    assert.equal(second.Imported, 1);
    const audited = (await runtime.inspect(database, source)).result;
    assert.equal(audited.snapshots, '2');
    assert.deepEqual(audited.pending_snapshots, []);
    assert.deepEqual(audited.errors, []);
    for (const [name, changed] of [
      ['03_top_matches_full.csv', bytes => Buffer.concat([bytes, Buffer.from('\n')])],
      ['gsheet-package-manifest.json', bytes => Buffer.from(bytes.toString().replace('Top matches', 'Changed metadata'))],
    ]) {
      const file = path.join(source, id, name), bytes = await fs.readFile(file), hash = await fileHash(database);
      await fs.writeFile(file, changed(bytes));
      await assert.rejects(runtime.inspect(database, source), /Source hash mismatch/);
      assert.equal(await fileHash(database), hash);
      await fs.writeFile(file, bytes);
    }
    console.log('PASS: current package finalized before import; complete CSV schema; restored backup has current dashboard; final live status leaves sources unchanged; manual sync/rebuild and competing writes refused; next-day import and backup pass; strict source checks retained.');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
