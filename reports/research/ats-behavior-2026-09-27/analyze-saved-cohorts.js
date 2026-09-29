// Offline follow-up. Reads saved batches and packages; writes only in this folder.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const {parseCsvRecords}=require(path.join(root,'src/lib/csv'));
const inputs=[];
function read(p){const b=fs.readFileSync(path.join(root,p));inputs.push({path:p,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});return b.toString();}
const json=p=>JSON.parse(read(p)); const csv=p=>parseCsvRecords(read(p)).rows;
const inc=(o,k,n=1)=>o[k]=(o[k]||0)+n;
const plain=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const examples={};function example(k,x){const a=examples[k]||=[];if(a.length<5)a.push(x);}
const batches=json('data/jobs/index/batch-index.json');
const cohorts={};
for(const ats of ['ashby','greenhouse','lever','bamboohr']){
 const selected=batches.filter(b=>b.ATS===ats&&b.BatchName.startsWith('refresh-known-good-')).sort((a,b)=>a.GeneratedAt.localeCompare(b.GeneratedAt)).slice(-3);
 const snapshots=[];
 for(const b of selected){const base=`data/jobs/batches/${b.BatchName}/`;const logs=json(base+'jobs-batch-fetch-log.json');const successful=new Set(logs.filter(r=>['success','empty'].includes(r.Status)).map(r=>r.CatalogSlug));const rows=json(base+'public-job-feed-batch.json');const boards=new Map();for(const r of rows){const m=boards.get(r.CatalogSlug)||new Map();m.set(r.RawJobId||r.URL,r);boards.set(r.CatalogSlug,m);}snapshots.push({file:base+'public-job-feed-batch.json',successful,boards});}
 const common=[...snapshots[0].successful].filter(b=>snapshots.every(s=>s.successful.has(b)));
 const out={files:snapshots.map(s=>s.file),boards:common.length,rows:[],removed:[],added:[],retained:[],changes:{},returningIds:0};
 for(let i=0;i<3;i++)out.rows.push(common.reduce((n,b)=>n+(snapshots[i].boards.get(b)?.size||0),0));
 for(let i=1;i<3;i++){
  let removed=0,added=0,retained=0;
  for(const b of common){const prev=snapshots[i-1].boards.get(b)||new Map(),curr=snapshots[i].boards.get(b)||new Map();for(const [k,r] of prev){if(!curr.has(k)){removed++;example(ats+':removed',{beforeFile:snapshots[i-1].file,afterFile:snapshots[i].file,board:b,id:k,title:r.Title,url:r.URL});}else{retained++;for(const f of ['Title','Description','DatePosted','Location','SalaryMin','SalaryMax','RemoteStatus'])if(plain(r[f])!==plain(curr.get(k)[f])){inc(out.changes,f);example(ats+':'+f,{beforeFile:snapshots[i-1].file,afterFile:snapshots[i].file,board:b,id:k,title:r.Title,url:r.URL,before:r[f],after:curr.get(k)[f]});}}}for(const [k,r] of curr)if(!prev.has(k))added++;
  }
  out.removed.push(removed);out.added.push(added);out.retained.push(retained);
 }
 for(const b of common){const first=snapshots[0].boards.get(b)||new Map(),middle=snapshots[1].boards.get(b)||new Map(),last=snapshots[2].boards.get(b)||new Map();for(const [k,r] of first)if(!middle.has(k)&&last.has(k)){out.returningIds++;example(ats+':return',{board:b,id:k,url:r.URL,files:out.files});}}
 cohorts[ats]=out;console.log(ats,common.length,'common boards');
}
const packages=fs.readdirSync(path.join(root,'data/jobs/gsheet-package')).filter(x=>/^\d{8}-\d{4}$/.test(x)).sort();
const checks=new Map();
for(const pkg of packages){const p=`data/jobs/gsheet-package/${pkg}/01_good_documentation_jobs-url-review.csv`;if(fs.existsSync(path.join(root,p)))for(const r of csv(p)){const k=[r['Apply Link'],r.UrlCheckCheckedAt].join('|');if(!checks.has(k))checks.set(k,{file:p,...r});}}
const health={uniqueChecks:checks.size,byATS:{},min:'',max:''};
for(const r of checks.values()){
 const s=health.byATS[r.Source]||={checks:0,issues:{},http200Issues:0,http200Urls:new Set(),http200Companies:new Set(),status:{}};s.checks++;inc(s.status,r.UrlCheckHttpStatus||'none');if(r.UrlCheckIssue)inc(s.issues,r.UrlCheckIssue);
 if(r.UrlCheckCheckedAt){health.min=!health.min||r.UrlCheckCheckedAt<health.min?r.UrlCheckCheckedAt:health.min;health.max=r.UrlCheckCheckedAt>health.max?r.UrlCheckCheckedAt:health.max;}
 if(r.UrlCheckHttpStatus==='200'&&r.UrlCheckIssue){s.http200Issues++;s.http200Urls.add(r['Apply Link']);s.http200Companies.add(r.Company);example(r.Source+':http200Issue',r);}
}
for(const s of Object.values(health.byATS)){s.http200Urls=s.http200Urls.size;s.http200Companies=s.http200Companies.size;}
const candidates=json(path.relative(root,path.join(__dirname,'discovery-candidates.json')));
const qualified={candidateRows:candidates.length,headings:{},examples:{}};
for(const [name,regex] of Object.entries({required:/\b(?:required qualifications|requirements|what you.ll need)\b/i,preferred:/\b(?:preferred qualifications|preferred experience|preferred skills)\b/i,bonus:/\b(?:nice.to.haves?|bonus|a plus)\b/i}))qualified.headings[name]=candidates.filter(r=>regex.test(plain(r.Description))).length;
const chosen=['4411944009','4c7683fa-fe37-44d9-aa3f-2f57a37c11f8','8128682','6174117004','8728346002','8134425','6098816004','5371666008','36a0249e-a672-44df-a08e-b5a5523dec26','4729404005','4017331008','9ce12e95-88cd-4da4-8f61-f9cb198b1cc8','8128683','6128026004','8300af8d-afb3-422d-a02c-1fec625dfe4d'];
const reviewed=candidates.filter(r=>chosen.includes(r.RawJobId));
for(const r of reviewed){r.PlainDescription=plain(r.Description);delete r.Description;}
const out={cohorts,health,qualified,examples,reviewed,inputs};
fs.writeFileSync(path.join(__dirname,'cohort-evidence.json'),JSON.stringify(out,null,2)+'\n');
console.log('Saved cohort evidence; selected records:',reviewed.length);
