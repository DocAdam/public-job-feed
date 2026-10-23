"""Approved one-time cleanup of three exact restore folders. No broad cleanup."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[3]
REVIEW = Path(__file__).resolve().parent
PRIOR = ROOT / 'docs/plans/history-backup-20261021T120102Z'
DB = ROOT / 'data/jobs/history/jobs-history.duckdb'
EXTERNAL = Path('/Volumes/1Pugh/Public Job Feed Archives')
EXPECTED = [
    ROOT / 'data/jobs/archives/20261020-762-batches/restore-test',
    ROOT / 'data/jobs/archives/1pugh-restore-test-20261020T190242Z',
    PRIOR / 'restore-test',
]


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def save(name, value):
    with (REVIEW / name).open('x') as f:
        json.dump(value, f, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())


def safe(p):
    assert p.is_absolute() and p.resolve() == p, f'Unsafe path: {p}'
    for ancestor in [p, *p.parents]:
        assert not ancestor.is_symlink(), ancestor


def volume():
    info = plistlib.loads(subprocess.check_output(['diskutil', 'info', '-plist', '/Volumes/1Pugh']))
    assert info['VolumeUUID'] == 'A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1'
    assert info['MountPoint'] == '/Volumes/1Pugh' and not info['Internal']
    assert ROOT.stat().st_dev != EXTERNAL.stat().st_dev
    return info['VolumeUUID']


def locks():
    owner = int(os.environ['RESTORE_CLEANUP_LOCK_OWNER'])
    assert json.loads(Path(str(DB) + '.history-lock').read_text())['pid'] == owner
    assert json.loads((ROOT / 'data/jobs/batches/.batch-maintenance.lock').read_text())['pid'] == owner
    assert json.loads(Path(str(DB) + '.history-operation.json').read_text())['state'] == 'accepted'
    for p in [Path(str(DB) + '.wal'), Path(str(DB) + '.history-recovery-lock'),
              ROOT / 'data/jobs/index/.fetch-history.lock', ROOT / 'data/jobs/index/.fetch-history-recovery.lock',
              ROOT / 'data/jobs/state/maintenance.lock']:
        assert not p.exists(), f'Active or pending operation: {p}'


def unused():
    # Read-only checks. Do not stop unrelated processes or remove stale locks.
    for p in [*EXPECTED, DB]:
        args = ['lsof', '-nP', '-t'] + (['+D', str(p)] if p.is_dir() else ['--', str(p)])
        result = subprocess.run(args, capture_output=True, text=True)
        assert result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip(), (p, result.stdout, result.stderr)


def candidate(c, content=True):
    folder = Path(c['path'])
    assert folder in EXPECTED
    safe(folder)
    assert folder.is_dir() and folder.stat().st_dev == ROOT.stat().st_dev
    expected = {r['path']: r for r in c['files']}
    actual = {}
    directories = {''}
    for p in folder.rglob('*'):
        assert not p.is_symlink(), p
        if p.is_dir():
            directories.add(str(p.relative_to(folder)))
            continue
        s = p.stat()
        assert stat.S_ISREG(s.st_mode) and s.st_nlink == 1, p
        rel = str(p.relative_to(folder))
        r = expected[rel]
        assert s.st_size == r['bytes'] and s.st_mtime_ns == r['mtime_ns'], p
        if content:
            assert digest(p) == r['sha256'], p
        actual[rel] = {'inode': s.st_ino, 'device': s.st_dev, 'bytes': s.st_size,
                       'mtime_ns': s.st_mtime_ns, 'allocated_bytes': s.st_blocks * 512}
    assert set(actual) == set(expected) and len(actual) == c['file_count']
    allowed_dirs = {''}
    for name in expected:
        allowed_dirs.update(str(p) for p in Path(name).parents if str(p) != '.')
    assert directories == allowed_dirs, 'Unexpected directory in candidate'
    assert sum(r['bytes'] for r in actual.values()) == c['bytes']
    return {'root_inode': folder.stat().st_ino, 'root_device': folder.stat().st_dev, 'files': actual}


def protected():
    roots = [ROOT / 'data/jobs/archives', ROOT / 'data/jobs/gsheet-package', ROOT / 'data/jobs/history',
             ROOT / 'data/jobs/history-migrations', ROOT / 'docs/plans', EXTERNAL,
             ROOT / 'data/jobs/reports/jobs-history-report.md']
    skip = [*EXPECTED, REVIEW, Path(str(DB) + '.history-lock')]
    records = {}

    def visit(p):
        if any(p == s or s in p.parents for s in skip):
            return
        s = p.lstat()
        if p.is_symlink():
            records[str(p)] = {'type': 'link', 'target': str(p.readlink()), 'mtime_ns': s.st_mtime_ns}
        elif p.is_dir():
            for child in sorted(p.iterdir()):
                visit(child)
        else:
            assert stat.S_ISREG(s.st_mode), p
            records[str(p)] = {'type': 'file', 'bytes': s.st_size, 'sha256': digest(p),
                               'mtime_ns': s.st_mtime_ns, 'mode': stat.S_IMODE(s.st_mode)}
    for root in roots:
        safe(root)
        visit(root)
    return records


def backup_checks():
    checked = []
    for folder in [ROOT / 'data/jobs/archives/20261020-762-batches',
                   EXTERNAL / '20261020-762-batches', EXTERNAL / PRIOR.name]:
        safe(folder)
        for line in (folder / 'SHA256SUMS').read_text().splitlines():
            sha, name = line.split(maxsplit=1)
            name = name.lstrip('*')
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            p = folder / name
            safe(p)
            assert p.is_file() and digest(p) == sha, p
            checked.append({'path': str(p), 'sha256': sha})
    assert json.loads((PRIOR / 'backup-manifest.json').read_text()) == json.loads((EXTERNAL / PRIOR.name / 'manifest.json').read_text())
    verification = json.loads((PRIOR / 'validation.json').read_text())
    assert digest(DB) == digest(EXTERNAL / PRIOR.name / 'jobs-history.duckdb') == verification['database_sha256']
    assert json.loads((EXTERNAL / PRIOR.name / 'VERIFICATION.json').read_text())['status'] == 'PASS_EXTERNAL_BACKUP_AND_FULL_RESTORE'
    return checked


def main():
    assert shutil.rmtree.avoids_symlink_attacks
    plan = json.loads((PRIOR / 'restore-test-cleanup-plan.json').read_text())
    assert [Path(c['path']) for c in plan['candidates']] == EXPECTED
    assert plan['candidate_bytes'] == 6310113758
    locks()
    volume_uuid = volume()
    unused()
    checked = backup_checks()
    print('All three backup checksum lists passed.', flush=True)
    candidates = {c['path']: candidate(c) for c in plan['candidates']}
    print('All 3,401 candidate files match the reviewed plan.', flush=True)
    before = protected()
    save('protected-before.json', before)
    save('fresh-validation.json', {'status': 'PASS', 'volume_uuid': volume_uuid, 'checksums': checked,
        'candidate_plan_sha256': digest(PRIOR / 'restore-test-cleanup-plan.json'),
        'candidate_state': candidates, 'protected_records': len(before),
        'authorization': 'User approved deletion of the three reviewed restore-test folders after fresh validation.'})
    print('Protected file hashes recorded. Starting approved cleanup.', flush=True)
    locks()
    volume()
    unused()
    assert protected() == before, 'Protected file changed before deletion'
    free_before = shutil.disk_usage(ROOT).free
    removed = []
    for c in plan['candidates']:
        locks()
        assert candidate(c, content=False) == candidates[c['path']], 'Candidate changed before deletion'
        folder = Path(c['path'])
        shutil.rmtree(folder)
        assert not folder.exists()
        removed.append({'path': str(folder), 'files': c['file_count'], 'bytes': c['bytes']})
        save(f'removed-{len(removed)}.json', removed[-1])
    free_immediate = shutil.disk_usage(ROOT).free
    after = protected()
    assert after == before, 'Protected file changed after deletion'
    save('protected-after.json', {'status': 'PASS', 'records': len(after), 'changed_records': 0})
    free_after = shutil.disk_usage(ROOT).free
    result = {'status': 'PASS', 'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'removed_folders': removed, 'removed_file_count': sum(r['files'] for r in removed),
        'removed_logical_bytes': sum(r['bytes'] for r in removed),
        'former_allocated_bytes': sum(f['allocated_bytes'] for c in candidates.values() for f in c['files'].values()),
        'free_bytes_before': free_before, 'free_bytes_immediately_after': free_immediate,
        'free_bytes_after_validation': free_after, 'observed_net_free_increase_bytes': free_after - free_before,
        'protected_records_checked': len(before), 'protected_changes': 0,
        'limits': 'Available space includes unrelated system activity; snapshots and shared blocks can defer gains. Directory modification/access times are not protected.'}
    save('validation.json', result)
    print(json.dumps(result, indent=2), flush=True)


if __name__ == '__main__':
    main()
