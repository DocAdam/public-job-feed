"""One-time cleanup checks. No production writer or batch retirement calls."""
import os, sys, json, hashlib, gzip, stat, subprocess, shutil, datetime, tempfile
from pathlib import Path
ROOT=Path('/Users/adampugh/GitHub/public-job-feed')
OUT=ROOT/'docs/plans/job-history-test-cleanup-20261020'
OLD=json.loads((ROOT/'docs/plans/job-history-retention-inventory.json').read_text())
DB=ROOT/'data/jobs/history/jobs-history.duckdb'
TARGETS=[Path(p) for p in OLD['scope_roots'][1:]]
BASE=json.loads((ROOT/'data/jobs/history-migrations/20261019-writer-review/execution-9819f508/baseline.json').read_text())
CANDIDATE=ROOT/'data/jobs/history-migrations/20261019-writer-review/candidate.duckdb'
CONTROL=CANDIDATE.with_name('v1-control.duckdb')
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name,value):
 p=OUT/name
 with p.open('x') as f: json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def sha(p):
 h=hashlib.sha256();before=p.stat()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 after=p.stat();assert (before.st_size,before.st_mtime_ns,before.st_ino)==(after.st_size,after.st_mtime_ns,after.st_ino),str(p)
 return h.hexdigest()
def meta(p):
 s=p.lstat();return {'bytes':s.st_size,'allocated_bytes':s.st_blocks*512,'mtime_ns':s.st_mtime_ns,'inode':s.st_ino,'mode':stat.S_IFMT(s.st_mode)}
def free():return shutil.disk_usage(ROOT).free
def run(name,args):
 print('Starting '+name,flush=True)
 with (OUT/(name+'.json')).open('x') as out, (OUT/(name+'.stderr')).open('x') as err:
  r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=err)
 assert r.returncode==0,name+' failed; see saved stderr'
 print('Passed '+name,flush=True)
 return json.loads((OUT/(name+'.json')).read_text())
def inspect(name,database):
 value=run(name,['node','--max-old-space-size=128','--expose-gc','src/scripts/job-history-runtime-worker.js','inspect',str(database),str(ROOT/'data/jobs/gsheet-package')])
 result=value['result'];assert not result['errors'] and not result['pending_snapshots']
 for key,n in [('snapshots',152),('raw_top_match_rows',111624),('observations',111614),('raw_good_job_rows',98896),('good_job_exceptions',40)]:assert int(result[key])==n,(key,result[key])
 return value

def targets_check():
 files=[];tokens=[];dirs=[]
 for target in TARGETS:
  assert target.name in ['job-history-bounded-BljI6a','job-history-bounded-B2D5Pb']
  assert target.resolve().parent==Path(tempfile.gettempdir()).resolve() and not target.is_symlink()
  assert target.stat().st_uid==os.getuid()
  owner=json.loads((target/'owner.json').read_text());assert owner['format']=='history-storage-prototype-1' and isinstance(owner['token'],str) and len(owner['token'])>20
  tokens.append(owner['token'])
  expected={Path(f['path']).name:f for f in OLD['files'] if f['root']==str(target)}
  entries=list(target.iterdir()); actual={p.name for p in entries if p.is_file()}
  assert actual==set(expected),'Changed target file inventory'
  for p in entries:
   assert not p.is_symlink(),'Target contains symlink'
   if p.is_dir():
    assert p.name=='prototype.duckdb.tmp' and not list(p.iterdir()),'Unexpected target directory'
    dirs.append({'path':str(p),'metadata':meta(p)})
    continue
   assert p.is_file()
   assert p.stat().st_size==expected[p.name]['bytes'] and p.stat().st_mtime_ns==expected[p.name]['mtime_ns'],'Changed target file'
   h=sha(p); saved=next((f for f in OLD['database_files'] if f['path']==str(p)),None)
   if saved:assert h==saved['sha256'],'Changed target database'
   files.append({'path':str(p),'sha256':h,**meta(p)})
  for name in ['writer.lock','recovery.lock','prototype.duckdb.wal','operation.next']:
   assert not (target/name).exists(),name
  if (target/'operation.json').exists():assert json.loads((target/'operation.json').read_text())['state']=='complete'
 # lsof returns 1 with no output when none of these files are open.
 result=subprocess.run(['/usr/sbin/lsof','-nP','--']+[r['path'] for r in files],capture_output=True,text=True)
 assert result.returncode==1 and not result.stdout and not result.stderr,'Target file is open or lsof failed'
 return files,tokens,dirs

def protected_paths():
 out=[]
 for rel in ['data/jobs/batches','data/jobs/gsheet-package','data/jobs/history','data/jobs/history-migrations']:
  for parent,dirs,files in os.walk(ROOT/rel,followlinks=False):
   for name in dirs+files:
    p=Path(parent)/name
    if p.is_symlink() or p.is_file():
     if p==Path(str(DB)+'.history-lock'):continue
     out.append(p)
 for name in BASE['code']:out.append(ROOT/name)
 out.append(ROOT/'data/jobs/reports/jobs-history-report.md')
 return sorted(set(out))

