const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {validationOperation}=require('./job-history-validation-control');
const {createBoundedRunner}=require('../lib/job-history-bounded-runner');
const {FILES,fileHash}=require('../lib/job-history-bounded-storage');
const {SAMPLE_IDS}=require('./test-job-history-storage');
async function main(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-compact-saved-')),root=path.join(temp,'snapshots');let p;const hashes=new Map();
  try{
    for(const id of SAMPLE_IDS){await fs.mkdir(path.join(root,id),{recursive:true});for(const name of FILES){
      const source=path.resolve('data/jobs/gsheet-package',id,name);try{hashes.set(source,await fileHash(source));await fs.copyFile(source,path.join(root,id,name));}
      catch(e){if(e.code!=='ENOENT'||name.startsWith('01_')||name.startsWith('03_'))throw e;}
    }}
    p=await createBoundedRunner();await p.importPackages(root,SAMPLE_IDS.slice(0,-1).map(id=>({id})));await p.prepareQueries();
    if(process.env.HISTORY_TEST_TRACE)console.error('first compaction');
    const first=await p.compact();
    await p.importPackage(root,SAMPLE_IDS.at(-1));
    const before=(await p.fingerprint()).objects;
    const afterAppend=(await fs.stat(p.database)).size;
    for(let i=0;i<2;i++)await p.importPackage(root,SAMPLE_IDS.at(-1));
    assert.deepEqual((await p.fingerprint()).objects,before);
    if(process.env.HISTORY_TEST_TRACE)console.error('final compaction');
    const final=await p.compact();assert.ok(final.after_bytes<final.before_bytes,'Compaction must reduce the tested file');
    assert.deepEqual((await p.fingerprint()).objects,before);
    const built=await validationOperation(p.directory,'build',root);
    const compared=await validationOperation(p.directory,'compare');
    const control={peak_rss_bytes:Math.max(built.peak_rss_bytes,compared.peak_rss_bytes)},parity=compared.parity,controlBytes=built.bytes;
    assert.ok(final.after_bytes<controlBytes,'Final compact file must be smaller than equivalent v1 control');
    const repeat=await p.compact();assert.deepEqual((await p.fingerprint()).objects,before);
    const rollback=await p.recover({rollback:true});assert.deepEqual((await p.fingerprint()).objects,before);
    const parentPeak=process.resourceUsage().maxRSS*1024;
    const prototypePeak=parentPeak+Math.max(p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes);
    assert.ok(prototypePeak<768*1024**2,'Prototype workflow exceeded the 768 MiB conservative peak threshold');
    const wholePeak=parentPeak+Math.max(p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes,control.peak_rss_bytes);
    assert.ok(wholePeak<768*1024**2,'Complete validation exceeded the 768 MiB conservative peak threshold');
    return {status:'passed',snapshots:SAMPLE_IDS.length,source_files:hashes.size,first_seven:first,after_eighth_append_bytes:afterAppend,
      final_eight:final,v1_control_bytes:controlBytes,reduction_vs_v1_percent:100*(1-final.after_bytes/controlBytes),repeat,rollback,parity,
      no_op_twice:'Exact logical fingerprints unchanged, including import timestamps',source_hashes:'unchanged',
      parent_peak_rss_bytes:process.resourceUsage().maxRSS*1024,import_worker_peak_rss_bytes:p.stats.worker_peak_rss_bytes,file_worker_peak_rss_bytes:p.stats.file_worker_peak_rss_bytes,file_worker_count:p.stats.file_worker_count,control_worker_peak_rss_bytes:control.peak_rss_bytes,control_build:built,control_compare_peak_rss_bytes:compared.peak_rss_bytes,
      prototype_conservative_peak_rss_bytes:prototypePeak,prototype_peak_limit_bytes:768*1024**2,
      whole_test_conservative_peak_rss_bytes:wholePeak,whole_test_peak_limit_bytes:768*1024**2,
      memory_scope:'Complete workflow: imports, setup, copy audits, fingerprints, compaction, recovery, original v1 scan/build/audits, and full read/report comparison. Sequential child peaks plus controller peak.',
      limit:'Saved sample only; backup files are retained in the owned directory until test cleanup. No production promotion or full archive migration.'};
  }finally{try{for(const [file,hash] of hashes)assert.equal(await fileHash(file),hash);}finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={main};
