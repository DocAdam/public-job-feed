const fs=require('node:fs/promises');
const path=require('node:path');
const {historyReport}=require('../lib/jobs-history-report');
async function main(){
  const options={database:path.resolve('data/jobs/history/jobs-history.duckdb'),output:path.resolve('data/jobs/reports/jobs-history-report.md')};
  const args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){const key={'--database':'database','--output':'output'}[args[i]];if(!key||!args[i+1])throw new Error('Use --database PATH and/or --output PATH');options[key]=path.resolve(args[i+1]);}
  const archive=path.resolve('data/jobs/gsheet-package');
  if(options.output===options.database || options.output===archive || options.output.startsWith(archive+path.sep))throw new Error('Report output must be outside the source archive and database.');
  const report=await historyReport(options.database);
  await fs.mkdir(path.dirname(options.output),{recursive:true});
  await fs.writeFile(options.output,report.markdown);
  console.log(JSON.stringify({output:options.output,latest:report.current.snapshot_id,weekly:report.weekly?.snapshot_id||null,monthly:report.monthly?.snapshot_id||null,signals:report.signals},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