def protected_record(p):
 r={'path':str(p),**meta(p)}
 if p.is_symlink():r.update(link=os.readlink(p),target_sha256=sha(p),target_metadata=meta(p.resolve()))
 else:r['sha256']=sha(p)
 return r

def baseline():
 assert not (OUT/'prepared.json').exists()
 files,tokens,dirs=targets_check();save('target-inventory.json',{'files':files,'empty_directories':dirs})
 journal=json.loads(Path(str(DB)+'.history-operation.json').read_text());assert journal['state']=='accepted'
 expected={str(DB):journal['newHash'],str(CANDIDATE):BASE['candidate_sha256'],str(CONTROL):BASE['control_sha256'],str(DB)+'.operations/'+journal['id']+'/before.duckdb':journal['oldHash']}
 for name,h in expected.items():assert sha(Path(name))==h,'Recovery copy changed'
 assert expected[str(DB)]==expected[str(CANDIDATE)]
 for suffix in ['.wal','.history-lock','.history-recovery-lock']:assert not Path(str(DB)+suffix).exists()
 # Archive every non-database test record. Remove both owner tokens wherever they occur.
 archived=[]
 for r in files:
  p=Path(r['path'])
  if p.suffix=='.duckdb':continue
  text=p.read_text();clean=text
  for token in tokens:clean=clean.replace(token,'[REDACTED_OWNER_TOKEN]')
  json.loads(clean)
  destination=OUT/'test-records'/p.parent.name/p.name;destination.parent.mkdir(parents=True,exist_ok=True)
  with destination.open('x') as f:f.write(clean);f.flush();os.fsync(f.fileno())
  assert destination.read_text()==clean and not any(t in clean for t in tokens)
  archived.append({'source':str(p),'saved':str(destination),'source_sha256':r['sha256'],'saved_sha256':sha(destination),'token_redacted':clean!=text})
 save('test-record-manifest.json',archived)
 total=0;paths=protected_paths();print('Hashing protected files, including all collection batches',flush=True)
 with gzip.open(OUT/'protected-before.jsonl.gz','xt') as out:
  for i,p in enumerate(paths):
   r=protected_record(p);out.write(json.dumps(r,separators=(',',':'))+'\n');total+=r['bytes']
   if i%5000==0:print('Protected files checked: '+str(i)+'/'+str(len(paths)),flush=True)
 # Check that the source inventory and runtime still match the accepted migration baseline.
 with gzip.open(OUT/'protected-before.jsonl.gz','rt') as inp:records={r['path']:r for r in map(json.loads,inp)}
 source_root=ROOT/'data/jobs/gsheet-package'
 for rel,e in BASE['sources'].items():
  r=records[str(source_root/rel)]
  if 'sha256' in e:assert r['sha256']==e['sha256'],'Source changed since review: '+rel
  else:assert r['link']==e['link'] and r['target_sha256']==e['target_sha256']
 for rel,e in BASE['code'].items():assert records[str(ROOT/rel)]['sha256']==(e['sha256'] if isinstance(e,dict) else e),'Runtime changed since review'
 save('prepared.json',{'at':now(),'protected_files':len(paths),'protected_bytes':total,'target_files':len(files),'archived_records':len(archived),'expected_database_hashes':expected,'empty_temp_directory_note':'Existing empty DuckDB spill directory; its modification time predates the retention review.'})
 print('Prepared checks and preserved test records',flush=True)

def protected_stat_check():
 with gzip.open(OUT/'protected-before.jsonl.gz','rt') as f: saved=[json.loads(line) for line in f]
 assert [r['path'] for r in saved]==[str(p) for p in protected_paths()],'Protected inventory changed'
 for r in saved:
  p=Path(r['path'])
  for key,value in meta(p).items():assert r[key]==value,'Protected metadata changed: '+str(p)
  if 'link' in r:assert os.readlink(p)==r['link'] and meta(p.resolve())==r['target_metadata']
 return saved

