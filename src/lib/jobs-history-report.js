const { monthlyBaseline, auditMetrics } = require('./historical-content-metrics');
const { titleCategories } = require('./title-category');
const { DuckDBInstance } = require('@duckdb/node-api');
const percent = n => n===null || n===undefined ? 'N/A' : `${n.toFixed(1)}%`;
const signed = n => n===null ? 'N/A' : `${n>=0?'+':''}${Number(n.toFixed(1))}`;
const metricRows = [
  ['Good jobs','good_jobs',false],['Remote jobs','remote_jobs',false],['Remote share','remote_share',true],
  ['Hybrid jobs','hybrid_jobs',false],['Hybrid share','hybrid_share',true],['Onsite jobs','onsite_jobs',false],['Onsite share','onsite_share',true],
  ['Unknown arrangement jobs','unknown_work_arrangement_jobs',false],['Unknown arrangement share','unknown_work_arrangement_share',true],
  ['Explicit U.S. remote jobs','explicit_us_remote_jobs',false],['Searchable jobs','searchable_jobs',false],['Searchable text coverage','searchable_text_coverage',true],
  ['AI mentions','ai_mentions',false],['AI share','ai_share',true],['API mentions','api_mentions',false],['API share','api_share',true],['Docs-as-code mentions','docs_as_code_mentions',false],['Docs-as-code share','docs_as_code_share',true],
];
function coverageChange(baseline,current){
  if(!baseline)return [];
  return ['company_count','catalog_slug_count','ats_type_count'].filter(k=>k==='ats_type_count' ? baseline[k]!==current[k] : baseline[k]===0 ? current[k]!==0 : Math.abs(current[k]-baseline[k])/baseline[k]>=0.1);
}
function signalsFor(current,baseline,period,roles){
  if(!baseline)return [];
  const coverage_warning=coverageChange(baseline,current).length>0;
  const changes=[['remote_share_change','remote_share'],['good_job_count_change','good_jobs'],['us_remote_change','explicit_us_remote_jobs'],...['ai','api','docs_as_code'].map(t=>['topic_share_change',`${t}_share`])];
  const signals=changes.filter(([,key])=>current[key]!==null&&baseline[key]!==null).map(([type,key])=>({type,metric:key,period,baseline_snapshot_id:baseline.snapshot_id,current_snapshot_id:current.snapshot_id,baseline:baseline[key],current:current[key],delta:current[key]-baseline[key],coverage_warning}));
  for(const role of titleCategories){const count=id=>roles.find(r=>r.snapshot_id===id&&r.role_group===role)?.job_count||0;const before=count(baseline.snapshot_id),now=count(current.snapshot_id);if(now!==before)signals.push({type:'role_group_change',role,period,baseline_snapshot_id:baseline.snapshot_id,current_snapshot_id:current.snapshot_id,baseline:before,current:now,delta:now-before,coverage_warning});}
  if(period==='7-day'&&current.weekly_churn_rate!==null)signals.push({type:'weekly_churn',period,baseline_snapshot_id:baseline.snapshot_id,current_snapshot_id:current.snapshot_id,count:current.weekly_churn_count,rate:current.weekly_churn_rate,coverage_warning});
  return signals;
}
const available = Number.isFinite;
const compareText = (a,b) => a<b?-1:a>b?1:0;
function selectLargestChanges(signals) {
  const selected=[];
  for(const metric of ['remote_share','explicit_us_remote_jobs','ai_share']) {
    const candidates=signals.filter(s=>s.metric===metric&&available(s.delta));
    const signal=candidates.find(s=>s.period==='30-day')||candidates.find(s=>s.period==='7-day');
    if(signal)selected.push(signal);
  }
  const weekly=signals.filter(s=>s.type==='role_group_change'&&s.period==='7-day'&&available(s.delta));
  const roles=weekly.length?weekly:signals.filter(s=>s.type==='role_group_change'&&s.period==='30-day'&&available(s.delta));
  const increase=roles.filter(s=>s.delta>0).sort((a,b)=>b.delta-a.delta||compareText(a.role,b.role))[0];
  const decrease=roles.filter(s=>s.delta<0).sort((a,b)=>a.delta-b.delta||compareText(a.role,b.role))[0];
  if(increase)selected.push({...increase,direction:'increase'});
  if(decrease)selected.push({...decrease,direction:'decrease'});
  const churn=signals.find(s=>s.type==='weekly_churn'&&available(s.rate)&&available(s.count));
  if(churn)selected.push(churn);
  return selected;
}
function weekStart(observedAt) {
  const date=new Date(`${String(observedAt).slice(0,10)}T00:00:00Z`);
  if(!Number.isFinite(+date))return null;
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  return date.toISOString().slice(0,10);
}
function sampleTrends(metrics,roles,limit=8) {
  const ordered=[...metrics].sort((a,b)=>compareText(a.observed_at,b.observed_at)||compareText(a.snapshot_id,b.snapshot_id));
  const weeks=new Map();
  for(const row of ordered){const week=weekStart(row.observed_at);if(week)weeks.set(week,row);}
  const samples=[...weeks].slice(-limit).map(([week,row])=>({week,row}));
  return samples.map(({week,row},index)=>{
    const previous=samples[index-1]?.row;
    const changes=new Set();
    if(previous){
      const start=ordered.findIndex(r=>r.snapshot_id===previous.snapshot_id),end=ordered.findIndex(r=>r.snapshot_id===row.snapshot_id);
      for(let i=start+1;i<=end;i++){
        for(const key of [...coverageChange(previous,ordered[i]),...coverageChange(ordered[i-1],ordered[i])])changes.add(key);
      }
    }
    const baseline=metrics.find(r=>r.snapshot_id===row.weekly_baseline_snapshot_id);
    const churnCoverage=baseline?coverageChange(baseline,row):[];
    const roleCount=name=>roles.find(r=>r.snapshot_id===row.snapshot_id&&r.role_group===name)?.job_count??null;
    return {week,snapshot_id:row.snapshot_id,remote_share:row.remote_share,explicit_us_remote_jobs:row.explicit_us_remote_jobs,
      ai_share:row.ai_share,weekly_churn_rate:row.weekly_churn_rate,technical_writing:roleCount('Technical Writing'),content_design_ux:roleCount('Content Design / UX Writing'),
      company_count:row.company_count,catalog_slug_count:row.catalog_slug_count,ats_type_count:row.ats_type_count,
      coverage_changes:[...changes].sort(),churn_coverage_changes:churnCoverage,previous_snapshot_id:previous?.snapshot_id||null,weekly_baseline_snapshot_id:baseline?.snapshot_id||null};
  });
}
function publishingFacts(selected) {
  return selected.map(s=>{
    let text;
    if(s.metric==='remote_share')text=`Remote jobs made up ${percent(s.current)} of the current feed, compared with ${percent(s.baseline)} in the selected ${s.period} comparison.`;
    else if(s.metric==='explicit_us_remote_jobs')text=`Explicit U.S.-remote jobs changed from ${s.baseline} to ${s.current} in the selected ${s.period} comparison.`;
    else if(s.metric==='ai_share')text=`AI-related terms appeared in ${percent(s.current)} of searchable postings, compared with ${percent(s.baseline)} in the selected ${s.period} comparison.`;
    else if(s.type==='role_group_change')text=`${s.role} changed by ${signed(s.delta)} jobs in the selected ${s.period} comparison (${s.baseline} to ${s.current}).`;
    else if(s.type==='weekly_churn')text=`Weekly churn was ${s.count} application-URL membership changes, or ${percent(s.rate)} of baseline jobs.`;
    return text ? text+(s.coverage_warning?' Source coverage changed materially in this comparison.':'') : null;
  }).filter(Boolean);
}
function renderLargestChanges(selected) {
  const out=['## Largest changes','','Fixed metric order; role groups show the largest numerical increase and decrease. Units are not ranked against each other.',''];
  for(const s of selected){
    let text;
    if(s.type==='role_group_change')text=`Largest role-group ${s.direction}: ${s.role}, ${signed(s.delta)} jobs (${s.baseline} → ${s.current}; ${s.period}).`;
    else if(s.type==='weekly_churn')text=`Weekly churn: ${s.count} membership changes (${percent(s.rate)} of baseline jobs).`;
    else {const label=metricRows.find(r=>r[1]===s.metric);text=`${label[0]}: ${signed(s.delta)}${label[2]?' percentage points':' jobs'} (${label[2]?percent(s.baseline):s.baseline} → ${label[2]?percent(s.current):s.current}; ${s.period}).`;}
    out.push(`- ${text}${s.coverage_warning?' Coverage warning: source coverage changed materially.':''}`);
  }
  if(!selected.length)out.push('No valid comparison changes are available.');
  out.push('','These are feed changes. Use the source-coverage and data notes below.','');
  return out;
}
function renderTrends(trends) {
  const count=n=>available(n)?String(n):'N/A';
  const out=['## Short historical trends','','Latest snapshot in each Monday–Sunday week, using the stored observation calendar date. Last eight weeks with data; missing weeks are omitted and the current week can be partial. Churn is the stored weekly comparison rate, not a calendar-week total.',''];
  if(!trends.length)return [...out,'No historical samples are available.',''];
  out.push('| Week starting | Snapshot | Remote share | U.S. remote | AI share | Weekly churn | Technical Writing | Content Design / UX Writing |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for(const t of trends)out.push(`| ${t.week} | ${t.snapshot_id} | ${percent(t.remote_share)} | ${count(t.explicit_us_remote_jobs)} | ${percent(t.ai_share)} | ${percent(t.weekly_churn_rate)} | ${count(t.technical_writing)} | ${count(t.content_design_ux)} |`);
  out.push('','AI share uses searchable postings. Other shares retain their existing denominators. N/A means a metric or comparison is unavailable.','', '| Snapshot | Companies | Catalog slugs | ATS types | Coverage warning |','| --- | ---: | ---: | ---: | --- |');
  for(const t of trends){const warning=[t.coverage_changes.length?'Sample interval':'',t.churn_coverage_changes.length?'Churn baseline':''].filter(Boolean).join('; ');out.push(`| ${t.snapshot_id} | ${count(t.company_count)} | ${count(t.catalog_slug_count)} | ${count(t.ats_type_count)} | ${warning||'None detected'} |`);}
  out.push('');
  for(const t of trends){if(t.coverage_changes.length)out.push(`- Coverage warning, ${t.previous_snapshot_id} → ${t.snapshot_id}: ${t.coverage_changes.join(', ')} crossed the existing threshold at an endpoint or an intervening snapshot.`);if(t.churn_coverage_changes.length)out.push(`- Coverage warning for churn at ${t.snapshot_id}: ${t.churn_coverage_changes.join(', ')} changed materially from baseline ${t.weekly_baseline_snapshot_id}.`);}
  if(trends.length===1)out.push('Only one sampled week is available; no between-week trend can be established.');
  out.push('','No correction is applied for crawler changes. No detected threshold crossing does not prove constant source coverage.','');
  return out;
}

function renderReport({metrics,roles,generatedAt}){
  const current=[...metrics].sort((a,b)=>b.snapshot_id.localeCompare(a.snapshot_id))[0];
  if(!current)throw new Error('No historical content metrics. Run jobs:history-build.');
  const weekly=metrics.find(m=>m.snapshot_id===current.weekly_baseline_snapshot_id)||null,monthly=monthlyBaseline(current,metrics);
  const signals=[...signalsFor(current,weekly,'7-day',roles),...signalsFor(current,monthly,'30-day',roles)];
  const largestChanges=selectLargestChanges(signals),trends=sampleTrends(metrics,roles),facts=publishingFacts(largestChanges);
  const out=['# Historical Jobs Report','',`Generated: ${generatedAt}`,`Latest snapshot: ${current.snapshot_id}`,`Observation time: ${current.observed_at}; recorded package time: ${current.report_observed_at} (${current.time_source}).`,'',...renderLargestChanges(largestChanges),'## Current snapshot','', '| Metric | Current |','| --- | ---: |',...metricRows.map(([name,key,p])=>`| ${name} | ${p?percent(current[key]):current[key]} |`),'',`Population: ${current.raw_good_jobs} raw export rows; ${current.duplicate_export_rows} repeated primary URLs; ${current.unmatched_good_job_rows} unmatched export rows retained.`, ''];
  for(const [label,baseline] of [['7-day',weekly],['30-day',monthly]]){
    out.push(`## ${label} comparison`,'');
    if(!baseline){out.push('No valid earlier baseline is available. Changes are N/A.','');continue;}
    out.push(`Baseline: ${baseline.snapshot_id} (${baseline.observed_at}; package time ${baseline.report_observed_at}).`,'','| Metric | Baseline | Current | Change |','| --- | ---: | ---: | ---: |',...metricRows.map(([name,key,p])=>`| ${name} | ${p?percent(baseline[key]):baseline[key]} | ${p?percent(current[key]):current[key]} | ${baseline[key]===null||current[key]===null?'N/A':signed(current[key]-baseline[key])+(p?' pp':'')} |`),'');
    if(label==='7-day')out.push(`Weekly added: ${current.weekly_added}; removed: ${current.weekly_removed}; net: ${signed(current.weekly_net_change)}; churn: ${current.weekly_churn_count} (${percent(current.weekly_churn_rate)} of baseline jobs).`,'');
    out.push(`Coverage (baseline → current): companies ${baseline.company_count} → ${current.company_count}; catalog slugs ${baseline.catalog_slug_count} → ${current.catalog_slug_count}; ATS types ${baseline.ats_type_count} → ${current.ats_type_count}.`);
    const changes=coverageChange(baseline,current);out.push(changes.length?`Coverage warning: material change in ${changes.join(', ')}. Do not attribute these changes to the labor market alone.`:'No coverage threshold was crossed. This does not establish constant source coverage.','');
  }
  out.push(...renderTrends(trends));
  out.push('## Role-group changes','','| Role group | Current | 7-day change | 30-day change |','| --- | ---: | ---: | ---: |');
  for(const role of titleCategories){const count=s=>roles.find(r=>r.snapshot_id===s.snapshot_id&&r.role_group===role)?.job_count||0;out.push(`| ${role} | ${count(current)} | ${weekly?signed(count(current)-count(weekly)):'N/A'} | ${monthly?signed(count(current)-count(monthly)):'N/A'} |`);}
  out.push('','## Publishing signals','','Factual candidates from this feed. Apply the comparison coverage notes above.','');
  // A fixed, short selection; no subjective scoring. The returned array retains all candidates.
  const displayed=signals.filter(s=>s.period==='30-day'&&['remote_share_change','topic_share_change','good_job_count_change','us_remote_change'].includes(s.type));
  displayed.push(...signals.filter(s=>s.type==='weekly_churn'),...signals.filter(s=>s.type==='role_group_change'&&s.period==='7-day').slice(0,3));
  if(!displayed.length)out.push('- No comparison signals are available.');
  for(const s of displayed){
    const caution=s.coverage_warning?' Coverage changed materially.':'';
    if(s.type==='weekly_churn')out.push(`- Weekly churn was ${s.count} membership changes, or ${percent(s.rate)} of baseline jobs.${caution}`);
    else if(s.type==='role_group_change')out.push(`- ${s.role} changed from ${s.baseline} to ${s.current} jobs in the selected ${s.period} comparison (${signed(s.delta)}).${caution}`);
    else {const label=metricRows.find(r=>r[1]===s.metric);out.push(`- ${label[0]} changed from ${label[2]?percent(s.baseline):s.baseline} to ${label[2]?percent(s.current):s.current} in the selected ${s.period} comparison.${caution}`);}
  }
  out.push('','## Publishing-ready facts','','These statements describe this feed only. Topic mentions are not requirements. Keep the comparison coverage notes when reusing these facts.','',...(facts.length?facts.map(f=>`- ${f}`):['No factual comparisons are available.']));
  out.push('','## Data notes','',
    '- This is a derived report. First/last seen and snapshot times are observations, not authoritative posting or closure dates.',
    '- The population uses primary application URLs from 01, including unmatched exceptions. Repeated primary URLs count once, as in the daily report.',
    '- Work arrangements use saved 01 values. U.S. remote uses the existing explicit-location filter, not 03 eligibility flags.',
    '- Values are rounded for display; changes are calculated before rounding. Shares are percentages. Changes in shares use percentage points (pp). Topic shares use searchable primary-URL text only; missing text is not a negative match. Company background can match a topic. Mentions are not requirements.',
    '- Weekly baseline: oldest strictly earlier package within seven days, using recorded package time. No earlier package means no weekly metrics. Monthly baseline: latest observation at or before current observation minus 30 days.',
    '- Coverage counts use the raw 03 shortlist. A company or catalog count change of at least 10%, or any ATS-count change, triggers a warning. No mathematical correction is applied.',
    '- Crawler coverage changed historically. These totals are not a pure labor-market index. Churn means application-URL membership changes, not confirmed openings or closures.','');
  return {markdown:out.join('\n'),signals,current,weekly,monthly,largestChanges,trends,facts};
}
async function historyReport(database,generatedAt=new Date().toISOString()){
  const instance=await DuckDBInstance.create(database,{access_mode:'READ_ONLY'}),c=await instance.connect();
  try{const errors=await auditMetrics(c);if(errors.length)throw new Error(errors.join('\n')+'; run jobs:history-update.');
    const read=async sql=>(await c.runAndReadAll(sql)).getRowObjectsJson();
    return renderReport({metrics:await read('SELECT * FROM historical_content_metrics'),roles:await read('SELECT * FROM historical_role_metrics'),generatedAt});
  }finally{c.closeSync();instance.closeSync();}
}
module.exports={selectLargestChanges,sampleTrends,publishingFacts,renderLargestChanges,renderTrends,coverageChange,signalsFor,renderReport,historyReport};
