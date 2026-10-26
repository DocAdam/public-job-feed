// Isolated production-command and migration tests. No default database writes.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
const {fixture,job,exported}=require('./test-job-history-lifecycle');
const {runHistory,query}=require('../lib/jobs-history');
const {fileHash}=require('../lib/job-history-bounded-storage');
const {withLease}=require('../lib/job-history-access');
const runtime=require('../lib/job-history-runtime');
const migration=require('../lib/job-history-migration');
const {historyReport}=require('../lib/jobs-history-report');
async function main(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'history-integration-')),root=path.join(dir,'sources');const checks=[];
 const mark=(name,result='passed')=>{checks.push({name,result});console.error(name,result);};
 const target=async name=>{const folder=path.join(dir,name);await fs.mkdir(folder);return path.join(folder,'jobs-history.duckdb');};
 try{
  await fixture(root,'20260101-1200',[job],[exported]);
  const legacy=await target('legacy');await runHistory('build',{root,database:legacy});assert.equal(await runtime.detect(legacy),'v1');
  const v2=await target('new');await runHistory('build',{root,database:v2,format:'v2'});assert.equal(await runtime.detect(v2),'v2');mark('build and format dispatch');
  await runtime.openRead(v2,c=>require('./test-job-history-sql').compareSql(c,legacy));mark('exact SQL and report');
  const before=await fileHash(v2);for(let i=0;i<2;i++)await runHistory('update',{root,database:v2});assert.equal(await fileHash(v2),before);mark('two no-op updates preserve file');
  await withLease(v2,async()=>{
    await assert.rejects(runHistory('audit',{root,database:v2}),/EEXIST/);
    await assert.rejects(historyReport(v2),/EEXIST/);
    await assert.rejects(run(process.execPath,['src/scripts/query-jobs-history.js','SELECT 1',v2]),/EEXIST/);
  });mark('reader and writer gate');
  await assert.rejects(runHistory('build',{root,database:v2,format:'v1'}),/conversion/);assert.equal(await fileHash(v2),before);mark('ordinary build cannot change format');
  await fixture(root,'20260103-1200',[{...job,Title:'Changed'}],[exported]);
  await fixture(root,'20260105-1200',[{...job,Title:'Changed again'}],[exported]);
  await assert.rejects(runHistory('update',{root,database:v2,afterImport:id=>{if(id==='20260105-1200')throw new Error('injected later failure');}}),/injected later failure/);
  assert.equal(await fileHash(v2),before);assert.equal((await runtime.openRead(v2,c=>query(c,'SELECT count(*) n FROM snapshots')))[0].n,'1');mark('multi-snapshot failure leaves active file unchanged');
  await runHistory('update',{root,database:v2});await runHistory('update',{root,database:legacy});
  await runtime.openRead(v2,c=>require('./test-job-history-sql').compareSql(c,legacy));mark('multi-snapshot success and metrics');
  const out=path.join(dir,'report.md');await run(process.execPath,['src/scripts/report-jobs-history.js','--database',v2,'--output',out]);assert.match(await fs.readFile(out,'utf8'),/Publishing-ready facts/);
  await run(process.execPath,['src/scripts/jobs-history.js','audit','--database',v2,'--root',root]);
  await run(process.execPath,['src/scripts/query-jobs-history.js','SELECT count(*) FROM snapshots',v2]);mark('normal CLI audit report query');
  const draft=await migration.prepareMigration({database:legacy,candidate:v2,root});await assert.rejects(migration.migrateHistory(draft),/approval/);
  const old=await fileHash(legacy);const success=await migration.migrateHistory({...draft,approved:true});assert.equal(await fileHash(success.backup),old);assert.equal(await runtime.detect(legacy),'v2');
  await assert.rejects(migration.recoverHistory(legacy,{rollback:true}),/lossy rollback/);mark('checked backup migration and accepted rollback refusal');
  const phases=['backup','before_prepared','prepared','renamed','replaced','companion_readme','companion_validation','companion_report'];
  for(const phase of phases){
    const db=await target('fault-'+phase);await fs.copyFile(success.backup,db);await fs.writeFile(path.join(path.dirname(db),'README.md'),'original README\n');
    const a=await migration.prepareMigration({database:db,candidate:v2,root});
    await assert.rejects(migration.migrateHistory({...a,approved:true},{at:where=>{if(where===phase)throw new Error('injected '+phase);}}),/injected/);
    if(!['backup','before_prepared'].includes(phase)){
      await assert.rejects(historyReport(db),/Unfinished/);
      await migration.recoverHistory(db);await migration.recoverHistory(db);
    }
    assert.equal(await fileHash(db),old);assert.equal(await fs.readFile(path.join(path.dirname(db),'README.md'),'utf8'),'original README\n');
    assert.equal(await runtime.detect(db),'v1');
  }mark('eight failure boundaries and repeated recovery');
  const wal=v2+'.wal';await fs.writeFile(wal,'pending');await assert.rejects(migration.prepareMigration({database:legacy,candidate:v2,root}),/WAL/);await fs.unlink(wal);mark('WAL refusal');
  const alias=path.join(dir,'alias.duckdb');await fs.symlink(v2,alias);await assert.rejects(runHistory('update',{root,database:alias}),/symlink/);mark('symlink refusal');
  await assert.rejects(migration.diskGuard(v2,{minFreeBytes:Number.MAX_SAFE_INTEGER}),/disk guard/);mark('disk floor refusal');
  const link=path.join(dir,'hard.duckdb');await fs.link(v2,link);await assert.rejects(runHistory('update',{root,database:link}),/hard links/);await fs.unlink(link);mark('hard-link refusal');
  const hash=await fileHash(v2),source=path.join(root,'20260101-1200','01_good_documentation_jobs.csv'),text=await fs.readFile(source);
  await fs.appendFile(source,'\n');await assert.rejects(runHistory('update',{root,database:v2}),/Source hash/);assert.equal(await fileHash(v2),hash);await fs.writeFile(source,text);mark('source mutation refusal');
  const recoveryFile=path.join(dir,'recovery-v1.duckdb');
  const recovery=await migration.buildRecoveryCandidate({database:v2,candidate:recoveryFile,root});
  assert.equal(recovery.approval.approved,false);assert.equal(await runtime.detect(recoveryFile),'v1');
  await runtime.openRead(v2,c=>require('./test-job-history-sql').compareSql(c,recoveryFile));mark('complete post-acceptance recovery candidate');
  const wrong={...await migration.prepareMigration({database:v2,candidate:recoveryFile,root}),approved:true,codeHash:'wrong'};
  await assert.rejects(migration.migrateHistory(wrong),/codeHash/);mark('approval code binding');
  await run(process.execPath,['src/scripts/jobs-history.js','compact','--database',v2,'--root',root]);
  await runtime.openRead(v2,c=>require('./test-job-history-sql').compareSql(c,recoveryFile));mark('production compaction command');
  const bad=await target('unknown');const {DuckDBInstance}=require('@duckdb/node-api');
  let instance=await DuckDBInstance.create(bad),connection=await instance.connect();await connection.run('CREATE TABLE unrelated(n INTEGER)');connection.closeSync();instance.closeSync();
  const badHash=await fileHash(bad);await assert.rejects(runHistory('build',{database:bad,root}),/Unknown or mixed/);assert.equal(await fileHash(bad),badHash);mark('unknown schema refusal');
  instance=await DuckDBInstance.create(v2,{access_mode:'READ_ONLY'});connection=await instance.connect();
  try{await assert.rejects(runHistory('update',{root,database:v2}),/external database/);}finally{connection.closeSync();instance.closeSync();}mark('external reader refusal');
  const badView=await target('bad-view');await fs.copyFile(v2,badView);
  instance=await DuckDBInstance.create(badView);connection=await instance.connect();
  await connection.run("ALTER VIEW posting_observations RENAME TO original_observations; CREATE VIEW posting_observations AS SELECT * REPLACE (''::VARCHAR AS url) FROM original_observations");connection.closeSync();instance.closeSync();
  await assert.rejects(runHistory('audit',{database:badView,root}),/Missing required observation URL/);mark('public-view identity audit');
  const cli=await target('maintenance-cli');await fs.copyFile(recoveryFile,cli);const approvalFile=path.join(path.dirname(cli),'approval.json');
  await run(process.execPath,['src/scripts/manage-jobs-history.js','prepare','--database',cli,'--candidate',v2,'--root',root,'--record',approvalFile]);
  await assert.rejects(run(process.execPath,['src/scripts/manage-jobs-history.js','apply','--record',approvalFile]),/approval/);
  const approved=JSON.parse(await fs.readFile(approvalFile));approved.approved=true;await fs.writeFile(approvalFile,JSON.stringify(approved));
  await run(process.execPath,['src/scripts/manage-jobs-history.js','apply','--record',approvalFile]);
  await run(process.execPath,['src/scripts/manage-jobs-history.js','recover','--database',cli]);assert.equal(await runtime.detect(cli),'v2');mark('maintenance CLI approval and apply');
  const crashDB=await target('crash');await fs.copyFile(recoveryFile,crashDB);
  const config=path.join(dir,'crash-request.json');await fs.writeFile(config,JSON.stringify({directory:await fs.realpath(dir),database:await fs.realpath(crashDB),candidate:v2,root,operation:'migrate',crash:'renamed'}));
  await assert.rejects(run(process.execPath,['src/scripts/test-job-history-integration-worker.js',config]),e=>e.signal==='SIGKILL');
  await assert.rejects(historyReport(crashDB),/EEXIST/);
  const realCrash=await fs.realpath(crashDB);await migration.recoverHistory(realCrash);assert.equal(await fileHash(crashDB),await fileHash(recoveryFile));mark('killed writer and dead-owner restart recovery');
  const faultDB=await target('restore-retry');await fs.copyFile(recoveryFile,faultDB);
  const a=await migration.prepareMigration({database:faultDB,candidate:v2,root});
  await assert.rejects(migration.migrateHistory({...a,approved:true},{at:where=>{if(where==='replaced')throw new Error('injected failure');}}),/injected/);
  await assert.rejects(migration.recoverHistory(faultDB,{at:where=>{if(where==='restored_database')throw new Error('injected restore failure');}}),/injected/);
  await migration.recoverHistory(faultDB);assert.equal(await fileHash(faultDB),await fileHash(recoveryFile));mark('interrupted restore retry');
  return {status:'passed',checks,peak_rss_bytes:process.resourceUsage().maxRSS*1024};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
