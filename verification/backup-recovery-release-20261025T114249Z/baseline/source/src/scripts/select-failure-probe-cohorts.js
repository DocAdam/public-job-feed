// Saved-data selection only. This script never imports or calls a network helper.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { fromRoot, writeJsonFile } = require('../lib/files');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function chooseCohorts(state, analysis, catalog) {
  const selected=[],used=new Set(),groups=[];
  const catalogByKey=new Map(catalog.map(x=>[x.BoardKey,x]));
  const add=(name,pool,n,diversity=x=>x.board_key)=>{
    const sorted=pool.filter(x=>!used.has(x.board_key)&&catalogByKey.has(x.board_key)).sort((a,b)=>hash(a.board_key).localeCompare(hash(b.board_key)));
    const choices=[],seen=new Set();
    for(const row of sorted){if(seen.has(diversity(row)))continue;choices.push(row);seen.add(diversity(row));if(choices.length===n)break;}
    if(choices.length<n)for(const row of sorted){if(!choices.includes(row))choices.push(row);if(choices.length===n)break;}
    for(const row of choices){selected.push({board_key:row.board_key,cohort:name});used.add(row.board_key);}
    groups.push({cohort:name,eligible:pool.length,selected:choices.length});
  };
  const failures=analysis.boards;
  const wd=failures.filter(x=>x.ats==='workday'&&x.http_status===422);
  const tenant=x=>(x.saved_workday_request||x.workday)?.tenant||'';
  add('workday_422_shard_tenant',wd.filter(x=>['wd1','wd3','wd5'].includes(tenant(x))),5,tenant);
  add('workday_422_normal_tenant_never',wd.filter(x=>!/^wd\d+$/.test(tenant(x))&&x.success_history==='never succeeded'),5,x=>x.workday?.host_segment);
  add('workday_422_previously_successful',wd.filter(x=>x.success_history==='previously succeeded'),5,x=>x.workday?.tenant);
  const successful=state.Boards.filter(x=>x.Active&&x.FetchEligible&&['GOOD_MATCHES_FOUND','JOBS_FOUND','FETCHED_EMPTY'].includes(x.CoverageStatus)).map(x=>({...x,board_key:x.BoardKey}));
  add('workday_currently_successful',successful.filter(x=>x.ATS==='workday'),5,x=>x.CatalogSlug.split('|')[1]);
  for(const history of ['never succeeded','previously succeeded']){
    add(`bamboohr_html_${history==='never succeeded'?'never':'previous'}`,failures.filter(x=>x.ats==='bamboohr'&&x.specific_error_class==='RESPONSE_PARSE_ERROR'&&x.success_history===history),3);
    add(`not_found_404_${history==='never succeeded'?'never':'previous'}`,failures.filter(x=>['ashby','greenhouse','lever'].includes(x.ats)&&x.http_status===404&&x.success_history===history),3,x=>x.ats);
  }
  add('icims_currently_successful',successful.filter(x=>x.ATS==='icims'),2);
  add('icims_failed',failures.filter(x=>x.ats==='icims'),2,x=>x.http_status);
  const unavailable={http_410:failures.filter(x=>x.http_status===410).length,
    icims_independent_source_urls:catalog.filter(x=>x.ATS==='icims'&&x.BoardURL).length,
    bamboohr_independent_source_urls:catalog.filter(x=>x.ATS==='bamboohr'&&x.BoardURL).length};
  return {selection_method:'Deterministic SHA-256 order of board key, with cohort diversity and no duplicate keys. This is a diagnostic sample, not a random prevalence estimate.',groups,unavailable,boards:selected};
}
async function main(){
  const inputs=[];
  const read=async file=>{const bytes=await fs.readFile(fromRoot(file));inputs.push({path:file,sha256:hash(bytes)});return JSON.parse(bytes);};
  const state=await read('data/jobs/state/board-state.json'),analysis=await read('data/jobs/reports/failure-analysis.json'),catalog=await read('data/catalogs/crawl/board-catalog.json');
  if(state.GeneratedAt!==analysis.state_generated_at)throw new Error('Refresh the saved-data failure analysis first.');
  const report={generated_at:new Date().toISOString(),state_generated_at:state.GeneratedAt,inputs,...chooseCohorts(state,analysis,catalog)};
  const output=fromRoot('data/jobs/reports/failure-probe-selection.json');
  await writeJsonFile(output,report);console.log(JSON.stringify({output,groups:report.groups,unavailable:report.unavailable,count:report.boards.length},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={chooseCohorts};
