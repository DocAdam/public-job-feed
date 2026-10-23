const fs=require('node:fs/promises');
const path=require('node:path');
const {historyReport}=require('../lib/jobs-history-report');
async function main(){
  const options={database:path.resolve('data/jobs/history/jobs-history.duckdb'),output:path.resolve('data/jobs/reports/jobs-history-report.md')};
  const args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){const key={'--database':'database','--output':'output'}[args[i]];if(!key||!args[i+1])throw new Error('Use --database PATH and/or --output PATH');options[key]=path.resolve(args[i+1]);}
  const archive=path.resolve('data/jobs/gsheet-package');
  if(options.output===options.database || options.output===archive || options.output.startsWith(archive+path.sep))throw new Error('Report output must be outside the source archive and database.');
  await require('../lib/job-history-access').withLease(options.database,async lease=>{
  const report=await historyReport(options.database,undefined,{lease});
  await require('../lib/job-history-access').regular(options.output,{missing:true});
  await fs.mkdir(path.dirname(options.output),{recursive:true});
  const hash=await require('../lib/job-history-bounded-storage').fileHash(options.database);
  let generation='sha256:'+hash;
  try{const journal=JSON.parse(await fs.readFile(options.database+'.history-operation.json','utf8'));if(journal.state==='accepted'&&journal.newHash===hash)generation=journal.id;}catch(e){if(e.code!=='ENOENT')throw e;}
  await require('../lib/job-history-migration').writeAtomic(options.output,report.markdown+`\n<!-- history-generation: ${generation}; database-sha256: ${hash} -->\n`);
  console.log(JSON.stringify({output:options.output,latest:report.current.snapshot_id,weekly:report.weekly?.snapshot_id||null,monthly:report.monthly?.snapshot_id||null,signals:report.signals},null,2));
  });
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
