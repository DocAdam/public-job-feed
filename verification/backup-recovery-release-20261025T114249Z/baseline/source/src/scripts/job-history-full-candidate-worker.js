// Explicit test worker. All writes are restricted to an owned temporary prototype.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {DuckDBInstance}=require('@duckdb/node-api');
const {owner,lease,pending}=require('../lib/job-history-prototype-owner');
const {createBoundedPrototype,fileHash,q}=require('../lib/job-history-bounded-storage');
const {query,discover}=require('../lib/jobs-history');
const {databaseOptions}=require('./job-history-validation-worker');
async function main(){
  const [operation,directory,token,control,...extra]=process.argv.slice(2);
  if(operation==='inventory'&&directory&&token&&!control){
    const instance=await DuckDBInstance.create(path.resolve(token),{...databaseOptions,access_mode:'READ_ONLY'});
    const c=await instance.connect();
    try{return {source:await discover(path.resolve(directory)),warehouse:{ids:await query(c,'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')}};}
    finally{c.closeSync();instance.closeSync();}
  }
  if(operation==='create'&&!directory){const p=await createBoundedPrototype();await p.close();return {directory:p.directory,token:p.ownerToken};}
  if(operation==='defer-metrics'&&directory&&token&&!control){
    const p=await createBoundedPrototype({ownedDirectory:directory,ownerToken:token});
    try{await p.connection.run('DROP VIEW IF EXISTS snapshots');return {bulk_build_only:true,query_preparation_required:true};}
    finally{await p.close();}
  }
  if(extra.length||!['compare','counts','state','control-info','report','lifecycle'].includes(operation)||(operation==='compare')!==Boolean(control))throw new Error('Expected compare with read-only control, state, counts, control-info, report, or lifecycle');
  await owner({ownedDirectory:directory,ownerToken:token});const release=await lease(directory);let instance,c;
  try{
    await pending(directory);
    const controlPath=path.join(directory,'v1-control.duckdb');
    if(['control-info','report'].includes(operation)){
      const ready=JSON.parse(await fs.readFile(path.join(directory,'v1-control.ready.json'),'utf8'));
      assert.equal(await fileHash(controlPath),ready.sha256,'Closed control completion hash');
    }
    instance=await DuckDBInstance.create(operation==='control-info'?controlPath:path.join(directory,'prototype.duckdb'),{...databaseOptions,access_mode:'READ_ONLY'});c=await instance.connect();
    if(operation==='state')return {directory:await fs.realpath(directory),ids:(await query(c,'SELECT snapshot_id FROM history_v2_snapshots ORDER BY snapshot_id')).map(r=>r.snapshot_id)};
    if(operation==='compare')return {parity:await require('./test-job-history-sql').compareSql(c,path.resolve(control))};
    if(operation==='lifecycle'){
      const {lifecycleEvents}=require('../lib/job-history-lifecycle'),ids=new Set(),counts={};
      for await(const e of lifecycleEvents(c)){
        assert.ok(!ids.has(e.event_id),'Unique lifecycle event identity');ids.add(e.event_id);
        const key=e.stream+':'+e.event_type;counts[key]=(counts[key]||0)+1;
        assert.equal(typeof e.time_uncertain,'boolean');assert.equal(typeof e.coverage_changed,'boolean');
        if(['content_changed','schema_changed'].includes(e.event_type))assert.ok(e.fields.length>0);
      }
      const expected=await query(c,`SELECT stream,count(DISTINCT subject_key) first_observed,
        count(*)-count(DISTINCT subject_key) reappeared,count(*) FILTER(WHERE first_absent_after_period IS NOT NULL) absent
        FROM history_presence_periods GROUP BY stream ORDER BY stream`);
      for(const row of expected){
        for(const key of ['first_observed','reappeared'])assert.equal(counts[row.stream+':'+key]||0,Number(row[key]));
        assert.equal(counts[row.stream+':'+(row.stream==='export'?'left_public_export':'absent_from_snapshot')]||0,Number(row.absent));
      }
      return {events:ids.size,counts,expected_boundaries:expected,unique_event_ids:'passed',page_rows:8};
    }
    if(operation==='report'){
      await c.run(`ATTACH ${q(controlPath)} AS control (READ_ONLY)`);
      const {renderReport}=require('../lib/jobs-history-report');
      const render=async prefix=>renderReport({metrics:await query(c,`SELECT * FROM ${prefix}.historical_content_metrics`),roles:await query(c,`SELECT * FROM ${prefix}.historical_role_metrics`),generatedAt:'fixed'}).markdown;
      assert.equal(await render('main'),await render('control'));return {report:'passed',snapshots:152};
    }
    // Separate scalar queries prevent multiple wide view plans from retaining
    // their intermediate joins at once merely to produce seven counts.
    const counts={};
    for(const [name,table,expression] of [
      ['snapshots','snapshots','count(*)'],['raw_top_rows','raw_top_match_rows','count(*)'],
      ['raw_good_rows','raw_good_job_rows','count(*)'],['observations','posting_observations','count(*)'],
      ['canonical_keys','posting_observations','count(DISTINCT canonical_url_key)'],
      ['job_keys','posting_observations','count(DISTINCT job_key)'],['exceptions','good_job_exceptions','count(*)']]){
      try{counts[name]=(await query(c,`SELECT ${expression} n FROM ${table}`))[0].n;}
      catch(e){throw new Error(`Count ${name}: ${e.message}`,{cause:e});}
    }
    if(operation==='control-info')return {counts,metric_errors:await require('../lib/historical-content-metrics').auditMetrics(c),completion_hash:'passed'};
    return {counts,
      endpoints:await query(c,"SELECT * FROM daily_market_metrics WHERE snapshot_id IN ('20260928-0552',(SELECT max(snapshot_id) FROM snapshots)) ORDER BY snapshot_id"),
      storage:(await query(c,`SELECT (SELECT count(*) FROM history_v2_text_blobs) text_blobs,
        (SELECT count(*) FROM history_v2_row_payloads) row_payloads,(SELECT count(*) FROM history_v2_content_versions) content_versions`))[0],
      lifecycle:await query(c,'SELECT stream,count(*) presence_periods,count(DISTINCT subject_key) subjects,sum(snapshots_seen) membership_observations FROM history_presence_periods GROUP BY stream ORDER BY stream'),
      anomalies:await query(c,'SELECT snapshot_id,raw_top_match_row_count,resolved_observation_count,duplicate_canonical_row_count,unmatched_good_job_count FROM snapshots WHERE duplicate_canonical_row_count>0 OR unmatched_good_job_count>0 ORDER BY snapshot_id')};
  }finally{c?.closeSync();instance?.closeSync();await release();}
}
if(require.main===module)main().then(result=>console.log(JSON.stringify({result,peak_rss_bytes:process.resourceUsage().maxRSS*1024}))).catch(e=>{console.error(e);process.exitCode=1});
