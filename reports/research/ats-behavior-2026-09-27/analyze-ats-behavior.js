/* Offline analysis. Run from any directory. Writes only beside this script.
 * Counts describe saved normalized records, not vacancies or vendor contracts.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { iterateStrictLineJsonArrayFile } = require(path.join(root, 'src/lib/files'));
const { parseCsvRecords } = require(path.join(root, 'src/lib/csv'));
const inputs = [];
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const inc = (o,k,n=1) => o[k]=(o[k]||0)+n;
const present = x => x !== '' && x !== null && x !== undefined;
const norm = x => String(x||'').replace(/\s+/g,' ').trim();
const plain = x => norm(String(x||'').replace(/<[^>]*>/g,' '));
// Workday bulletFields[0] can be an employment label (for example, Regular).
// Require its raw ID to occur in the URL; otherwise retain the full URL identity.
const id = r => [r.ATS,r.CatalogSlug||r.BoardURL||r.CompanyKey,
 r.ATS==='workday' && !String(r.URL||'').includes(String(r.RawJobId||'__missing__')) ? r.URL : r.RawJobId||r.URL].join('|');
const brief = r => Object.fromEntries(['ATS','Company','CompanyKey','Title','Department','Location','RemoteStatus','USRemoteEligible','SalaryMin','SalaryMax','SalaryCurrency','SalaryPeriod','SalaryText','DatePosted','FetchedAt','RawJobId','URL','CatalogSlug','SourceBatch'].map(k=>[k,r[k]]));
function read(p) { const b=fs.readFileSync(path.join(root,p)); inputs.push({path:p,bytes:b.length,sha256:hash(b)}); return b.toString('utf8'); }
function json(p) { return JSON.parse(read(p)); }
function csv(p) { return parseCsvRecords(read(p)).rows; }
function save(name,x) { fs.writeFileSync(path.join(__dirname,name),JSON.stringify(x,null,2)+'\n'); }
const conventional = /technical\s+writ|documentation\s+(?:engineer|manager)/i;
const adjacent = /content|knowledge|information architect|developer (?:experience|education|advoca)|enablement|education|readiness|governance|workflow|program manag/i;
const signals = [/\b(?:own|build|maintain|create|develop|manage|lead)\w*\b.{0,100}\b(?:documentation|knowledge base|content (?:systems|strategy|operations)|taxonomy)\b/i,/\b(?:API documentation|developer documentation|docs.as.code|information architecture|content governance|knowledge management|technical writing)\b/i];
async function main() {
 const feed='data/jobs/public/public-job-feed-latest.json';
 const before=fs.statSync(path.join(root,feed));
 const stats={}, samples={}, candidates=[]; const rawIds=new Map(), canon=new Map(), qualifiedIds=new Set();
 const addSample=(k,r)=> { const a=samples[k] ||= []; if(a.length<6) a.push(brief(r)); };
 let total=0; const fields=new Set();
 for await(const {lineNumber,row:r} of iterateStrictLineJsonArrayFile(path.join(root,feed))) {
  total++; Object.keys(r).forEach(k=>fields.add(k));
  const a=r.ATS||'Unknown'; const s=stats[a] ||= {rows:0,companies:new Set(),boards:new Set(),missing:{},remote:{},dates:{},metrics:{},hosts:{},fetchMin:'',fetchMax:''};
  s.rows++; s.companies.add(r.CompanyKey||r.Company); s.boards.add(r.CatalogSlug||r.BoardURL);
  for(const k of ['RawJobId','DatePosted','Location','Description','Department','SalaryMin','SalaryMax','SalaryCurrency','SalaryPeriod','URL','FetchedAt']) if(!present(r[k])) inc(s.missing,k);
  inc(s.remote,r.RemoteStatus||'blank');
  const d=plain(r.Description), t=plain(r.Title), dp=norm(r.DatePosted);
  const dateKind=!dp?'missing':/^\d{4}-\d\d-\d\d/.test(dp)&&Number.isFinite(Date.parse(dp))?'absolute':'relative_or_other'; inc(s.dates,dateKind);
  if(d===t) { inc(s.metrics,'descriptionEqualsTitle'); addSample(a+':titleOnly',r); }
  if(d.length<200) inc(s.metrics,'descriptionUnder200');
  if(/<\/?(?:p|div|li|strong|br)\b/i.test(r.Description||'')) inc(s.metrics,'residualMarkup');
  if(r.SalaryDetected===true) inc(s.metrics,'salaryDetected');
  if(r.PossibleDuplicate===true) inc(s.metrics,'possibleDuplicate');
  if(r.CrossATSDuplicate===true) inc(s.metrics,'crossATSFlag');
  if(/\bremote\b/i.test(r.Location||'')) inc(s.metrics,'remoteInLocation');
  if(/\bremote\b/i.test(d)&&!/\bremote\b/i.test(r.Location||'')) {inc(s.metrics,'remoteOnlyInDescription');addSample(a+':remoteOnlyInDescription',r);}
  if(r.USRemoteEligible===true) inc(s.metrics,'usRemoteEligible');
  if(/\b(?:CAD|AUD|EUR|GBP)\b/.test(d)&&r.SalaryCurrency==='USD') {inc(s.metrics,'currencyReviewCandidate');addSample(a+':currencyReviewCandidate',r);}
  if(r.Location!==r.RawLocation) {inc(s.metrics,'locationDiffersRaw');addSample(a+':locationDiffersRaw',r);}
  if(r.FetchedAt) {s.fetchMin=!s.fetchMin||r.FetchedAt<s.fetchMin?r.FetchedAt:s.fetchMin;s.fetchMax=r.FetchedAt>s.fetchMax?r.FetchedAt:s.fetchMax; if(Date.parse('2026-09-27T23:59:59Z')-Date.parse(r.FetchedAt)>30*86400000) inc(s.metrics,'fetchedOver30DaysAgo');}
  try {const u=new URL(r.URL);inc(s.hosts,u.hostname);if(u.search) {inc(s.metrics,'urlWithQuery');addSample(a+':urlWithQuery',r);}}catch{inc(s.metrics,'invalidUrl');}
  if(a==='workday' && !String(r.URL||'').includes(String(r.RawJobId||'__missing__'))) {inc(s.metrics,'rawIdNotInUrl');addSample(a+':rawIdNotInUrl',r);}
  const qid=id(r); if(qualifiedIds.has(qid)) inc(s.metrics,'repeatedQualifiedIdRows'); qualifiedIds.add(qid);
  if(r.RawJobId) {const k=a+'|'+r.RawJobId;const old=rawIds.get(k);if(!old)rawIds.set(k,{company:r.CompanyKey,board:r.CatalogSlug,row:brief(r),cross:false});else if(old.board!==r.CatalogSlug){if(!old.cross){inc(s.metrics,'rawIdAcrossBoardsGroups');old.cross=true;addSample(a+':rawIdCollision',old.row);}inc(s.metrics,'rawIdAcrossBoardsExtraRows');addSample(a+':rawIdCollision',r);}}
  if(r.CanonicalURLKey){const old=canon.get(r.CanonicalURLKey);if(!old)canon.set(r.CanonicalURLKey,{id:qid,row:brief(r),cross:false});else if(old.id!==qid){inc(s.metrics,'canonicalDifferentIdExtraRows');if(!old.cross){addSample(a+':canonicalCollision',old.row);old.cross=true;}addSample(a+':canonicalCollision',r);}}
  const sig=signals.map(x=>x.test(d));
  if(/\bdocumentation\b/i.test(d)) inc(s.metrics,'descriptionMentionsDocumentation');
  if(conventional.test(t)) inc(s.metrics,'conventionalTitle');
  if(sig.every(Boolean)&&!conventional.test(t)) inc(s.metrics,'twoSignalsWithoutConventionalTitle');
  if((adjacent.test(t)&&sig.some(Boolean))||conventional.test(t)) {
   const score=Number(sig[0])*4+Number(sig[1])*4+Number(/knowledge|information architect|content (?:engineer|operations|systems|strateg)|developer (?:education|advoca)|enablement/i.test(t))*3;
   candidates.push({...brief(r),Description:r.Description,WriterFitScore:r.WriterFitScore,TitleMatchType:r.TitleMatchType,lineNumber,analysisScore:score});
  }
 }
 const after=fs.statSync(path.join(root,feed)); assert.equal(before.size,after.size);assert.equal(before.mtimeMs,after.mtimeMs);
 const digest=crypto.createHash('sha256');for await(const b of fs.createReadStream(path.join(root,feed)))digest.update(b);
 inputs.push({path:feed,bytes:before.size,sha256:digest.digest('hex'),mtime:before.mtime.toISOString()});
 for(const s of Object.values(stats)){s.companies=s.companies.size;s.boards=s.boards.size;s.hosts=Object.fromEntries(Object.entries(s.hosts).sort((a,b)=>b[1]-a[1]).slice(0,12));}
 console.log('Full feed:',total,'rows');
 const packages=fs.readdirSync(path.join(root,'data/jobs/gsheet-package')).filter(x=>/^\d{8}-\d{4}$/.test(x)).sort();
 const histories=new Map(),historyStats={},changes={},snapshots=[];
 for(const pkg of packages){
  const p=`data/jobs/gsheet-package/${pkg}/03_top_matches_full.csv`;if(!fs.existsSync(path.join(root,p)))continue;
  const rows=csv(p); const si=snapshots.length; snapshots.push({package:pkg,rows:rows.length,path:p});
  const seen=new Set();
  for(const r of rows){const k=id(r);if(seen.has(k))continue;seen.add(k);const a=r.ATS||'Unknown';const hs=historyStats[a] ||= {observations:0,identities:0,repeated:0,gapReturns:0,changes:{},companies:new Set()};hs.observations++;hs.companies.add(r.CompanyKey||r.Company);
   const old=histories.get(k);if(!old){hs.identities++;histories.set(k,{first:pkg,last:pkg,index:si,row:r,p:p,count:1});continue;}
   if(old.count===1)hs.repeated++;
   if(old.index<si-1){hs.gapReturns++;const ar=changes[a+':gapReturn'] ||= [];if(ar.length<6)ar.push({id:k,beforePackage:old.last,afterPackage:pkg,beforeFile:old.p,afterFile:p,row:brief(r)});}
   for(const f of ['Title','Description','Location','RemoteStatus','USRemoteEligible','SalaryMin','SalaryMax','SalaryCurrency','SalaryPeriod','DatePosted','URL']){
    if(norm(old.row[f])!==norm(r[f])){inc(hs.changes,f);const ar=changes[a+':'+f] ||= [];if(ar.length<8)ar.push({id:k,beforePackage:old.last,afterPackage:pkg,beforeFile:old.p,afterFile:p,before:f==='Description'?hash(norm(old.row[f])):old.row[f],after:f==='Description'?hash(norm(r[f])):r[f],firstPackage:old.first,row:brief(r)});}
   }
   old.last=pkg;old.index=si;old.row=r;old.p=p;old.count++;
  }
 }
 for(const h of Object.values(historyStats))h.companies=h.companies.size;
 console.log('History:',snapshots.length,'packages');
 const urlStats={observations:0,uniqueUrls:new Set(),statuses:{},issues:{},byATS:{},http200Issues:0,changedFinalUrl:0,examples:[]};
 for(const pkg of packages){const p=`data/jobs/gsheet-package/${pkg}/01_good_documentation_jobs-url-review.csv`;if(!fs.existsSync(path.join(root,p)))continue;for(const r of csv(p)){urlStats.observations++;urlStats.uniqueUrls.add(r['Apply Link']);inc(urlStats.statuses,r.UrlCheckStatus);if(r.UrlCheckIssue)inc(urlStats.issues,r.UrlCheckIssue);const a=r.Source;const u=urlStats.byATS[a] ||= {observations:0,issues:0,http200Issues:0,companies:new Set()};u.observations++;u.companies.add(r.Company);if(r.UrlCheckIssue)u.issues++;if(r.UrlCheckFinalUrl&&r.UrlCheckFinalUrl!==r['Apply Link'])urlStats.changedFinalUrl++;if(r.UrlCheckHttpStatus==='200'&&r.UrlCheckIssue){urlStats.http200Issues++;u.http200Issues++;if(urlStats.examples.length<15)urlStats.examples.push({file:p,...r});}}}
 urlStats.uniqueUrls=urlStats.uniqueUrls.size;for(const u of Object.values(urlStats.byATS))u.companies=u.companies.size;
 const state=json('data/jobs/state/board-state.json'); const stateStats={};for(const b of state.Boards){const s=stateStats[b.ATS] ||= {boards:0,status:{},error:{},failedWithPriorSuccess:0};s.boards++;inc(s.status,b.LastFetchStatus||'unattempted');if(b.LastErrorClass)inc(s.error,b.LastErrorClass);if(b.LastFetchStatus==='failed'&&b.LastSuccessAt)s.failedWithPriorSuccess++;}
 const batches=json('data/jobs/index/batch-index.json');const batchStats={};let logs=0;const logSeen=new Set();
 for(const b of batches){const p=`data/jobs/batches/${b.BatchName}/jobs-batch-fetch-log.json`;if(!fs.existsSync(path.join(root,p)))continue;logs++;for(const r of json(p)){const key=[r.ATS,r.CatalogSlug,r.FetchedAt,r.Status].join('|');if(logSeen.has(key))continue;logSeen.add(key);const s=batchStats[r.ATS] ||= {attempts:0,status:{},companies:new Set(),boards:new Set(),min:'',max:'',count2000:0,examples:[]};s.attempts++;inc(s.status,r.Status);s.companies.add(r.CompanyKey||r.Company);s.boards.add(r.CatalogSlug);if(r.FetchedAt){s.min=!s.min||r.FetchedAt<s.min?r.FetchedAt:s.min;s.max=r.FetchedAt>s.max?r.FetchedAt:s.max;}if(Number(r.JobCount)===2000){s.count2000++;if(s.examples.length<5)s.examples.push({file:p,...r});}}}
 for(const s of Object.values(batchStats)){s.companies=s.companies.size;s.boards=s.boards.size;}
 assert.equal(Object.values(stats).reduce((n,s)=>n+s.rows,0),total);
 assert.equal(Object.values(historyStats).reduce((n,s)=>n+s.identities,0),histories.size);
 candidates.sort((a,b)=>b.analysisScore-a.analysisScore||a.URL.localeCompare(b.URL));
 // Preserve all matched rows for review; selection is a discovery probe, not a relevance label.
 save('discovery-candidates.json',candidates);
 save('evidence-examples.json',{samples,changes,urlExamples:urlStats.examples});
 delete urlStats.examples;
 save('quantitative-evidence.json',{analysisDate:'2026-09-27',total,fields:[...fields],stats,historyStats,snapshots,urlStats,stateGeneratedAt:state.GeneratedAt,stateStats,batchStats,logFiles:logs,discoveryCandidateCount:candidates.length});
 save('input-manifest.json',{method:'SHA-256 of each consumed source file; no network requests',inputs});
 console.log('Analysis complete; assertions passed. Candidates:',candidates.length);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
