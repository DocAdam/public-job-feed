// Test driver: mutation targets must be inside its caller's isolated test folder.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const runtime=require('../lib/job-history-runtime');
const migration=require('../lib/job-history-migration');
const {fileHash}=require('../lib/job-history-bounded-storage');
async function main(){
 const [file]=process.argv.slice(2),o=JSON.parse(await fs.readFile(file,'utf8'));
 const directory=await fs.realpath(o.directory);
 if(path.dirname(directory)!==await fs.realpath(os.tmpdir())||!path.basename(directory).startsWith('history-integration-'))throw new Error('Not an isolated integration directory');
 if(!path.resolve(o.database).startsWith(directory+path.sep))throw new Error('Test database escapes isolated directory');
 let result;
 const at=where=>{if(where===o.crash)process.kill(process.pid,'SIGKILL');if(where===o.fault)throw new Error('Injected '+where);};
 if(o.operation==='fixtures'){
  if(!path.resolve(o.root).startsWith(directory+path.sep))throw new Error('Fixture root escapes test directory');
  const {fixture}=require('./test-job-history-lifecycle');
  await fixture(o.root,'20260101-1200',[],[]);
  // A saved full-size package is copied only inside this isolated test root.
  const next=path.join(o.root,'20261020-1200');await fs.mkdir(next);
  for(const name of require('../lib/job-history-bounded-storage').FILES){
    try{await fs.copyFile(path.join(o.root,'20261019-0616',name),path.join(next,name));}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  result={fixtures:2,empty_late_snapshot:1,copied_full_size_snapshot:'20261019-0616'};
 }else if(o.operation==='migrate'){
  const approval=await migration.prepareMigration(o);result=await migration.migrateHistory({...approval,approved:true},{at});
 }else if(o.operation==='recover')result=await migration.recoverHistory(o.database,{at});
 else if(o.operation==='compare')result=(await runtime.worker('compare',[o.database,o.control])).result;
 else if(o.operation==='report'){
  const report=await require('../lib/jobs-history-report').historyReport(o.database,'fixed');result={snapshot:report.current.snapshot_id,markdown:report.markdown};
 }else result=await runtime.runHistory(o.operation,{...o,at});
 return {result,database_sha256:await fileHash(o.database),own_peak_rss_bytes:process.resourceUsage().maxRSS*1024,
  child_peak_rss_bytes:runtime.stats.worker_peak_rss_bytes,peak_rss_bytes:process.resourceUsage().maxRSS*1024+runtime.stats.worker_peak_rss_bytes};
}
main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
