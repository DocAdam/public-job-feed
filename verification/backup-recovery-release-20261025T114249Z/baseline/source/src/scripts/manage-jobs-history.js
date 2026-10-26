// Maintenance commands require explicit paths. They have no live-path defaults.
const fs=require('node:fs/promises');
const path=require('node:path');
const migration=require('../lib/job-history-migration');
async function main(){
 const [mode,...args]=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const key={'--database':'database','--candidate':'candidate','--root':'root','--record':'record','--control':'control'}[args[i]];if(!key||!args[i+1]||options[key])throw new Error('Use explicit --database, --candidate, --root, and --record paths');options[key]=path.resolve(args[i+1]);}
 if(mode==='recovery-candidate'){
  if(!options.database||!options.candidate||!options.root||!options.record)throw new Error('recovery-candidate needs all four paths');
  const result=await migration.buildRecoveryCandidate(options);await require('../lib/job-history-access').regular(options.record,{missing:true});
  await fs.writeFile(options.record,JSON.stringify(result.approval,null,2)+'\n',{flag:'wx'});return {record:options.record,approved:false,checks:result.parity};
 }
 if(mode==='prepare'){
  if(!options.database||!options.candidate||!options.root||!options.record)throw new Error('prepare needs all four paths');
  if(options.record===options.database||options.record===options.candidate||options.record.startsWith(options.root+path.sep))throw new Error('Approval record must be separate from data');
  const result=await migration.prepareMigration(options);await require('../lib/job-history-access').regular(options.record,{missing:true});
  await fs.writeFile(options.record,JSON.stringify(result,null,2)+'\n',{flag:'wx'});return {record:options.record,approved:false};
 }
 if(mode==='apply'&&options.record&&Object.keys(options).length===1)return migration.migrateHistory(JSON.parse(await fs.readFile(options.record,'utf8')));
 if(mode==='recover'&&options.database&&Object.keys(options).length===1)return migration.recoverHistory(options.database);
 throw new Error('Expected prepare, apply --record PATH, or recover --database PATH');
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
