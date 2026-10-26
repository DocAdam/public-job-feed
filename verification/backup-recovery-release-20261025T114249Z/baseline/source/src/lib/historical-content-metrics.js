const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { enrich } = require('./daily-jobs-review');
const { buildContentMetrics, compareMembership, roleChanges } = require('./content-metrics');
const { filterConfirmedUsRemote } = require('./us-remote-daily-report');
const { titleCategories } = require('./title-category');
const { parseRecordedTime } = require('./package-time');
const { parseCsvRecords } = require('./csv');
const q = value => `'${String(value).replace(/'/g, "''")}'`;
const read = async (c, sql) => (await c.runAndReadAll(sql)).getRowObjectsJson();
const object = value => typeof value === 'string' ? JSON.parse(value) : value;
const time = value => new Date(String(value).replace(' ', 'T').replace(/Z$/, '') + 'Z').getTime();
const columns = {
  snapshot_id:'VARCHAR PRIMARY KEY', observed_at:'TIMESTAMP', report_observed_at:'TIMESTAMP', time_source:'VARCHAR', definition_hash:'VARCHAR',
  raw_good_jobs:'INTEGER', duplicate_export_rows:'INTEGER', unmatched_good_job_rows:'INTEGER', unmatched_good_jobs:'INTEGER', good_jobs:'INTEGER',
  remote_jobs:'INTEGER', remote_share:'DOUBLE', hybrid_jobs:'INTEGER', hybrid_share:'DOUBLE', onsite_jobs:'INTEGER', onsite_share:'DOUBLE', unknown_work_arrangement_jobs:'INTEGER', unknown_work_arrangement_share:'DOUBLE',
  explicit_us_remote_jobs:'INTEGER', searchable_jobs:'INTEGER', searchable_text_coverage:'DOUBLE', ai_mentions:'INTEGER', ai_share:'DOUBLE', api_mentions:'INTEGER', api_share:'DOUBLE', docs_as_code_mentions:'INTEGER', docs_as_code_share:'DOUBLE',
  company_count:'INTEGER', catalog_slug_count:'INTEGER', ats_type_count:'INTEGER', weekly_baseline_snapshot_id:'VARCHAR', weekly_added:'INTEGER', weekly_removed:'INTEGER', weekly_net_change:'INTEGER', weekly_churn_count:'INTEGER', weekly_churn_rate:'DOUBLE',
};
function definitionHash() {
  const names = ['historical-content-metrics.js','content-metrics.js','daily-jobs-review.js','title-category.js','job-titles.js','company-key.js','us-remote-daily-report.js','package-time.js'];
  return crypto.createHash('sha256').update(names.map(name => fs.readFileSync(path.join(__dirname,name))).join('\n')).digest('hex');
}
function weeklyBaseline(current, snapshots) {
  const now = time(current.report_observed_at || current.observed_at);
  return snapshots.filter(s => s.snapshot_id < current.snapshot_id && time(s.report_observed_at || s.observed_at) < now && time(s.report_observed_at || s.observed_at) >= now - 7*86400000)
    .sort((a,b) => time(a.report_observed_at || a.observed_at)-time(b.report_observed_at || b.observed_at) || a.snapshot_id.localeCompare(b.snapshot_id))[0] || null;
}
function monthlyBaseline(current, snapshots) {
  const cutoff = time(current.observed_at)-30*86400000;
  return snapshots.filter(s => s.snapshot_id < current.snapshot_id && time(s.observed_at)<=cutoff)
    .sort((a,b)=>time(b.observed_at)-time(a.observed_at) || b.snapshot_id.localeCompare(a.snapshot_id))[0] || null;
}
function calculate(snapshot, good, details, baseline, baselineRows, exceptions) {
  const rows = enrich(good, details);
  const before = enrich(baselineRows || [], []);
  const daily = buildContentMetrics({ rows, baseline:before, weekly:compareMembership(rows,before), roles:roleChanges(rows,before), remoteSummary:{us:filterConfirmedUsRemote(good).length,international:0,unique:0,overlap:[]} });
  const metrics = { snapshot_id:snapshot.snapshot_id,observed_at:snapshot.observed_at,report_observed_at:snapshot.report_observed_at,time_source:snapshot.time_source,
    definition_hash:definitionHash(),raw_good_jobs:good.length,duplicate_export_rows:good.length-rows.length,unmatched_good_job_rows:exceptions.length,unmatched_good_jobs:enrich(exceptions,[]).length,good_jobs:rows.length,
    explicit_us_remote_jobs:daily.remoteAvailability.us,searchable_jobs:daily.textCoverage.searchable,searchable_text_coverage:daily.textCoverage.share,
    company_count:snapshot.company_count,catalog_slug_count:snapshot.catalog_slug_count,ats_type_count:snapshot.ats_type_count,
    weekly_baseline_snapshot_id:baseline?.snapshot_id || null,
    weekly_added:baseline ? daily.weeklyMovement.added : null,weekly_removed:baseline ? daily.weeklyMovement.removed : null,
    weekly_net_change:baseline ? daily.weeklyMovement.net : null,weekly_churn_count:baseline ? daily.weeklyMovement.churn : null,weekly_churn_rate:baseline ? daily.weeklyMovement.churnRate : null };
  for (const [name,key] of [['Remote','remote'],['Hybrid','hybrid'],['Onsite','onsite'],['Unknown','unknown_work_arrangement']]) {
    const arrangement=daily.marketOverview.arrangements.find(r=>r.name===name);metrics[`${key}_jobs`]=arrangement.count;metrics[`${key}_share`]=arrangement.share;
  }
  for (const [name,key] of [['AI mentions','ai'],['API mentions','api'],['Docs-as-code mentions','docs_as_code']]) {
    const topic=daily.topics.find(r=>r.name===name);metrics[`${key}_mentions`]=topic.count;metrics[`${key}_share`]=topic.share;
  }
  return {metrics,roles:titleCategories.map(role=>({snapshot_id:snapshot.snapshot_id,role_group:role,job_count:rows.filter(r=>r.category===role).length})),daily};
}
async function metricSnapshots(c) {
  const snapshots=await read(c,'SELECT * FROM snapshots ORDER BY snapshot_id');
  const artifacts=await read(c,"SELECT snapshot_id,file_name,content FROM source_artifacts WHERE file_name IN ('README_GSHEET_PACKAGE.md','00_start_here.csv')");
  return snapshots.map(s=>{
    const files=artifacts.filter(a=>a.snapshot_id===s.snapshot_id);
    const exact=parseRecordedTime(files.find(a=>a.file_name==='README_GSHEET_PACKAGE.md')?.content.match(/^Generated:\s*(.+)$/m)?.[1]);
    const csv=files.find(a=>a.file_name==='00_start_here.csv')?.content;
    const fallback=csv ? parseRecordedTime(parseCsvRecords(csv).rows[0]?.['Report Run Date']) : null;
    return {...s,report_observed_at:(exact||fallback)?.toISOString().replace('T',' ').replace('Z','') || s.observed_at,time_source:exact?'package_readme':fallback?'package_start_csv':'folder_time_no_zone'};
  });
}
async function loadPopulation(c,id) {
  const good=await read(c,`SELECT g.raw_values, g.matched_canonical_url_key, p.included_in_good_jobs FROM raw_good_job_rows g LEFT JOIN posting_observations p ON p.snapshot_id=g.snapshot_id AND p.canonical_url_key=g.matched_canonical_url_key WHERE g.snapshot_id=${q(id)} ORDER BY g.raw_row_number`);
  if(good.some(r=>r.matched_canonical_url_key && r.included_in_good_jobs!==true))throw new Error(`${id}: good-job membership mismatch`);
  const details=await read(c,`SELECT raw_values FROM raw_top_match_rows WHERE snapshot_id=${q(id)} ORDER BY raw_row_number`);
  const exceptions=await read(c,`SELECT raw_values FROM good_job_exceptions WHERE snapshot_id=${q(id)} ORDER BY raw_row_number`);
  if(exceptions.length!==good.filter(r=>!r.matched_canonical_url_key).length)throw new Error(`${id}: lost good-job exceptions`);
  return {good:good.map(r=>object(r.raw_values)),details:details.map(r=>object(r.raw_values)),exceptions:exceptions.map(r=>object(r.raw_values))};
}
async function refreshMetrics(c) {
  await c.run(`CREATE TABLE IF NOT EXISTS historical_content_metrics (${Object.entries(columns).map(([k,v])=>`${k} ${v}`).join(',')});
    CREATE TABLE IF NOT EXISTS historical_role_metrics (snapshot_id VARCHAR,role_group VARCHAR,job_count INTEGER,PRIMARY KEY(snapshot_id,role_group));`);
  const snapshots=await metricSnapshots(c), existing=await read(c,'SELECT snapshot_id,weekly_baseline_snapshot_id,definition_hash FROM historical_content_metrics');
  const version=definitionHash();let refreshed=0;
  for(const snapshot of snapshots){
    const baseline=weeklyBaseline(snapshot,snapshots),old=existing.find(r=>r.snapshot_id===snapshot.snapshot_id);
    if(old && old.definition_hash===version && old.weekly_baseline_snapshot_id===(baseline?.snapshot_id||null))continue;
    const pop=await loadPopulation(c,snapshot.snapshot_id);
    const before=baseline ? (await read(c,`SELECT raw_values FROM raw_good_job_rows WHERE snapshot_id=${q(baseline.snapshot_id)} ORDER BY raw_row_number`)).map(r=>object(r.raw_values)) : [];
    const result=calculate(snapshot,pop.good,pop.details,baseline,before,pop.exceptions);
    await c.run(`DELETE FROM historical_content_metrics WHERE snapshot_id=${q(snapshot.snapshot_id)}; DELETE FROM historical_role_metrics WHERE snapshot_id=${q(snapshot.snapshot_id)}`);
    await c.run(`INSERT INTO historical_content_metrics (${Object.keys(columns).join(',')}) VALUES (${Object.keys(columns).map(k=>result.metrics[k]===null?'NULL':q(result.metrics[k])).join(',')})`);
    for(const role of result.roles)await c.run(`INSERT INTO historical_role_metrics VALUES (${q(role.snapshot_id)},${q(role.role_group)},${role.job_count})`);
    refreshed++;
  }
  return refreshed;
}
async function auditMetrics(c) {
  const snapshots=await metricSnapshots(c),metrics=await read(c,'SELECT * FROM historical_content_metrics'),roles=await read(c,'SELECT * FROM historical_role_metrics');
  const errors=[];if(metrics.length!==snapshots.length)errors.push('Historical metric snapshot count mismatch');
  for(const s of snapshots){const m=metrics.find(r=>r.snapshot_id===s.snapshot_id),r=roles.filter(r=>r.snapshot_id===s.snapshot_id);
    if(!m || m.definition_hash!==definitionHash() || m.raw_good_jobs!==s.good_job_count || m.raw_good_jobs!==m.good_jobs+m.duplicate_export_rows || m.unmatched_good_job_rows!==s.unmatched_good_job_count || m.weekly_baseline_snapshot_id!==(weeklyBaseline(s,snapshots)?.snapshot_id||null) || r.length!==titleCategories.length || r.reduce((n,r)=>n+r.job_count,0)!==m.good_jobs)errors.push(`${s.snapshot_id}: historical metric integrity mismatch`);
  }
  if(roles.some(r=>!snapshots.some(s=>s.snapshot_id===r.snapshot_id)))errors.push('Orphan historical role metric');
  return errors;
}
module.exports={calculate,weeklyBaseline,monthlyBaseline,refreshMetrics,auditMetrics,metricSnapshots,loadPopulation,definitionHash};
