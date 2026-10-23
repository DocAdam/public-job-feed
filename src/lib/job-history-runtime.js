// Permanent-path adapter. Import work still runs in token-owned temporary workers.
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
const {DuckDBInstance}=require('@duckdb/node-api');
const {withLease,regular,exists,noWal}=require('./job-history-access');
const {fileHash,DATABASE_OPTIONS,FILES}=require('./job-history-bounded-storage');
const {FORMAT,TABLES}=require('./job-history-storage');
const {query,discover}=require('./jobs-history');
const MiB=1024**2;
const stats={worker_peak_rss_bytes:0};
async function openRead(database,fn){
  await regular(database);const i=await DuckDBInstance.create(database,{...DATABASE_OPTIONS,access_mode:'READ_ONLY'});let c;
  try{c=await i.connect();return await fn(c);}finally{c?.closeSync();i.closeSync();}
}
async function detect(database){
  if(!await exists(database))return 'absent';
  return openRead(database,async c=>{
    const objects=await query(c,"SELECT table_name,table_type FROM information_schema.tables WHERE table_schema='main'");
    const table=n=>objects.some(o=>o.table_name===n&&o.table_type==='BASE TABLE');
    const view=n=>objects.some(o=>o.table_name===n&&o.table_type==='VIEW');
    const shape=async(name,expected)=>{
      const rows=await query(c,`DESCRIBE ${name}`);
      for(const [column,type] of expected)if(!rows.some(r=>r.column_name===column&&r.column_type===type))throw new Error('Unsupported history schema: '+name+'.'+column);
    };
    if(table('history_metadata')){
      const meta=await query(c,'SELECT format FROM history_metadata');
      if(meta.length!==1||meta[0].format!==FORMAT||!['history_v2_snapshots','history_v2_raw_rows','history_v2_observations','history_v2_manifests','history_v2_text_blobs'].every(table)||!['snapshots','posting_observations','raw_top_match_rows','raw_good_job_rows'].every(view))throw new Error('Unknown or mixed history schema');
      for(const [name,definition] of Object.entries(TABLES)){
        if(!table(name))throw new Error('Unknown or mixed history schema');
        await shape(name,[...definition.matchAll(/(?:^|, )(\w+) (VARCHAR|INTEGER|BOOLEAN|TIMESTAMP|DOUBLE)/g)].map(m=>[m[1],m[2]]));
      }
      for(const name of ['history_v2_runs','history_v2_layout','history_v2_columns','history_v2_payload_texts','history_v2_imports','history_v2_observation_attributes','history_v2_export_rows','history_v2_sql_columns'])if(!table(name))throw new Error('Incomplete v2 schema');
      if(JSON.stringify(await query(c,'SELECT version FROM history_v2_layout'))!==JSON.stringify([{version:3}]))throw new Error('Unsupported v2 layout');
      for(const name of require('./job-history-sql-compatibility').PUBLIC_OBJECTS)if(!objects.some(o=>o.table_name===name))throw new Error('Missing SQL interface');
      return 'v2';
    }
    if(objects.some(o=>o.table_name.startsWith('history_v2_'))||!['snapshots','posting_observations','raw_top_match_rows','raw_good_job_rows','good_job_exceptions','snapshot_files','source_artifacts'].every(table))throw new Error('Unknown or mixed history schema');
    for(const [name,columns] of [['snapshots',['snapshot_id','raw_top_match_row_count','resolved_observation_count']],['posting_observations',['snapshot_id','canonical_url_key','raw_values','selected_raw_row_number']]]){
      const shape=(await query(c,`DESCRIBE ${name}`)).map(r=>r.column_name);if(columns.some(n=>!shape.includes(n)))throw new Error('Unsupported history schema');
    }
    return 'v1';
  });
}
async function manifest(root){
  root=await fs.realpath(root);const found=await discover(root);
  if(found.malformed.length||!found.ids.length)throw new Error('Invalid history source inventory');
  const files={};
  for(const id of found.ids)for(const name of FILES){
    const file=path.join(root,id,name);
    if(!await exists(file)){if(name.startsWith('01_')||name.startsWith('03_'))throw new Error('Missing required source');continue;}
    await regular(file);files[id+'/'+name]=await fileHash(file);
  }
  return {root,ids:found.ids,files};
}
async function verifyManifest(saved){
  if(JSON.stringify(await manifest(saved.root))!==JSON.stringify(saved))throw new Error('Source hash or inventory changed');
}
async function worker(operation,args,{heap=128}={}){
  const {stdout}=await run(process.execPath,[`--max-old-space-size=${heap}`,'--expose-gc',path.join(__dirname,'../scripts/job-history-runtime-worker.js'),operation,...args],{maxBuffer:8*MiB});const result=JSON.parse(stdout);stats.worker_peak_rss_bytes=Math.max(stats.worker_peak_rss_bytes,result.peak_rss_bytes);return result;
}
async function inspect(database,root){return worker('inspect',[path.resolve(database),path.resolve(root)]);}
async function runHistory(mode,options={}){
  if(!['build','update','audit','compact'].includes(mode))throw new Error('Expected build, update, audit or compact');
  const database=path.resolve(options.database||'data/jobs/history/jobs-history.duckdb'),root=await fs.realpath(options.root||'data/jobs/gsheet-package');
  if(database===root||database.startsWith(root+path.sep))throw new Error('Database must be outside the snapshot archive');
  return withLease(database,async lease=>{
    const format=await detect(database);
    if(options.format&&!['v1','v2'].includes(options.format))throw new Error('Unknown requested format');
    if(format!=='absent'&&options.format&&options.format!==format)throw new Error('Format conversion requires an approved migration');
    if(mode!=='audit'&&format!=='absent')await require('./job-history-migration').closed(database);
    if(mode==='compact'&&format!=='v2')throw new Error('Compaction requires v2');
    if(format==='v1'||(format==='absent'&&options.format!=='v2'))return require('./jobs-history').runLegacyHistory(mode,{...options,root,database,lease});
    if(format==='absent'&&mode!=='build')throw new Error('History database does not exist');
    if(mode==='audit'){const result=(await inspect(database,root)).result;if(result.pending_snapshots.length)throw new Error('Source snapshots not imported');return {...result,mode};}
    await noWal(database);
    const sources=await manifest(root),oldHash=format==='absent'?null:await fileHash(database);
    const ids=format==='absent'?[]:await openRead(database,async c=>(await query(c,'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')).map(r=>r.snapshot_id));
    if(ids.some(id=>!sources.ids.includes(id)))throw new Error('Stored source snapshot is missing');
    if(format!=='absent')await inspect(database,root); // checks imported source bytes; permits new packages
    if(mode==='update'&&sources.ids.every(id=>ids.includes(id))){await verifyManifest(sources);return {...(await inspect(database,root)).result,mode,imported:0};}
    const {createBoundedRunner}=require('./job-history-bounded-runner');let p;
    try{
      p=await createBoundedRunner();
      const guard=()=>require('./job-history-migration').diskGuard(database,{additionalPaths:[p.directory]});
      await guard();
      if(mode==='update'||mode==='compact')await fs.copyFile(database,p.database);
      if(mode==='compact'){
        const compacted=await p.compact();await verifyManifest(sources);
        const installed=await require('./job-history-migration').replaceHistory({database,candidate:p.database,root,sources,oldHash,lease,kind:mode,at:options.at});
        return {...installed,mode,compacted,worker_stats:p.stats};
      }
      // A fresh build is private until replacement. Import raw history first,
      // then calculate metrics once on the complete candidate below. Updates
      // already have public views, so their row/metric transactions stay intact.
      for(const id of sources.ids)if(mode==='build'||!ids.includes(id)){
        await guard();await p.importPackage(root,id);await guard();if(options.afterImport)await options.afterImport(id);
      }
      await p.prepareQueries();await verifyManifest(sources);
      const checked=await inspect(p.database,root);
      const result=await require('./job-history-migration').replaceHistory({database,candidate:p.database,root,sources,oldHash,lease,kind:mode,at:options.at});
      return {...checked.result,mode,imported:mode==='build'?sources.ids.length:sources.ids.length-ids.length,generation:result.generation,worker_stats:p.stats};
    }finally{if(p)stats.worker_peak_rss_bytes=Math.max(stats.worker_peak_rss_bytes,p.stats.worker_peak_rss_bytes,p.stats.file_worker_peak_rss_bytes);await p?.dispose();}
  });
}
module.exports={stats,openRead,detect,manifest,verifyManifest,worker,inspect,runHistory};
