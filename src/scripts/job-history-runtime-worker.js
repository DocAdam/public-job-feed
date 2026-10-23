// Read-only bounded audit. It never opens an input database for writing.
const path=require('node:path');
const {openRead,detect,manifest,verifyManifest}=require('../lib/job-history-runtime');
const {query,summary}=require('../lib/jobs-history');
const {validate}=require('../lib/job-history-prototype-files');
const {auditMetrics}=require('../lib/historical-content-metrics');
const {FILES,q}=require('../lib/job-history-bounded-storage');
if(typeof global.gc==='function')setInterval(()=>global.gc(),50).unref();
let phase='start';
async function main(){
  const [op,database,root,...extra]=process.argv.slice(2);
  if(!['inspect','compare'].includes(op)||!database||!root||extra.length)throw new Error('Expected inspect DATABASE SOURCE or compare DATABASE CONTROL');
  if(op==='compare')return openRead(database,c=>require('../lib/job-history-parity').compareSql(c,root));
  const format=await detect(database),sources=await manifest(root);
  return openRead(database,async c=>{
    if(format==='v2'){try{await validate(c);}catch(e){throw new Error('Structural audit: '+e.message,{cause:e});}}
    else{const errors=await auditMetrics(c);if(errors.length)throw new Error(errors.join('\n'));}
    phase='snapshot inventory';const ids=(await query(c,'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')).map(r=>r.snapshot_id);
    if(format==='v2')for(const id of ids){
      const metadata=JSON.parse((await query(c,`SELECT metadata FROM history_v2_snapshots WHERE snapshot_id=${q(id)}`))[0].metadata);
      for(const [table,key] of [['posting_observations','resolved'],['raw_top_match_rows','top'],['raw_good_job_rows','good'],['good_job_exceptions','unmatched']]){
        if(Number((await query(c,`SELECT count(*) n FROM ${table} WHERE snapshot_id=${q(id)}`))[0].n)!==metadata[key])throw new Error('Public row preservation failure: '+id+'/'+table);
      }
      if((await query(c,`SELECT canonical_url_key FROM posting_observations WHERE snapshot_id=${q(id)} GROUP BY canonical_url_key HAVING count(*)<>1 OR nullif(trim(canonical_url_key),'') IS NULL LIMIT 1`)).length)throw new Error('Unresolved or missing canonical observation identity');
      if((await query(c,`SELECT 1 FROM posting_observations WHERE snapshot_id=${q(id)} AND nullif(trim(url),'') IS NULL LIMIT 1`)).length)throw new Error('Missing required observation URL');
    }
    const saved=[];
    for(const id of ids)for(const table of ['snapshot_files','source_artifacts'])try{saved.push(...await query(c,`SELECT snapshot_id,file_name,sha256 FROM ${table} WHERE snapshot_id=${q(id)}`));}catch(e){throw new Error(table+': '+e.message,{cause:e});}
    for(const id of ids){
      if(!sources.ids.includes(id))throw new Error('Stored source snapshot missing');
      for(const name of FILES){const row=saved.find(r=>r.snapshot_id===id&&r.file_name===name);
        if((row?.sha256||null)!==(sources.files[id+'/'+name]||null))throw new Error(`Source hash mismatch: ${id}/${name}`);
      }
    }
    phase='anomalies';const anomalies=[];
    for(const id of ids)anomalies.push(...await query(c,`SELECT snapshot_id,duplicate_canonical_row_count,unmatched_good_job_count FROM snapshots WHERE snapshot_id=${q(id)} AND (duplicate_canonical_row_count>0 OR unmatched_good_job_count>0)`));
    const warnings=[],variants={};
    for(const row of anomalies){
      if(row.duplicate_canonical_row_count)warnings.push(`${row.snapshot_id}: ${row.duplicate_canonical_row_count} duplicate canonical rows resolved; raw rows preserved`);
      if(row.unmatched_good_job_count)warnings.push(`${row.snapshot_id}: ${row.unmatched_good_job_count} unmatched good-job rows preserved as exceptions`);
    }
    for(const id of ids)for(const name of FILES.slice(2))if(!sources.files[id+'/'+name])warnings.push(`${id}: optional ${name} absent`);
    phase='headers';for(const id of ids)for(const row of await query(c,`SELECT snapshot_id,file_name,headers FROM snapshot_files WHERE snapshot_id=${q(id)} ORDER BY file_name`)){
      const h=typeof row.headers==='string'?row.headers:JSON.stringify(row.headers);((variants[row.file_name]||={})[h]||=[]).push(row.snapshot_id);
    }
    const header_variants=Object.fromEntries(Object.entries(variants).map(([file,v])=>[file,Object.entries(v).map(([h,ids])=>({headers:JSON.parse(h),snapshots:ids.length,first:ids[0],last:ids.at(-1)}))]));
    for(const [file,v] of Object.entries(header_variants))if(v.length>1)warnings.push(`${file}: ${v.length} header variants (union by name)`);
    phase='summary';const result={format,...await summary(c),errors:[],warnings,header_variants,pending_snapshots:sources.ids.filter(id=>!ids.includes(id))};
    await verifyManifest(sources);return result;
  });
}
main().then(result=>console.log(JSON.stringify({result,peak_rss_bytes:process.resourceUsage().maxRSS*1024}))).catch(e=>{console.error(phase,e);process.exitCode=1});
