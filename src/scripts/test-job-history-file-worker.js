const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createBoundedRunner}=require('../lib/job-history-bounded-runner');
const {fileHash}=require('../lib/job-history-bounded-storage');
const {fixture,job,exported}=require('./test-job-history-lifecycle');
const run=promisify(execFile);
async function main(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-file-worker-test-')),root=path.join(temp,'snapshots');let p;
  try{
    await fixture(root,'20260101-1200',[job],[exported]);
    p=await createBoundedRunner();await p.importPackage(root,'20260101-1200');
    await p.openQueries();
    for(const operation of ['prepareQueries','fingerprint','compact','recover'])await assert.rejects(p[operation](),/Close the prototype/);
    await p.close();
    const hash=await fileHash(p.database),worker=path.join(__dirname,'job-history-file-worker.js');
    await assert.rejects(run(process.execPath,[worker,p.directory,'wrong','compact']),/owner token mismatch/);
    await assert.rejects(run(process.execPath,[worker,p.directory,'wrong','unknown']),/Expected owned prototype/);
    assert.equal(await fileHash(p.database),hash);
    await p.prepareQueries();const before=(await p.fingerprint()).objects;
    const copying=p.compact();
    const blocked=await Promise.allSettled([p.fingerprint(),p.recover(),p.prepareQueries(),p.compact(),p.openQueries(),p.dispose(),p.importPackage(root,'20260101-1200')]);
    assert.ok(blocked.every(r=>r.status==='rejected'),'All competing operations must reject while a worker is active');
    await copying;
    assert.deepEqual((await p.fingerprint()).objects,before);
    // A child error must propagate and clear the runner busy flag.
    const lock=path.join(p.directory,'writer.lock');await fs.writeFile(lock,'{}');
    await assert.rejects(p.compact(),/lease/);
    await assert.rejects(p.recover(),/Invalid writer lease/);
    await fs.unlink(lock);
    await p.recover();assert.deepEqual((await p.fingerprint()).objects,before);
    await p.recover({rollback:true});assert.deepEqual((await p.fingerprint()).objects,before);
    return {status:'passed',cases:['open_reader_guard','wrong_token_no_file_change','invalid_operation',
      'concurrent_operations_rejected','child_error_propagated','busy_reset_after_error','worker_recovery','worker_rollback'],stats:p.stats};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
