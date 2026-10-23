"""One-time backup and restore check. Run only through run-backup.cjs.

Creates new paths only. Keeps every restore-test file. Does not delete sources.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
REVIEW = Path(__file__).resolve().parent
VOLUME = Path('/Volumes/1Pugh')
UUID = 'A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1'
DEST = VOLUME / 'Public Job Feed Archives' / REVIEW.name
RESTORE = REVIEW / 'restore-test'
SOURCE = ROOT / 'data/jobs/gsheet-package'
DB = ROOT / 'data/jobs/history/jobs-history.duckdb'


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def save(p, value):
    with p.open('x') as f:
        json.dump(value, f, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())


def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    expected = digest(source)
    with source.open('rb') as a, destination.open('xb') as b:
        shutil.copyfileobj(a, b, 8 * 1024 * 1024)
        b.flush()
        os.fsync(b.fileno())
    assert digest(source) == digest(destination) == expected, source
    return expected


def volume_check():
    info = plistlib.loads(subprocess.check_output(['diskutil', 'info', '-plist', str(VOLUME)]))
    assert info['VolumeUUID'] == UUID and info['MountPoint'] == str(VOLUME), info
    assert info['Writable'] and not info['Internal'], info
    assert ROOT.stat().st_dev != VOLUME.stat().st_dev
    assert info['FreeSpace'] > 10 * 1024**3
    return info


def check_sources():
    before = json.loads((REVIEW / 'source-files-before.json').read_text())
    actual = sorted(str(p.relative_to(SOURCE)) for p in SOURCE.rglob('*') if p.is_file() or p.is_symlink())
    assert actual == sorted(r['path'] for r in before), 'Source inventory changed'
    for r in before:
        p = SOURCE / r['path']
        if r['type'] == 'link':
            assert p.is_symlink() and str(p.readlink()) == r['target'], p
        else:
            assert not p.is_symlink() and p.stat().st_size == r['bytes'] and digest(p) == r['sha256'], p
    return before


def archive(name, entries):
    entries = sorted(entries, key=lambda pair: pair[1])
    records = []
    archive_path = DEST / name
    with archive_path.open('xb') as raw:
        with tarfile.open(fileobj=raw, mode='w:gz', compresslevel=6) as tar:
            for source, member in entries:
                assert source.is_file() and not source.is_symlink(), source
                record = {'path': member, 'bytes': source.stat().st_size, 'sha256': digest(source)}
                tar.add(source, arcname=member, recursive=False)
                assert digest(source) == record['sha256'], source
                records.append(record)
        raw.flush()
        os.fsync(raw.fileno())
    # Read every archived byte, then restore only the expected regular paths.
    expected = {r['path']: r for r in records}
    seen = set()
    with tarfile.open(archive_path, 'r|gz') as tar:
        for member in tar:
            assert member.isfile() and member.name in expected and member.name not in seen, member.name
            assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
            r = expected[member.name]
            assert member.size == r['bytes'], member.name
            target = RESTORE / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            h = hashlib.sha256()
            with tar.extractfile(member) as source, target.open('xb') as out:
                for chunk in iter(lambda: source.read(8 * 1024 * 1024), b''):
                    h.update(chunk)
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            assert h.hexdigest() == digest(target) == r['sha256'], member.name
            seen.add(member.name)
    assert seen == set(expected), 'Lost archive member'
    # Reading gzip to EOF checks its checksum and trailer too.
    import gzip
    with gzip.open(archive_path, 'rb') as f:
        while f.read(8 * 1024 * 1024):
            pass
    return records


def main():
    volume_check()
    before = check_sources()
    assert os.environ.get('HISTORY_BACKUP_LEASE') == str(DB), 'Use the lease wrapper'
    assert (Path(str(DB) + '.history-lock')).is_file()
    assert not Path(str(DB) + '.wal').exists()
    journal = json.loads(Path(str(DB) + '.history-operation.json').read_text())
    assert journal['state'] == 'accepted' and digest(DB) == journal['newHash']
    DEST.mkdir()  # Refuse an existing backup, including a prior partial attempt.
    RESTORE.mkdir()
    print('Creating new backup:', DEST, flush=True)
    db_hash = copy(DB, DEST / 'jobs-history.duckdb')
    copy(DEST / 'jobs-history.duckdb', RESTORE / 'history/jobs-history.duckdb')
    snapshots = sorted(p for p in SOURCE.iterdir() if re.fullmatch(r'\d{8}-\d{4}', p.name))
    source_entries = []
    for folder in snapshots:
        assert folder.is_dir() and not folder.is_symlink(), folder
        for p in folder.rglob('*'):
            assert not p.is_symlink(), p
            if p.is_file():
                source_entries.append((p, 'snapshots/' + str(p.relative_to(SOURCE))))
    source_records = archive('sources.tar.gz', source_entries)
    print('Source archive and full restore checked:', len(source_records), 'files', flush=True)
    runtime_entries = [(p, 'runtime/' + str(p.relative_to(ROOT)))
                       for directory in ['src', 'launchers'] for p in (ROOT / directory).rglob('*') if p.is_file()]
    runtime_entries += [(ROOT / name, 'runtime/' + name) for name in ['package.json', 'package-lock.json']]
    runtime_records = archive('runtime.tar.gz', runtime_entries)
    for name, source in {
        'history-README.md': DB.parent / 'README.md',
        'validation.json': DB.parent / 'validation.json',
        'jobs-history-report.md': ROOT / 'data/jobs/reports/jobs-history-report.md',
        'accepted-operation.json': Path(str(DB) + '.history-operation.json'),
        'update-audit.json': REVIEW / 'audit.json',
    }.items():
        copy(source, DEST / 'metadata' / name)
    check_sources()
    volume_check()
    assert digest(DB) == db_hash
    manifest = {
        'status': 'COPIED_AND_RESTORED_AWAITING_DATABASE_AUDIT',
        'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'volume_uuid': UUID, 'backup': str(DEST), 'restore_test': str(RESTORE),
        'database_sha256': db_hash, 'database_bytes': DB.stat().st_size,
        'generation': journal['id'], 'snapshot_count': len(snapshots),
        'source_files': source_records, 'runtime_files': runtime_records,
        'protected_source_records': len(before), 'source_changes': 0,
        'deletions': 0,
    }
    save(DEST / 'manifest.json', manifest)
    save(REVIEW / 'backup-manifest.json', manifest)
    print('Backup copy and file restore checks passed. Database audit is still required.', flush=True)


if __name__ == '__main__':
    main()
