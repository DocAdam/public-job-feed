// Compute prospective metrics before acquiring the import's write buffers.
// Persist the results in the SAME transaction as the new raw rows. All metric
// definitions, clock handling, and baseline selection use the existing helpers.
const {query,ident,observedAt}=require('./jobs-history');
const {metricSnapshots,weeklyBaseline,calculate,definitionHash,loadPopulation,auditMetrics}=require('./historical-content-metrics');
const {records,q,LIMITS}=require('./job-history-bounded-storage');
const METRIC_TABLES=['historical_content_metrics','historical_role_metrics'];
async function prepareMetrics(c,s,limits=LIMITS){
  const catalog=(await query(c,'SELECT current_database() AS name'))[0].name;
  const source=name=>`${ident(catalog)}.main.${ident(name)}`;
  for(const name of ['snapshots','source_artifacts'])if((await query(c,`SELECT 1 FROM information_schema.tables WHERE table_catalog='temp' AND table_name=${q(name)}`)).length)throw new Error('Temporary metric scope collision');
  const snapshotValues=[s.id,observedAt(s.id),s.top,s.good,s.top?s.good/s.top:null,s.companies,s.slugs,s.ats,null,s.top,s.resolved,s.duplicates,s.unmatched];
  const shape=await query(c,`DESCRIBE SELECT * FROM ${source('snapshots')}`);
  if(shape.length!==snapshotValues.length)throw new Error('Unexpected prospective snapshot schema');
  // Read large source metadata one snapshot at a time. The temporary scope
  // contains only the narrow values needed by the unchanged metric helpers.
  const saved=await storedMetricScope(c,catalog),incoming=Object.fromEntries(shape.map((r,i)=>[r.column_name,snapshotValues[i]]));
  saved.snapshots.push(incoming);
  saved.artifacts.push(...s.artifacts.filter(f=>['README_GSHEET_PACKAGE.md','00_start_here.csv'].includes(f.file))
    .map(f=>({snapshot_id:s.id,file_name:f.file,sha256:f.sha256,content:f.body})));
  const artifacts=saved.artifacts;
  const snapshots=await withMetricScopes(c,scopeEntries(saved),()=>metricSnapshots(c));
  const existing=await query(c,'SELECT snapshot_id,weekly_baseline_snapshot_id,definition_hash FROM historical_content_metrics');
  const version=definitionHash(),planned=[];
  let future;
  const futurePopulation=async()=>{
    if(future)return future;
    const rows=async file=>{const result=[];for await(const r of records(file,limits))result.push(JSON.parse(r.raw_values));return result;};
    future={good:await rows(s.goodStaged),details:await rows(s.rawStaged),exceptions:await rows(s.exceptionStaged)};
    return future;
  };
  for(const snapshot of snapshots){
    const baseline=weeklyBaseline(snapshot,snapshots),old=existing.find(r=>r.snapshot_id===snapshot.snapshot_id);
    if(old&&old.definition_hash===version&&old.weekly_baseline_snapshot_id===(baseline?.snapshot_id||null))continue;
    const pop=snapshot.snapshot_id===s.id?await futurePopulation():await loadPopulation(c,snapshot.snapshot_id);
    const before=!baseline?[]:baseline.snapshot_id===s.id?(await futurePopulation()).good:
      (await query(c,`SELECT raw_values FROM raw_good_job_rows WHERE snapshot_id=${q(baseline.snapshot_id)} ORDER BY raw_row_number`)).map(r=>typeof r.raw_values==='string'?JSON.parse(r.raw_values):r.raw_values);
    const result=calculate(snapshot,pop.good,pop.details,baseline,before,pop.exceptions);
    planned.push({metrics:result.metrics,roles:result.roles});
  }
  return {changes:planned,snapshots,shape,artifacts};
}
async function storeMetrics(c,planned){
  const columns={};
  for(const table of METRIC_TABLES)columns[table]=(await query(c,`DESCRIBE ${ident(table)}`)).map(r=>r.column_name);
  for(const result of planned){
    for(const [table,rows] of [[METRIC_TABLES[0],[result.metrics]],[METRIC_TABLES[1],result.roles]]){
      await c.run(`DELETE FROM ${ident(table)} WHERE snapshot_id=${q(result.metrics.snapshot_id)}`);
      const names=columns[table];
      const values=rows.map(row=>'('+names.map(k=>{
        if(row[k]===undefined)throw new Error(`Missing calculated metric ${k}`);
        return row[k]===null?'NULL':q(row[k]);
      }).join(',')+')').join(',');
      if(rows.length)await c.run(`INSERT INTO ${ident(table)} (${names.map(ident).join(',')}) VALUES ${values}`);
    }
  }
  return planned.length;
}
async function storedMetricScope(c,catalog){
  catalog ||= (await query(c,'SELECT current_database() AS name'))[0].name;
  const source=name=>`${ident(catalog)}.main.${ident(name)}`;
  const shape=await query(c,`DESCRIBE SELECT * FROM ${source('snapshots')}`),snapshots=[],artifacts=[];
  for(const {snapshot_id:id} of await query(c,`SELECT snapshot_id FROM ${source('snapshots')} ORDER BY snapshot_id`)){
    snapshots.push(...await query(c,`SELECT * FROM ${source('snapshots')} WHERE snapshot_id=${q(id)}`));
    artifacts.push(...await query(c,`SELECT snapshot_id,file_name,sha256,content FROM ${source('source_artifacts')}
      WHERE snapshot_id=${q(id)} AND file_name IN ('README_GSHEET_PACKAGE.md','00_start_here.csv')`));
  }
  return {snapshots,shape,artifacts};
}
function scopeEntries(plan){return [['snapshots',plan.snapshots,plan.shape],['source_artifacts',plan.artifacts,
  ['snapshot_id','file_name','sha256','content'].map(column_name=>({column_name,column_type:'VARCHAR'}))]];}
async function withStoredMetricScope(c,fn){return withMetricScopes(c,scopeEntries(await storedMetricScope(c)),fn);}
async function auditPlannedMetrics(c,plan){
  // Raw/run counts and source hashes are checked inside the same transaction.
  return withMetricScopes(c,scopeEntries(plan),()=>auditMetrics(c));
}
async function withMetricScopes(c,scopes,fn){
  for(const [name] of scopes)if((await query(c,`SELECT 1 FROM information_schema.tables WHERE table_catalog='temp' AND table_name=${q(name)}`)).length)throw new Error('Temporary metric audit collision');
  let failure;
  try{
    for(const [name,rows,shape] of scopes){
      const cast=(v,t)=>`CAST(${v===null?'NULL':q(v)} AS ${t})`;
      const select=rows.length?'SELECT * FROM (VALUES '+rows.map(r=>'('+shape.map(s=>cast(r[s.column_name],s.column_type)).join(',')+')').join(',')+') AS scoped('+shape.map(s=>ident(s.column_name)).join(',')+')':
        'SELECT '+shape.map(s=>cast(null,s.column_type)+' AS '+ident(s.column_name)).join(',')+' WHERE false';
      await c.run(`CREATE TEMP VIEW ${ident(name)} AS ${select}`);
    }
    return await fn();
  }catch(error){failure=error;throw error;}
  finally{try{await c.run('DROP VIEW IF EXISTS temp.main.source_artifacts; DROP VIEW IF EXISTS temp.main.snapshots');}catch(error){if(!failure)throw error;}}
}
module.exports={prepareMetrics,storeMetrics,auditPlannedMetrics,withStoredMetricScope};
