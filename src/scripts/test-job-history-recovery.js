const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {fork}=require('node:child_process');
const {createBoundedPrototype,fileHash,q}=require('../lib/job-history-bounded-storage');
const {compactPrototype,recoverPrototype,fingerprint}=require('../lib/job-history-prototype-files');
const {installCompatibility}=require('../lib/job-history-sql-compatibility');
const {installLifecycleViews}=require('../lib/job-history-lifecycle');
const {query}=require('../lib/jobs-history');
const {fixture,job,exported}=require('./test-job-history-lifecycle');
const owned=p=>({ownedDirectory:p.directory,ownerToken:p.ownerToken});
async function pause(phase) {process.send({phase});await new Promise(()=>{});}
async function worker() {
  const [kind,options,root,id,point]=process.argv.slice(3),o=JSON.parse(options);let p;
  if(kind==='compact'){await compactPrototype(o,{at:async phase=>{if(phase===point)await pause(phase);}});return;}
  try{
    p=await createBoundedPrototype(o);await p.connection.run("SET wal_autocheckpoint='1GB'");
    await p.importPackage(root,id,{beforeCommit:kind==='uncommitted'?()=>pause('uncommitted'):undefined});
    if(kind==='committed'){assert.ok((await fs.stat(p.database+'.wal')).size>0);await pause('committed');}
  }finally{await p?.close();}
}
async function killAt(kind,o,root,id,point=kind) {
  const child=fork(__filename,['--worker',kind,JSON.stringify(o),root,id,point],{execArgv:['--max-old-space-size=128'],stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.on('data',b=>{stderr+=b;});
  return new Promise((resolve,reject)=>{
    let reached=false;
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Timeout waiting for ${point}: ${stderr}`));},30000);
    child.on('message',message=>{if(message.phase===point){reached=true;child.kill('SIGKILL');}});
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('exit',(code,signal)=>{clearTimeout(timeout);if(reached&&signal==='SIGKILL')resolve({point,signal});else reject(new Error(`Worker failed before ${point}: ${code}/${signal} ${stderr}`));});
  });
}
async function main() {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-recovery-')),root=path.join(temp,'snapshots');let p;
  const results=[];
  try {
    const first='20260101-1200',next='20260102-1200',last='20260103-1200';
    await fixture(root,first,[job],[exported]);await fixture(root,next,[{...job,Description:'B'}],[exported]);await fixture(root,last,[],[]);
    p=await createBoundedPrototype();const o=owned(p);
    await p.importPackage(root,first);await installCompatibility(p.connection);await installLifecycleViews(p.connection);
    let baseline=await fingerprint(p.connection);
    await assert.rejects(createBoundedPrototype(o),/lease/);await assert.rejects(compactPrototype(o),/lease/);await assert.rejects(recoverPrototype(o),/alive/);
    results.push('live_writer_and_recovery_rejected');await p.close();
    for(const kind of ['uncommitted','committed']){
      results.push(await killAt(kind,o,root,next));
      await assert.rejects(createBoundedPrototype(o),/lease/);
      await recoverPrototype(o);p=await createBoundedPrototype(o);
      if(kind==='uncommitted')assert.deepEqual(await fingerprint(p.connection),baseline,'Killed transaction leaves no data or metrics');
      else {
        assert.equal(Number((await query(p.connection,'SELECT count(*) n FROM snapshots'))[0].n),2);
        baseline=await fingerprint(p.connection);
        assert.equal((await p.importPackage(root,next)).imported,false);assert.deepEqual(await fingerprint(p.connection),baseline);
      }
      await p.close();
    }
    for(const point of ['before_copy','after_copy','prepared','old_renamed','promoted','complete']) {
      results.push(await killAt('compact',o,root,next,point));
      await recoverPrototype(o);p=await createBoundedPrototype(o);
      assert.deepEqual(await fingerprint(p.connection),baseline,`Recovery from ${point}`);await p.close();
    }
    const compact=await compactPrototype(o);p=await createBoundedPrototype(o);
    assert.deepEqual(await fingerprint(p.connection),baseline);await p.close();
    assert.equal((await recoverPrototype(o,{rollback:true})).result,'previous_file_restored');
    p=await createBoundedPrototype(o);assert.deepEqual(await fingerprint(p.connection),baseline);await p.close();results.push('explicit_file_rollback');
    // An actual rename error, created only inside this test's owned directory.
    await assert.rejects(compactPrototype(o,{at:async phase=>{if(phase==='old_renamed')await fs.mkdir(p.database);}}),/directory|EISDIR|ENOTDIR/);
    await fs.rmdir(p.database);await recoverPrototype(o);p=await createBoundedPrototype(o);assert.deepEqual(await fingerprint(p.connection),baseline);await p.close();results.push('rename_failure_restored');
    await assert.rejects(compactPrototype(o,{at:async phase=>{if(phase==='after_copy')throw new Error('Injected write failure');}}),/Injected write failure/);
    await recoverPrototype(o);p=await createBoundedPrototype(o);assert.deepEqual(await fingerprint(p.connection),baseline);await p.close();results.push('copy_failure_preserved');
    await compactPrototype(o);
    const journal=JSON.parse(await fs.readFile(path.join(p.directory,'operation.json'),'utf8'));
    const backup=path.join(p.directory,journal.backup),size=(await fs.stat(backup)).size;
    const current=await fileHash(p.database);await fs.appendFile(backup,'corrupt');
    await assert.rejects(recoverPrototype(o,{rollback:true}),/Rollback hash mismatch/);assert.equal(await fileHash(p.database),current);
    await fs.truncate(backup,size);results.push('damaged_backup_refused');
    results.push(await killAt('committed',o,root,last));
    await assert.rejects(recoverPrototype(o,{rollback:true}),/Pending WAL/);results.push('rollback_with_pending_wal_refused');
    await recoverPrototype(o);
    const before=await fileHash(p.database);await assert.rejects(recoverPrototype(o,{rollback:true}),/Current file changed/);assert.equal(await fileHash(p.database),before);results.push('rollback_after_new_import_refused');
    // A malformed lock cannot be treated as a dead writer's valid lease.
    await fs.writeFile(path.join(p.directory,'writer.lock'),'{}');await assert.rejects(recoverPrototype(o),/Invalid writer lease/);await fs.unlink(path.join(p.directory,'writer.lock'));results.push('malformed_lease_refused');
    p=await createBoundedPrototype(o);await p.close();
    return {status:'passed',cases:results,compaction:compact,limits:'Process-kill tests, injected copy failure, and real rename failure. No power-loss or full-disk hardware simulation. Production code rollback is outside this temporary prototype.'};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module)(process.argv[2]==='--worker'?worker():main().then(r=>console.log(JSON.stringify(r,null,2)))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={main,killAt};
