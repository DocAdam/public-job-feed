// Compaction and recovery are restricted to token-owned temporary prototypes.
// This is not a production cutover command.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { DuckDBInstance } = require('@duckdb/node-api');
const { owner, lease, pending } = require('./job-history-prototype-owner');
const { query, ident } = require('./jobs-history');
const { fileHash, auditIntegrity, q, DATABASE_OPTIONS } = require('./job-history-bounded-storage');
const { auditMetrics } = require('./historical-content-metrics');
async function syncDirectory(directory) {const h=await fs.open(directory,'r');try{await h.sync();}finally{await h.close();}}
async function writeJournal(directory,value) {
  const file=path.join(directory,'operation.next');const h=await fs.open(file,'w',0o600);
  try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}
  await fs.rename(file,path.join(directory,'operation.json'));await syncDirectory(directory);
}
async function open(file,readOnly=false) {
  const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Database must be an existing regular file');
  const instance=await DuckDBInstance.create(file,{...DATABASE_OPTIONS,...(readOnly?{access_mode:'READ_ONLY'}:{})});
  try{return {instance,c:await instance.connect(),close(){this.c.closeSync();this.instance.closeSync();}};}
  catch(error){instance.closeSync();throw error;}
}
async function objects(c,catalog) {
  return query(c,`SELECT table_name,table_type FROM information_schema.tables WHERE table_catalog=${q(catalog)} AND table_schema='main' ORDER BY table_name`);
}
const columnsContainRaw=shape=>shape.some(([name])=>name==='raw_values');
// Evaluate derived narrow views once. Re-running their history windows for
// each snapshot is costly; running two window plans together raises the peak.
// Temporary DuckDB tables can spill under the same fixed database memory limit.
async function stagedView(c,target,enabled,fn) {
  if(!enabled)return fn(target);
  const stage=ident('compact_compare_'+crypto.randomUUID().replaceAll('-',''));
  try{await c.run(`CREATE TEMP TABLE ${stage} AS SELECT * FROM ${target}`);return await fn(stage);}
  finally{await c.run(`DROP TABLE IF EXISTS ${stage}`);}
}
async function fingerprint(c,catalog,{resetConnection}={}) {
  catalog ||= (await query(c,'SELECT current_database() AS name'))[0].name;
  const result=[];
  for(const {table_name:name,table_type:kind} of await objects(c,catalog)) {
    if(resetConnection)c=await resetConnection();
    if(process.env.HISTORY_TEST_TRACE)console.error('fingerprint',name);
    const target=`${ident(catalog)}.main.${ident(name)}`;
    const shape=(await query(c,`DESCRIBE SELECT * FROM ${target}`)).map(r=>[r.column_name,r.column_type]);
    // The wide views are checked row-for-row by compareCopies. Their backing
    // tables are fingerprinted here. Re-serializing every wide row together
    // exceeds the fixed memory budget; SQL text also changes on DuckDB reopen.
    if(kind==='VIEW' && columnsContainRaw(shape)){
      result.push({name,kind,shape,rows:(await query(c,`SELECT count(*) n FROM ${target}`))[0].n});continue;
    }
    const partitions=shape.some(r=>r[0]==='snapshot_id') ? (await query(c,`SELECT snapshot_id FROM ${ident(catalog)}.main.history_v2_snapshots ORDER BY snapshot_id`)).map(r=>` WHERE snapshot_id=${q(r.snapshot_id)}`) : [''];
    const data=[];
    // Hash long text before JSON serialization. The row digest still covers
    // every named field, its order, NULL state, and exact string bytes. This
    // avoids allocating a second, JSON-escaped copy of every description.
    const hashedFields=shape.map(([name,type])=>`${ident(name)} := ${['VARCHAR','JSON'].includes(type)?`sha256(t.${ident(name)}::VARCHAR)`:`t.${ident(name)}`}`).join(',');
    await stagedView(c,target,kind==='VIEW'&&name!=='daily_market_metrics',async saved=>{
      for(const where of partitions)data.push((await query(c,`SELECT count(*) n, sha256(coalesce(string_agg(h,'' ORDER BY h),'')) hash FROM (SELECT sha256(to_json(struct_pack(${hashedFields}))::VARCHAR) h FROM ${saved} t${where})`))[0]);
    });
    result.push({name,kind,shape,data});
  }
  return result;
}
// Both copy audits and the independent v1 control use this exact comparison.
async function compareObservationRows(c,left,right,snapshots,columns,{resetConnection}={}){
  const keys=['snapshot_id','canonical_url_key'];
  for(const target of [left,right]){
    if((await query(c,`SELECT 1 FROM ${target} GROUP BY snapshot_id,canonical_url_key HAVING count(*)<>1 OR snapshot_id IS NULL OR canonical_url_key IS NULL LIMIT 1`)).length)throw new Error('Invalid wide observation identity');
    const outside=snapshots.length?`snapshot_id NOT IN (${snapshots.map(q).join(',')})`:'true';
    if((await query(c,`SELECT 1 FROM ${target} WHERE ${outside} LIMIT 1`)).length)throw new Error('Invalid wide observation snapshot');
  }
  const values=columns.filter(name=>!keys.includes(name));
  // Each exact comparison keeps the unique row identity. Stage one snapshot
  // and eight value columns so only one JSON transform and a narrow hash set
  // are live. Posting text stays in DuckDB, which can spill temporary data.
  const stage=ident('compact_compare_'+crypto.randomUUID().replaceAll('-',''));
  const rightStage=ident('compact_compare_'+crypto.randomUUID().replaceAll('-',''));
  for(const id of snapshots){
    if(resetConnection)c=await resetConnection();
    if(process.env.HISTORY_TEST_TRACE)console.error('compare observations',id);
    for(let i=0;i<values.length;i+=8){
    const projection=[...keys,...values.slice(i,i+8)].map(ident).join(',');
    try{
      await c.run(`CREATE TEMP TABLE ${stage} AS SELECT ${projection} FROM ${left} WHERE snapshot_id=${q(id)}`);
      await c.run(`CREATE TEMP TABLE ${rightStage} AS SELECT ${projection} FROM ${right} WHERE snapshot_id=${q(id)}`);
      const saved=`SELECT * FROM ${stage}`,copied=`SELECT * FROM ${rightStage}`;
      for(const [from,to] of [[saved,copied],[copied,saved]]){
        if(Number((await query(c,`SELECT count(*) n FROM (${from} EXCEPT ALL ${to})`))[0].n))throw new Error('Wide observation values differ');
      }
    }finally{await c.run(`DROP TABLE IF EXISTS ${rightStage}; DROP TABLE IF EXISTS ${stage}`);}
    }
  }
}
async function compareCopies(c,left,right,{resetConnection}={}) {
  const a=await objects(c,left),b=await objects(c,right);
  if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Compaction object inventory differs');
  for(const {table_name:name,table_type:kind} of a) {
    if(resetConnection)c=await resetConnection();
    if(process.env.HISTORY_TEST_TRACE)console.error('compare copy',name);
    const target=prefix=>`${ident(prefix)}.main.${ident(name)}`;
    const shape=async prefix=>(await query(c,`DESCRIBE SELECT * FROM ${target(prefix)}`)).map(r=>[r.column_name,r.column_type,r.null,r.key]);
    if(JSON.stringify(await shape(left))!==JSON.stringify(await shape(right)))throw new Error(`Compaction schema differs: ${name}`);
    if((await query(c,`SELECT count(*) n FROM ${target(left)}`))[0].n!==(await query(c,`SELECT count(*) n FROM ${target(right)}`))[0].n)throw new Error(`Compaction total count differs: ${name}`);
    const columns=await shape(left);
    if(name==='posting_observations'){
      const snapshots=(await query(c,`SELECT snapshot_id FROM ${ident(left)}.main.history_v2_snapshots ORDER BY snapshot_id`)).map(r=>r.snapshot_id);
      await compareObservationRows(c,target(left),target(right),snapshots,columns.map(r=>r[0]),{resetConnection});
      continue;
    }
    const partitions=columns.some(r=>r[0]==='snapshot_id') ? (await query(c,`SELECT snapshot_id FROM ${ident(left)}.main.history_v2_snapshots ORDER BY snapshot_id`)).map(r=>` WHERE snapshot_id=${q(r.snapshot_id)}`) : [''];
    const stage=kind==='VIEW'&&name!=='daily_market_metrics'&&!columnsContainRaw(columns);
    await stagedView(c,target(left),stage,async saved=>stagedView(c,target(right),stage,async copied=>{
      for(const where of partitions)for(const [from,to] of [[saved,copied],[copied,saved]]){
        const differences=Number((await query(c,`SELECT count(*) n FROM (SELECT * FROM ${from}${where} EXCEPT ALL SELECT * FROM ${to}${where})`))[0].n);
        if(differences)throw new Error(`Compaction data differs: ${name}`);
      }
    }));
  }
  const constraints=async catalog=>query(c,`SELECT table_name,constraint_type,constraint_text FROM duckdb_constraints() WHERE database_name=${q(catalog)} ORDER BY ALL`);
  if(JSON.stringify(await constraints(left))!==JSON.stringify(await constraints(right)))throw new Error('Compaction constraints differ');
  return a.length;
}
async function validate(c) {
  if(process.env.HISTORY_TEST_TRACE)console.error('validate integrity');
  await auditIntegrity(c);
  if((await query(c,"SELECT 1 FROM information_schema.views WHERE table_name='snapshots'")).length){
    const errors=await auditMetrics(c);if(errors.length)throw new Error(errors.join('\n'));
    for(const {snapshot_id:id} of await query(c,'SELECT snapshot_id FROM history_v2_snapshots ORDER BY snapshot_id')){
      if(Number((await query(c,`SELECT count(*) n FROM history_decoded_raw WHERE snapshot_id=${q(id)} AND sha256(raw_values::VARCHAR)<>raw_hash`))[0].n))throw new Error('SQL raw reconstruction mismatch');
    }
  }
}
async function readJournal(directory) {
  const j=JSON.parse(await fs.readFile(path.join(directory,'operation.json'),'utf8'));
  for(const key of ['candidate','backup']){
    if(!new RegExp(`^${key}-[a-f0-9-]+\\.duckdb$`).test(j[key]))throw new Error('Invalid recovery filename');
    const file=path.join(directory,j[key]);if(await exists(file)){
      const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Invalid recovery file');
    }
  }
  if(!['prepared','complete'].includes(j.state)||!j.old_hash||!j.new_hash)throw new Error('Invalid recovery journal');
  return j;
}
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function restore(directory,j) {
  const database=path.join(directory,'prototype.duckdb'),backup=path.join(directory,j.backup);
  if(await exists(database+'.wal') && (await fs.stat(database+'.wal')).size)throw new Error('Pending WAL; rollback refused until recovery and review');
  if(await exists(backup)) {
    if(await fileHash(backup)!==j.old_hash)throw new Error('Rollback hash mismatch; preserve files for review');
    if(await exists(database) && ![j.old_hash,j.new_hash].includes(await fileHash(database)))throw new Error('Current file changed; rollback refused');
    await fs.rename(backup,database);await syncDirectory(directory);
  }
  if(!await exists(database)||await fileHash(database)!==j.old_hash)throw new Error('Original file unavailable; preserve files for review');
  await fs.unlink(path.join(directory,'operation.json'));await syncDirectory(directory);
}
async function compactPrototype(options,{at=async()=>{}}={}) {
  const directory=await owner(options),release=await lease(directory);let db;
  const database=path.join(directory,'prototype.duckdb'),id=crypto.randomUUID();
  const candidate=`candidate-${id}.duckdb`,backup=`backup-${id}.duckdb`;
  try {
    await pending(directory);
    db=await open(database);await validate(db.c);await db.c.run('CHECKPOINT');
    const oldBytes=(await fs.stat(database)).size;
    await at('before_copy');
    await db.c.run(`ATTACH ${q(path.join(directory,candidate))} AS compacted`);
    const source=(await query(db.c,'SELECT current_database() AS name'))[0].name;
    await db.c.run(`COPY FROM DATABASE ${ident(source)} TO compacted (SCHEMA)`);
    // COPY's data order can violate foreign keys. Load parents first using the
    // actual constraint catalog; do not remove constraints for the copy.
    const tables=(await objects(db.c,source)).filter(r=>r.table_type==='BASE TABLE').map(r=>r.table_name);
    const dependencies=await query(db.c,`SELECT table_name,referenced_table FROM duckdb_constraints() WHERE database_name=${q(source)} AND constraint_type='FOREIGN KEY'`);
    const loaded=new Set();
    while(loaded.size<tables.length){
      const ready=tables.filter(t=>!loaded.has(t)&&dependencies.filter(d=>d.table_name===t).every(d=>loaded.has(d.referenced_table)));
      if(!ready.length)throw new Error('Compaction dependency cycle');
      for(const table of ready){await db.c.run(`INSERT INTO compacted.main.${ident(table)} SELECT * FROM ${ident(source)}.main.${ident(table)}`);loaded.add(table);}
    }
    await at('after_copy');
    await db.c.run('CHECKPOINT compacted');
    // Release the copy's index builders and write buffers before read audits.
    // Reopen both files read-only; neither comparison can alter copied values.
    await db.c.run('DETACH compacted');db.close();db=null;
    db=await open(database,true);
    await db.c.run(`ATTACH ${q(path.join(directory,candidate))} AS compacted (READ_ONLY)`);
    // Each relation gets a new database instance. This releases loaded indexes
    // and native result buffers from the previous relation's exact comparison.
    const comparedObjects=await compareCopies(db.c,source,'compacted',{resetConnection:async()=>{
      db.close();db=null;db=await open(database,true);
      await db.c.run(`ATTACH ${q(path.join(directory,candidate))} AS compacted (READ_ONLY)`);return db.c;
    }});
    await db.c.run('DETACH compacted');
    db.close();db=null;
    // Reopen the closed candidate before any source rename. This also catches
    // copied views that still bind to the source catalog.
    db=await open(path.join(directory,candidate),true);await validate(db.c);
    const checked=await fingerprint(db.c,undefined,{resetConnection:async()=>{
      db.close();db=null;db=await open(path.join(directory,candidate),true);return db.c;
    }});db.close();db=null;
    const journal={state:'prepared',candidate,backup,old_hash:await fileHash(database),new_hash:await fileHash(path.join(directory,candidate))};
    await writeJournal(directory,journal);await at('prepared');
    await fs.rename(database,path.join(directory,backup));await syncDirectory(directory);await at('old_renamed');
    await fs.rename(path.join(directory,candidate),database);await syncDirectory(directory);await at('promoted');
    db=await open(database,true);await validate(db.c);
    if(JSON.stringify(await fingerprint(db.c,undefined,{resetConnection:async()=>{
      db.close();db=null;db=await open(database,true);return db.c;
    }}))!==JSON.stringify(checked))throw new Error('Promoted file differs');
    db.close();db=null;
    await writeJournal(directory,{...journal,state:'complete'});await at('complete');
    return {before_bytes:oldBytes,after_bytes:(await fs.stat(database)).size,backup_bytes:(await fs.stat(path.join(directory,backup))).size,
      compared_objects:comparedObjects,closed_candidate_and_promoted_reopen:'passed',backup_retained:true};
  } finally {db?.close();await release();}
}
async function recoverPrototype(options,{rollback=false}={}) {
  const directory=await owner(options),release=await lease(directory,{recover:true});let db;
  try {
    let result='database_reopened';
    if(await exists(path.join(directory,'operation.json'))) {
      const j=await readJournal(directory);
      if(j.state!=='complete'||rollback){await restore(directory,j);result='previous_file_restored';}
    }else if(rollback)throw new Error('No rollback file recorded');
    db=await open(path.join(directory,'prototype.duckdb'));await validate(db.c);await db.c.run('CHECKPOINT');
    return {result};
  }finally{db?.close();await release();}
}
async function fingerprintPrototype(options){
  const directory=await owner(options),release=await lease(directory);let db;
  const database=path.join(directory,'prototype.duckdb');
  try{
    await pending(directory);db=await open(database,true);await validate(db.c);
    return {objects:await fingerprint(db.c,undefined,{resetConnection:async()=>{
      db.close();db=null;db=await open(database,true);return db.c;
    }})};
  }finally{db?.close();await release();}
}
module.exports={compactPrototype,recoverPrototype,fingerprintPrototype,fingerprint,compareCopies,compareObservationRows,validate};
