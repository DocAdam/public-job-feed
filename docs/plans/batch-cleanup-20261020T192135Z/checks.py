"""Read-only data checks for the approved 762-batch cleanup."""
import datetime, gzip, hashlib, importlib.util, json, os, stat, sys
from pathlib import Path

ROOT = Path('/Users/adampugh/GitHub/public-job-feed')
OUT = Path(__file__).parent
ARCHIVE = ROOT / 'data/jobs/archives/20261020-762-batches'
EXTERNAL = Path('/Volumes/1Pugh/Public Job Feed Archives/20261020-762-batches')
MANIFEST = json.loads((ARCHIVE / 'manifest.json').read_text())
NAMES = set(MANIFEST['batch_names'])
assert len(NAMES) == 762

def save(name, data):
    with (OUT / name).open('x') as f:
        json.dump(data, f, indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())

def record(p):
    s = p.lstat()
    assert stat.S_ISREG(s.st_mode) or stat.S_ISLNK(s.st_mode), str(p)
    h = hashlib.sha256()
    with p.open('rb') as f:
        while b := f.read(8 * 1024 * 1024): h.update(b)
    t = p.lstat()
    attrs = lambda v: [v.st_dev, v.st_ino, v.st_size, v.st_mtime_ns, v.st_ctime_ns, v.st_mode]
    assert attrs(s) == attrs(t), 'Changed during read: ' + str(p)
    return {'path': str(p), 'metadata': attrs(s), 'link': os.readlink(p) if p.is_symlink() else None, 'sha256': h.hexdigest()}

def inventory():
    found = []
    roots = [ROOT / ('data/jobs/' + n) for n in ['batches', 'gsheet-package', 'history', 'history-migrations', 'archives', 'public', 'index/history']]
    roots.append(EXTERNAL)
    for top in roots:
        assert top.is_dir(), str(top)
        for folder, dirs, files in os.walk(top, followlinks=False):
            base = Path(folder)
            if base == ROOT / 'data/jobs/batches': dirs[:] = [d for d in dirs if d not in NAMES]
            for name in dirs + files:
                p = base / name
                if p == ROOT / 'data/jobs/batches/.batch-maintenance.lock': continue
                if p.is_symlink() or p.is_file(): found.append(p)
    return sorted(found)

def backup_check():
    volume = Path('/Volumes/1Pugh')
    assert volume.is_mount() and volume.stat().st_dev != ROOT.stat().st_dev
    trusted = json.loads((ROOT / 'docs/plans/batch-1pugh-backup-20261020T190242Z/validation.json').read_text())
    assert trusted['status'] == 'PASS_independent_external_backup_verified'
    results = []
    for item in trusted['copied_files']:
        for base in [ARCHIVE, EXTERNAL]:
            r = record(base / item['file'])
            assert r['sha256'] == item['sha256'] and r['metadata'][2] == item['bytes'], str(base / item['file'])
            results.append(r)
    assert (EXTERNAL / 'EXTERNAL-BACKUP-VERIFICATION.json').read_bytes() == (ROOT / 'docs/plans/batch-1pugh-backup-20261020T190242Z/validation.json').read_bytes()
    save('backup-check.json', {'status': 'PASS', 'files': results})

def metadata_check():
    with gzip.open(OUT / 'protected-before.jsonl.gz', 'rt') as f: rows = [json.loads(line) for line in f]
    assert [str(p) for p in inventory()] == [r['path'] for r in rows], 'Protected inventory changed'
    for r in rows:
        p = Path(r['path']); s = p.lstat()
        assert [s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode] == r['metadata'], 'Protected metadata changed: ' + str(p)

def space():
    s = os.statvfs(ROOT)
    return {'available_bytes': s.f_bavail * s.f_frsize, 'free_bytes': s.f_bfree * s.f_frsize}

if sys.argv[1] == 'before':
    backup_check()
    paths = inventory()
    with gzip.open(OUT / 'protected-before.jsonl.gz', 'xt') as f:
        for i,p in enumerate(paths,1):
            f.write(json.dumps(record(p), separators=(',',':')) + '\n')
            if i % 5000 == 0: print('Protected files checked', i, '/', len(paths), flush=True)
    assert inventory() == paths
    metadata_check()
    for name in ['batch-index.json','batch-index.csv','board-latest-fetch.json']:
        with (OUT / ('before-' + name)).open('xb') as f: f.write((ROOT / 'data/jobs/index' / name).read_bytes())
    save('protected-before-summary.json', {'files': len(paths), 'status': 'PASS'})
elif sys.argv[1] == 'predelete':
    metadata_check()
    spec = importlib.util.spec_from_file_location('archive_helper', ARCHIVE / 'archive_batches.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    helper.assert_sources(ROOT, MANIFEST, content=False)
    logical = allocated = files = 0
    for r in MANIFEST['records']:
        s = (ROOT / r['path']).lstat()
        allocated += s.st_blocks * 512
        if r['type'] == 'file':
            assert s.st_nlink == 1, 'Unexpected hard-linked candidate'
            logical += s.st_size; files += 1
    assert logical == 52741474676 and files == 14875
    save('space-before.json', {**space(), 'candidate_logical_bytes': logical, 'candidate_allocated_bytes': allocated, 'candidate_files': files})
elif sys.argv[1] == 'after':
    metadata_check()
    with gzip.open(OUT / 'protected-before.jsonl.gz', 'rt') as f: rows = [json.loads(line) for line in f]
    for i,r in enumerate(rows,1):
        assert record(Path(r['path'])) == r, 'Protected file changed: ' + r['path']
        if i % 5000 == 0: print('Protected files rechecked', i, '/', len(rows), flush=True)
    metadata_check()
    assert all(not (ROOT / 'data/jobs/batches' / n).exists() for n in NAMES)
    save('protected-after.json', {'status': 'PASS', 'files': len(rows), 'deleted_batch_folders': len(NAMES), 'space_after': space()})
else:
    raise ValueError('Unknown check')
print('PASS', sys.argv[1], flush=True)
