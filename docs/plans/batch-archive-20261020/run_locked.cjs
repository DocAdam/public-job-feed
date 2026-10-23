// All source operations remain inside the existing batch maintenance boundary.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const { withBatchMaintenance, assertHistoryIdle } = require(path.join(root, 'src/lib/batch-maintenance'));
const { captureInputs, digest } = require(path.join(root, 'src/lib/batch-retention'));
async function python(script, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-u', path.join(__dirname, script), ...args],
      { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Archive step failed: ${script}, code ${code}, signal ${signal}`)));
  });
}
(async () => {
  const config = { batchesRoot: path.join(root, 'data/jobs/batches'), indexDir: path.join(root, 'data/jobs/index') };
  await withBatchMaintenance(config.batchesRoot, 'archive-762-batches', async owner => {
    await fs.writeFile(path.join(__dirname, 'maintenance-owner.json'), JSON.stringify(owner, null, 2)+'\n', { flag: 'wx' });
    await assertHistoryIdle(config.indexDir);
    await python('verify-protected.py', 'before');
    const binding = JSON.parse(await fs.readFile(path.join(root, 'docs/plans/batch-retention-safeguards-20261020/batch-retention-plan.manifest.json')));
    const rows = JSON.parse(await fs.readFile(path.join(root, 'docs/plans/batch-retention-safeguards-20261020/batch-retention-plan.json')));
    if (digest(rows) !== binding.rowsHash) throw new Error('Candidate plan changed');
    console.log('Check saved source fingerprint');
    if (digest(await captureInputs(config)) !== binding.inputFingerprint) throw new Error('Saved sources changed since candidate review; stop for review');
    await python('run_archive.py');
    await python('verify-protected.py', 'after');
    await assertHistoryIdle(config.indexDir);
    const output = path.join(root, 'data/jobs/archives/20261020-762-batches');
    const result = JSON.parse(await fs.readFile(path.join(output, 'verification.json')));
    result.protection_check = 'PASS';
    // A final archive name is used only after all checks pass.
    try { await fs.lstat(path.join(output, 'batches.tar.gz')); throw new Error('Final archive already exists'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    await fs.rename(path.join(output, 'batches.tar.gz.partial'), path.join(output, 'batches.tar.gz'));
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(result, null, 2)+'\n');
    await fs.writeFile(path.join(output, 'SHA256SUMS'), `${result.archive_sha256}  batches.tar.gz\n${result.manifest_sha256}  manifest.json\n`, { flag: 'wx' });
    for (const name of ['verification.json', 'SHA256SUMS']) {
      const h = await fs.open(path.join(output, name), 'r'); try { await h.sync(); } finally { await h.close(); }
    }
    const dir = await fs.open(output, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    await fs.writeFile(path.join(__dirname, 'verification.json'), JSON.stringify(result, null, 2)+'\n', { flag: 'wx' });
  });
  console.log('PASS: complete archive verified; source data unchanged; no source deletions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
