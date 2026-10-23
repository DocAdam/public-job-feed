// One-time execution of the explicitly approved, archived 762-batch cleanup.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const ROOT = '/Users/adampugh/GitHub/public-job-feed';
const OUT = __dirname;
const { planRetention, retireBatches } = require(path.join(ROOT, 'src/lib/batch-retention'));
const { savePlan } = require(path.join(ROOT, 'src/scripts/plan-batch-retention'));
const { main: index } = require(path.join(ROOT, 'src/scripts/index-batches'));
const config = { batchesRoot: path.join(ROOT,'data/jobs/batches'), indexDir: path.join(ROOT,'data/jobs/index') };
const json = async p => JSON.parse(await fs.readFile(p,'utf8'));
async function save(name, data) {
  const h = await fs.open(path.join(OUT,name),'wx');
  try { await h.writeFile(JSON.stringify(data,null,2)+'\n'); await h.sync(); } finally { await h.close(); }
}
function checks(phase) {
  return new Promise((resolve,reject) => {
    const child = spawn('python3',['-B',path.join(OUT,'checks.py'),phase],{cwd:ROOT,stdio:'inherit'});
    child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error('Check failed: '+phase+' '+code)));
  });
}
async function main() {
  const manifest = await json(path.join(ROOT,'data/jobs/archives/20261020-762-batches/manifest.json'));
  const approved = [...manifest.batch_names].sort();
  assert.equal(approved.length,762);
  console.log('Starting fresh plan and protected-file baseline');
  const plan = await planRetention(config, { onLocked: () => checks('before'), save: p => savePlan(OUT,p) });
  assert.deepEqual(plan.rows.filter(r => r.Action === 'RETIRE_CANDIDATE').map(r => r.BatchName).sort(),approved);
  assert.equal(plan.inputFingerprint,manifest.retention_plan_binding.inputFingerprint,'Inputs differ from the verified archive scope; stop for review');
  console.log('Fresh plan passed for exactly 762 archived batches');
  const dry = await retireBatches(config,plan);
  await save('dry-run.json',dry);
  assert.equal(dry.Validation,'PASS'); assert.equal(dry.DeletedCount,0);
  console.log('Fresh dry run passed. Starting approved removal with locked validation.');
  const removed = await retireBatches(config,plan,{apply:true,onPhase:async phase => {
    if (phase === 'before-removal') {
      await checks('predelete');
      await save('removal-authorized.json',{at:new Date().toISOString(),approvedNames:approved,backupVerified:true,freshValidation:'PASS'});
    }
  }});
  await save('retirement-result.json',removed);
  assert.deepEqual([...removed.DeletedBatches].sort(),approved);
  console.log('Removed exactly 762 folders. Refreshing derived batch index.');
  await index({onLocked:async () => {
    const remaining = (await fs.readdir(config.batchesRoot,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
    assert.deepEqual(remaining,plan.rows.filter(r=>!approved.includes(r.BatchName)).map(r=>r.BatchName).sort());
    for (const name of ['batch-index.json','batch-index.csv','board-latest-fetch.json']) {
      assert.deepEqual(await fs.readFile(path.join(config.indexDir,name)),await fs.readFile(path.join(OUT,'before-'+name)),'Index changed before refresh');
    }
  }});
  const oldState = await json(path.join(OUT,'before-board-latest-fetch.json'));
  const newState = await json(path.join(config.indexDir,'board-latest-fetch.json'));
  assert.deepEqual(newState.Boards,oldState.Boards);
  console.log('Board results unchanged. Checking remaining inventory, ledger, and protected files.');
  const postDir = path.join(OUT,'post-cleanup'); await fs.mkdir(postDir);
  const post = await planRetention(config,{onLocked:()=>checks('after'),save:p=>savePlan(postDir,p)});
  assert.equal(post.totals.batches,plan.totals.batches-762);
  assert.equal(post.checks.ledgerEvents,plan.checks.ledgerEvents);
  assert.equal(post.checks.boardCount,plan.checks.boardCount);
  assert.equal(post.totals.candidateCount,0);
  await save('completion.json',{status:'PASS',completedAt:new Date().toISOString(),deletedBatches:762,remainingBatches:post.totals.batches,checks:post.checks,boardRowsUnchanged:true,protectedDataUnchanged:true});
  console.log('PASS: cleanup, index refresh, history preservation, and protected-file checks');
}
main().catch(async e => { console.error(e); await save('failure.json',{error:e.stack,at:new Date().toISOString()}); process.exitCode=1; });
