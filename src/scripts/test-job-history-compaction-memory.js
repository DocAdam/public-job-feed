const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createBoundedRunner}=require('../lib/job-history-bounded-runner');
const run=promisify(execFile);
const PEAK_LIMIT=768*1024**2,GROWTH_LIMIT=256*1024**2;
async function stress(count){
  let p;
  try{
    p=await createBoundedRunner();
    // Use the same isolated, owner-guarded generator as the validation test.
    // Count its peak, but do not retain fixture strings during compaction.
    const {token}=JSON.parse(await fs.readFile(path.join(p.directory,'owner.json'),'utf8'));
    const generated=JSON.parse((await run(process.execPath,['--max-old-space-size=128',path.join(__dirname,'test-job-history-validation-memory.js'),
      '--generate',String(count),p.directory,token],{maxBuffer:1024*1024})).stdout);
    const generationBound=process.resourceUsage().maxRSS*1024+generated.peak_rss_bytes;
    const root=path.join(p.directory,'stress-input');
    for(const id of generated.ids){
      await p.importPackage(root,id);
      await fs.rm(path.join(root,id),{recursive:true,force:true});
    }
    await p.prepareQueries();
    const before=(await p.fingerprint()).objects,compactions=[];
    const rowsIn=name=>before.find(o=>o.name===name).data.reduce((sum,part)=>sum+Number(part.n),0);
    assert.equal(rowsIn('history_v2_raw_rows'),count*400);
    assert.equal(rowsIn('history_v2_content_versions'),count*200);
    for(let i=0;i<2;i++){
      compactions.push(await p.compact());
      assert.deepEqual((await p.fingerprint()).objects,before);
    }
    const rollback=await p.recover({rollback:true});
    assert.deepEqual((await p.fingerprint()).objects,before);
    const parent=process.resourceUsage().maxRSS*1024;
    const peak=Math.max(generationBound,parent+Math.max(p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes));
    assert.ok(peak<PEAK_LIMIT,`${count} snapshots exceeded the 768 MiB prototype peak limit: ${peak}`);
    return {snapshots:count,raw_rows:count*400,unique_content_versions:count*200,compactions,rollback,
      parent_peak_rss_bytes:parent,fixture_generation_bound_rss_bytes:generationBound,stats:p.stats,conservative_peak_rss_bytes:peak};
  }finally{await p?.dispose();}
}
async function main(){
  if(process.argv[2]==='--worker'){
    const count=Number(process.argv[3]);
    if(![8,32].includes(count)||process.argv.length!==4)throw new Error('Expected fixed stress size 8 or 32');
    return stress(count);
  }
  if(process.argv.length!==2)throw new Error('No input or output database path is accepted');
  const cases=[];
  for(const count of [8,32]){
    const {stdout}=await run(process.execPath,['--max-old-space-size=256',__filename,'--worker',String(count)],{maxBuffer:1024*1024});
    cases.push(JSON.parse(stdout));
  }
  const growth=cases[1].conservative_peak_rss_bytes-cases[0].conservative_peak_rss_bytes;
  assert.ok(growth<GROWTH_LIMIT,`Fourfold input growth exceeded 256 MiB: ${JSON.stringify(cases)}`);
  return {status:'passed',cases,growth_bytes:growth,peak_limit_bytes:PEAK_LIMIT,growth_limit_bytes:GROWTH_LIMIT,
    note:'Maximum phase bound including fixture generation: isolated controller peak plus largest sequential child peak. Test dispatcher excluded. Synthetic history only; no OS-enforced RSS ceiling.'};
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
