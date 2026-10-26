const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { query } = require('../lib/jobs-history');
const { boundedReader, LIMITS, FILES, fileHash } = require('../lib/job-history-bounded-storage');
const { createBoundedRunner } = require('../lib/job-history-bounded-runner');
const { installLifecycleViews, lifecycleEvents, lifecycleSummary } = require('../lib/job-history-lifecycle');
const { compareV1, SAMPLE_IDS } = require('./test-job-history-storage');
const { fixture, job, exported } = require('./test-job-history-lifecycle');
const run = promisify(execFile);
async function savedSample(parity = false) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'bounded-saved-test-')), root = path.join(temp,'snapshots');
  const source = path.resolve(__dirname,'../../data/jobs/gsheet-package'), hashes = new Map(); let p;
  const start = performance.now();
  try {
    for (const id of SAMPLE_IDS) {
      const folder=path.join(root,id); await fs.mkdir(folder,{recursive:true});
      for (const name of FILES) {
        const file=path.join(source,id,name); let hash;
        try { hash=await fileHash(file); } catch(error) { if(error.code==='ENOENT'&&!name.startsWith('03_')&&!name.startsWith('01_'))continue;throw error; }
        hashes.set(file,hash); await fs.copyFile(file,path.join(folder,name)); assert.equal(await fileHash(path.join(folder,name)),hash);
      }
    }
    p=await createBoundedRunner(); await p.importPackages(root,SAMPLE_IDS.map(id=>({id}))); await p.openQueries(); await installLifecycleViews(p.connection);
    const memoryAfterImport=process.memoryUsage();
    const buildMs=Math.round(performance.now()-start);
    const counts=(await query(p.connection,`SELECT
      (SELECT count(*) FROM history_v2_raw_rows) raw_rows,
      (SELECT count(*) FROM history_v2_observations) observations,
      (SELECT count(*) FROM history_v2_good_job_exceptions) exceptions,
      (SELECT count(*) FROM history_v2_text_blobs) text_values,
      (SELECT count(*) FROM history_v2_postings) postings,
      (SELECT count(*) FROM history_v2_content_versions) content_versions`))[0];
    assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number(v)])),{raw_rows:9775,observations:5175,exceptions:3,text_values:2228,postings:2402,content_versions:2998});
    const deepnote=await lifecycleSummary(p.connection,'shortlist','https://jobs.ashbyhq.com/deepnote/eb00d9b0-0dfc-4ff7-9aa4-19cf22e9644c');
    assert.equal(Number(deepnote.snapshots_seen),8); assert.equal(deepnote.presence_period_count,1); assert.equal(deepnote.content_change_count,0);
    let eventCount=0; for await(const event of lifecycleEvents(p.connection)) { assert.ok(event.event_id);eventCount++; }
    const memoryAfterEvents=process.memoryUsage();
    const parityResult=parity?await compareV1(root,temp,p,boundedReader):null;
    await p.connection.run('CHECKPOINT'); const storage=await query(p.connection,'PRAGMA database_size'); await p.close();
    return { mode:parity?'saved-parity':'saved-isolated',snapshot_count:8,counts,events:eventCount,deepnote,
      parity:parityResult,build_and_audit_ms:buildMs,closed_bytes:(await fs.stat(p.database)).size,stats:p.stats,
      peak_rss_bytes:process.resourceUsage().maxRSS*1024+p.stats.worker_peak_rss_bytes,
      parent_peak_rss_bytes:process.resourceUsage().maxRSS*1024,source_files_checked:hashes.size,limits:LIMITS,
      memory_after_import:memoryAfterImport,memory_after_events:memoryAfterEvents,database_storage:storage };
  } finally {
    try { for(const [file,hash]of hashes)assert.equal(await fileHash(file),hash); }
    finally { await p?.dispose(); await fs.rm(temp,{recursive:true,force:true}); }
  }
}
async function stress(snapshotCount) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-growth-test-')),root=path.join(temp,'snapshots');let p;
  const start=performance.now();
  try {
    p=await createBoundedRunner();
    for(let day=0;day<snapshotCount;day++) {
      const stamp=new Date(Date.UTC(2026,0,1+day)).toISOString(),id=stamp.slice(0,10).replaceAll('-','')+'-1200';
      const rows=Array.from({length:200},(_,i)=>({...job,CanonicalURLKey:`https://stress/${i}`,URL:`https://stress/${i}`,
        Description:`Snapshot ${day} posting ${i}: `+'abcdefgh '.repeat(900),FetchedAt:stamp}));
      await fixture(root,id,rows,rows.map(r=>({...exported,'Apply Link':r.URL})));
      await p.importPackage(root,id);
      // Each input package is disposable synthetic evidence, owned by this test.
      await fs.rm(path.join(root,id),{recursive:true,force:true});
    }
    await p.openQueries();await installLifecycleViews(p.connection);
    const expected=snapshotCount*200;
    assert.equal(Number((await query(p.connection,'SELECT count(*) n FROM history_v2_content_versions'))[0].n),expected);
    let changed=0;
    for await(const e of lifecycleEvents(p.connection,{stream:'shortlist'}))if(e.event_type==='content_changed')changed++;
    assert.equal(changed,(snapshotCount-1)*200);
    await p.connection.run('CHECKPOINT'); await p.close();
    return {mode:'stress',snapshot_count:snapshotCount,raw_rows:expected*2,unique_content_versions:expected,changed_events:changed,
      elapsed_ms:Math.round(performance.now()-start),closed_bytes:(await fs.stat(p.database)).size,stats:p.stats,
      peak_rss_bytes:process.resourceUsage().maxRSS*1024+p.stats.worker_peak_rss_bytes,
      parent_peak_rss_bytes:process.resourceUsage().maxRSS*1024,limits:LIMITS};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
async function main() {
  const mode=process.argv[2];
  if(mode==='--worker') {
    const type=process.argv[3];
    const result=type==='saved'?await savedSample(false):type==='small'?await stress(8):type==='large'?await stress(32):null;
    if(!result)throw new Error('Unknown isolated worker');console.log(JSON.stringify(result));return;
  }
  if(mode)throw new Error('No input or output database path is accepted');
  const parity=await savedSample(true),workers=[];
  for(const type of ['saved','small','large']) {
    const {stdout}=await run(process.execPath,['--max-old-space-size=256',__filename,'--worker',type],{maxBuffer:1024*1024});
    const result=JSON.parse(stdout); workers.push(result);
    assert.ok(result.peak_rss_bytes<768*1024**2,'Isolated worker exceeded the 768 MiB test threshold');
    assert.ok(result.stats.max_batch_rows<=LIMITS.batchRows);
    assert.ok(result.stats.max_batch_bytes<=Math.max(LIMITS.batchBytes,LIMITS.recordBytes));
  }
  assert.ok(workers[2].peak_rss_bytes-workers[1].peak_rss_bytes<256*1024**2,'4x input growth exceeded the 256 MiB growth threshold');
  console.log(JSON.stringify({status:'passed',parity,isolated_workers:workers,
    note:'One import worker per package, sequentially. Isolated benchmark parents use a 256 MiB V8 heap; import workers use 128 MiB; DuckDB uses a 192 MB setting. peak_rss_bytes is the conservative sum of parent peak and maximum child peak, which may occur at different times. RSS thresholds are test gates, not a hard OS memory limit. No full archive imported.'},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
