// One owned prototype file operation per process. Exit releases native allocations.
const {compactPrototype,recoverPrototype,fingerprintPrototype}=require('../lib/job-history-prototype-files');
const {createBoundedPrototype}=require('../lib/job-history-bounded-storage');
const {installCompatibility}=require('../lib/job-history-sql-compatibility');
const {installLifecycleViews}=require('../lib/job-history-lifecycle');
// Release finished native query results while the bounded process is active.
if(typeof global.gc==='function')setInterval(()=>global.gc(),50).unref();
async function main(){
  const [ownedDirectory,ownerToken,operation,...extra]=process.argv.slice(2);
  if(!ownedDirectory||!ownerToken||extra.length||!['compact','recover','rollback','prepare','fingerprint'].includes(operation))throw new Error('Expected owned prototype, token, and a file operation');
  const options={ownedDirectory,ownerToken};
  let result;
  if(operation==='fingerprint')result=await fingerprintPrototype(options);
  else if(operation==='prepare'){
    const p=await createBoundedPrototype(options);
    try{
      await installCompatibility(p.connection);await installLifecycleViews(p.connection);result={prepared:true};
    }finally{await p.close();}
  }else result=operation==='compact'?await compactPrototype(options):await recoverPrototype(options,{rollback:operation==='rollback'});
  console.log(JSON.stringify({result,peak_rss_bytes:process.resourceUsage().maxRSS*1024}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
