// Shared access gate. Reads are serialized too: a file swap must have no readers.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const active=new WeakSet();
async function regular(file,{missing=false}={}){
  const absolute=path.resolve(file);
  let cursor=path.parse(absolute).root;
  for(const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,part);
    try{if((await fs.lstat(cursor)).isSymbolicLink()){
      const systemAlias=process.platform==='darwin'&&((cursor==='/var'&&await fs.realpath(cursor)==='/private/var')||(cursor==='/tmp'&&await fs.realpath(cursor)==='/private/tmp'));
      if(!systemAlias)throw new Error('History path contains a symlink');
    }}
    catch(e){if(e.code==='ENOENT'&&missing)return absolute;throw e;}
  }
  const s=await fs.stat(absolute);if(!s.isFile())throw new Error('History file must be regular');return absolute;
}
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function noWal(database){if(await exists(database+'.wal'))throw new Error('Pending WAL: close/recover the database before replacement');}
async function pending(database){
  const f=database+'.history-operation.json';if(!await exists(f))return;
  await regular(f);const j=JSON.parse(await fs.readFile(f,'utf8'));
  if(!['accepted','rolled_back'].includes(j.state))throw new Error('Unfinished history operation; explicit recovery required');
}
async function assertLease(lease,database){
  if(!active.has(lease)||lease.database!==path.resolve(database))throw new Error('Invalid history lease');
  const saved=JSON.parse(await fs.readFile(lease.database+'.history-lock','utf8'));
  if(saved.pid!==process.pid||saved.nonce!==lease.nonce)throw new Error('History lease changed');
}
async function withLease(database,fn,{lease,recovery=false}={}){
  database=path.resolve(database);
  if(lease){await assertLease(lease,database);return fn(lease);}
  await regular(database,{missing:true});
  await fs.mkdir(path.dirname(database),{recursive:true});
  const file=database+'.history-lock',guard=database+'.history-recovery-lock';let recoveryHandle;
  if(recovery){
    recoveryHandle=await fs.open(guard,'wx',0o600);
    try{
      if(await exists(file)){
        await regular(file);const old=JSON.parse(await fs.readFile(file,'utf8'));
        if(!Number.isSafeInteger(old.pid)||old.pid<=0||typeof old.nonce!=='string')throw new Error('Unknown lock owner; manual review required');
        try{process.kill(old.pid,0);throw new Error('History owner is still active');}catch(e){if(e.code!=='ESRCH')throw e;}
        if(JSON.parse(await fs.readFile(file,'utf8')).nonce!==old.nonce)throw new Error('History lease changed');
        await fs.unlink(file);
      }
    }catch(e){await recoveryHandle.close();await fs.unlink(guard);throw e;}
  }
  let handle,claim;
  try{
    if(!recovery&&await exists(guard))throw new Error('History recovery is active');
    handle=await fs.open(file,'wx',0o600);
    claim={database,nonce:crypto.randomUUID()};active.add(claim);
    await handle.writeFile(JSON.stringify({pid:process.pid,nonce:claim.nonce}));await handle.sync();
    if(!recovery)await pending(database);
    return await fn(claim);
  }finally{
    if(handle){await handle.close();await assertLease(claim,database);active.delete(claim);await fs.unlink(file);}
    if(recoveryHandle){await recoveryHandle.close();await fs.unlink(guard);}
  }
}
module.exports={regular,exists,noWal,pending,withLease,assertLease};
