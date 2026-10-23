const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { query, runHistory, ident } = require('../lib/jobs-history');
const { createBoundedRunner } = require('../lib/job-history-bounded-runner');
const { installCompatibility, PUBLIC_OBJECTS } = require('../lib/job-history-sql-compatibility');
const { FILES, q, createBoundedPrototype } = require('../lib/job-history-bounded-storage');
const { compareObservationRows } = require('../lib/job-history-prototype-files');
const { validationOperation } = require('./job-history-validation-control');
const { renderReport } = require('../lib/jobs-history-report');
const { SAMPLE_IDS } = require('./test-job-history-storage');
const { fixture, job, exported } = require('./test-job-history-lifecycle');
const {compareSql}=require('../lib/job-history-parity');
async function savedSql() {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-sql-saved-')),root=path.join(temp,'snapshots');let p;
  try {
    for(const id of SAMPLE_IDS){await fs.mkdir(path.join(root,id),{recursive:true});for(const file of FILES){
      try{await fs.copyFile(path.resolve('data/jobs/gsheet-package',id,file),path.join(root,id,file));}
      catch(e){if(e.code!=='ENOENT'||file.startsWith('01_')||file.startsWith('03_'))throw e;}
    }}
    p=await createBoundedRunner();await p.importPackages(root,SAMPLE_IDS.map(id=>({id})));await p.prepareQueries();
    const built=await validationOperation(p.directory,'build',root);
    const first=await validationOperation(p.directory,'compare');
    const reopened=await validationOperation(p.directory,'compare');
    const peak=process.resourceUsage().maxRSS*1024+Math.max(p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes,built.peak_rss_bytes,first.peak_rss_bytes,reopened.peak_rss_bytes);
    assert.ok(peak<768*1024**2,'Saved SQL validation exceeded the 768 MiB conservative peak threshold');
    return {sample_ids:SAMPLE_IDS,...first.parity,reopen:'passed',control_build:built,
      compare_peak_rss_bytes:Math.max(first.peak_rss_bytes,reopened.peak_rss_bytes),conservative_peak_rss_bytes:peak};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
async function fixtureSql() {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-sql-fixture-')),root=path.join(temp,'snapshots');let p;
  try {
    p=await createBoundedRunner();await p.openQueries();await installCompatibility(p.connection);await p.close();
    const ids=['20260101-1200','20260103-1200','20260105-1200'];
    const descriptions=['\" / \\ \b \f \t\n漢字 🦆 \u2028 \u2029','B','C'];
    for(let i=0;i<ids.length;i++)await fixture(root,ids[i],[{...job,Company:i===2?'':'Example, Inc.',Title:i===0?'':'Changed title',Location:i===2?'':'Remote',Description:descriptions[i],SalaryMin:i?'125000':'bad',USRemoteEligible:i?'true':'unknown',PossibleDuplicate:'false',DedupeGroupSize:'3',SourceATSCount:'bad',NewField:'value', 'Numeric/Field~X':'punctuation'}],[exported,{...exported,'Apply Link':'https://fixture/exception'}]);
    // Insert an older run after a later run: the weekly baseline must refresh.
    await p.importPackage(root,ids[0]);await p.importPackage(root,ids[2]);await p.openQueries();
    assert.equal((await query(p.connection,`SELECT weekly_baseline_snapshot_id FROM historical_content_metrics WHERE snapshot_id=${q(ids[2])}`))[0].weekly_baseline_snapshot_id,ids[0]);await p.close();
    // Jan 1 is outside Jan 10's seven-day range. Late Jan 3 becomes its baseline.
    const later='20260110-1200';await fixture(root,later,[],[]);await p.importPackage(root,later);
    await p.importPackage(root,ids[1]);await p.openQueries();
    assert.equal((await query(p.connection,`SELECT weekly_baseline_snapshot_id FROM historical_content_metrics WHERE snapshot_id=${q(later)}`))[0].weekly_baseline_snapshot_id,ids[1]);
    if(process.env.HISTORY_TEST_TRACE)console.error('build control');
    const control=path.join(temp,'control.duckdb');await runHistory('build',{root,database:control});
    const result=await compareSql(p.connection,control);
    const life=(await query(p.connection,'SELECT * FROM posting_lifecycle'))[0];
    assert.equal(life.first_observed_title,null);assert.equal(life.latest_observed_title,'Changed title');
    assert.equal(life.first_observed_company,'Example, Inc.');assert.equal(life.latest_observed_company,null);
    assert.equal(life.latest_observed_location,null);assert.equal(Number(life.snapshots_seen),3);
    const stamps=await query(p.connection,'SELECT * FROM snapshots ORDER BY snapshot_id');await p.close();
    for(let i=0;i<2;i++)await p.importPackage(root,ids[1]);await p.openQueries();
    assert.deepEqual(await query(p.connection,'SELECT * FROM snapshots ORDER BY snapshot_id'),stamps);
    await compareSql(p.connection,control);
    return {...result,late_baseline_refresh:'passed',no_op_twice:'passed',empty_snapshot:'passed',special_json_and_types:'passed',lifecycle_null_endpoints:'passed',
      conservative_peak_rss_bytes:process.resourceUsage().maxRSS*1024+p.stats.worker_peak_rss_bytes};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
async function schemaOrderSql(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-sql-order-')),root=path.join(temp,'snapshots');let p;
  try{
    p=await createBoundedRunner();
    await fixture(root,'20260103-1200',[{...job,ZuluField:'first'}],[exported]);
    await p.importPackage(root,'20260103-1200');await p.openQueries();await installCompatibility(p.connection);await p.close();
    const control=path.join(temp,'control.duckdb');await runHistory('build',{root,database:control});
    await fixture(root,'20260101-1200',[{...job,AlphaField:'later column in older run'}],[exported]);
    await p.importPackage(root,'20260101-1200');await runHistory('update',{root,database:control});
    await p.openQueries();await compareSql(p.connection,control);
    return {result:'Incremental column order matches v1 after a late schema addition',
      conservative_peak_rss_bytes:process.resourceUsage().maxRSS*1024+p.stats.worker_peak_rss_bytes};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
async function metricRollbackSql(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'history-metric-rollback-')),root=path.join(temp,'snapshots');let p;
  try{
    p=await createBoundedPrototype();await installCompatibility(p.connection);
    await fixture(root,'20260101-1200',[job],[exported]);await p.importPackage(root,'20260101-1200');
    const state=async()=>Promise.all(['snapshots','historical_content_metrics','historical_role_metrics'].map(t=>query(p.connection,`SELECT * FROM ${t} ORDER BY ALL`)));
    const before=await state();
    await fixture(root,'20260102-1200',[{...job,Description:'New API and AI documentation'}],[{...exported,'Work Arrangement':'Onsite'}]);
    await assert.rejects(p.importPackage(root,'20260102-1200',{beforeCommit:()=>{throw new Error('Injected after metrics');}}),/Injected after metrics/);
    assert.deepEqual(await state(),before,'Rows and precomputed metrics roll back together');
    assert.deepEqual(await query(p.connection,"SELECT table_name FROM information_schema.tables WHERE table_catalog='temp' AND table_name IN ('snapshots','source_artifacts')"),[]);
    await p.importPackage(root,'20260102-1200');
    const control=path.join(temp,'control.duckdb');await runHistory('build',{root,database:control});await compareSql(p.connection,control);
    return {status:'passed',atomic_metric_rollback:'passed',temporary_scope_cleanup:'passed',retry_and_original_control:'passed',conservative_peak_rss_bytes:process.resourceUsage().maxRSS*1024};
  }finally{await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
async function main(){
  // Run the large saved-data phase before small fixtures retain native buffers.
  // Each phase includes its controller high-water mark and all of its workers.
  const saved=process.argv.includes('--fixtures-only')?null:await savedSql();
  const fixtures=await fixtureSql(),schema_order=await schemaOrderSql(),metric_rollback=await metricRollbackSql();
  const peak=Math.max(saved?.conservative_peak_rss_bytes||0,fixtures.conservative_peak_rss_bytes,schema_order.conservative_peak_rss_bytes,metric_rollback.conservative_peak_rss_bytes);
  assert.ok(peak<768*1024**2,'SQL validation phases exceeded the 768 MiB conservative peak threshold');
  return {status:'passed',fixtures,schema_order,metric_rollback,saved,whole_test_conservative_peak_rss_bytes:peak,
    memory_scope:'Maximum phase bound: controller high-water mark through that phase plus its largest worker. Saved data runs first; later fixture allocations cannot overlap its completed workers.'};
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={compareSql,savedSql,fixtureSql,schemaOrderSql};
