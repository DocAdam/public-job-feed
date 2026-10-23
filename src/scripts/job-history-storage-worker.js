// Internal worker. Requires the random owner token of a newly created prototype.
const { createBoundedPrototype } = require('../lib/job-history-bounded-storage');
async function main() {
  const [ownedDirectory,ownerToken,root,id,...extra]=process.argv.slice(2);
  if(!ownedDirectory||!ownerToken||!root||!id||extra.length)throw new Error('Expected owned prototype, token, source root, and one snapshot');
  let p,collector;
  try {
    p=await createBoundedPrototype({ownedDirectory,ownerToken,separatePreparation:true});
    if(typeof global.gc==='function')collector=setInterval(()=>global.gc(),50);
    const result=await p.importPackage(root,id);
    await p.close();
    console.log(JSON.stringify({result,stats:p.stats,peak_rss_bytes:Math.max(process.resourceUsage().maxRSS*1024,p.stats.preparation_bound_rss_bytes||0)}));
  }finally{clearInterval(collector);await p?.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
