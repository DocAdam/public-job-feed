const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict');
const root='/Users/adampugh/GitHub/public-job-feed', evidence=path.resolve(__dirname,'..');
const {iterateLargeJsonArrayFile}=require(path.join(root,'src/lib/files'));
const {parseCsvRecords}=require(path.join(root,'src/lib/csv'));
const {EMPLOYMENT_FIELDS,ensureEmploymentType,displayEmploymentType,employmentVariant,validateEmploymentType,validatePublicEmploymentLabel}=require(path.join(root,'src/lib/employment-type'));
const {employmentCoverage,sheetRange}=require(path.join(root,'src/lib/employment-type-report'));
const {buildSimplePublicRow,SIMPLE_PUBLIC_HEADERS}=require(path.join(root,'src/lib/simple-public-export'));
const {selectDedupedRows}=require(path.join(root,'src/lib/dedupe-select'));
const {groupPublicSheetCountryPostings}=require(path.join(root,'src/scripts/build-gsheet-package'));
const {packageEligibility}=require(path.join(root,'src/lib/public-package-eligibility'));
const {getJobKey,getCanonicalURLKey,getCompanyTitleLocationKey}=require(path.join(root,'src/lib/job-dedupe'));
const {scoreWriterFit}=require(path.join(root,'src/lib/writer-fit-score'));
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const save=async(name,value)=>fs.writeFile(path.join(__dirname,name),JSON.stringify(value,null,2)+'\n');
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
async function fileHash(p){const h=crypto.createHash('sha256');for await(const b of fss.createReadStream(p))h.update(b);return h.digest('hex');}
function contract(row){return Object.fromEntries(EMPLOYMENT_FIELDS.map(k=>[k,row[k]]));}
function observationKey(batch,row){return JSON.stringify([batch,row.ATS,row.CatalogSlug,row.RawJobId,row.URL,row.FetchedAt]);}
function sample(row){return {ATS:row.ATS,Company:row.Company,Title:row.Title,URL:row.URL,SourceBatch:row.SourceBatch,FetchedAt:row.FetchedAt,display:displayEmploymentType(row),...contract(row)};}
function trueValue(v){return v===true||String(v).toUpperCase()==='TRUE';}
function compareText(a,b){const x=String(a||'').toLowerCase(),y=String(b||'').toLowerCase();return x<y?-1:x>y?1:0;}
function sortTop(rows){return [...rows].sort((a,b)=>((+b.WriterFitScore||0)-(+a.WriterFitScore||0))||((+a.TitleReviewPriority||999)-(+b.TitleReviewPriority||999))||(Number(trueValue(b.USRemoteEligible))-Number(trueValue(a.USRemoteEligible)))||(Number(trueValue(b.SalaryDetected))-Number(trueValue(a.SalaryDetected)))||compareText(a.Company,b.Company)||compareText(a.Title,b.Title));}
function loadAt(file,filename){const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fss.readFileSync(file,'utf8'),filename);return m.exports;}
async function main(){
 const inProgress=process.argv.includes('--in-progress');
 const processResult=inProgress?{recordedRun:await json(path.join(root,'data/jobs/reports/refresh-run.json')),exitCode:null,inProgress:true}:await json(path.join(__dirname,'process-result.json')),run=processResult.recordedRun,baseline=await json(path.join(evidence,'baseline/context.json'));
 const initialCode=await json(path.join(evidence,'baseline/code-hashes.json'));assert.equal(await fileHash(path.join(root,'src/lib/employment-type.js')),initialCode['src/lib/employment-type.js'],'Verify run artifacts before applying the candidate fix');
 assert(run&&run.RunId!==baseline.refreshRun.RunId,'A distinct refresh run is required');
 const result={run,process:processResult,checks:[],limits:[],generatedAt:new Date().toISOString()};
 const check=(requirement,pass,detail,evidencePath)=>result.checks.push({requirement,status:pass?'PASS':'FAIL',detail,evidence:evidencePath,runId:run.RunId});
 if(inProgress)result.checks.push({requirement:'Normal launcher completed',status:'NOT VERIFIED',detail:'Normal refresh is still running',runId:run.RunId});else check('Normal launcher completed',processResult.exitCode===0&&run.Status==='COMPLETE',processResult.exitCode,'process-result.json');
 const {packageIdentity}=require(path.join(root,'src/lib/package-status'));
 const packageRoot=path.join(root,'data/jobs/gsheet-package'),id=await packageIdentity(path.join(packageRoot,'latest')),dir=path.join(packageRoot,id);
 result.packageId=id;result.packageDirectory=dir;
 check('Distinct package from this refresh',id!==baseline.packageId&&Date.parse((await json(path.join(root,'data/jobs/reports/release-run-summary.json'))).GeneratedAt)>=Date.parse(run.StartedAt),id,'data/jobs/reports/release-run-summary.json');
 const jobFile=path.join(dir,'01_good_documentation_jobs.csv'),publicCsv=parseCsvRecords(await fs.readFile(jobFile,'utf8')),schema=await json(path.join(dir,'public-schema.json')),coverage=await json(path.join(dir,'employment-type-coverage.json'));
 result.public={headers:publicCsv.headers,rows:publicCsv.rows.length,coverage:employmentCoverage(publicCsv.rows,true),range:sheetRange(publicCsv.headers,publicCsv.rows.length),csv:jobFile,sha256:await fileHash(jobFile)};
 const oldHeaders=(await json(path.join(evidence,'baseline/package-summary.json'))).headers;
 check('Public column is appended; evidence is internal',JSON.stringify(publicCsv.headers)===JSON.stringify([...oldHeaders,'Employment Type'])&&!publicCsv.headers.includes('EmploymentTypeEvidence'),publicCsv.headers,jobFile);
 check('Public labels validate',publicCsv.rows.every(row=>validatePublicEmploymentLabel(row['Employment Type'])),result.public.coverage,jobFile);
 check('Schema, final coverage, and import range agree',schema.rowCount===publicCsv.rows.length&&schema.tableRange===result.public.range&&JSON.stringify(coverage.public)===JSON.stringify(result.public.coverage)&&(await fs.readFile(path.join(dir,'EMPLOYMENT_TYPE_IMPORT.md'),'utf8')).includes(result.public.range),{schema,coverage},dir);
 const manifests={};
 for(const folder of [dir,path.join(packageRoot,'latest')]){
   const manifest=await json(path.join(folder,'gsheet-package-manifest.json')),csv=parseCsvRecords(await fs.readFile(path.join(folder,'gsheet-package-manifest.csv'),'utf8'));let mismatches=[];
   for(const entry of manifest){if(!entry.Exists)continue;try{const actual=await fs.stat(path.join(folder,entry.FileName));if(Number(entry.SizeBytes)!==actual.size)mismatches.push({file:entry.FileName,recorded:entry.SizeBytes,actual:actual.size});}catch(error){mismatches.push({file:entry.FileName,error:error.message});}}
   for(const entry of manifest){const other=csv.rows.find(row=>row.FileName===entry.FileName);if(!other||Number(other.SizeBytes)!==Number(entry.SizeBytes))mismatches.push({file:entry.FileName,reason:'CSV manifest differs'});}
   manifests[path.basename(folder)]={mismatches,rows:manifest.length};
 }
 result.manifests=manifests;check('Manifest sizes and formats agree',Object.values(manifests).every(v=>v.mismatches.length===0),manifests,dir);
 const sameNames=['01_good_documentation_jobs.csv','public-schema.json','employment-type-coverage.json','EMPLOYMENT_TYPE_IMPORT.md'];let copies=[];
 for(const name of sameNames)copies.push({file:name,same:await fileHash(path.join(dir,name))===await fileHash(path.join(packageRoot,'latest',name))});
 check('Latest and dated copies agree',copies.every(c=>c.same),copies,dir);
 const prune=await json(path.join(dir,'01_good_documentation_jobs-url-check-summary.json'));result.urlChecks=prune;
 check('Current URL check and safe prune completed',prune.Applied===true&&prune.ApplyMode==='safe'&&prune.KeptRows===publicCsv.rows.length&&Date.parse(prune.CheckedAt)>=Date.parse(run.StartedAt),prune,dir);
 const tests=await json(path.join(root,'data/jobs/reports/test-all-results.json')),validation=await json(path.join(root,'data/jobs/reports/refresh-output-validation.json')),packageTest=await json(path.join(root,'data/jobs/reports/test-gsheet-package-results.json'));
 result.tests=tests;result.refreshValidation=validation;result.packageValidation=packageTest;
 check('Production suite belongs to this run',tests.RunId===run.RunId&&tests.PackageRun===id&&tests.Status==='PASS'&&tests.Tests.every(t=>t.ExitCode===0),{runId:tests.RunId,packageId:tests.PackageRun,status:tests.Status,tests:tests.Tests.length},'data/jobs/reports/test-all-results.json');
 check('Current refresh and package validation pass',validation.PackageRun===id&&validation.Status==='PASS'&&Date.parse(validation.GeneratedAt)>=Date.parse(run.StartedAt)&&packageTest.PackageRun===id&&packageTest.Failures.length===0,{validation,packageTest},'data/jobs/reports/refresh-output-validation.json');
 const detailed=parseCsvRecords(await fs.readFile(path.join(dir,'03_top_matches_full.csv'),'utf8'));
 const top=await json(path.join(root,'data/jobs/public/public-job-feed-deduped-top.json'));
 result.top={rows:top.length,coverage:employmentCoverage(top),newRows:top.filter(r=>Date.parse(r.FetchedAt)>=Date.parse(run.StartedAt)).length};
 check('Detailed CSV contains valid JSON arrays',detailed.rows.every(row=>{try{return Array.isArray(JSON.parse(row.EmploymentTerms))&&Array.isArray(JSON.parse(row.EmploymentTypeEvidence));}catch{return false;}}),{rows:detailed.rows.length},path.join(dir,'03_top_matches_full.csv'));
 const topMap=new Map(top.map(row=>[row.URL,row]));let csvDifferences=[];
 for(const row of detailed.rows){const other=topMap.get(row.URL);if(!other||JSON.stringify(ensureEmploymentType(row))!==JSON.stringify(contract(other)))csvDifferences.push(row.URL);}
 check('Shortlist evidence survives detailed CSV',csvDifferences.length===0,{differences:csvDifferences.slice(0,10)},dir);
 const batchRoot=path.join(root,'data/jobs/batches'),inventory=await json(path.join(evidence,'baseline/data-inventory.json'));const newBatches=(await fs.readdir(batchRoot,{withFileTypes:true})).filter(d=>d.isDirectory()&&!inventory['data/jobs/batches/'+d.name]).map(d=>d.name);
 const batchMap=new Map(),batchSummary={},representatives={};
 for(const batch of newBatches){const p=path.join(batchRoot,batch,'public-job-feed-batch.json');try{await fs.access(p);}catch{continue;}let count=0;for await(const row of iterateLargeJsonArrayFile(p)){count++;batchMap.set(observationKey(batch,row),{hash:hash(contract(row)),seen:false});const ats=row.ATS||'unknown';batchSummary[ats]||={rows:0,structuredRows:0,statuses:{},sourceFields:{}};const b=batchSummary[ats];b.rows++;b.statuses[row.EmploymentTypeStatus]=(b.statuses[row.EmploymentTypeStatus]||0)+1;const fields=(row.EmploymentTypeEvidence||[]).filter(e=>e.SourceKind==='structured_field');if(fields.length)b.structuredRows++;for(const e of fields)b.sourceFields[e.SourceField]=(b.sourceFields[e.SourceField]||0)+1;if(!representatives[ats]||(fields.some(e=>e.Value)&&!representatives[ats].EmploymentTypeEvidence.some(e=>e.SourceKind==='structured_field'&&e.Value)))representatives[ats]=sample({...row,SourceBatch:batch});}console.log('Read new batch',batch,count);}
 result.newBatches={names:newBatches,byATS:batchSummary,representatives};
 const candidates=[],canonicalStats={rows:0,newRows:0,retainedRows:0,byATS:{},contractErrors:0,sourceDateErrors:0,batchMatches:0,batchContractDifferences:0,unsupportedVariableRows:0,unsupportedVariableExamples:[],variableCompatibilityRows:0,variableCompatibilityExamples:[]};
 const feed=path.join(root,'data/jobs/public/public-job-feed-latest.json');
 for await(const row of iterateLargeJsonArrayFile(feed)){
   canonicalStats.rows++;const fresh=Date.parse(row.FetchedAt)>=Date.parse(run.StartedAt);canonicalStats[fresh?'newRows':'retainedRows']++;
   const ats=row.ATS||'unknown';canonicalStats.byATS[ats]||={newRows:0,retainedRows:0,structuredNew:0};canonicalStats.byATS[ats][fresh?'newRows':'retainedRows']++;
   if(fresh&&(row.EmploymentTypeEvidence||[]).some(e=>e.SourceKind==='structured_field'))canonicalStats.byATS[ats].structuredNew++;
   canonicalStats.contractErrors+=Number(validateEmploymentType(row).length>0);
   const unsupportedVariable=(row.EmploymentTypeEvidence||[]).some(item=>item.Value==='Variable'&&item.Dimension==='schedule'&&item.SourceKind!=='structured_field'&&!/\bvariable[\s_–—‑-]+(?:hours?|schedules?|shifts?|time)\b/i.test(item.RawValue||'')&&!(item.SourceKind==='description'&&(/^variable$/i.test(item.RawValue||'')||/\b(?:employment\s+(?:type|status)|position\s+type|job\s+type|schedule|commitment)\s*[:：]\s*variable\b/i.test(item.RawValue||''))));
   if(unsupportedVariable){canonicalStats.unsupportedVariableRows++;if(canonicalStats.unsupportedVariableExamples.length<10)canonicalStats.unsupportedVariableExamples.push(sample(row));}
   const values=new Set((row.EmploymentTypeEvidence||[]).filter(e=>e.Dimension==='schedule').map(e=>e.Value));const fixed=[...values].filter(v=>v!=='Variable');if(values.has('Variable')&&fixed.length===1&&row.EmploymentTypeStatus==='conflict'){canonicalStats.variableCompatibilityRows++;if(canonicalStats.variableCompatibilityExamples.length<10)canonicalStats.variableCompatibilityExamples.push(sample(row));}

   if((row.EmploymentTypeEvidence||[]).some(e=>e.ObservedAt&&Date.parse(e.ObservedAt)>Date.parse(row.FetchedAt)+1000))canonicalStats.sourceDateErrors++;
   const b=batchMap.get(observationKey(row.SourceBatch,row));if(b){b.seen=true;canonicalStats.batchMatches++;if(b.hash!==hash(contract(row)))canonicalStats.batchContractDifferences++;}
   if(['A','B'].includes(row.WriterFitTier)||row.TitleReviewBucket==='STRONG_MATCH')candidates.push(row);
   if(canonicalStats.rows%200000===0)console.log('Canonical records checked',canonicalStats.rows);
 }
 result.canonical=canonicalStats;result.newBatches.presentInCanonical=[...batchMap.values()].filter(v=>v.seen).length;
 check('Canonical employment contract and observation dates validate',canonicalStats.contractErrors===0&&canonicalStats.sourceDateErrors===0,canonicalStats,feed);
 check('Free text Variable values require an explicit schedule',canonicalStats.unsupportedVariableRows===0,{rows:canonicalStats.unsupportedVariableRows,examples:canonicalStats.unsupportedVariableExamples},feed);
 check('Variable hours or shifts do not contradict stated full-time or part-time hours',canonicalStats.variableCompatibilityRows===0,{rows:canonicalStats.variableCompatibilityRows,examples:canonicalStats.variableCompatibilityExamples},feed);
 check('New normalized batch evidence survives merge',canonicalStats.batchMatches>0&&canonicalStats.batchContractDifferences===0,{matched:canonicalStats.batchMatches,differences:canonicalStats.batchContractDifferences,newBatchRecords:batchMap.size},feed);
 const newRows=sortTop(selectDedupedRows(sortTop(candidates),'deduped-top').rows);
 const actualIdentities=top.map(r=>[r.URL,r.RawJobId]),calculatedIdentities=newRows.map(r=>[r.URL,r.RawJobId]);
 check('Controlled selection reproduces actual shortlist',JSON.stringify(actualIdentities)===JSON.stringify(calculatedIdentities),{actual:top.length,calculated:newRows.length,candidates:candidates.length},feed);
 const oldSelect=loadAt(path.join(evidence,'baseline/dedupe-select-head.cjs'),path.join(root,'src/lib/dedupe-select-head-verification.cjs'));
 const oldGroup=loadAt(path.join(evidence,'baseline/build-gsheet-package-head.cjs'),path.join(root,'src/scripts/build-gsheet-package-head-verification.cjs')).groupPublicSheetCountryPostings;
 const oldRows=sortTop(oldSelect.selectDedupedRows(sortTop(candidates),'deduped-top').rows),newEligible=packageEligibility(newRows).included,oldEligible=packageEligibility(oldRows).included;
 const generatedAt=(await json(path.join(root,'data/jobs/reports/release-run-summary.json'))).GeneratedAt;
 const groupedNew=groupPublicSheetCountryPostings(newEligible.map(r=>buildSimplePublicRow(r,generatedAt))),groupedOld=oldGroup(oldEligible.map(r=>buildSimplePublicRow(r,generatedAt)));
 result.controlledComparison={input:feed,inputRows:canonicalStats.rows,strongCandidates:candidates.length,oldSelected:oldRows.length,newSelected:newRows.length,oldEligible:oldEligible.length,newEligible:newEligible.length,oldGroupedBeforeLinks:groupedOld.length,newGroupedBeforeLinks:groupedNew.length,selectionDelta:newRows.length-oldRows.length,publicGroupingDelta:groupedNew.length-groupedOld.length,limit:'Both rule sets use the same current canonical records and scores. These counts are before URL checks. They do not assign normal source additions/removals or changed URL outcomes to the feature.'};
 const sourcePublic=new Map(groupedNew.map(row=>[row['Apply Link'],row]));let displayDifferences=[];
 for(const row of publicCsv.rows){const other=sourcePublic.get(row['Apply Link']);if(!other||String(other['Employment Type'])!==row['Employment Type'])displayDifferences.push(row['Apply Link']);}
 check('Final public labels trace to current grouped shortlist',displayDifferences.length===0,{differences:displayDifferences},jobFile);
 const publicExamples={};for(const row of top){const key=row.ATS||'unknown';if(!publicExamples[key]||(Date.parse(row.FetchedAt)>=Date.parse(run.StartedAt)&&publicExamples[key].scope!=='new'))publicExamples[key]={scope:Date.parse(row.FetchedAt)>=Date.parse(run.StartedAt)?'new':'retained',...sample(row)};}result.publicExamples=publicExamples;
 let scoreDifferences=0,keyDifferences=0;for(const row of candidates){const plain={...row};for(const field of EMPLOYMENT_FIELDS)delete plain[field];if(JSON.stringify(scoreWriterFit(row))!==JSON.stringify(scoreWriterFit(plain)))scoreDifferences++;if(getJobKey(row)!==getJobKey(plain)||getCompanyTitleLocationKey(row)!==getCompanyTitleLocationKey(plain)||getCanonicalURLKey(row.URL)!==getCanonicalURLKey(plain.URL))keyDifferences++;}
 check('Employment fields do not change scores or identity keys on the same inputs',scoreDifferences===0&&keyDifferences===0,{rows:candidates.length,scoreDifferences,keyDifferences},feed);
 const conflicts=top.filter(r=>r.EmploymentTypeStatus==='conflict').map(sample);result.conflicts=conflicts;
 result.backup=await json(path.join(root,'data/jobs/reports/daily-history-backup.json'));result.historyValidation=await json(path.join(root,'data/jobs/history/validation.json'));
 if(inProgress)result.checks.push({requirement:'History result belongs to this run and package',status:'NOT VERIFIED',detail:'Wait for the normal history and backup stage; the prior result is not evidence for this run',runId:run.RunId});else check('History result belongs to this run and package',result.backup.RunId===run.RunId&&result.backup.History==='PASS'&&result.backup.LatestSnapshot===id&&Date.parse(result.backup.GeneratedAt)>=Date.parse(run.StartedAt),result.backup,'data/jobs/reports/daily-history-backup.json');
 result.limits.push('Raw successful ATS responses are not archived by the normal collector. Observed field tracing starts at the normalized batch evidence. No extra source or detail request was made for verification.');
 result.limits.push('Workday jobPostingInfo and iCIMS detail-only fields remain outside this release. Unknown structured labels remain evidence without a forced public category.');
 result.limits.push('The daily profile does not create a formula CSV. Formula parity and synchronization were tested with offline fixtures.');
 await save(inProgress?'artifact-verification-in-progress.json':'artifact-verification.json',result);console.log('Saved artifact verification',id,result.public.rows,result.checks.filter(c=>c.status==='FAIL').map(c=>c.requirement));
}
main().catch(async error=>{console.error(error);await save('artifact-verification-error.json',{error:error.stack,at:new Date().toISOString()});process.exitCode=1;});
