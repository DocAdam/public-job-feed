const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createBoundedRunner}=require('../lib/job-history-bounded-runner');
const {fileHash}=require('../lib/job-history-bounded-storage');
const {validationOperation}=require('./job-history-validation-control');
const {fixture,job,exported}=require('./test-job-history-lifecycle');
const {owner,lease}=require('../lib/job-history-prototype-owner');
const run=promisify(execFile),PEAK_LIMIT=768*1024**2,GROWTH_LIMIT=256*1024**2;
async function stress(count){
  let p;
  try{
    p=await createBoundedRunner();
    const {token}=JSON.parse(await fs.readFile(path.join(p.directory,'owner.json'),'utf8'));
    const generated=JSON.parse((await run(process.execPath,['--max-old-space-size=128',__filename,'--generate',String(count),p.directory,token],{maxBuffer:1024*1024})).stdout);
    const generationBound=process.resourceUsage().maxRSS*1024+generated.peak_rss_bytes;
    const root=path.join(p.directory,'stress-input');
    for(const id of generated.ids)await p.importPackage(root,id);
    await p.prepareQueries();
    const built=await validationOperation(p.directory,'build',root);
    assert.equal(Number(built.snapshots),count);assert.equal(Number(built.raw_top_match_rows),count*200);
    assert.equal(Number(built.raw_good_job_rows),count*200);assert.equal(Number(built.observations),count*200);
    assert.equal(Number(built.good_job_exceptions),0);assert.deepEqual(built.errors,[]);
    const files=[p.database,path.join(p.directory,'v1-control.duckdb')],hashes=await Promise.all(files.map(fileHash)),compares=[];
    for(let i=0;i<2;i++){
      compares.push(await validationOperation(p.directory,'compare'));
      assert.deepEqual(await Promise.all(files.map(fileHash)),hashes,'Read-only comparison must preserve both database files');
    }
    const parent=process.resourceUsage().maxRSS*1024;
    const peak=Math.max(generationBound,parent+Math.max(p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes,built.peak_rss_bytes,...compares.map(r=>r.peak_rss_bytes)));
    assert.ok(peak<PEAK_LIMIT,`${count} snapshots exceeded the 768 MiB complete validation limit: ${JSON.stringify({peak,parent,import:p.stats.worker_peak_rss_bytes,files:p.stats.file_worker_peak_rss_bytes,scan:built.scan_peak_rss_bytes,build:built.build_peak_rss_bytes,compares:compares.map(r=>r.peak_rss_bytes)})}`);
    return {snapshots:count,raw_rows:count*400,control:built,comparison_peak_rss_bytes:Math.max(...compares.map(r=>r.peak_rss_bytes)),
      public_interfaces:compares[0].parity.objects.length,report:compares[0].parity.report,repeat_readonly_comparison:'passed',
      parent_peak_rss_bytes:parent,fixture_generation_bound_rss_bytes:generationBound,stats:p.stats,conservative_peak_rss_bytes:peak};
  }finally{await p?.dispose();}
}
async function main(){
  if(process.argv[2]==='--generate'){
    const count=Number(process.argv[3]);
    if(![8,32].includes(count)||process.argv.length!==6)throw new Error('Expected fixed fixture count and owned prototype');
    const directory=await owner({ownedDirectory:process.argv[4],ownerToken:process.argv[5]}),release=await lease(directory);
    try{
      const root=path.join(directory,'stress-input'),ids=[];await fs.mkdir(root);
      for(let day=0;day<count;day++){
        const stamp=new Date(Date.UTC(2026,0,1+day)).toISOString(),id=stamp.slice(0,10).replaceAll('-','')+'-1200';ids.push(id);
        const rows=Array.from({length:200},(_,i)=>({...job,CanonicalURLKey:`https://stress/${i}`,URL:`https://stress/${i}`,
          Description:`Snapshot ${day} posting ${i}: `+'abcdefgh '.repeat(900),FetchedAt:stamp}));
        await fixture(root,id,rows,rows.map(r=>({...exported,'Apply Link':r.URL})));
      }
      return {ids,peak_rss_bytes:process.resourceUsage().maxRSS*1024};
    }finally{await release();}
  }
  if(process.argv[2]==='--worker'){
    const count=Number(process.argv[3]);
    if(![8,32].includes(count)||process.argv.length!==4)throw new Error('Expected fixed stress size 8 or 32');
    return stress(count);
  }
  if(process.argv.length!==2)throw new Error('No database path is accepted');
  const cases=[];
  for(const count of [8,32]){
    const {stdout}=await run(process.execPath,['--max-old-space-size=256',__filename,'--worker',String(count)],{maxBuffer:1024*1024});
    cases.push(JSON.parse(stdout));
  }
  const growth=cases[1].conservative_peak_rss_bytes-cases[0].conservative_peak_rss_bytes;
  assert.ok(growth<GROWTH_LIMIT,`Fourfold validation input growth exceeded 256 MiB: ${JSON.stringify(cases.map(r=>({snapshots:r.snapshots,peak:r.conservative_peak_rss_bytes,parent:r.parent_peak_rss_bytes,control:r.control})))}`);
  return {status:'passed',cases,growth_bytes:growth,peak_limit_bytes:PEAK_LIMIT,growth_limit_bytes:GROWTH_LIMIT,
    note:'Controller peak plus largest sequential worker peak, including original v1 scan/build/audits and SQL/report comparisons. Test dispatcher excluded; no OS-enforced RSS ceiling.'};
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
