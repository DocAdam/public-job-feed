const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { planRetention, retireBatches, digest } = require('../lib/batch-retention');
const { withBatchMaintenance, LOCK_NAME } = require('../lib/batch-maintenance');
const { withBatchRun } = require('../lib/batch-run');
const { savePlan } = require('./plan-batch-retention');
const NOW = Date.parse('2026-10-20T12:00:00Z');
const root = path.resolve(__dirname, '../..');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value)); };
async function fixture(parent) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(parent, 'case-')));
  for (const rel of ['src/lib/files.js', 'src/lib/csv.js', 'src/lib/batch-history.js', 'src/lib/batch-history-ledger.js',
    'src/lib/batch-maintenance.js', 'src/lib/batch-retention.js', 'src/scripts/index-batches.js',
    'src/scripts/plan-batch-retention.js', 'src/scripts/retire-batches.js']) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await fs.copyFile(path.join(root, rel), path.join(dir, rel));
  }
  const config = { batchesRoot: path.join(dir, 'data/jobs/batches'), indexDir: path.join(dir, 'data/jobs/index') };
  async function batch(name, date, slug, status, extra = {}) {
    const folder = path.join(config.batchesRoot, name);
    await write(path.join(folder, 'jobs-batch-summary.json'), { GeneratedAt: date });
    await write(path.join(folder, 'jobs-batch-fetch-log.json'), [{ ATS: 'ashby', CatalogSlug: slug, Status: status, FetchedAt: date, JobCount: status === 'success' ? 1 : 0, ...extra }]);
    await write(path.join(folder, 'public-job-feed-batch.json'), []);
  }
  await batch('old', '2026-07-01T00:00:00Z', 'alpha', 'success');
  await batch('failed', '2026-07-02T00:00:00Z', 'alpha', 'failed', { Diagnostic: { message: 'fixture failure' } });
  await batch('current', '2026-10-19T00:00:00Z', 'alpha', 'success');
  await batch('protected-old', '2026-07-01T00:00:00Z', 'beta', 'empty');
  await batch('recent', '2026-10-18T00:00:00Z', 'gamma', 'failed');
  await batch('unfinished', '2026-07-01T00:00:00Z', 'gamma', 'failed');
  await write(path.join(config.batchesRoot, 'unfinished/batch-run-fixture.json'), { status: 'running' });
  await fs.mkdir(path.join(config.batchesRoot, 'review'));
  const indexScript = path.join(dir, 'src/scripts/index-batches.js');
  const index = () => run(process.execPath, [indexScript]);
  await index();
  return { dir, config, indexScript, index, plan: () => planRetention(config, { now: NOW }) };
}
async function childHoldingIndex(f) {
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(f.indexScript)}).main({onLocked:async()=>{process.send('locked');setInterval(()=>{},1000);await new Promise(()=>{});}}).catch(e=>{console.error(e);process.exitCode=1;});`], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child lock timeout')), 10000);
    child.once('message', () => { clearTimeout(timer); resolve(); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Child exited before lock: ' + code)); });
    child.once('error', reject);
  });
  return child;
}
async function main() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-retention-test-'));
  let passed = 0;
  async function check(name, action) {
    const f = await fixture(parent);
    try { await action(f); passed++; console.log('PASS ' + name); }
    finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  }
  try {
    await check('policy, exact state and ledger coverage; deterministic plan', async f => {
      const p = await f.plan(); assert.deepEqual(await f.plan(), p);
      assert.equal(p.totals.candidateCount, 2); assert.equal(p.checks.ledgerEvents, 6);
      assert.equal(p.rows.find(r => r.BatchName === 'protected-old').Action, 'KEEP_CURRENT_SOURCE');
      assert.equal(p.rows.find(r => r.BatchName === 'recent').Action, 'KEEP_RECENT');
      assert.equal(p.rows.find(r => r.BatchName === 'unfinished').Action, 'REVIEW');
      assert.equal(p.rows.find(r => r.BatchName === 'review').Action, 'REVIEW');
      const out = path.join(f.dir, 'plan'); await savePlan(out, p);
      const loaded = { ...await json(path.join(out, 'batch-retention-plan.manifest.json')), rows: await json(path.join(out, 'batch-retention-plan.json')) };
      assert.deepEqual(loaded, p);
      const before = (await fs.readdir(f.config.batchesRoot)).sort();
      assert.equal((await retireBatches(f.config, loaded, { now: NOW })).DeletedCount, 0);
      assert.deepEqual((await fs.readdir(f.config.batchesRoot)).sort(), before);
    });
    await check('fixture removal, reindex twice, all saved events retained', async f => {
      const p = await f.plan(); const ledger = path.join(f.config.indexDir, 'history/fetch-events/2026-07.jsonl.gz');
      const before = await fs.readFile(ledger), state = await json(path.join(f.config.indexDir, 'board-latest-fetch.json'));
      assert.equal((await retireBatches(f.config, p, { apply: true, now: NOW })).DeletedCount, 2);
      await assert.rejects(retireBatches(f.config, p, { apply: true, now: NOW }), /inventory/);
      await f.index(); await f.index(); assert.deepEqual(await fs.readFile(ledger), before);
      assert.deepEqual((await json(path.join(f.config.indexDir, 'board-latest-fetch.json'))).Boards, state.Boards);
    });
    for (const [name, mutate, error] of [
      ['changed candidate bytes', f => fs.writeFile(path.join(f.config.batchesRoot, 'old/public-job-feed-batch.json'), '[{}]'), /Stale/],
      ['new unindexed batch', f => fs.mkdir(path.join(f.config.batchesRoot, 'extra')), /inventory/],
      ['missing batch', f => fs.rm(path.join(f.config.batchesRoot, 'old'), { recursive: true }), /inventory/],
      ['changed index', async f => { const file = path.join(f.config.indexDir, 'batch-index.json'); const rows = await json(file); rows[0].IndexedAt = 'changed'; await write(file, rows); }, /Stale/],
      ['changed board job count', async f => { const file = path.join(f.config.indexDir, 'board-latest-fetch.json'); const s = await json(file); s.Boards[0].JobCount++; await write(file, s); }, /board state/],
      ['missing saved events', f => fs.writeFile(path.join(f.config.indexDir, 'history/fetch-events/2026-07.jsonl.gz'), zlib.gzipSync('')), /saved fetch event/],
      ['damaged ledger', f => fs.writeFile(path.join(f.config.indexDir, 'history/fetch-events/2026-07.jsonl.gz'), 'bad gzip'), /header|gzip|compression/i],
      ['active monthly writer', f => fs.writeFile(path.join(f.config.indexDir, '.fetch-history.lock'), '{}'), /pending/],
      ['pending monthly recovery', f => fs.writeFile(path.join(f.config.indexDir, '.fetch-history-recovery.lock'), '{}'), /pending/],
      ['symlink candidate file', async f => { const file = path.join(f.config.batchesRoot, 'old/public-job-feed-batch.json'); await fs.unlink(file); await fs.symlink(path.join(f.config.batchesRoot, 'current/public-job-feed-batch.json'), file); }, /Unsafe/],
      ['unsafe indexed folder', async f => { const file = path.join(f.config.indexDir, 'batch-index.json'); const rows = await json(file); rows[0].BatchFolder = f.dir; await write(file, rows); }, /path mismatch/],
      ['duplicate indexed name', async f => { const file = path.join(f.config.indexDir, 'batch-index.json'); const rows = await json(file); rows[0].BatchName = rows[1].BatchName; await write(file, rows); }, /inventory/],
    ]) await check(name + ' refuses deletion', async f => {
      const p = await f.plan(); await mutate(f);
      await assert.rejects(retireBatches(f.config, p, { apply: true, now: NOW }), error);
      await fs.access(path.join(f.config.batchesRoot, 'current'));
      if (name !== 'missing batch') await fs.access(path.join(f.config.batchesRoot, 'old'));
    });
    await check('changed plan decisions, unknown names, unsafe paths, version and expiry', async f => {
      const p = await f.plan();
      for (const modify of [p => { p.rows[0].Action = 'RETIRE_CANDIDATE'; }, p => { p.rows.push({ BatchName: '../outside', Action: 'RETIRE_CANDIDATE' }); }, p => { p.version = 9; }, p => { delete p.version; }]) {
        const q = structuredClone(p); modify(q); await assert.rejects(retireBatches(f.config, q, { apply: true, now: NOW }), /Invalid/);
      }
      const forged = structuredClone(p); forged.rows.find(r => r.BatchName === 'current').Action = 'RETIRE_CANDIDATE'; forged.rowsHash = digest(forged.rows);
      await assert.rejects(retireBatches(f.config, forged, { apply: true, now: NOW }), /Stale/);
      await assert.rejects(retireBatches(f.config, p, { now: NOW + 86400001 }), /expired/);
      await assert.rejects(retireBatches(f.config, p, { now: NOW - 1 }), /Invalid/);
    });
    await check('monthly lock stops index before it changes any output', async f => {
      const file = path.join(f.config.indexDir, 'batch-index.json'), before = await fs.readFile(file);
      await fs.writeFile(path.join(f.config.indexDir, '.fetch-history.lock'), '{}');
      await assert.rejects(f.index(), /pending/);
      assert.deepEqual(await fs.readFile(file), before);
    });
    await check('saved diagnostics must match raw evidence', async f => {
      const file = path.join(f.config.indexDir, 'history/fetch-events/2026-07.jsonl.gz');
      const events = zlib.gunzipSync(await fs.readFile(file)).toString().trim().split('\n').map(JSON.parse);
      events.find(e => e.SourceBatch === 'failed').Diagnostic.message = 'changed';
      await fs.writeFile(file, zlib.gzipSync(events.map(e => JSON.stringify(e)).join('\n') + '\n'));
      await assert.rejects(f.plan(), /conflicting saved fetch event/);
    });
    await check('symlink batch folder and unknown owner refuse work', async f => {
      await fs.symlink(path.join(f.config.batchesRoot, 'current'), path.join(f.config.batchesRoot, 'linked'));
      await assert.rejects(f.plan(), /Unexpected batch entry/);
      await fs.unlink(path.join(f.config.batchesRoot, 'linked'));
      await fs.writeFile(path.join(f.config.batchesRoot, LOCK_NAME), 'unknown owner');
      await assert.rejects(f.plan(), /maintenance lock/);
      await assert.rejects(f.index(), /maintenance lock/);
    });
    await check('input change during planning refuses plan', async f => {
      await assert.rejects(planRetention(f.config, { now: NOW, onPhase: async phase => {
        if (phase === 'validated') await fs.writeFile(path.join(f.config.batchesRoot, 'old/new-file'), 'changed');
      } }), /changed during/);
    });
    await check('real index owner blocks planning, retirement and collection; dead owner stays blocked', async f => {
      const p = await f.plan(), before = await fs.readFile(path.join(f.config.indexDir, 'batch-index.json'));
      const child = await childHoldingIndex(f);
      try {
        await assert.rejects(f.plan(), /maintenance lock/);
        await assert.rejects(retireBatches(f.config, p, { apply: true, now: NOW }), /maintenance lock/);
        await assert.rejects(withBatchRun(path.join(f.config.batchesRoot, 'blocked'), async () => assert.fail('collector entered')), /maintenance lock/);
        await assert.rejects(f.index(), /maintenance lock/);
      } finally { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; }
      await assert.rejects(f.plan(), /maintenance lock/);
      assert.deepEqual(await fs.readFile(path.join(f.config.indexDir, 'batch-index.json')), before);
      // Test-only manual release after observing the child exit. Never clear production locks here.
      await fs.unlink(path.join(f.config.batchesRoot, LOCK_NAME));
      assert.deepEqual(await f.plan(), p);
    });
    await check('retirement lock spans validation and removal; index refuses before writes', async f => {
      const p = await f.plan(), before = await fs.readFile(path.join(f.config.indexDir, 'batch-index.json'));
      const result = await retireBatches(f.config, p, { apply: true, now: NOW, onPhase: async phase => {
        if (phase === 'locked' || phase === 'before-removal') {
          await assert.rejects(f.index(), /maintenance lock/);
          await assert.rejects(f.plan(), /maintenance lock/);
          assert.deepEqual(await fs.readFile(path.join(f.config.indexDir, 'batch-index.json')), before);
        }
      } });
      assert.equal(result.DeletedCount, 2);
    });
    await check('collection and planner hold the same boundary; caught errors release it', async f => {
      await withBatchRun(path.join(f.config.batchesRoot, 'current'), async () => {
        await assert.rejects(f.index(), /maintenance lock/); await assert.rejects(f.plan(), /maintenance lock/);
      });
      await planRetention(f.config, { now: NOW, onLocked: async () => { await assert.rejects(f.index(), /maintenance lock/); } });
      await assert.rejects(withBatchMaintenance(f.config.batchesRoot, 'test', async () => { throw new Error('synthetic failure'); }), /synthetic/);
      await f.plan();
    });
    console.log(`Batch retention safeguards: ${passed} test groups passed.`);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
