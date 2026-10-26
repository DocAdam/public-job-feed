// Test-only v1 control. The destination is fixed inside an owned prototype.
const fs=require('node:fs/promises');
const path=require('node:path');
const {DuckDBInstance}=require('@duckdb/node-api');
const {owner,lease,pending}=require('../lib/job-history-prototype-owner');
const {runHistory,discover,REQUIRED,snake,META_TYPES}=require('../lib/jobs-history');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
const {DATABASE_OPTIONS,FILES,fileHash}=require('../lib/job-history-bounded-storage');
const databaseOptions=DATABASE_OPTIONS;
async function main(){
  const [ownedDirectory,ownerToken,operation,root,...extra]=process.argv.slice(2);
  if(extra.length||!['scan','build','compare'].includes(operation)||(operation!=='compare'?!root:root!==undefined))throw new Error('Expected owned prototype, token, and scan/build with source root or compare');
  const directory=await owner({ownedDirectory,ownerToken}),release=await lease(directory);
  let instance,c,scanChildPeak=0;
  try{
    await pending(directory);
    const database=path.join(directory,'v1-control.duckdb'),stage=path.join(directory,'v1-stage'),manifest=path.join(stage,'scan.json'),ready=path.join(directory,'v1-control.ready.json');let result;
    if(operation==='scan'){
      await fs.mkdir(stage);
      const discovery=await discover(root);
      if(discovery.malformed.length||!discovery.ids.length)throw new Error('Invalid validation snapshot inventory');
      const scanned={...discovery,snapshots:[],headers:new Set(REQUIRED),variants:{},warnings:[],errors:[]};
      const {nonce}=JSON.parse(await fs.readFile(path.join(directory,'writer.lock'),'utf8'));
      for(const id of discovery.ids){
        const {stdout}=await run(process.execPath,['--max-old-space-size=256',path.join(__dirname,'job-history-validation-scan-worker.js'),directory,ownerToken,path.resolve(root),id,nonce],{maxBuffer:8*1024**2});
        const part=JSON.parse(stdout);scanChildPeak=Math.max(scanChildPeak,part.peak_rss_bytes);
        scanned.snapshots.push(...part.snapshots);part.headers.forEach(h=>scanned.headers.add(h));
        scanned.warnings.push(...part.warnings);scanned.errors.push(...part.errors);
        for(const [file,variants] of Object.entries(part.variants))for(const [header,ids] of Object.entries(variants)){
          ((scanned.variants[file]||={})[header]||=[]).push(...ids);
        }
      }
      const names=[...scanned.headers].map(snake);
      if(new Set(names).size!==names.length||names.some(n=>Object.keys(META_TYPES).includes(n)))scanned.errors.push('CSV column names collide with warehouse columns');
      for(const [file,variants] of Object.entries(scanned.variants))if(Object.keys(variants).length>1)scanned.warnings.push(`${file}: ${Object.keys(variants).length} header variants (union by name)`);
      if(scanned.errors.length)throw new Error(scanned.errors.join('\n'));
      const stagedHashes={};
      for(const s of scanned.snapshots)for(const key of ['staged','rawStaged','goodStaged','exceptionStaged'])stagedHashes[path.basename(s[key])]=await fileHash(s[key]);
      await fs.writeFile(manifest,JSON.stringify({...scanned,headers:[...scanned.headers],root:await fs.realpath(root),stagedHashes}),{flag:'wx'});
      result={snapshots:scanned.snapshots.length};
    }else if(operation==='build'){
      // A repeat must select a fresh owned test directory, never replace a control.
      try{await fs.lstat(database);throw new Error('Validation control already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
      const scanned=JSON.parse(await fs.readFile(manifest,'utf8'));
      if(scanned.root!==await fs.realpath(root))throw new Error('Validation source root changed');
      const verify=async()=>{
        const current=await discover(root);
        if(current.malformed.length||JSON.stringify(current.ids)!==JSON.stringify(scanned.ids))throw new Error('Validation source inventory changed');
        for(const s of scanned.snapshots){
          for(const name of FILES){
            const file=[...s.sources,...s.artifacts].find(f=>f.file===name);
            if(file){if(await fileHash(path.join(root,s.id,name))!==file.sha256)throw new Error('Validation source hash changed');}
            else try{await fs.access(path.join(root,s.id,name));throw new Error('Validation source inventory changed');}catch(e){if(e.code!=='ENOENT')throw e;}
          }
          for(const key of ['staged','rawStaged','goodStaged','exceptionStaged']){
            if(path.dirname(s[key])!==stage||(await fs.lstat(s[key])).isSymbolicLink()||await fileHash(s[key])!==scanned.stagedHashes[path.basename(s[key])])throw new Error('Validation staged hash changed');
          }
        }
      };
      await verify();
      // The installed Node binding only destroys query results in finalizers.
      // Collect finished results during this test-only legacy build; otherwise
      // a small JS heap can retain large native buffers until much later.
      const collector=setInterval(()=>global.gc(),50);let built;
      try{built=await runHistory('build',{root,database,databaseOptions,scanSource:async()=>({...scanned,headers:new Set(scanned.headers)})});}
      finally{clearInterval(collector);}
      await verify();
      result={snapshots:built.snapshots,observations:built.observations,raw_top_match_rows:built.raw_top_match_rows,
        raw_good_job_rows:built.raw_good_job_rows,good_job_exceptions:built.good_job_exceptions,errors:built.errors,bytes:(await fs.stat(database)).size};
      await fs.writeFile(ready,JSON.stringify({sha256:await fileHash(database)}),{flag:'wx'});
      await fs.rm(stage,{recursive:true});
    }else{
      const stat=await fs.lstat(database);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Validation control must be a regular file');
      const checked=JSON.parse(await fs.readFile(ready,'utf8'));
      if(await fileHash(database)!==checked.sha256)throw new Error('Validation control hash changed');
      instance=await DuckDBInstance.create(path.join(directory,'prototype.duckdb'),{...databaseOptions,access_mode:'READ_ONLY'});
      c=await instance.connect();
      const {compareSql}=require('./test-job-history-sql');
      result={parity:await compareSql(c,database)};
    }
    c?.closeSync();c=null;instance?.closeSync();instance=null;
    return {...result,scan_child_peak_rss_bytes:scanChildPeak,own_peak_rss_bytes:process.resourceUsage().maxRSS*1024,
      peak_rss_bytes:process.resourceUsage().maxRSS*1024+scanChildPeak};
  }finally{c?.closeSync();instance?.closeSync();await release();}
}
async function dispatch(){
  if(process.argv[4]==='build'&&typeof global.gc!=='function'){
    // Older callers still get the bounded build. Count this waiting process in
    // the returned bound instead of hiding the extra process from measurement.
    const {stdout}=await run(process.execPath,['--max-old-space-size=128','--expose-gc',__filename,...process.argv.slice(2)],{maxBuffer:1024*1024});
    const result=JSON.parse(stdout),wrapper=process.resourceUsage().maxRSS*1024;
    return {...result,wrapper_peak_rss_bytes:wrapper,peak_rss_bytes:wrapper+result.peak_rss_bytes};
  }
  return main();
}
if(require.main===module)dispatch().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={databaseOptions};
