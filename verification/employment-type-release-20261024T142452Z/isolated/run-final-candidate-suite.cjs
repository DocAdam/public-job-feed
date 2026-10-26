const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const iso=__dirname, project=path.join(iso,'project'), original='/Users/adampugh/GitHub/public-job-feed';
const config=require(path.join(project,'package.json'));
const {executeTests}=require(path.join(project,'src/scripts/run-test-suite'));
const {packageIdentity}=require(path.join(project,'src/lib/package-status'));
const {randomUUID}=require('node:crypto');
async function main(){
 await fs.mkdir(path.join(iso,'final-candidate-test-logs'),{recursive:true});
 const runId='final-candidate-'+randomUUID();
 const results=await executeTests(config.testSuites,async name=>{
   const readOnlyConfiguration=name==='jobs:test-passive-launcher';
   const cwd=readOnlyConfiguration?original:project;
   const log=await fs.open(path.join(iso,'final-candidate-test-logs',name.replaceAll(':','-')+'.log'),'w');
   console.log(new Date().toISOString()+' START '+name+(readOnlyConfiguration?' [read-only original launcher configuration]':''));
   const child=spawn('npm',['run',name],{cwd,env:{...process.env,TMPDIR:path.join(iso,'tmp')+'/',NPM_CONFIG_CACHE:path.join(iso,'npm-cache'),NODE_OPTIONS:'--require='+path.join(iso,'offline-guard.cjs'),PJF_NETWORK_BLOCK_LOG:path.join(iso,'final-candidate-network-blocks.jsonl')},stdio:['ignore',log.fd,log.fd]});
   const outcome=await new Promise(resolve=>{child.once('error',e=>resolve({ExitCode:null,Error:e.message}));child.once('close',(code,signal)=>resolve({ExitCode:code,Signal:signal}));});
   await log.close();
   console.log(new Date().toISOString()+' END '+name+' '+outcome.ExitCode);
   return {...outcome,WorkingDirectory:cwd,Evidence:path.join(iso,'final-candidate-test-logs',name.replaceAll(':','-')+'.log'),SourcePopulation:readOnlyConfiguration?'current read-only repository launcher configuration':'isolated fixed data copy or offline fixtures, as defined by this test'};
 },async result=>fs.writeFile(path.join(iso,'final-candidate-suite-results.json'),JSON.stringify(result,null,2)+'\n'),{RunId:runId,PackageRun:await packageIdentity(path.join(project,'data/jobs/gsheet-package/latest')),Snapshot:project,NetworkPolicy:'OS deny network; Node calls fail before a request; writes confined to isolated directory'});
 console.log(JSON.stringify({Status:results.Status,Tests:results.Tests.length,FailedTest:results.FailedTest,RunId:runId}));
 if(results.Status!=='PASS')process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
