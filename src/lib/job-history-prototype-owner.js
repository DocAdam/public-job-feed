// Shared ownership and exclusive lease for temporary prototype files only.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { FORMAT } = require('./job-history-storage');
async function owner(options) {
  const directory = await fs.realpath(options.ownedDirectory);
  if (path.dirname(directory)!==await fs.realpath(os.tmpdir()) || !path.basename(directory).startsWith('job-history-bounded-')) throw new Error('Not an owned temporary prototype');
  const marker=await fs.lstat(path.join(directory,'owner.json'));
  if(!marker.isFile()||marker.isSymbolicLink())throw new Error('Invalid prototype owner marker');
  const saved=JSON.parse(await fs.readFile(path.join(directory,'owner.json'),'utf8'));
  if(!options.ownerToken||saved.token!==options.ownerToken||saved.format!==FORMAT)throw new Error('Prototype owner token mismatch');
  for(const name of ['prototype.duckdb','prototype.duckdb.wal','operation.json']){
    let stat;try{stat=await fs.lstat(path.join(directory,name));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw new Error('Prototype path must be a regular file');
  }
  return directory;
}
async function lease(directory,{recover=false}={}) {
  // Serialize stale-lease recovery. A stopped recovery process leaves this
  // secondary lock for manual review instead of risking two active owners.
  if(recover){
    const file=path.join(directory,'recovery.lock');const guard=await fs.open(file,'wx',0o600);
    try{await guard.writeFile(JSON.stringify({pid:process.pid}));await guard.sync();return await acquire(directory,true);}
    finally{await guard.close();await fs.unlink(file);}
  }
  return acquire(directory,false);
}
async function acquire(directory,recover) {
  const file=path.join(directory,'writer.lock'),nonce=crypto.randomUUID();let handle;
  try{handle=await fs.open(file,'wx',0o600);}catch(e){
    if(e.code!=='EEXIST'||!recover)throw new Error('Prototype writer lease exists; close the owner or run explicit recovery');
    const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Invalid writer lease');
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    if(!Number.isSafeInteger(saved.pid)||saved.pid<=0||!saved.nonce)throw new Error('Invalid writer lease; manual review required');
    try{process.kill(saved.pid,0);throw new Error('Prototype writer is still alive');}catch(error){if(error.code!=='ESRCH')throw error;}
    // Only a dead process's well-formed lease can be removed. Recheck its token.
    if(JSON.parse(await fs.readFile(file,'utf8')).nonce!==saved.nonce)throw new Error('Writer lease changed');
    await fs.unlink(file);handle=await fs.open(file,'wx',0o600);
  }
  await handle.writeFile(JSON.stringify({pid:process.pid,nonce}));await handle.sync();await handle.close();
  let released=false;
  return async()=>{if(released)return;const saved=JSON.parse(await fs.readFile(file,'utf8'));if(saved.nonce!==nonce)throw new Error('Writer lease changed');await fs.unlink(file);released=true;};
}
async function pending(directory) {
  try{const journal=JSON.parse(await fs.readFile(path.join(directory,'operation.json'),'utf8'));if(journal.state!=='complete')throw new Error('Unfinished compaction; explicit recovery required');}
  catch(e){if(e.code!=='ENOENT')throw e;}
}
module.exports={owner,lease,pending};
