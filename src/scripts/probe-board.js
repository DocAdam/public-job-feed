const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { fromRoot, writeJsonFile, writeTextFile } = require('../lib/files');
const { MAX_BOARDS, MAX_REDIRECTS, selectBoards, buildRequest, probe } = require('../lib/board-probe');
const { safeUrl } = require('../lib/failure-diagnostics');
function parseArgs(args) {
  const result = { keys: [], limit:MAX_BOARDS, view:'adapter', dryRun:false };
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--dry-run') result.dryRun=true;
    else if(['--keys-file','--limit','--output-dir','--view'].includes(arg)) {
      const value=args[++i];if(!value || value.startsWith('--'))throw new Error(`Missing value for ${arg}`);
      if(arg==='--keys-file')result.keysFile=value;
      if(arg==='--limit')result.limit=Number(value);
      if(arg==='--output-dir')result.outputDir=value;
      if(arg==='--view')result.view=value;
    } else if(arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else result.keys.push(arg);
  }
  if(result.keysFile && result.keys.length)throw new Error('Use keys or a key file, not both.');
  if(!result.keysFile&&!result.keys.length)throw new Error('Usage: npm run jobs:probe-board -- <board-key> [<board-key> ...]');
  return result;
}
function markdown(report) {
  const cell=x=>String(x??'unknown').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
  const cohorts={};for(const row of report.results){const c=cohorts[row.cohort] ||= {probed:0,statuses:{}};c.probed++;const key=`${row.http_status ?? 'no response'} / ${row.specific_class}`;c.statuses[key]=(c.statuses[key]||0)+1;}
  return ['# Failure probe report (derived)','',`Run: ${report.run_id}`,`Status: ${report.status}`,`Started: ${report.started_at}`,`HTTP request attempts (including redirect hops): ${report.request_attempts.length}`,
    `Responses received: ${report.request_attempts.filter(x=>x.http_status).length}`, '',
    'Only explicit board keys were probed. One adapter page per board; at most two redirects. No retries. Results do not establish closure or replacement boards.', '',
    '## Cohorts','',...Object.entries(cohorts).map(([name,c])=>`- ${name}: ${c.probed}; ${Object.entries(c.statuses).map(([s,n])=>`${s}: ${n}`).join('; ')}`),'',
    '| Cohort | Board | HTTP | Classification | History | Conclusion |','| --- | --- | --- | --- | --- | --- |',
    ...report.results.map(r=>`| ${[r.cohort,r.board_key,r.http_status,r.specific_class,r.historical_success.status,r.conclusion.label].map(cell).join(' | ')} |`),'',
    'The JSON report includes request fields, bounded previews, redirect hops, source hashes, and per-request times.',''].join('\n');
}
async function main(args=process.argv.slice(2)) {
  const options=parseArgs(args), inputs=[];
  async function read(file){const buffer=await fs.readFile(file);inputs.push({path:path.relative(fromRoot(),file),sha256:crypto.createHash('sha256').update(buffer).digest('hex')});return JSON.parse(buffer);}
  const selection=options.keysFile ? await read(path.resolve(options.keysFile)) : options.keys;
  const catalog=await read(fromRoot('data/catalogs/crawl/board-catalog.json'));
  const chosen=selectBoards(Array.isArray(selection)?selection:selection.boards,catalog,options.limit);
  for(const {entry} of chosen)buildRequest(entry,options.view); // Validate the full plan before any request.
  console.log(`Selected ${chosen.length} explicit boards. Sequential requests; no retries; maximum ${chosen.length*(MAX_REDIRECTS+1)} HTTP attempts.`);
  for(const item of chosen)console.log(`${item.cohort}: ${item.entry.BoardKey}`);
  if(options.dryRun){console.log('Dry run: no network requests and no output writes.');return;}
  const state=await read(fromRoot('data/jobs/state/board-state.json'));
  const analysis=await read(fromRoot('data/jobs/reports/failure-analysis.json'));
  if(state.GeneratedAt!==analysis.state_generated_at)throw new Error('Failure analysis is stale. Run jobs:analyze-failures first.');
  const stateByKey=new Map(state.Boards.map(r=>[r.BoardKey,r])), failures=new Map(analysis.boards.map(r=>[r.board_key,r]));
  const raws=new Map();for(const ats of new Set(chosen.map(x=>x.entry.ATS)))raws.set(ats,await read(fromRoot(`data/catalogs/raw/${ats}_companies.json`)));
  const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8);
  const output=path.resolve(options.outputDir || fromRoot('data/jobs/reports'));
  const runDir=path.join(output,'failure-probes',runId);
  const report={schema_version:1,run_id:runId,status:'running',started_at:new Date().toISOString(),state_generated_at:state.GeneratedAt,
    selection:chosen.map(x=>({board_key:x.entry.BoardKey,cohort:x.cohort})),request_view:options.view,
    controls:{maximum_boards:MAX_BOARDS,maximum_redirects:MAX_REDIRECTS,concurrency:1,automatic_retries:0,one_page_only:true},
    inputs,request_attempts:[],results:[]};
  await writeJsonFile(path.join(runDir,'selection.json'),report.selection);
  const save=()=>writeJsonFile(path.join(runDir,'report.json'),report);
  await save();
  for(const {entry,cohort} of chosen){
    const saved=stateByKey.get(entry.BoardKey), failure=failures.get(entry.BoardKey);
    const result=await probe(entry,{view:options.view,onAttempt:async attempt=>{report.request_attempts.push({board_key:entry.BoardKey,...attempt});await save();}});
    // Copy completed attempt fields back into the durable request ledger.
    const start=report.request_attempts.length-result.attempts.length;
    result.attempts.forEach((a,i)=>Object.assign(report.request_attempts[start+i],a));
    result.cohort=cohort;
    result.historical_success={status:failure?.success_history || (saved?.LastSuccessAt?'previously succeeded':'no recorded success in state'),
      last_success_at:failure?.last_success_at || saved?.LastSuccessAt || null,
      successful_snapshot_count:failure?.successful_snapshot_count ?? null,
      basis:failure?'failure analysis joins history':'board state; count not enumerated', current_saved_status:saved?.CoverageStatus || null};
    const raw=(raws.get(entry.ATS)||[]).find(x=>typeof x==='string'?x===entry.CatalogSlug:x?.slug===entry.CatalogSlug);
    result.raw_catalog_entry=typeof raw==='string'?raw:raw?{slug:raw.slug,url:safeUrl(raw.url||raw.careerSiteUrl||raw.careersUrl)}:null;
    result.raw_source_url=typeof raw==='object'&&raw?safeUrl(raw.url||raw.careerSiteUrl||raw.careersUrl):null;
    report.results.push(result);await save();
    console.log(`${entry.BoardKey}: ${result.http_status??'no response'} ${result.specific_class}`);
    await new Promise(resolve=>setTimeout(resolve,750));
  }
  report.status='complete';report.completed_at=new Date().toISOString();
  await save();await writeTextFile(path.join(runDir,'report.md'),markdown(report));
  await writeJsonFile(path.join(output,'failure-probe-report.json'),report);
  await writeTextFile(path.join(output,'failure-probe-report.md'),markdown(report));
  console.log(`Saved ${report.results.length} board results; ${report.request_attempts.length} HTTP attempts. ${runDir}`);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={parseArgs,markdown,main};
