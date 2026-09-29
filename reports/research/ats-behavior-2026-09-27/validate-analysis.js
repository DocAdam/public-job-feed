// Validate saved analysis without fetching data or changing production files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const local=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n),'utf8'));
async function main(){
 const q=local('quantitative-evidence.json'),c=local('cohort-evidence.json');
 const summary=JSON.parse(fs.readFileSync(path.join(root,'data/jobs/public/public-job-feed-latest-summary.json'),'utf8'));
 assert.equal(q.total,summary.TotalRows);
 assert.equal(Object.values(q.stats).reduce((n,x)=>n+x.rows,0),q.total);
 for(const z of Object.values(c.cohorts))for(let i=0;i<2;i++){
  assert.equal(z.rows[i]-z.removed[i]+z.added[i],z.rows[i+1]);
  assert.equal(z.rows[i]-z.removed[i],z.retained[i]);
 }
 assert.equal(c.health.uniqueChecks,q.urlStats.observations);
 assert.equal(Object.values(c.health.byATS).reduce((n,z)=>n+z.http200Issues,0),q.urlStats.http200Issues);
 const docs=['ats-behavior-analysis.md','doc-job-search-playbook.md'];let localLinks=0;
 for(const d of docs){const text=fs.readFileSync(path.join(__dirname,d),'utf8');assert(!/<!-- .*TABLE -->/.test(text));for(const m of text.matchAll(/\]\(([^)]+)\)/g)){if(!/^https?:/.test(m[1])){const [target]=m[1].split('#');if(target){if(target!=='validation.json')assert(fs.existsSync(path.resolve(__dirname,target)),target);localLinks++;}}}}
 const allInputs=new Map([...local('input-manifest.json').inputs,...c.inputs].map(r=>[r.path,r]));let bytes=0;
 for(const [p,r] of allInputs){const file=path.join(root,p),h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);assert.equal(h.digest('hex'),r.sha256,p+' changed');bytes+=r.bytes;}
 const reviewed=c.reviewed;
 assert(reviewed.find(r=>r.RawJobId==='8128683').PlainDescription.includes('CAD'));
 assert.equal(reviewed.find(r=>r.RawJobId==='8128683').SalaryCurrency,'USD');
 assert(reviewed.find(r=>r.RawJobId==='9ce12e95-88cd-4da4-8f61-f9cb198b1cc8').PlainDescription.includes('$102,300.00 to $164,900.00'));
 assert.equal(reviewed.find(r=>r.RawJobId==='9ce12e95-88cd-4da4-8f61-f9cb198b1cc8').SalaryText,'');
 const codeFiles=['src/lib/jobs-normalize.js','src/lib/job-dedupe.js','src/lib/job-url-health.js','src/lib/work-arrangement.js','src/lib/salary-detect.js','src/lib/curated-submissions.js','src/scripts/merge-batches.js','src/scripts/fetch-batch-jobs.js','src/scripts/report-job-trends.js',...['ashby','greenhouse','lever','bamboohr','workday','icims','talentbrew'].map(a=>`src/lib/ats/${a}.js`)];
 const codeHashes=codeFiles.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}));
 const result={status:'PASS',checks:{fullFeedMatchesSavedSummary:true,cohortBalances:true,urlTotalsReconcile:true,allInputHashesUnchanged:true,verifiedInputFiles:allInputs.size,verifiedBytes:bytes,localFileLinks:localLinks,confirmedSalaryExamples:2},codeHashes,
  fixtureChecksRunInThisTask:[['node src/scripts/test-job-url-health.js','PASS'],['node src/scripts/test-dedupe-select.js','PASS'],['node src/scripts/test-ats-error-classification.js','PASS'],['node src/scripts/test-talentbrew-parser.js','PASS']],
  commands:['node --max-old-space-size=6144 reports/research/ats-behavior-2026-09-27/analyze-ats-behavior.js','node --max-old-space-size=6144 reports/research/ats-behavior-2026-09-27/analyze-saved-cohorts.js','node reports/research/ats-behavior-2026-09-27/validate-analysis.js'],
  limits:['Fixture results above record earlier commands in this task; this validation script does not rerun them.','The full suite was not rerun.','No live open-status or ATS-wide completeness claim is validated.','Research scripts and reports are the only intended writes.']};
 fs.writeFileSync(path.join(__dirname,'validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.checks));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
