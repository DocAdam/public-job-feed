// One-time approved cleanup. Each phase must pass before the next phase starts.
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const root='/Users/adampugh/GitHub/public-job-feed';
const out=__dirname;
const {withLease}=require(path.join(root,'src/lib/job-history-access'));
function phase(mode){return new Promise((resolve,reject)=>{
 const child=spawn('python3',[path.join(out,'checks.py'),mode],{cwd:root,stdio:'inherit'});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(mode+' failed with exit '+code)));
});}
(async()=>{
 if(fs.existsSync(path.join(out,'execution-status.json')))throw new Error('One-time execution has already ended');
 await withLease(path.join(root,'data/jobs/history/jobs-history.duckdb'),async()=>{
  await phase('recover');
  await phase('cleanup');
  await phase('verify');
 });
 fs.writeFileSync(path.join(out,'execution-status.json'),JSON.stringify({status:'passed',finished_at:new Date().toISOString(),history_lease_released:true},null,2)+'\n',{flag:'wx'});
})().catch(error=>{
 fs.writeFileSync(path.join(out,'execution-failure.json'),JSON.stringify({status:'failed',at:new Date().toISOString(),message:error.message},null,2)+'\n',{flag:'wx'});
 console.error(error.message);process.exitCode=1;
});
