const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile, fork } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { fixture, job, exported } = require('./test-job-history-lifecycle');
const { parseCsvRecords } = require('../lib/csv');
const runtime = require('../lib/job-history-runtime');
const { query } = require('../lib/jobs-history');
const { withLease } = require('../lib/job-history-access');
const { fileHash } = require('../lib/job-history-bounded-storage');
const { checkPendingDashboards } = require('../lib/package-history-guard');
const { dailyHistory } = require('../lib/daily-history-backup');
const { loadSnapshots } = require('./report-job-trends');
const {
  DIRECTORY,
  ROLLBACK_DIRECTORY,
  buildRecord,
  activateDisposition,
  rollbackDisposition,
} = require('../lib/package-snapshot-disposition');

async function captureWorker(source, database, expectedPhase) {
  let used = false;
  const result = await loadSnapshots(source, { database, at: async phase => {
    if (phase !== expectedPhase || used) return;
    used = true;
    await pauseWorker(phase);
  } });
  process.send({
    type: 'result',
    ids: result.snapshots.map(item => item.id),
    skipped: result.skippedPackages.map(item => item.packageId),
  });
}

async function activateWorker(source, database, packageId, reason, recordedAt) {
  const result = await activateDisposition({ packageRoot: source, database, packageId, reason, recordedAt,
    at: phase => pauseWorker(phase) });
  process.send({ type: 'result', file: result.file, record: result.record });
}

function pauseWorker(phase) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.off('message', message);
      process.off('disconnect', disconnected);
    };
    const message = value => {
      if (value?.type !== 'continue') return;
      cleanup();
      resolve();
    };
    const disconnected = () => {
      cleanup();
      reject(new Error('Overlap test parent disconnected'));
    };
    process.on('message', message);
    process.on('disconnect', disconnected);
    process.send({ type: 'boundary', phase });
  });
}

