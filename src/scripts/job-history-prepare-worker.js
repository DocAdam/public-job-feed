// Parse one capped source package, then exit before database writes and audits.
const fs=require('node:fs/promises');
const path=require('node:path');
const {owner}=require('../lib/job-history-prototype-owner');
const {preparePackage}=require('../lib/job-history-bounded-storage');
async function main(){
  const [ownedDirectory,ownerToken,root,id,working,nonce,limitsText,...extra]=process.argv.slice(2);
  if(extra.length||!limitsText||!nonce)throw new Error('Expected owned preparation request');
  const directory=await owner({ownedDirectory,ownerToken}),target=await fs.realpath(working);
  if(path.dirname(target)!==directory||!/^package-/.test(path.basename(target))||(await fs.lstat(working)).isSymbolicLink())throw new Error('Preparation must use an owned package directory');
  const check=async()=>{const lock=JSON.parse(await fs.readFile(path.join(directory,'writer.lock'),'utf8'));
    if(lock.pid!==process.ppid||lock.nonce!==nonce)throw new Error('Preparation parent lease mismatch');};
  await check();
  const prepared=await preparePackage(root,id,target,JSON.parse(limitsText));await check();
  return {prepared,peak_rss_bytes:process.resourceUsage().maxRSS*1024};
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
