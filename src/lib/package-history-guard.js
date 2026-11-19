const fs = require('node:fs/promises');
const path = require('node:path');

async function exists(file) {
  try { await fs.lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function withMutablePackage(packageRoot, id, action) {
  if (!/^\d{8}-\d{4}$/.test(id)) throw new Error('Invalid package run identity');
  const database = path.resolve(packageRoot, '../history/jobs-history.duckdb');
  if (!await exists(database) && !await exists(database + '.history-lock') && !await exists(database + '.history-operation.json')) {
    return action();
  }
  const { withLease } = require('./job-history-access');
  return withLease(database, async () => {
    if (await exists(database)) {
      const { openRead } = require('./job-history-runtime');
      const imported = await openRead(database, async connection =>
        (await connection.runAndReadAll(`SELECT snapshot_id FROM snapshots WHERE snapshot_id='${id}'`)).getRowObjectsJson());
      if (imported.length) throw new Error(`Package ${id} is already imported into history; keep later status in data/jobs/reports.`);
    }
    // Hold the history lease until all package writes finish.
    return action();
  });
}

async function checkPendingDashboards(packageRoot, database) {
  const { withLease } = require('./job-history-access');
  return withLease(database, async () => {
    let imported = [];
    if (await exists(database)) {
      imported = await require('./job-history-runtime').openRead(database, async connection =>
        (await connection.runAndReadAll('SELECT snapshot_id FROM snapshots')).getRowObjectsJson());
    }
    const ids = new Set(imported.map(row => row.snapshot_id));
    const entries = await fs.readdir(packageRoot, { withFileTypes: true });
    const packageIds = entries.filter(entry => entry.isDirectory() && /^\d{8}-\d{4}$/.test(entry.name)).map(entry => entry.name).sort();
    const dispositions = await require('./package-snapshot-disposition').resolveDispositions(packageRoot, packageIds);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !/^\d{8}-\d{4}$/.test(entry.name) || ids.has(entry.name)) continue;
      if (dispositions.records.has(entry.name)) continue;
      const directory = path.join(packageRoot, entry.name), dashboard = path.join(directory, 'PROJECT_STATUS_DASHBOARD.md');
      // Older source fixtures and archives can have no operational dashboard.
      if (!await exists(dashboard)) {
        const manifestPath = path.join(directory, 'gsheet-package-manifest.json');
        if (await exists(manifestPath)) {
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
          if (Array.isArray(manifest) && manifest.some(row => row.FileName === 'PROJECT_STATUS_DASHBOARD.md')) {
            throw new Error(`Package dashboard is not finalized: ${entry.name}; dashboard is missing.`);
          }
        }
        continue;
      }
      const text = await fs.readFile(dashboard, 'utf8');
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'gsheet-package-manifest.json'), 'utf8'));
      const row = Array.isArray(manifest) && manifest.find(item => item.FileName === 'PROJECT_STATUS_DASHBOARD.md');
      if (text.match(/^Package run: (.+)$/m)?.[1] !== entry.name || !row || row.Exists !== true || row.SizeBytes !== Buffer.byteLength(text)) {
        throw new Error(`Package dashboard is not finalized: ${entry.name}; sync it before history import.`);
      }
    }
    return { skipped: dispositions.skipped };
  });
}

module.exports = { withMutablePackage, checkPendingDashboards };
