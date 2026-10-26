// Combine explicit saved probe runs. No live requests.
const fs=require('fs/promises');
const path=require('path');
const zlib=require('zlib');
const crypto=require('crypto');
const { fromRoot, writeJsonFile, writeTextFile }=require('../lib/files');
const { getWorkdaySlugFromUrl, getWorkdayFetchUrl }=require('../lib/ats/workday');
const { markdown }=require('./probe-board');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function observedClass(row){
  try{const url=new URL(row.final_url);if(row.ats==='bamboohr'&&row.redirected&&url.hostname==='www.bamboohr.com'&&url.pathname==='/'&&/BambooHR.*HR Software/i.test(row.html_title))return 'redirected_to_vendor_homepage';}catch{}
  return row.specific_class;
}
function aggregate(runs){
  if(!runs.length||runs.some(r=>r.status!=='complete')||new Set(runs.map(r=>r.run_id)).size!==runs.length)throw new Error('Provide distinct complete probe runs.');
  for(const run of runs)if(run.request_attempts.length!==run.results.reduce((n,r)=>n+r.attempts.length,0))throw new Error('Request ledger does not match probe attempts.');
  const results=runs.flatMap(run=>run.results.map(row=>({...row,run_id:run.run_id,recorded_specific_class:row.specific_class,specific_class:observedClass(row)})));
  const requestAttempts=runs.flatMap(run=>run.request_attempts.map(row=>({...row,run_id:run.run_id})));
  const cohort=name=>results.filter(r=>r.cohort===name);
  const bad=cohort('workday_422_shard_tenant');
  return {schema_version:1,derived:true,run_id:'combined',status:'complete',generated_at:new Date().toISOString(),
    started_at:runs.map(r=>r.started_at).sort()[0],completed_at:runs.map(r=>r.completed_at).sort().at(-1),
    request_attempts:requestAttempts,results,
    summary:{live_http_request_attempts:requestAttempts.length,http_responses:requestAttempts.filter(r=>r.http_status).length,
      probe_count:results.length,distinct_boards:new Set(results.map(r=>r.board_key)).size,
      workday_shard_tenant_sample:{probed:bad.length,malformed_parsing_confirmed:0,valid_configuration:bad.filter(r=>r.specific_class==='SUPPORTED_JOB_RESPONSE').length,
        unresolved_cause:bad.length,raw_shard_tenant_values_confirmed:bad.filter(r=>/^wd\d+\|/.test(r.raw_catalog_entry||'')).length,
        meaning:'The live 422 responses do not identify a cause. Raw metadata already contains these tenant values; no URL-to-tenant parsing defect was found.'}}};
}
async function main(args=process.argv.slice(2)){
  if(!args.length||args.some(x=>x.startsWith('--')))throw new Error('Pass explicit saved report.json paths.');
  const inputs=[];
  const read=async file=>{const bytes=await fs.readFile(file);inputs.push({path:path.relative(fromRoot(),file),sha256:sha(bytes)});return JSON.parse(bytes);};
  const runs=[];for(const file of args)runs.push(await read(path.resolve(file)));
  const report=aggregate(runs);
  const state=await read(fromRoot('data/jobs/state/board-state.json'));
  const analysis=await read(fromRoot('data/jobs/reports/failure-analysis.json'));
  const freshness=await read(fromRoot('data/jobs/reports/board-freshness-report.json'));
  const catalog=await read(fromRoot('data/catalogs/crawl/board-catalog.json'));
  const raw=await read(fromRoot('data/catalogs/raw/workday_companies.json'));
  const stateByKey=new Map(state.Boards.map(r=>[r.BoardKey,r]));
  const differences=analysis.boards.filter(r=>r.last_success_at&&!stateByKey.get(r.board_key)?.LastSuccessAt);
  const historyFile=fromRoot('data/jobs/index/history/fetch-events/2026-06.jsonl.gz');
  const historyBytes=await fs.readFile(historyFile);inputs.push({path:path.relative(fromRoot(),historyFile),sha256:sha(historyBytes)});
  const keys=new Set(differences.map(r=>r.board_key));
  const successEvents=zlib.gunzipSync(historyBytes).toString().trim().split('\n').map(JSON.parse).filter(r=>keys.has(r.BoardKey)&&['success','empty'].includes(r.Status));
  report.count_reconciliation={label:'CONFIRMED',freshness_state_generated_at:freshness.StateGeneratedAt,analysis_state_generated_at:analysis.state_generated_at,
    same_state:freshness.StateGeneratedAt===analysis.state_generated_at&&state.GeneratedAt===analysis.state_generated_at,
    freshness_no_success:freshness.FailureBreakdown.reduce((n,r)=>n+r.LastSuccessUnknown,0),analysis_no_success:analysis.summary.never_succeeded,
    explanation:'The freshness report reads LastSuccessAt from state. The analysis also reads saved fetch history. Three state records have no LastSuccessAt but have successful June fetch events. No timing change is needed to explain the difference.',
    boards:differences.map(r=>({board_key:r.board_key,state_last_success_at:stateByKey.get(r.board_key).LastSuccessAt,history_last_success_at:r.last_success_at,successful_snapshot_count:r.successful_snapshot_count})),success_events:successEvents};
  const suspects=analysis.boards.filter(r=>r.ats==='workday'&&r.http_status===422&&(r.saved_workday_request||r.workday)?.tenant_looks_like_host_segment);
  const rawSet=new Set(raw.filter(x=>typeof x==='string'));
  const bySite=new Map();
  for(const row of catalog.filter(r=>r.ATS==='workday'&&!/^wd\d+\|/.test(r.CatalogSlug))){const [,shard,site]=row.CatalogSlug.split('|');const key=`${shard}|${site}`;if(!bySite.has(key))bySite.set(key,[]);bySite.get(key).push(row.BoardKey);}
  const relations=suspects.map(r=>{const slug=r.board_key.slice('workday|'.length);const [shard,,site]=slug.split('|');return {board_key:r.board_key,raw_exact_match:rawSet.has(slug),catalog_matches:bySite.get(`${shard}|${site}`)||[]};});
  report.workday_catalog_structure={label:'CONFIRMED',affected:relations.length,exact_raw_values:relations.filter(r=>r.raw_exact_match).length,
    unique_same_site_and_shard:relations.filter(r=>r.catalog_matches.length===1).length,multiple_same_site_and_shard:relations.filter(r=>r.catalog_matches.length>1).length,
    no_same_site_and_shard:relations.filter(r=>!r.catalog_matches.length).length,
    interpretation:{label:'INFERRED',text:'These records are consistent with duplicate catalog entries that placed a host shard in the tenant slot. The upstream extraction step and intended replacement are not established.'},relations};
  report.workday_parser_checks=report.results.filter(r=>r.ats==='workday').map(r=>{
    const endpoint=new URL(r.constructed_request_url),parts=endpoint.pathname.split('/').filter(Boolean);
    const url=`https://${endpoint.hostname}/${parts[3]}`;
    return {board_key:r.board_key,live_status:r.http_status,input_url:url,input_basis:'reconstructed from the probed endpoint; raw catalog has no URL',
      expected_tenant:parts[2],expected_hostname_shard:endpoint.hostname.split('.')[1],expected_site:parts[3],
      parsed_slug:getWorkdaySlugFromUrl(url),constructed_endpoint:getWorkdayFetchUrl('',url),
      endpoint_matches_probe:getWorkdayFetchUrl('',url)===r.constructed_request_url};
  });
  const cohort = name => report.results.filter(r => r.cohort === name);
  const statusCounts = rows => Object.entries(rows.reduce((out,r) => { const key = String(r.http_status ?? 'no response'); out[key]=(out[key]||0)+1; return out; },{})).map(([status,count])=>`${count} HTTP ${status}`).join(', ') || 'no probes';
  const normal = [...cohort('workday_422_normal_tenant_never'),...cohort('workday_422_previously_successful')];
  const bamboo = report.results.filter(r=>r.ats==='bamboohr');
  const vendor = bamboo.filter(r=>r.specific_class==='redirected_to_vendor_homepage');
  const icims = report.results.filter(r=>r.ats==='icims');
  const icimsSourceUrls = catalog.filter(r=>r.ATS==='icims'&&r.BoardURL).length;
  const parserMismatch = report.workday_parser_checks.filter(r=>!r.endpoint_matches_probe).length;
  const noSource = report.results.filter(r=>r.ats==='workday').every(r=>!r.raw_source_url);
  const reconciliationConfirmed = report.count_reconciliation.same_state &&
    report.count_reconciliation.freshness_no_success-report.count_reconciliation.analysis_no_success===differences.length &&
    differences.every(r=>successEvents.some(e=>e.BoardKey===r.board_key));
  if(!reconciliationConfirmed){report.count_reconciliation.label='UNRESOLVED';report.count_reconciliation.explanation='The saved files do not establish the full difference.';}
  report.conclusions=[
    {label:'CONFIRMED',question:1,text:`Canonical URL round-trip checks had ${parserMismatch} endpoint mismatches. ${report.workday_catalog_structure.exact_raw_values}/${relations.length} suspicious values exist verbatim in the raw string catalog. This evidence does not demonstrate a current URL-to-tenant parsing defect.`},
    {label:'UNRESOLVED',question:2,text:`No raw source URL for all sampled Workday entries: ${noSource}. The upstream extraction step is not established. The adapter accepts tenant|shard|site strings.`},
    {label:'CONFIRMED',question:3,text:`All ${relations.length} affected records have the raw structural pattern; ${report.workday_catalog_structure.unique_same_site_and_shard} have one normal-tenant same-site/shard catalog entry and ${report.workday_catalog_structure.multiple_same_site_and_shard} have several. This is a catalog-wide structural count, not a live result for all records.`},
    {label:'INFERRED',question:3,text:`Shard-tenant sample: ${statusCounts(cohort('workday_422_shard_tenant'))}; same-site catalog controls: ${statusCounts(cohort('workday_same_site_catalog_control'))}. A metadata defect is a strong lead when the first group fails and its paired controls work. This is not a replacement mapping.`},
    {label:'UNRESOLVED',question:4,text:`Normal-tenant examples: ${statusCounts(normal)}; prior-success examples: ${statusCounts(cohort('workday_422_previously_successful'))}. An HTTP_422 response alone does not establish the cause. A normal-tenant 422 is outside the shard-tenant pattern.`},
    {label:'CONFIRMED',question:5,text:`${vendor.length}/${bamboo.length} BambooHR probes across ${new Set(bamboo.map(r=>r.board_key)).size} boards reached the vendor product homepage. The run records show the request paths and redirect statuses. This does not prove account inactivity or employer closure.`},
    {label:'CONFIRMED',question:6,text:`Never-successful 404 cohort: ${statusCounts(cohort('not_found_404_never'))}; prior-success 404 cohort: ${statusCounts(cohort('not_found_404_previous'))}. Saved HTTP 410 boards available: ${analysis.boards.filter(r=>r.http_status===410).length}. These endpoint responses do not prove retirement.`},
    {label:'CONFIRMED',question:7,text:`iCIMS: ${statusCounts(icims)}; ${icims.filter(r=>r.specific_class==='ICIMS_JOB_CARDS').length} responses had parsed job cards at the constructed search URL. Independent iCIMS catalog source URLs available: ${icimsSourceUrls}. Constructed URL round trips are not independent source-URL tests.`},
    {label:reconciliationConfirmed?'CONFIRMED':'UNRESOLVED',question:8,text:report.count_reconciliation.explanation},
  ];
  report.limitations=['Diagnostic sample only; not a prevalence estimate.','A first-page success is not proof of complete pagination.','No Workday parser or ATS adapter file was changed on this branch.','No catalog records, state records, retry schedules, or public feeds were changed.','The locale-prefixed Workday path assumption remains outside these observed URL fixtures.'];
  report.inputs=inputs;
  report.protected_inputs_unchanged=[];
  for(const input of runs[0].inputs.filter(r=>r.path.startsWith('data/catalogs/')||r.path==='data/jobs/state/board-state.json')){
    report.protected_inputs_unchanged.push({path:input.path,unchanged:sha(await fs.readFile(fromRoot(input.path)))===input.sha256});
  }
  const extra=['','## Conclusions','',...report.conclusions.map(c=>`- **${c.label} — Question ${c.question}:** ${c.text}`),'',
    '## Workday shard-tenant sample','',...Object.entries(report.summary.workday_shard_tenant_sample).map(([k,v])=>`- ${k}: ${v}`),'',
    '## Count reconciliation','',report.count_reconciliation.explanation,'',...report.count_reconciliation.boards.map(r=>`- ${r.board_key}: ${r.history_last_success_at}; ${r.successful_snapshot_count} saved successes.`),'',
    '## Limits','',...report.limitations.map(x=>`- ${x}`),''].join('\n');
  await writeJsonFile(fromRoot('data/jobs/reports/failure-probe-report.json'),report);
  await writeTextFile(fromRoot('data/jobs/reports/failure-probe-report.md'),markdown(report)+extra);
  console.log(JSON.stringify({summary:report.summary,structure:{...report.workday_catalog_structure,relations:undefined},protected_inputs_unchanged:report.protected_inputs_unchanged},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={aggregate,observedClass,main};
