// Explicit full-history rehearsal. Retains only isolated files for review.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
async function fileHash(file){const h=createHash('sha256'),f=await fs.open(file,'r'),buffer=Buffer.alloc(64*1024);try{for(;;){const {bytesRead}=await f.read(buffer,0,buffer.length,null);if(!bytesRead)break;h.update(buffer.subarray(0,bytesRead));}return h.digest('hex');}finally{await f.close();}}
const FILES=['03_top_matches_full.csv','01_good_documentation_jobs.csv','gsheet-package-manifest.json','SOURCE_SUMMARY.md','09_ats_health.csv','README_GSHEET_PACKAGE.md','00_start_here.csv'];
async function manifest(root){root=await fs.realpath(root);const ids=(await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d{8}-\d{4}$/.test(e.name)).map(e=>e.name).sort(),files={};for(const id of ids)for(const name of FILES){try{files[id+'/'+name]=await fileHash(path.join(root,id,name));}catch(e){if(e.code!=='ENOENT')throw e;}}return {root,ids,files};}
const MiB=1024**2,GiB=1024**3;
async function main(){
 const [candidate,control]=process.argv.slice(2);if(!candidate||!control)throw new Error('Supply the reviewed v2 candidate and v1 control');
 const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'history-integration-full-')));
 const root=path.join(directory,'sources'),database=path.join(directory,'history','jobs-history.duckdb');
 await fs.mkdir(path.dirname(database));
 const sourceRoot=path.resolve('data/jobs/gsheet-package'),live=path.resolve('data/jobs/history/jobs-history.duckdb');
 const sources=await manifest(sourceRoot),liveHash=await fileHash(live),candidateHash=await fileHash(candidate),controlHash=await fileHash(control);
 const report={directory,status:'running',source_snapshot_count:sources.ids.length,live_hash:liveHash,candidate_hash:candidateHash,control_hash:controlHash,phases:[],peak_disk_bytes:0,minimum_free_bytes:Infinity};
 const save=()=>fs.writeFile(path.join(directory,'results.json'),JSON.stringify(report,null,2));
 async function usage(){let bytes=0;async function walk(p){let es;try{es=await fs.readdir(p,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const e of es){const f=path.join(p,e.name);let s;try{s=await fs.lstat(f);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(s.isSymbolicLink())throw new Error('Unexpected test symlink');if(s.isDirectory())await walk(f);else bytes+=Math.max(s.size,s.blocks*512);}}await walk(directory);const s=await fs.statfs(directory);report.peak_disk_bytes=Math.max(report.peak_disk_bytes,bytes);report.minimum_free_bytes=Math.min(report.minimum_free_bytes,s.bavail*s.bsize);assert.ok(bytes<=16*GiB,'16 GiB disk gate');assert.ok(s.bavail*s.bsize>=32*GiB,'32 GiB free floor');}
 async function phase(name,options,{failure=false}={}){
  const config=path.join(directory,'request.json');await fs.writeFile(config,JSON.stringify({directory,database,root,candidate:path.resolve(candidate),control:path.resolve(control),...options}));
  const started=Date.now(),child=run(process.execPath,['--max-old-space-size=128','--expose-gc',path.join(__dirname,'test-job-history-integration-worker.js'),config],{maxBuffer:8*MiB});
  let sampling,error;const sample=()=>sampling|| (sampling=usage().catch(e=>{error=e;child.child.kill('SIGTERM');}).finally(()=>{sampling=null;}));const timer=setInterval(sample,1000);
  try{const out=JSON.parse((await child).stdout);await sample();if(error)throw error;assert.ok(!failure,'Expected injected failure');
   const peak=process.resourceUsage().maxRSS*1024+out.peak_rss_bytes;assert.ok(peak<768*MiB,'768 MiB conservative process gate');
   report.phases.push({name,status:'passed',elapsed_ms:Date.now()-started,conservative_peak_rss_bytes:peak,...out});await save();console.error(name,'passed',Math.round(peak/MiB)+' MiB');return out;
  }catch(e){if(failure&&!error&&e.stderr?.includes('Injected')){report.phases.push({name,status:'expected_failure',elapsed_ms:Date.now()-started});await save();return;}
   report.phases.push({name,status:'failed',elapsed_ms:Date.now()-started,error:e.message});throw e;
  }finally{clearInterval(timer);await sampling;}
 }
 try{
  await fs.copyFile(live,database);
  for(const id of sources.ids){await fs.mkdir(path.join(root,id),{recursive:true});for(const name of FILES)if(sources.files[id+'/'+name])await fs.copyFile(path.join(sourceRoot,id,name),path.join(root,id,name));}
  await usage();await save();console.error('REHEARSAL',directory);
  await phase('full replacement failure',{operation:'migrate',fault:'renamed'},{failure:true});
  await phase('restore original 131 snapshots',{operation:'recover'});assert.equal(await fileHash(database),liveHash);
  const installed=await phase('full checked migration',{operation:'migrate'});assert.equal(installed.database_sha256,candidateHash);
  const start=await fileHash(database);
  for(let i=0;i<2;i++){const r=await phase('unchanged update '+(i+1),{operation:'update'});assert.equal(r.database_sha256,start);assert.equal(r.result.imported,0);}
  const audit=await phase('full production audit',{operation:'audit'});assert.equal(audit.result.snapshots,'152');assert.equal(audit.result.raw_top_match_rows,'111624');assert.equal(audit.result.good_job_exceptions,'40');
  await phase('full public SQL and report',{operation:'compare'});
  // An empty late fixture and a full-size saved-package copy test incremental writes.
  // Both exist only in this disposable source tree; they are not real new runs.
  await phase('create isolated late and full-size packages',{operation:'fixtures'});
  const updated=await phase('full-size late and next snapshot update',{operation:'update'});assert.equal(updated.result.imported,2);assert.equal(updated.result.snapshots,'154');assert.equal(updated.result.raw_top_match_rows,'112502');
  await phase('full-size compaction',{operation:'compact'});
  const after=await phase('audit after compaction',{operation:'audit'});assert.equal(after.result.snapshots,'154');assert.equal(after.result.raw_top_match_rows,'112502');assert.equal(after.result.good_job_exceptions,'40');
  assert.equal(await fileHash(live),liveHash);assert.equal(await fileHash(candidate),candidateHash);assert.equal(await fileHash(control),controlHash);assert.deepEqual(await manifest(sourceRoot),sources);
  report.status='passed';report.protected_inputs='unchanged';
 }catch(e){report.status='failed';report.error=e.message;throw e;}
 finally{await usage();await save();console.log(JSON.stringify({directory,status:report.status,result:path.join(directory,'results.json')}));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
