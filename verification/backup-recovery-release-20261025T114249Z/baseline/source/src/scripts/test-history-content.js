const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {calculate,weeklyBaseline,monthlyBaseline}=require('../lib/historical-content-metrics');
const {coverageChange,renderReport,historyReport,selectLargestChanges,sampleTrends,publishingFacts,renderLargestChanges,renderTrends}=require('../lib/jobs-history-report');
const {enrich}=require('../lib/daily-jobs-review');
const {buildContentMetrics,compareMembership,roleChanges}=require('../lib/content-metrics');
const {filterConfirmedUsRemote}=require('../lib/us-remote-daily-report');
const {titleCategories}=require('../lib/title-category');
const {rowsToCsv}=require('../lib/csv');
const {runHistory}=require('../lib/jobs-history');
const snap=(id,date)=>({snapshot_id:id,observed_at:date,report_observed_at:date,time_source:'fixture',company_count:10,catalog_slug_count:10,ats_type_count:3});
async function main(){
 const s=snap('20260210-1200','2026-02-10 12:00:00');
 const dates=[snap('20260202-1200','2026-02-02 12:00:00'),snap('20260203-1200','2026-02-03 12:00:00'),snap('20260203-1800','2026-02-03 18:00:00'),snap('20260207-1000','2026-02-07 10:00:00'),s];
 assert.equal(weeklyBaseline(s,dates).snapshot_id,'20260203-1200');assert.equal(weeklyBaseline(s,[s,dates[0]]),null);
 const month=[snap('20260110-1200','2026-01-10 12:00:00'),snap('20260111-1200','2026-01-11 12:00:00'),snap('20260111-1300','2026-01-11 13:00:00')];
 assert.equal(monthlyBaseline(s,month).snapshot_id,'20260111-1200');assert.equal(monthlyBaseline(s,[s]),null);
 assert.deepEqual(coverageChange(s,{...s,company_count:10.9}),[]);assert.deepEqual(coverageChange(s,{...s,company_count:11}),['company_count']);assert.deepEqual(coverageChange(s,{...s,ats_type_count:4}),['ats_type_count']);assert.deepEqual(coverageChange({...s,company_count:0},{...s,company_count:1}),['company_count']);
 const good=[
  {'Apply Link':'https://x/a',Title:'Technical Writer',Company:'One',Location:'US','Work Arrangement':'Remote'},
  {'Apply Link':'https://x/b',Title:'Documentation Engineer',Company:'Two',Location:'UK','Work Arrangement':'Hybrid'},
  {'Apply Link':'https://x/c',Title:'Content Writer',Company:'Three',Location:'US','Work Arrangement':'Onsite'},
  {'Apply Link':'https://x/missing',Title:'Unclassified',Company:'Four',Location:'','Work Arrangement':'Unknown'},
 ];
 const details=[{URL:'https://x/a',Description:'We use AI, APIs, and docs-as-code.'},{URL:'https://x/b',Description:'Company background: artificial intelligence.'},{URL:'https://x/c',Description:''}];
 const baseline=[good[0],{...good[1],'Apply Link':'https://x/removed'}],b=dates[1];
 const historical=calculate(s,good,details,b,baseline,[good[3]]);
 const rows=enrich(good,details),before=enrich(baseline,[]);
 const daily=buildContentMetrics({rows,baseline:before,weekly:compareMembership(rows,before),roles:roleChanges(rows,before),remoteSummary:{us:filterConfirmedUsRemote(good).length,international:0,unique:0,overlap:[]}});
 const m=historical.metrics;
 assert.equal(m.good_jobs,daily.marketOverview.total);assert.equal(m.good_jobs,4);assert.equal(m.unmatched_good_jobs,1);
 for(const [name,key] of [['Remote','remote'],['Hybrid','hybrid'],['Onsite','onsite'],['Unknown','unknown_work_arrangement']]){const d=daily.marketOverview.arrangements.find(r=>r.name===name);assert.equal(m[key+'_jobs'],d.count);assert.equal(m[key+'_share'],d.share);}
 assert.equal(m.explicit_us_remote_jobs,1);assert.equal(m.searchable_jobs,2);assert.equal(m.searchable_text_coverage,50);
 for(const [name,key] of [['AI mentions','ai'],['API mentions','api'],['Docs-as-code mentions','docs_as_code']]){const d=daily.topics.find(t=>t.name===name);assert.equal(m[key+'_mentions'],d.count);assert.equal(m[key+'_share'],d.share);}
 assert.equal(m.ai_mentions,2);assert.equal(m.api_mentions,1);assert.equal(m.docs_as_code_mentions,1);
 for(const role of titleCategories)assert.equal(historical.roles.find(r=>r.role_group===role).job_count,rows.filter(r=>r.category===role).length);
 assert.deepEqual([m.weekly_added,m.weekly_removed,m.weekly_net_change,m.weekly_churn_count,m.weekly_churn_rate],[3,1,2,4,200]);
 const duplicate=calculate(s,[...good,good[0]],details,null,[],[good[3]]).metrics;assert.equal(duplicate.raw_good_jobs,5);assert.equal(duplicate.good_jobs,4);assert.equal(duplicate.duplicate_export_rows,1);
 const empty=calculate(s,[],[],null,[],[]);assert.equal(empty.metrics.ai_share,null);assert.equal(empty.metrics.remote_share,null);assert.equal(empty.metrics.weekly_added,null);
 const reportInput={metrics:[m],roles:historical.roles,generatedAt:'fixed'};
 const report=renderReport(reportInput);assert.equal(report.markdown,renderReport(reportInput).markdown);
 for(const heading of ['Current snapshot','7-day comparison','30-day comparison','Role-group changes','Publishing signals','Data notes'])assert.ok(report.markdown.includes('## '+heading));
 assert.ok(!/NaN|Infinity/.test(renderReport({metrics:[empty.metrics],roles:empty.roles,generatedAt:'fixed'}).markdown));
 const baselineMetric=calculate(b,baseline,[],null,[],[]);
 const comparison=renderReport({metrics:[baselineMetric.metrics,m],roles:[...baselineMetric.roles,...historical.roles],generatedAt:'fixed'});
 assert.ok(comparison.signals.every(signal=>['remote_share_change','good_job_count_change','us_remote_change','topic_share_change','role_group_change','weekly_churn'].includes(signal.type)));
 assert.ok(comparison.signals.some(signal=>signal.type==='weekly_churn'&&signal.count===4));
 // Publishing additions must preserve every existing section.
 const reportFixture=JSON.parse(await fs.readFile(path.join(__dirname,'fixtures/history-report-input.json'),'utf8'));
 const original=await fs.readFile(path.join(__dirname,'fixtures/history-report-existing.md'),'utf8');
 const enhanced=renderReport(reportFixture);
 const sections=text=>new Map(text.split(/(?=^## )/m).filter(part=>part.startsWith('## ')).map(part=>[part.split('\n')[0],part.trim()]));
 for(const [heading,body] of sections(original))assert.equal(sections(enhanced.markdown).get(heading),body,heading);
 assert.ok(enhanced.markdown.indexOf('## Largest changes')<enhanced.markdown.indexOf('## Current snapshot'));
 const roleSignals=[
  {type:'role_group_change',period:'7-day',role:'Zeta',baseline:2,current:5,delta:3},
  {type:'role_group_change',period:'7-day',role:'Alpha',baseline:2,current:5,delta:3},
  {type:'role_group_change',period:'7-day',role:'Technical Writing',baseline:30,current:8,delta:-22},
  {type:'role_group_change',period:'7-day',role:'Other',baseline:5,current:4,delta:-1},
 ];
 const factSignals=[{type:'remote_share_change',metric:'remote_share',period:'30-day',baseline:22.1,current:19.2,delta:-2.9},
  {type:'us_remote_change',metric:'explicit_us_remote_jobs',period:'30-day',baseline:65,current:45,delta:-20},
  {type:'topic_share_change',metric:'ai_share',period:'30-day',baseline:38.4,current:33.6,delta:-4.8,coverage_warning:true},...roleSignals,
  {type:'weekly_churn',period:'7-day',count:233,rate:28.8}];
 const largest=selectLargestChanges(factSignals);
 assert.equal(largest.find(r=>r.direction==='increase').role,'Alpha');assert.equal(largest.find(r=>r.direction==='decrease').role,'Technical Writing');
 assert.deepEqual(renderLargestChanges(largest),renderLargestChanges(selectLargestChanges([...factSignals].reverse())));
 const facts=publishingFacts(largest);
 assert.ok(facts.includes('Remote jobs made up 19.2% of the current feed, compared with 22.1% in the selected 30-day comparison.'));
 assert.ok(facts.includes('Explicit U.S.-remote jobs changed from 65 to 45 in the selected 30-day comparison.'));
 assert.ok(facts.some(f=>f.startsWith('AI-related terms appeared in 33.6% of searchable postings, compared with 38.4%')&&f.endsWith('Source coverage changed materially in this comparison.')));
 assert.ok(facts.some(f=>f.includes('Technical Writing changed by -22 jobs')));
 assert.deepEqual(selectLargestChanges([]),[]);assert.deepEqual(publishingFacts([]),[]);
 assert.deepEqual(selectLargestChanges([{metric:'ai_share',period:'30-day',delta:null}]),[]);
 const trendMetric=(id,company=10)=>({...reportFixture.metrics[0],snapshot_id:id,observed_at:`${id.slice(0,4)}-${id.slice(4,6)}-${id.slice(6,8)} ${id.slice(9,11)}:${id.slice(11)}:00`,company_count:company});
 const history=[];
 for(let i=0;i<10;i++){const d=new Date(Date.UTC(2025,10,24+i*7)).toISOString().slice(0,10).replaceAll('-','');history.push(trendMetric(d+'-1200'));}
 history.push(trendMetric('20260126-1800'));
 const sampled=sampleTrends(history,[]);
 assert.equal(sampled.length,8);assert.equal(sampled.at(-1).snapshot_id,'20260126-1800');assert.equal(sampled[0].week,'2025-12-08');
 assert.deepEqual(sampled,sampleTrends([...history].reverse(),[]));
 const sparse=sampleTrends([trendMetric('20260101-1200'),trendMetric('20260125-1200')],[]);assert.equal(sparse.length,2);
 // A temporary expansion between samples must not disappear from the warning.
 const crossed=sampleTrends([trendMetric('20260104-1200'),trendMetric('20260106-1200',15),trendMetric('20260111-1200')],[]);
 assert.ok(crossed[1].coverage_changes.includes('company_count'));assert.match(renderTrends(crossed).join('\n'),/Coverage warning, 20260104-1200 → 20260111-1200/);
 const single=sampleTrends([{...trendMetric('20260111-1200'),remote_share:null,ai_share:null,weekly_churn_rate:null,explicit_us_remote_jobs:null}],[]);
 const singleText=renderTrends(single).join('\n');assert.match(singleText,/Only one sampled week/);assert.match(singleText,/N\/A/);assert.ok(!/NaN|Infinity|undefined|\bnull\b/.test(singleText));
 assert.match(renderTrends([]).join('\n'),/No historical samples/);
 const zeroText=renderTrends(sampleTrends([{...trendMetric('20260111-1200'),remote_share:0,ai_share:0,weekly_churn_rate:0}],[])).join('\n');assert.match(zeroText,/0.0%/);
 assert.match(renderReport({metrics:[empty.metrics],roles:empty.roles,generatedAt:'fixed'}).markdown,/No factual comparisons/);
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'history-content-'));const root=path.join(tmp,'snapshots'),database=path.join(tmp,'history.duckdb');
 async function fixture(id){const dir=path.join(root,id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'03_top_matches_full.csv'),rowsToCsv(['CanonicalURLKey','URL','Title','Description'],[{CanonicalURLKey:'https://x/a',URL:'https://x/a',Title:'Writer',Description:'AI APIs docs as code'}]));await fs.writeFile(path.join(dir,'01_good_documentation_jobs.csv'),rowsToCsv(Object.keys(good[0]),[good[0],good[3]]));}
 try{
  await fixture('20260110-1200');await fixture('20260111-1200');let r=await runHistory('build',{root,database});assert.equal(r.metrics_refreshed,2);
  r=await runHistory('update',{root,database});assert.equal(r.metrics_refreshed,0);
  await fixture('20260105-1200');r=await runHistory('update',{root,database});assert.equal(r.imported,1);assert.equal(r.metrics_refreshed,3);
  const generated=await historyReport(database,'fixed');assert.equal(generated.current.good_jobs,2);assert.equal(generated.current.unmatched_good_job_rows,1);assert.equal(generated.weekly.snapshot_id,'20260105-1200');
  assert.equal((await runHistory('audit',{root,database})).errors.length,0);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
 console.log('PASS: daily parity, topic denominators, exceptions, duplicate exports, baseline selection, churn, coverage, roles, deterministic report, zero denominators, dependent incremental refresh, deterministic publishing sections, weekly trends, coverage gaps, and existing-section preservation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
