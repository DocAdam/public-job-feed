import os,json,gzip,hashlib,datetime,subprocess
from pathlib import Path
root=Path('/Users/adampugh/GitHub/public-job-feed');out=root/'docs/plans/monthly-history-writer-20261020'
with gzip.open(out/'protected-before.jsonl.gz','rt') as f:saved=[json.loads(line) for line in f]
changes=[];errors=[];groups={};unchanged=0
for i,r in enumerate(saved):
 p=Path(r['path'])
 try:
  s=p.lstat();target_before=p.stat();h=hashlib.sha256()
  with p.open('rb') as f:
   for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
  t=p.lstat();target_after=p.stat()
  current={'path':str(p),'bytes':s.st_size,'mtime_ns':s.st_mtime_ns,'inode':s.st_ino,'link':os.readlink(p) if p.is_symlink() else None,'sha256':h.hexdigest()}
  stable=(s.st_size,s.st_mtime_ns,s.st_ino)==(t.st_size,t.st_mtime_ns,t.st_ino) and (target_before.st_size,target_before.st_mtime_ns,target_before.st_ino)==(target_after.st_size,target_after.st_mtime_ns,target_after.st_ino)
  group='latest_exports' if '/gsheet-package/latest/' in str(p) else 'dated_packages' if '/gsheet-package/' in str(p) and p.relative_to(root/'data/jobs/gsheet-package').parts[0][:8].isdigit() else 'batches' if '/batches/' in str(p) else 'recovery_and_database' if '/history/' in str(p) or '/history-migrations/' in str(p) else 'other_protected'
  groups[group]=groups.get(group,0)+1
  if current!=r or not stable:changes.append({'group':group,'before':r,'after':current,'stable_during_read':stable})
  else:unchanged+=1
 except Exception as e:errors.append({'path':str(p),'error':str(e)})
 if i%10000==0:print(i,len(saved),flush=True)
paths=[]
for rel in ['data/jobs/batches','data/jobs/gsheet-package','data/jobs/history','data/jobs/history-migrations','data/jobs/index']:
 for parent,dirs,files in os.walk(root/rel,followlinks=False):
  for name in dirs+files:
   p=Path(parent)/name
   if p.is_file() or p.is_symlink():paths.append(str(p))
added=sorted(set(paths)-{r['path'] for r in saved});missing=sorted({r['path'] for r in saved}-set(paths))
unexpected=[c for c in changes if c['group']!='latest_exports']
status='original_protected_data_unchanged_with_concurrent_refresh_changes' if not unexpected and not errors and not missing else 'review_required'
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':status,'checked_baseline_files':len(saved),'unchanged_files':unchanged,'groups':groups,'changed_files':changes,'unexpected_protected_changes':unexpected,'errors':errors,'added_paths':added,'missing_paths':missing,'scope_note':'Independent refresh process started at 06:08:28 CDT, before this task baseline, and wrote current feed/package outputs. No production writer, index, refresh, or retirement command was invoked by this task.'}
(out/'preservation-review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['status','checked_baseline_files','unchanged_files','groups']},indent=2));print('changes',len(changes),'added',len(added),'unexpected',len(unexpected),'errors',len(errors))