def recover():
 prepared=json.loads((OUT/'prepared.json').read_text());protected_stat_check()
 before=inspect('production-audit-before',DB)
 restored=OUT/'recovery-test.duckdb'
 assert not restored.exists()
 with CANDIDATE.open('rb') as src,restored.open('xb') as dest:
  shutil.copyfileobj(src,dest,1024*1024);dest.flush();os.fsync(dest.fileno())
 expected=prepared['expected_database_hashes'][str(CANDIDATE)]
 assert sha(restored)==expected
 restored_audit=inspect('restored-copy-audit',restored)
 assert restored_audit['result']==before['result'],'Restored audit results differ'
 report=run('restored-copy-report',['node','src/scripts/report-jobs-history.js','--database',str(restored),'--output',str(OUT/'restored-report.md')])
 assert report['latest']=='20261019-0616'
 assert sha(restored)==expected and sha(CANDIDATE)==expected
 for suffix in ['.wal','.history-lock','.history-recovery-lock']:assert not Path(str(restored)+suffix).exists()
 # Remove only this run's verified restoration test copy.
 restored.unlink()
 spill=Path(str(restored)+'.tmp')
 if spill.exists():assert spill.is_dir() and not spill.is_symlink() and not list(spill.iterdir());spill.rmdir()
 protected_stat_check()
 save('recovery-checks.json',{'at':now(),'status':'passed','production_audit':'passed','isolated_restore_hash':expected,'restored_audit_matches_production':True,'report_latest':report['latest'],'restoration_test_copy_removed':True,'production_copy_never_replaced':True})

def cleanup():
 import time
 assert json.loads((OUT/'recovery-checks.json').read_text())['status']=='passed'
 assert not (OUT/'deletion-result.json').exists() and not (OUT/'deleted-files.jsonl').exists()
 protected_stat_check()
 records=json.loads((OUT/'test-record-manifest.json').read_text())
 for r in records:assert sha(Path(r['saved']))==r['saved_sha256'],'Saved test record changed'
 files,tokens,dirs=targets_check()
 expected=json.loads((OUT/'target-inventory.json').read_text())
 assert files==expected['files'] and dirs==expected['empty_directories'],'Target changed after preparation'
 prepared=json.loads((OUT/'prepared.json').read_text())
 for p,h in prepared['expected_database_hashes'].items():assert sha(Path(p))==h,'Recovery copy changed'
 protected_stat_check()
 before=free();started=now();removed=[]
 with (OUT/'deleted-files.jsonl').open('x') as log:
  for target in TARGETS:
   # This exact inventory was checked above. No recursive wildcard removal.
   for r in files:
    p=Path(r['path'])
    if p.parent!=target:continue
    assert meta(p)=={k:r[k] for k in meta(p)}
    p.unlink();removed.append(r)
    log.write(json.dumps({'path':str(p),'sha256':r['sha256'],'bytes':r['bytes'],'removed_at':now()})+'\n');log.flush();os.fsync(log.fileno())
   for r in dirs:
    p=Path(r['path'])
    if p.parent==target:p.rmdir()
   target.rmdir()
  assert all(not t.exists() for t in TARGETS)
 after=free();time.sleep(3);settled=free()
 save('deletion-result.json',{'status':'completed','started_at':started,'finished_at':now(),'removed_folders':list(map(str,TARGETS)),'removed_files':len(removed),'removed_logical_bytes':sum(r['bytes'] for r in removed),'removed_allocated_bytes':sum(r['allocated_bytes'] for r in removed),'database_bytes_removed':sum(r['bytes'] for r in removed if r['path'].endswith('.duckdb')),'free_bytes_before':before,'free_bytes_immediate_after':after,'free_bytes_after_three_seconds':settled,'observed_free_space_increase':settled-before,'preserved_test_records':len(records),'space_note':'Observed volume change may include other system activity and APFS shared blocks or snapshots.'})
 print('Removed only the two approved old test folders',flush=True)

def verify():
 result=inspect('production-audit-after',DB)
 before=json.loads((OUT/'production-audit-before.json').read_text())
 assert result['result']==before['result'],'Production audit changed'
 saved=protected_stat_check();checked=0;total=0;counts={}
 print('Rechecking all protected content hashes',flush=True)
 for r in saved:
  p=Path(r['path']);actual=protected_record(p);assert actual==r,'Protected content changed: '+str(p)
  checked+=1;total+=r['bytes']
  group='batches' if '/data/jobs/batches/' in str(p) else 'packages' if '/data/jobs/gsheet-package/' in str(p) else 'other_protected'
  counts[group]=counts.get(group,0)+1
  if checked%5000==0:print('Unchanged protected files: '+str(checked)+'/'+str(len(saved)),flush=True)
 protected_stat_check()
 assert all(not t.exists() for t in TARGETS)
 save('final-verification.json',{'at':now(),'status':'passed','protected_files':checked,'protected_bytes':total,'groups':counts,'content_hash_mismatches':0,'inventory_or_metadata_changes':0,'production_audit_matches_before':True,'known_source_warnings':len(result['result']['warnings']),'production_structural_errors':result['result']['errors'],'production_snapshots':result['result']['snapshots'],'latest':result['result']['latest'],'removed_folders_absent':True})

if __name__=='__main__':
 modes={'prepare':baseline,'recover':recover,'cleanup':cleanup,'verify':verify}
 assert sys.argv[1] in modes;modes[sys.argv[1]]()
