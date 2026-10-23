// Checked file replacement. The live database is never opened for writing here.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
const {regular,exists,noWal,withLease,assertLease}=require('./job-history-access');
const {fileHash}=require('./job-history-bounded-storage');
const runtime=require('./job-history-runtime');
const REPO=path.resolve(__dirname,'../..'),GiB=1024**3;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const journalPath=db=>db+'.history-operation.json';
function locations(db,id){
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid operation identity');
  return {directory:db+'.operations/'+id,backup:db+'.operations/'+id+'/before.duckdb',next:db+'.next-'+id};
}
function companions(db){
  const live=path.join(REPO,'data/jobs/history/jobs-history.duckdb');
  return {readme:path.join(path.dirname(db),'README.md'),validation:path.join(path.dirname(db),'validation.json'),
    report:db===live?path.join(REPO,'data/jobs/reports/jobs-history-report.md'):path.join(path.dirname(db),'jobs-history-report.md')};
}
async function syncDirectory(dir){const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function writeAtomic(file,body){
  await regular(file,{missing:true});await fs.mkdir(path.dirname(file),{recursive:true});const next=file+'.next-'+crypto.randomUUID();
  const h=await fs.open(next,'wx',0o600);try{await h.writeFile(body);await h.sync();}finally{await h.close();}
  await fs.rename(next,file);await syncDirectory(path.dirname(file));
}
async function copyChecked(from,to){
  await regular(from);await regular(to,{missing:true});const hash=await fileHash(from);
  await fs.copyFile(from,to,require('node:fs').constants.COPYFILE_EXCL);
  const h=await fs.open(to,'r');try{await h.sync();}finally{await h.close();}
  if(await fileHash(from)!==hash||await fileHash(to)!==hash)throw new Error('Backup/copy hash mismatch');
  await syncDirectory(path.dirname(to));return hash;
}
async function closed(database){
  if(!await exists(database))return;
  await regular(database);await noWal(database);if((await fs.stat(database)).nlink!==1)throw new Error('Database hard links are not writable');
  try{const r=await run('lsof',['-t','--',database]);if(r.stdout.trim())throw new Error('Close external database readers/writers before replacement');}
  catch(e){if(e.code===1&&!e.stdout&&!e.stderr)return;throw e;}
}
async function codeManifest(){
  const files={};
  async function walk(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('Runtime source symlink');
    if(e.isDirectory())await walk(file);else if(e.isFile())files[path.relative(REPO,file)]=await fileHash(file);
  }}
  await walk(path.join(REPO,'src'));
  for(const name of ['package.json','package-lock.json'])files[name]=await fileHash(path.join(REPO,name));return files;
}
async function diskGuard(database,{maxWorkingBytes=16*GiB,minFreeBytes=32*GiB,additionalPaths=[]}={}){
  if(maxWorkingBytes>16*GiB||minFreeBytes<32*GiB||!Number.isSafeInteger(maxWorkingBytes)||!Number.isSafeInteger(minFreeBytes))throw new Error('Resource limits cannot be increased');
  let bytes=0;async function walk(p){if(!await exists(p))return;const s=await fs.lstat(p);if(s.isSymbolicLink())throw new Error('Operation path symlink');if(s.isDirectory())for(const n of await fs.readdir(p))await walk(path.join(p,n));else bytes+=Math.max(s.size,s.blocks*512);}
  await walk(database+'.operations');for(const n of await fs.readdir(path.dirname(database)))if(n.startsWith(path.basename(database)+'.next-'))await walk(path.join(path.dirname(database),n));
  for(const extra of new Set(additionalPaths.map(p=>path.resolve(p))))await walk(extra);
  const s=await fs.statfs(path.dirname(database)),free=s.bavail*s.bsize;
  if(bytes>maxWorkingBytes||free<minFreeBytes)throw new Error('History disk guard exceeded');return {working_bytes:bytes,free_bytes:free};
}
async function prepareMigration({database,candidate,root,control,operationId=crypto.randomUUID()}){
  database=path.resolve(database);candidate=path.resolve(candidate);root=await fs.realpath(root);
  if(database===candidate||database===root||database.startsWith(root+path.sep))throw new Error('Invalid migration paths');
  return withLease(database,async()=>{
    await closed(database);await closed(candidate);
    const hashes={old:await fileHash(database),candidate:await fileHash(candidate)},code=await codeManifest();
    const oldFormat=await runtime.detect(database),newFormat=await runtime.detect(candidate);
    if(oldFormat==='absent'||newFormat==='absent')throw new Error('Migration needs two existing databases');
    if(oldFormat===newFormat)throw new Error('Migration must change between supported formats');
    const sources=await runtime.manifest(root),before=await runtime.inspect(database,root),after=await runtime.inspect(candidate,root);
    if(after.result.pending_snapshots.length)throw new Error('Candidate is missing source snapshots');
    const comparison=control?path.resolve(control):oldFormat==='v1'&&!before.result.pending_snapshots.length?database:newFormat==='v1'&&!before.result.pending_snapshots.length?candidate:null;
    if(!comparison)throw new Error('A complete v1 control is required for migration qualification');
    await closed(comparison);if(await runtime.detect(comparison)!=='v1')throw new Error('Control must use v1');
    const controlBefore=await fileHash(comparison);
    const peer=newFormat==='v1'?database:candidate;
    const parity=await runtime.worker('compare',[peer,comparison]);
    const oldIds=await runtime.openRead(database,async c=>(await require('./jobs-history').query(c,'SELECT snapshot_id FROM snapshots ORDER BY snapshot_id')).map(r=>r.snapshot_id));
    if(oldIds.some(id=>!sources.ids.includes(id)))throw new Error('Migration would lose snapshots');
    await runtime.verifyManifest(sources);
    if(await fileHash(database)!==hashes.old||await fileHash(candidate)!==hashes.candidate||await fileHash(comparison)!==controlBefore||digest(await codeManifest())!==digest(code))throw new Error('Qualification input changed');
    const location=locations(database,operationId);
    return {approved:false,database,candidate,root,operationId,backupPath:location.backup,control:comparison,controlHash:controlBefore,qualification:parity.result,oldFormat,newFormat,oldHash:hashes.old,newHash:hashes.candidate,sources,
      codeHash:digest(code),before:before.result,after:after.result};
  });
}
async function migrateHistory(approval,{at}={}){
  if(approval?.approved!==true)throw new Error('Explicit migration approval is required');
  const current=await prepareMigration(approval);
  for(const key of ['database','candidate','root','oldHash','newHash','oldFormat','newFormat','codeHash','sources','control','controlHash','operationId','backupPath'])if(JSON.stringify(current[key])!==JSON.stringify(approval[key]))throw new Error('Migration approval no longer matches '+key);
  return withLease(current.database,lease=>replaceHistory({...current,lease,kind:'migration',at}));
}
async function render(c,generatedAt){
  const {query}=require('./jobs-history'),{renderReport}=require('./jobs-history-report');
  return renderReport({metrics:await query(c,'SELECT * FROM historical_content_metrics'),roles:await query(c,'SELECT * FROM historical_role_metrics'),generatedAt}).markdown;
}
async function replaceHistory({database,candidate,root,sources,oldHash,newHash,codeHash,control,controlHash,operationId,lease,kind,at=async()=>{},limits}){
  database=path.resolve(database);candidate=path.resolve(candidate);await assertLease(lease,database);
  await closed(database);await closed(candidate);await diskGuard(database,limits);await runtime.verifyManifest(sources);
  if(newHash&&await fileHash(candidate)!==newHash)throw new Error('Approved candidate changed');
  if(codeHash&&digest(await codeManifest())!==codeHash)throw new Error('Approved runtime changed');
  if(controlHash&&await fileHash(control)!==controlHash)throw new Error('Approved control changed');
  if((await exists(database)?await fileHash(database):null)!==oldHash)throw new Error('Active database changed');
  const checked=await runtime.inspect(candidate,root);if(checked.result.pending_snapshots.length)throw new Error('Candidate is incomplete');
  const id=operationId||crypto.randomUUID(),loc=locations(database,id),targets=companions(database);
  await regular(loc.directory,{missing:true});await fs.mkdir(path.dirname(loc.directory),{recursive:true});await fs.mkdir(loc.directory);
  const j={version:1,id,database,root,kind,state:'preparing',oldHash,newHash:await fileHash(candidate),sources,companions:{},code:await codeManifest(),runtime:{node:process.version,duckdb:require('@duckdb/node-api/package.json').version},created_at:new Date().toISOString()};
  // All destination paths are derived locally; the journal never supplies paths.
  if(oldHash){if(await copyChecked(database,loc.backup)!==oldHash)throw new Error('Live backup differs');await runtime.inspect(loc.backup,root);}
  await at('backup');
  for(const [name,file] of Object.entries(targets)){
    const present=await exists(file),saved=path.join(loc.directory,'before-'+name);
    j.companions[name]={present,oldHash:present?await copyChecked(file,saved):null,newHash:null};
  }
  for(const [name,h] of Object.entries(j.code)){
    const target=path.join(loc.directory,'runtime',name);await fs.mkdir(path.dirname(target),{recursive:true});
    if(await copyChecked(path.join(REPO,name),target)!==h)throw new Error('Runtime changed during backup');
  }
  if(await copyChecked(candidate,loc.next)!==j.newHash)throw new Error('Candidate changed during copy');
  if(newHash&&j.newHash!==newHash)throw new Error('Approved candidate changed');
  if(codeHash&&digest(j.code)!==codeHash)throw new Error('Approved runtime changed');
  const validation=JSON.stringify({status:'passed',generation:id,database_sha256:j.newHash,source_manifest_hash:digest(sources),...checked.result},null,2)+'\n';
  const report=await runtime.openRead(loc.next,c=>render(c,j.created_at))+`\n<!-- history-generation: ${id}; database-sha256: ${j.newHash} -->\n`;
  const readme=`# Saved job history\n\nGeneration: ${id}\n\nFormat: ${checked.result.format}. Snapshots: ${checked.result.snapshots}.\n\nThe dated CSV packages remain the source of truth. Raw rows, resolved observations, good-job membership, and exceptions are separate.\n\nUse jobs:history-update, jobs:history-audit, and jobs:history-report. Updates use a staged copy and the shared history lock. Pending operations require explicit recovery.\n\nBackup and recovery details: ${loc.directory}\n\nSource warnings are retained in validation.json. Structural errors block acceptance. Reappearance does not prove an employer repost.\n`;
  for(const [name,body] of Object.entries({validation,report,readme})){
    const file=path.join(loc.directory,'after-'+name);await writeAtomic(file,body);j.companions[name].newHash=await fileHash(file);
  }
  await writeAtomic(path.join(loc.directory,'manifest.json'),JSON.stringify(j,null,2));
  await at('before_prepared');await diskGuard(database,limits);await closed(database);await runtime.verifyManifest(sources);
  if((await exists(database)?await fileHash(database):null)!==oldHash||await fileHash(loc.next)!==j.newHash||digest(await codeManifest())!==digest(j.code))throw new Error('Prepared input changed');
  for(const [name,file] of Object.entries(targets))if((await exists(file)?await fileHash(file):null)!==j.companions[name].oldHash)throw new Error('Companion changed during preparation');
  j.state='prepared';await writeAtomic(journalPath(database),JSON.stringify(j));await at('prepared');
  await fs.rename(loc.next,database);await syncDirectory(path.dirname(database));await at('renamed');
  j.state='replaced';await writeAtomic(journalPath(database),JSON.stringify(j));await at('replaced');
  const installed=await runtime.inspect(database,root);
  if(await fileHash(database)!==j.newHash||JSON.stringify(installed.result)!==JSON.stringify(checked.result))throw new Error('Installed generation differs');
  for(const [name,file] of Object.entries(targets)){
    if((await exists(file)?await fileHash(file):null)!==j.companions[name].oldHash)throw new Error('Companion changed before install');
    const saved=path.join(loc.directory,'after-'+name);if(await fileHash(saved)!==j.companions[name].newHash)throw new Error('Companion staging hash mismatch');
    await writeAtomic(file,await fs.readFile(saved));await at('companion_'+name);
  }
  await runtime.verifyManifest(sources);j.state='accepted';await writeAtomic(journalPath(database),JSON.stringify(j));
  await writeAtomic(path.join(loc.directory,'manifest.json'),JSON.stringify(j,null,2));await at('accepted');
  return {generation:id,backup:oldHash?loc.backup:null,format:checked.result.format,disk:await diskGuard(database,limits)};
}
async function recoverHistory(database,{rollback=false,at=async()=>{}}={}){
  database=path.resolve(database);
  return withLease(database,async lease=>{
    await closed(database);const file=journalPath(database);await regular(file);
    const j=JSON.parse(await fs.readFile(file,'utf8'));
    if(j.version!==1||j.database!==database||!['prepared','replaced','accepted','rolled_back','rolling_back'].includes(j.state))throw new Error('Invalid recovery record');
    const loc=locations(database,j.id),targets=companions(database);
    if(!/^[a-f0-9]{64}$/.test(j.newHash)||(j.oldHash!==null&&!/^[a-f0-9]{64}$/.test(j.oldHash)))throw new Error('Invalid recovery hashes');
    for(const name of Object.keys(targets)){
      const e=j.companions?.[name];if(!e||typeof e.present!=='boolean'||!(/^[a-f0-9]{64}$/).test(e.newHash)||(e.present?!(/^[a-f0-9]{64}$/).test(e.oldHash):e.oldHash!==null))throw new Error('Invalid companion record');
      for(const side of ['before','after'])if(await exists(path.join(loc.directory,side+'-'+name)))await regular(path.join(loc.directory,side+'-'+name));
    }
    if(j.oldHash)await regular(loc.backup);
    if(j.state==='accepted'){
      if(rollback)throw new Error('Accepted history requires a fully validated recovery candidate; refusing lossy rollback');
      if(await fileHash(database)!==j.newHash)throw new Error('Accepted database hash changed');
      for(const [name,file] of Object.entries(targets))if((await exists(file)?await fileHash(file):null)!==j.companions[name]?.newHash)throw new Error('Accepted companion changed');
      await runtime.inspect(database,j.root);
      return {state:'accepted',generation:j.id};
    }
    if(j.state==='rolled_back'){
      if((await exists(database)?await fileHash(database):null)!==j.oldHash)throw new Error('Restored database changed');
      for(const [name,file] of Object.entries(targets))if((await exists(file)?await fileHash(file):null)!==j.companions[name]?.oldHash)throw new Error('Restored companion changed');
      return {state:'rolled_back',generation:j.id};
    }
    const current=await exists(database)?await fileHash(database):null;
    if(![j.oldHash,j.newHash].includes(current))throw new Error('Unknown current hash; preserve files for review');
    if(j.oldHash&&await fileHash(loc.backup)!==j.oldHash)throw new Error('Rollback backup hash mismatch');
    for(const [name,file] of Object.entries(targets)){
      const entry=j.companions[name];if(!entry||typeof entry.present!=='boolean')throw new Error('Invalid companion record');
      const h=await exists(file)?await fileHash(file):null;
      if(![entry.oldHash,entry.newHash].includes(h))throw new Error('Companion changed; preserve for review');
      if(entry.present&&await fileHash(path.join(loc.directory,'before-'+name))!==entry.oldHash)throw new Error('Companion backup changed');
    }
    j.state='rolling_back';await writeAtomic(journalPath(database),JSON.stringify(j));
    if(current===j.newHash){
      const quarantine=path.join(loc.directory,'failed.duckdb');if(!await exists(quarantine))await copyChecked(database,quarantine);
      if(j.oldHash){const restored=path.join(loc.directory,'restore.duckdb');if(await exists(restored))await fs.unlink(restored);await copyChecked(loc.backup,restored);await fs.rename(restored,database);}
      else await fs.unlink(database);
      await syncDirectory(path.dirname(database));
    }
    await at('restored_database');
    for(const [name,file] of Object.entries(targets)){
      const entry=j.companions[name];if(entry.present)await writeAtomic(file,await fs.readFile(path.join(loc.directory,'before-'+name)));else if(await exists(file)){await fs.unlink(file);await syncDirectory(path.dirname(file));}
    }
    if(j.oldHash){if(await fileHash(database)!==j.oldHash)throw new Error('Restored hash differs');await runtime.inspect(database,j.root);}
    j.state='rolled_back';await writeAtomic(journalPath(database),JSON.stringify(j));await writeAtomic(path.join(loc.directory,'manifest.json'),JSON.stringify(j,null,2));
    return {state:'rolled_back',generation:j.id};
  },{recovery:true});
}
// Recovery after acceptance preserves all accepted snapshots. It only prepares
// a separate candidate; installation still needs a fresh approval record.
async function buildRecoveryCandidate({database,candidate,root}){
  database=path.resolve(database);candidate=path.resolve(candidate);root=await fs.realpath(root);
  if(candidate===database||candidate===root||candidate.startsWith(root+path.sep)||await exists(candidate))throw new Error('Recovery candidate needs a new path outside the archive');
  const result=await withLease(database,async()=>{
    await closed(database);if(await runtime.detect(database)!=='v2')throw new Error('Recovery build requires v2');
    const sources=await runtime.manifest(root),checked=await runtime.inspect(database,root),oldHash=await fileHash(database);
    if(checked.result.pending_snapshots.length)throw new Error('Recovery source must contain exactly the accepted snapshot inventory');
    const p=await require('./job-history-bounded-runner').createBoundedRunner();
    try{
      await fs.copyFile(database,p.database);
      await diskGuard(database,{additionalPaths:[p.directory]});
      const built=await require('../scripts/job-history-validation-control').validationOperation(p.directory,'build',root);
      runtime.stats.worker_peak_rss_bytes=Math.max(runtime.stats.worker_peak_rss_bytes,built.peak_rss_bytes);
      await diskGuard(database,{additionalPaths:[p.directory]});
      const parity=await runtime.worker('compare',[database,path.join(p.directory,'v1-control.duckdb')]);
      await runtime.verifyManifest(sources);if(await fileHash(database)!==oldHash)throw new Error('Accepted database changed');
      await regular(candidate,{missing:true});await fs.mkdir(path.dirname(candidate),{recursive:true});
      await copyChecked(path.join(p.directory,'v1-control.duckdb'),candidate);
      return {built,parity:parity.result};
    }finally{await p.dispose();}
  });
  return {...result,approval:await prepareMigration({database,candidate,root})};
}
module.exports={closed,buildRecoveryCandidate,writeAtomic,prepareMigration,migrateHistory,replaceHistory,recoverHistory,diskGuard,codeManifest,copyChecked,companions};
