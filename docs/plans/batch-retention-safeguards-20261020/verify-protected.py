import os,sys,json,gzip,hashlib,stat,datetime
from pathlib import Path
root=Path('/Users/adampugh/GitHub/public-job-feed');out=root/'docs/plans/batch-retention-safeguards-20261020'
def inventory():
 paths=[]
 for rel in ['data/jobs/batches','data/jobs/gsheet-package','data/jobs/history','data/jobs/history-migrations','data/jobs/index']:
  for parent,dirs,files in os.walk(root/rel,followlinks=False):
   for name in dirs+files:
    p=Path(parent)/name
    if p.is_file() or p.is_symlink():paths.append(p)
 return sorted(paths)
def record(p):
 s=p.lstat();h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 t=p.lstat();assert (s.st_size,s.st_mtime_ns,s.st_ino)==(t.st_size,t.st_mtime_ns,t.st_ino)
 return {'path':str(p),'bytes':s.st_size,'mtime_ns':s.st_mtime_ns,'inode':s.st_ino,'link':os.readlink(p) if p.is_symlink() else None,'sha256':h.hexdigest()}
paths=inventory()
if sys.argv[1]=='before':
 with gzip.open(out/'protected-before.jsonl.gz','xt') as f:
  for i,p in enumerate(paths):
   f.write(json.dumps(record(p),separators=(',',':'))+'\n')
   if i%10000==0:print(i,len(paths),flush=True)
else:
 with gzip.open(out/'protected-before.jsonl.gz','rt') as f: saved=[json.loads(line) for line in f]
 assert [str(p) for p in paths]==[r['path'] for r in saved],'Inventory changed'
 for i,r in enumerate(saved):
  assert record(Path(r['path']))==r,'Protected content or metadata changed: '+r['path']
  if i%10000==0:print(i,len(paths),flush=True)
 assert inventory()==paths
 (out/'protected-after.json').write_text(json.dumps({'status':'passed','files':len(paths),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'content_and_metadata_mismatches':0},indent=2)+'\n')
print('PASS',sys.argv[1],len(paths),flush=True)
