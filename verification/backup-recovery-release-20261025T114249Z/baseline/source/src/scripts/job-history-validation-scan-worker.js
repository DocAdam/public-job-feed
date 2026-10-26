// One original-parser package per child. Only the parent's owned stage is writable.
const fs=require('node:fs/promises');
const path=require('node:path');
const {owner}=require('../lib/job-history-prototype-owner');
const {scan,observedAt}=require('../lib/jobs-history');
const {FILES,LIMITS,fileHash}=require('../lib/job-history-bounded-storage');
async function main(){
  const [directory,token,root,id,nonce,...extra]=process.argv.slice(2);
  if(extra.length||!observedAt(id)||!nonce)throw new Error('Expected owned scan package');
  await owner({ownedDirectory:directory,ownerToken:token});
  const checkLease=async()=>{
    const lock=JSON.parse(await fs.readFile(path.join(directory,'writer.lock'),'utf8'));
    if(lock.pid!==process.ppid||lock.nonce!==nonce)throw new Error('Scan parent lease mismatch');
  };
  await checkLease();
  const stage=path.join(directory,'v1-stage'),input=path.join(stage,'input'),folder=path.join(input,id);
  await fs.mkdir(folder,{recursive:true});
  try{
    const info=await fs.lstat(path.join(root,id));
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Scan source must be a real directory');
    let bytes=0;const hashes=[];
    for(const file of FILES){
      const source=path.join(root,id,file),copy=path.join(folder,file);let stat;
      try{stat=await fs.lstat(source);}catch(e){if(e.code==='ENOENT'&&!file.startsWith('01_')&&!file.startsWith('03_'))continue;throw e;}
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Scan source must be a regular file');
      bytes+=stat.size;if(bytes>LIMITS.packageBytes)throw new Error('Validation package exceeds byte limit');
      const hash=await fileHash(source);await fs.copyFile(source,copy);
      if(await fileHash(copy)!==hash)throw new Error('Validation source changed while copying');
      hashes.push([source,hash]);
    }
    // Keep the original parser and scanner, independent of the prototype parser.
    const result=await scan(input,stage);
    for(const [source,hash] of hashes)if(await fileHash(source)!==hash)throw new Error('Validation source hash changed');
    await checkLease();
    return {...result,headers:[...result.headers],peak_rss_bytes:process.resourceUsage().maxRSS*1024};
  }finally{await fs.rm(input,{recursive:true,force:true});}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