function startWorker(args) {
  const child = fork(__filename, args, {
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let reached, finish, fail;
  const reachedPromise = new Promise(resolve => { reached = resolve; });
  const result = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  child.on('message', value => {
    if (value?.type === 'boundary') reached(value);
    if (value?.type === 'result') finish(value);
  });
  child.on('error', fail);
  child.on('exit', code => { if (code !== 0) fail(new Error(`Overlap capture worker exited ${code}`)); });
  return {
    reached: reachedPromise,
    release: () => child.send({ type: 'continue' }),
    result,
  };
}

const startCapture = (source, database, phase) => startWorker(['--capture-overlap', source, database, phase]);
const startActivation = (source, database, packageId, reason, recordedAt) =>
  startWorker(['--activate-overlap', source, database, packageId, reason, recordedAt]);

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'package-disposition-'));
  const original = path.resolve(__dirname, '../..');
  const project = path.join(temp, 'project');
  const source = path.join(project, 'data/jobs/gsheet-package');
  const trends = path.join(project, 'data/jobs/trends/latest');
  const database = path.join(project, 'data/jobs/history/jobs-history.duckdb');
  const seed = '20261118-0846', supplemental = '20261118-0959', current = '20261119-0619';
  const baselineIds = ['20261112-0708', '20261113-0604', '20261114-0622', '20261115-1121', '20261116-0651', '20261117-0728', seed];
  const allWeeklyIds = [...baselineIds, supplemental, current];
  const eligibleWeeklyIds = [...baselineIds, current];
  const wrongDashboard = `Package run: ${seed}\nSupplemental candidate.\n`;
  const candidateOnly = { ...job, CanonicalURLKey: 'https://fixture/supplemental-only', URL: 'https://fixture/supplemental-only', JobKey: 'supplemental-only', Company: 'Supplemental Only', Title: 'Supplemental Greenhouse Repair Role' };
  const candidateOnlyExport = { ...exported, 'Apply Link': candidateOnly.URL, Company: candidateOnly.Company, Title: candidateOnly.Title };
  const currentOnly = { ...job, CanonicalURLKey: 'https://fixture/current-only', URL: 'https://fixture/current-only', JobKey: 'current-only', Company: 'Current Only', Title: 'Current Documentation Role' };
  const currentOnlyExport = { ...exported, 'Apply Link': currentOnly.URL, Company: currentOnly.Company, Title: currentOnly.Title };

  async function packageFixture(id, dashboard, top = [job], good = [exported]) {
    await fixture(source, id, top, good);
    const folder = path.join(source, id);
    await fs.writeFile(path.join(folder, 'PROJECT_STATUS_DASHBOARD.md'), dashboard);
    const rows = [];
    for (const name of ['01_good_documentation_jobs.csv', '03_top_matches_full.csv', 'PROJECT_STATUS_DASHBOARD.md']) {
      rows.push({ FileName: name, OutputPath: path.join(folder, name), Exists: true, SizeBytes: (await fs.stat(path.join(folder, name))).size });
    }
    await fs.writeFile(path.join(folder, 'gsheet-package-manifest.json'), JSON.stringify(rows, null, 2) + '\n');
  }

  async function csvHashes() {
    const result = {};
    for (const id of [supplemental, current]) for (const name of ['01_good_documentation_jobs.csv', '03_top_matches_full.csv']) {
      result[`${id}/${name}`] = await fileHash(path.join(source, id, name));
    }
    return result;
  }

  async function runProjectScript(name) {
    return run(process.execPath, [path.join(project, 'src/scripts', name)], {
      cwd: project,
      env: { ...process.env, NODE_PATH: path.join(project, 'node_modules') },
      maxBuffer: 8 * 1024 ** 2,
    });
  }

  const runTrends = () => runProjectScript('report-job-trends.js');

  async function trendResult() {
    const manifest = JSON.parse(await fs.readFile(path.join(trends, 'trend-manifest.json'), 'utf8'));
    const weekly = parseCsvRecords(await fs.readFile(path.join(trends, 'weekly-new-jobs.csv'), 'utf8')).rows;
    const report = await fs.readFile(path.join(trends, 'weekly-substack-report.md'), 'utf8');
    return { manifest, weekly, report };
  }

  try {
    await fs.mkdir(project);
    for (const folder of ['src', 'launchers']) await fs.cp(path.join(original, folder), path.join(project, folder), { recursive: true });
    await fs.mkdir(path.join(project, 'data/config'), { recursive: true });
    await fs.writeFile(path.join(project, 'data/config/public-sheet.json'), JSON.stringify({
      publicSheetUrl: 'https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing',
      publicSheetLabel: 'good documentation jobs',
      updateCadence: 'Updated at least 2 times per week',
    }));
    await fs.writeFile(path.join(project, 'data/config/company-normalization.json'), '{}');
    for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(original, name), path.join(project, name));
    const dependencyRoot = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)[0] || path.join(original, 'node_modules');
    await fs.symlink(dependencyRoot, path.join(project, 'node_modules'));

    for (const id of baselineIds) await packageFixture(id, `Package run: ${id}\nFinalized package.\n`);
    await runtime.runHistory('build', { root: source, database, format: 'v2' });
    await packageFixture(supplemental, wrongDashboard, [job, candidateOnly], [exported, candidateOnlyExport]);
    await packageFixture(current, `Package run: ${current}\nFinalized package.\n`, [job, currentOnly], [exported, currentOnlyExport]);
    const beforeHashes = await csvHashes();
    const databaseBefore = await fileHash(database);

    const callerLeaseDiscovery = await withLease(database, lease => loadSnapshots(source, { database, lease }));
    assert.deepEqual(callerLeaseDiscovery.snapshots.map(item => item.id), allWeeklyIds,
      'A caller-held lease must be reused instead of acquired twice');

    const activationBoundary = startCapture(source, database, 'active-directory-checked');
    await activationBoundary.reached;
    try {
      await assert.rejects(activateDisposition({ packageRoot: source, database, packageId: supplemental,
        reason: 'Must wait for the trends snapshot capture.' }), /EEXIST/);
    } finally {
      activationBoundary.release();
    }
    assert.deepEqual((await activationBoundary.result).ids, allWeeklyIds,
      'Activation overlap must leave trends with the complete old disposition state');

    await assert.rejects(checkPendingDashboards(source, database), new RegExp(`Package dashboard is not finalized: ${supplemental}`));
    assert.equal(await fileHash(database), databaseBefore, 'The blocked history sweep must not change history');
    await runTrends();
    const withoutDisposition = await trendResult();
    assert.equal(withoutDisposition.manifest.CurrentSnapshot, current);
    assert.equal(withoutDisposition.manifest.PreviousSnapshot, supplemental);
    assert.deepEqual(withoutDisposition.manifest.TrendSnapshotsIncluded, allWeeklyIds);
    assert.ok(withoutDisposition.weekly.some(row => row['Apply Link'] === candidateOnly.URL), 'The unfiltered Top 5 input must show the supplemental-only fixture');
    await assert.rejects(activateDisposition({ packageRoot: source, database, packageId: seed, reason: 'Must fail.' }), /already imported/);

    const activeDirectory = path.join(source, DIRECTORY);
    await fs.mkdir(activeDirectory);
    const malformed = await buildRecord(source, supplemental, 'Supplemental Greenhouse repair candidate.', '2026-11-19T12:00:00.000Z');
    malformed.action = 'HOLD';
    await fs.writeFile(path.join(activeDirectory, `${supplemental}.json`), JSON.stringify(malformed));
    await assert.rejects(checkPendingDashboards(source, database), /Unknown package disposition action/);
    await assert.rejects(runTrends(), /Unknown package disposition action/);
    await fs.unlink(path.join(activeDirectory, `${supplemental}.json`));

    const conflicting = await buildRecord(source, supplemental, 'Supplemental Greenhouse repair candidate.', '2026-11-19T12:00:00.000Z');
    conflicting.consumers = ['history'];
    await fs.writeFile(path.join(activeDirectory, `${supplemental}.json`), JSON.stringify(conflicting));
    await assert.rejects(checkPendingDashboards(source, database), /Malformed package disposition consumers/);
    await assert.rejects(runTrends(), /Malformed package disposition consumers/);
    await fs.unlink(path.join(activeDirectory, `${supplemental}.json`));

    await fs.writeFile(path.join(activeDirectory, 'all-packages.json'), '{}');
    await assert.rejects(checkPendingDashboards(source, database), /Unknown package disposition entry/);
    await assert.rejects(runTrends(), /Unknown package disposition entry/);
    await fs.unlink(path.join(activeDirectory, 'all-packages.json'));

    const reason = 'Supplemental Greenhouse repair candidate held from public release; its copied dashboard identifies 20261118-0846, so it is not a distinct daily snapshot.';
    const activationWriter = startActivation(source, database, supplemental, reason, '2026-11-19T12:01:00.000Z');
    assert.equal((await activationWriter.reached).phase, 'active-file-opened');
    try {
      await assert.rejects(loadSnapshots(source, { database }), /EEXIST/);
    } finally {
      activationWriter.release();
    }
    const activated = await activationWriter.result;
    assert.equal(path.dirname(activated.file), await fs.realpath(activeDirectory));
    assert.equal(activated.record.packageId, supplemental);
    assert.deepEqual(activated.record.consumers, ['history', 'trends']);
    assert.equal(activated.record.reason, reason);
    assert.equal(activated.record.evidence.dashboardPackageRun, seed);
    assert.deepEqual((await loadSnapshots(source, { database })).snapshots.map(item => item.id), eligibleWeeklyIds,
      'The first trends capture after activation must use the complete new disposition state');

    const supplementalCsv = path.join(source, supplemental, '01_good_documentation_jobs.csv');
    const originalCsv = await fs.readFile(supplementalCsv);
    await fs.appendFile(supplementalCsv, '\n');
    await assert.rejects(checkPendingDashboards(source, database), new RegExp(`Package disposition evidence mismatch: ${supplemental}`));
    await assert.rejects(runTrends(), new RegExp(`Package disposition evidence mismatch: ${supplemental}`));
    await fs.writeFile(supplementalCsv, originalCsv);

    const rollbackBoundary = startCapture(source, database, 'active-entries-listed');
    await rollbackBoundary.reached;
    try {
      await assert.rejects(rollbackDisposition({ packageRoot: source, database, packageId: supplemental }), /EEXIST/);
    } finally {
      rollbackBoundary.release();
    }
    const capturedWithDisposition = await rollbackBoundary.result;
    assert.deepEqual(capturedWithDisposition.ids, eligibleWeeklyIds,
      'Rollback overlap must leave trends with the complete active disposition state');
    assert.deepEqual(capturedWithDisposition.skipped, [supplemental]);

    const unrelated = '20261120-1200';
    await packageFixture(unrelated, wrongDashboard, [job], [exported]);
    await assert.rejects(checkPendingDashboards(source, database), new RegExp(`Package dashboard is not finalized: ${unrelated}`));
    await runTrends();
    assert.equal((await trendResult()).manifest.CurrentSnapshot, unrelated, 'The exact disposition must not hide an unrelated trends package');
    await fs.rm(path.join(source, unrelated), { recursive: true });

    const guarded = await checkPendingDashboards(source, database);
    assert.deepEqual(guarded.skipped.map(item => item.packageId), [supplemental]);
    await runTrends();
    const withDisposition = await trendResult();
    assert.equal(withDisposition.manifest.CurrentSnapshot, current);
    assert.equal(withDisposition.manifest.PreviousSnapshot, seed);
    assert.deepEqual(withDisposition.manifest.SnapshotIds, eligibleWeeklyIds);
    assert.deepEqual(withDisposition.manifest.TrendSnapshotsIncluded, eligibleWeeklyIds);
    assert.deepEqual(withDisposition.manifest.SkippedPackageDispositions.map(item => item.packageId), [supplemental]);
    assert.equal(withDisposition.manifest.SkippedPackageDispositions[0].reason, reason);
    assert.ok(!withDisposition.weekly.some(row => row['Apply Link'] === candidateOnly.URL), 'The Top 5 input must exclude the supplemental-only fixture');
    assert.ok(withDisposition.weekly.some(row => row['Apply Link'] === currentOnly.URL), 'The Top 5 input must retain the current package fixture');
    assert.match(withDisposition.report, new RegExp(`${supplemental} skipped for history and trends`));
    assert.match(withDisposition.report, /Supplemental Greenhouse repair candidate held from public release/);
    assert.match(withDisposition.report, /newest snapshot \(2026-11-19 06:19 UTC\).*previous snapshot \(2026-11-18 08:46 UTC\)/);
    assert.match(withDisposition.report, new RegExp(`Jobs first seen in this week: ${withDisposition.weekly.length}(?:\\n|$)`));
    await runProjectScript('test-trends.js');
    const trendTest = JSON.parse(await fs.readFile(path.join(project, 'data/jobs/reports/test-trends-results.json'), 'utf8'));
    assert.deepEqual(trendTest.Failures, []);

    const inventory = await runtime.manifest(source);
    assert.deepEqual(inventory.allIds, allWeeklyIds);
    assert.deepEqual(inventory.ids, eligibleWeeklyIds);
    assert.deepEqual(inventory.skipped.map(item => item.packageId), [supplemental]);

    const mount = path.join(temp, '1Pugh');
    await fs.mkdir(path.join(mount, 'Public Job Feed Archives'), { recursive: true });
    const options = { project, source, database, mount, stateFile: path.join(temp, 'daily-backup-state.json'), runId: 'disposition-fixture' };
    const dependencies = { probeDrive: async () => ({ FreeSpace: 1024 ** 4 }) };
    const first = await dailyHistory(options, dependencies);
    assert.equal(first.History, 'PASS', first.Warnings.join('\n'));
    assert.equal(first.Backup, 'PASS', first.Warnings.join('\n'));
    assert.equal(first.Imported, 1);
    assert.equal(first.LatestSnapshot, current);
    assert.deepEqual(first.SkippedPackages.map(item => item.packageId), [supplemental]);
    const second = await dailyHistory({ ...options, runId: 'disposition-fixture-repeat' }, dependencies);
    assert.equal(second.History, 'PASS', second.Warnings.join('\n'));
    assert.equal(second.Imported, 0);
    assert.ok(['PASS', 'UNCHANGED'].includes(second.Backup), second.Warnings.join('\n'));

    const ids = await runtime.openRead(database, async connection => (await query(connection, 'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')).map(row => row.snapshot_id));
    assert.deepEqual(ids, eligibleWeeklyIds);
    const verified = JSON.parse(await fs.readFile(path.join(first.LastVerified.folder, 'VERIFIED.json'), 'utf8'));
    const backupManifest = JSON.parse(await fs.readFile(path.join(first.LastVerified.folder, 'manifest.json'), 'utf8'));
    assert.equal(backupManifest.latestSnapshot, current);
    assert.deepEqual(verified.audit.skipped_packages.map(item => item.packageId), [supplemental]);
    assert.ok(backupManifest.files.some(item => item.path === `snapshots/${DIRECTORY}/${supplemental}.json`));
    assert.ok(backupManifest.files.some(item => item.path === `snapshots/${supplemental}/01_good_documentation_jobs.csv`));
    assert.ok(backupManifest.files.some(item => item.path === `snapshots/${current}/03_top_matches_full.csv`));

    const rollback = await rollbackDisposition({ packageRoot: source, database, packageId: supplemental,
      rolledBackAt: '2026-11-19T12:02:00.000Z' });
    assert.match(rollback.archived, new RegExp(`${ROLLBACK_DIRECTORY}.+${supplemental}`));
    await assert.rejects(checkPendingDashboards(source, database), new RegExp(`Package dashboard is not finalized: ${supplemental}`));
    await runTrends();
    const afterRollback = await trendResult();
    assert.equal(afterRollback.manifest.CurrentSnapshot, current);
    assert.equal(afterRollback.manifest.PreviousSnapshot, supplemental);
    assert.deepEqual(afterRollback.manifest.TrendSnapshotsIncluded, allWeeklyIds);
    assert.ok(afterRollback.weekly.some(row => row['Apply Link'] === candidateOnly.URL));
    assert.match(afterRollback.report, /newest snapshot \(2026-11-19 06:19 UTC\).*previous snapshot \(2026-11-18 09:59 UTC\)/);
    assert.match(afterRollback.report, new RegExp(`Jobs first seen in this week: ${afterRollback.weekly.length}(?:\\n|$)`));
    const blockedAgain = await dailyHistory({ ...options, runId: 'disposition-fixture-rollback' }, dependencies);
    assert.equal(blockedAgain.History, 'FAILED');
    assert.equal(blockedAgain.Backup, 'NOT_RUN');
    const auditAfterRollback = (await runtime.inspect(database, source)).result;
    assert.deepEqual(auditAfterRollback.pending_snapshots, [supplemental]);
    assert.deepEqual(auditAfterRollback.skipped_packages, []);
    assert.deepEqual(await runtime.openRead(database, async connection => (await query(connection, 'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')).map(row => row.snapshot_id)), eligibleWeeklyIds);
    await assert.rejects(activateDisposition({ packageRoot: source, database, packageId: current, reason: 'Must fail.' }), /already imported/);
    assert.deepEqual(await csvHashes(), beforeHashes, 'The disposition and rollback must not change either package CSV');

    console.log(`PASS: deterministic activation and rollback overlap barriers produced complete old or new trends state; no-disposition weekly IDs ${allWeeklyIds.join(', ')}; valid-disposition weekly IDs ${eligibleWeeklyIds.join(', ')}; exact package skipped in history, trends, weekly comparison, and Top 5 inputs; ${current} imported once and full restore passed; rollback restored prior behavior; package CSVs unchanged.`);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

const operation = process.argv[2] === '--capture-overlap'
  ? captureWorker(process.argv[3], process.argv[4], process.argv[5])
  : process.argv[2] === '--activate-overlap'
    ? activateWorker(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7])
    : main();
operation.catch(error => { console.error(error); process.exitCode = 1; });
