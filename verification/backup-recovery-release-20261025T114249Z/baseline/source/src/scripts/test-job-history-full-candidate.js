// Opt-in full archive experiment; retains its owned candidate for review.
// No production database or source file is opened for writing.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const assert=require('node:assert/strict');
const {promisify}=require('node:util');
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
const run=promisify(execFile),MiB=1024**2;
async function hashFile(file){const h=createHash('sha256');for await(const part of createReadStream(file))h.update(part);return h.digest('hex');}
async function usage(directory){
  let logical=0,allocated=0;
  async function walk(dir){let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT'&&dir!==directory)return;throw e;}for(const entry of entries){const file=path.join(dir,entry.name);let s;try{s=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(s.isSymbolicLink())throw new Error('Unexpected symlink in candidate');if(s.isDirectory())await walk(file);else{logical+=s.size;allocated+=s.blocks*512;}}}
  await walk(directory);const v=await fs.statfs(directory);return {logical_bytes:logical,allocated_bytes:allocated,free_bytes:v.bavail*v.bsize};
}
async function main(){
  if(process.argv.length===3&&process.argv[2]==='--self-test'){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'history-disk-guard-')),original=fs.lstat;
    try{
      const sample=path.join(directory,'sample'),link=path.join(directory,'link'),removed=path.join(directory,'stage');
      await fs.writeFile(sample,Buffer.alloc(4096));assert.equal((await usage(directory)).logical_bytes,4096);
      await fs.symlink(sample,link);await assert.rejects(usage(directory),/Unexpected symlink/);await fs.unlink(link);
      await fs.mkdir(removed);
      fs.lstat=async file=>{const stat=await original(file);if(file===removed)await fs.rm(removed,{recursive:true});return stat;};
      assert.equal((await usage(directory)).logical_bytes,4096,'A removed staging directory is not a disk-limit violation');
      console.log('Disk accounting, symlink rejection, and concurrent cleanup tests passed');return;
    }finally{fs.lstat=original;await fs.rm(directory,{recursive:true,force:true});}
  }
  const [option,resumeDirectory,resumeToken,...extra]=process.argv.slice(2);
  if(option!==undefined&&(option!=='--resume'||!resumeDirectory||!resumeToken||extra.length))throw new Error('Use no arguments for a fresh candidate, or --resume with an owned temporary directory and token');
  const root=path.resolve('data/jobs/gsheet-package'),control=path.resolve('data/jobs/history/jobs-history.duckdb');
  const report={started_at:new Date().toISOString(),status:'running',limits:{memory_estimate_bytes:768*MiB,temporary_disk_bytes:16*1024*MiB,minimum_free_bytes:32*1024*MiB},phases:[],disk_peak:{logical_bytes:0,allocated_bytes:0},memory_note:'Controller high-water mark plus largest sequential worker bound, including parser child overlap. This is a measured test gate, not an OS RSS limit. Disk sampled every second and at phase boundaries.'};
  let directory,token;
  async function save(){if(directory)await fs.writeFile(path.join(directory,'full-history-results.json'),JSON.stringify(report,null,2));}
  async function phase(name,script,args,heap=128){
    const started=Date.now();let sampling,sampleError;
    const collect=script==='job-history-storage-worker.js'||(script==='job-history-validation-worker.js'&&args[2]==='build');
    const child=run(process.execPath,[`--max-old-space-size=${heap}`,...(collect?['--expose-gc']:[]),path.join(__dirname,script),...args],{maxBuffer:8*MiB});
    const sample=()=>{
      if(!directory)return Promise.resolve();if(sampling)return sampling;
      sampling=(async()=>{try{
        const u=await usage(directory);
        for(const key of ['logical_bytes','allocated_bytes'])report.disk_peak[key]=Math.max(report.disk_peak[key],u[key]);
        report.minimum_free_bytes=Math.min(report.minimum_free_bytes??Infinity,u.free_bytes);
        if(u.logical_bytes>report.limits.temporary_disk_bytes||u.allocated_bytes>report.limits.temporary_disk_bytes||u.free_bytes<report.limits.minimum_free_bytes)throw new Error('Temporary disk guard exceeded');
      }catch(e){sampleError=e;child.child.kill('SIGTERM');}finally{sampling=null;}})();
      return sampling;
    };
    const timer=setInterval(sample,1000);let output;
    try{output=JSON.parse((await child).stdout);await sample();if(sampleError)throw sampleError;}
    catch(e){const error=sampleError||e;report.phases.push({name,status:'failed',elapsed_ms:Date.now()-started,error:error.message,signal:e.signal??null,code:e.code??null,monitor_error:sampleError?.message??null});throw error;}
    finally{clearInterval(timer);await sampling;}
    const parent=process.resourceUsage().maxRSS*1024;
    report.phases.push({name,status:'passed',elapsed_ms:Date.now()-started,worker_peak_rss_bytes:output.peak_rss_bytes,controller_peak_rss_bytes:parent,conservative_peak_rss_bytes:parent+output.peak_rss_bytes,result:output.result??output,worker_details:output.stats??null});
    report.conservative_peak_rss_bytes=Math.max(report.conservative_peak_rss_bytes||0,parent+output.peak_rss_bytes);
    await save();console.log(JSON.stringify({phase:name,elapsed_ms:Date.now()-started,peak_mib:(parent+output.peak_rss_bytes)/MiB}));return output.result??output;
  }
  try{
    const inventory=await phase('read-only inventory','job-history-full-candidate-worker.js',['inventory',root,control]);
    assert.deepEqual(inventory.source.malformed,[]);
    let existing=new Set();
    if(option==='--resume'){
      const state=await phase('verify resume owner','job-history-full-candidate-worker.js',['state',resumeDirectory,resumeToken]);
      directory=state.directory;token=resumeToken;existing=new Set(state.ids);
      const prior=JSON.parse(await fs.readFile(path.join(directory,'full-history-results.json'),'utf8'));
      await fs.writeFile(path.join(directory,`full-history-attempt-${Date.now()}.json`),JSON.stringify(prior,null,2),{flag:'wx'});
      Object.assign(report,prior,{status:'running',resumed_at:new Date().toISOString(),prior_failure:prior.error});delete report.error;
      assert.ok(state.ids.every(id=>inventory.source.ids.includes(id)),'Candidate has an unexpected snapshot');
    }else{
      const created=await phase('create','job-history-full-candidate-worker.js',['create']);directory=created.directory;token=created.token;
    }
    report.directory=directory;await save();console.log(`CANDIDATE ${directory}`);
    const file=op=>phase(op,'job-history-file-worker.js',[directory,token,op]);
    const importOne=id=>phase(`import ${id}`,'job-history-storage-worker.js',[directory,token,root,id]);
    const prefix=inventory.warehouse.ids.map(r=>r.snapshot_id);
    assert.deepEqual(inventory.source.ids.slice(0,prefix.length),prefix);
    for(const id of prefix)if(!existing.has(id))await importOne(id);
    const prefixPassed=report.phases.some(p=>p.name==='existing 131 exact SQL/report comparison'&&p.status==='passed');
    if(!prefixPassed){
      assert.ok(existing.size<=prefix.length,'Missing prior prefix comparison');
      await file('prepare');
      await phase('existing 131 exact SQL/report comparison','job-history-full-candidate-worker.js',['compare',directory,token,control],256);
    }
    // Keep query interfaces installed while appending the remaining history.
    // Each import must update its metrics in the same transaction.
    for(const id of inventory.source.ids.slice(prefix.length))if(!existing.has(id))await importOne(id);
    await file('prepare');
    report.full_counts=await phase('full counts','job-history-full-candidate-worker.js',['counts',directory,token]);
    const expected={snapshots:152,raw_top_rows:111624,raw_good_rows:98896,observations:111614,exceptions:40};
    for(const [k,v] of Object.entries(expected))assert.equal(Number(report.full_counts.counts[k]),v,k);
    report.checks={};
    const check=async(name,fn)=>{
      try{const result=await fn();report.checks[name]={status:'passed',result};await save();return result;}
      catch(e){report.checks[name]={status:'failed',error:e.message};await save();return null;}
    };
    // Exact closed-file bytes are a stronger no-op check than a logical digest.
    // Keep testing independent gates when the full lifecycle digest cannot run.
    await check('full_lifecycle_events',()=>phase('full lifecycle events','job-history-full-candidate-worker.js',['lifecycle',directory,token]));
    await check('two_no_op_imports',async()=>{
      const before=await hashFile(path.join(directory,'prototype.duckdb'));
      for(let i=0;i<2;i++){
        assert.equal((await importOne(inventory.source.ids.at(-1))).imported,false);
        assert.equal(await hashFile(path.join(directory,'prototype.duckdb')),before);
      }
      return {sha256:before,closed_file_bytes_unchanged:true};
    });
    report.pre_compaction=await usage(directory);
    await check('compaction',()=>file('compact'));report.post_compaction=await usage(directory);
    await check('recovery',()=>file('recover'));
    const scanned=await check('v1_scan',()=>phase('v1 scan','job-history-validation-worker.js',[directory,token,'scan',root],256));
    if(scanned){
      const built=await check('v1_build',()=>phase('v1 build','job-history-validation-worker.js',[directory,token,'build',root],128));
      if(built){
        for(let i=0;i<2;i++)await check(`full_SQL_comparison_${i+1}`,()=>phase(`full SQL/report comparison ${i+1}`,'job-history-validation-worker.js',[directory,token,'compare'],256));
        await check('independent_control_counts',()=>phase('control completion and counts','job-history-full-candidate-worker.js',['control-info',directory,token],256));
        await check('full_report',()=>phase('independent full report','job-history-full-candidate-worker.js',['report',directory,token],256));
      }
    }
    report.status=Object.values(report.checks).some(c=>c.status==='failed')?'failed':report.conservative_peak_rss_bytes<report.limits.memory_estimate_bytes?'passed':'memory_gate_failed';
    if(report.status!=='passed')process.exitCode=1;
  }catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.message);}
  finally{report.finished_at=new Date().toISOString();if(directory){report.final_disk=await usage(directory);await save();console.log(`RESULTS ${path.join(directory,'full-history-results.json')}`);}}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={usage};
