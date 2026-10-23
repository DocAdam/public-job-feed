"""Content-complete batch archive. Source files are read only. No deletion code."""
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tarfile

CHUNK = 1024 * 1024
META = '__archive__/manifest.json'

def sha_file(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()

def stamp(file):
    s = Path(file).lstat()
    return [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, stat.S_IMODE(s.st_mode)]

def safe_name(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name or str(p) != name:
        raise ValueError('Unsafe archive path: ' + name)
    return name

def check_directory(directory):
    p = Path(directory).absolute()
    for part in [*reversed(p.parents), p]:
        s = part.lstat()
        if not stat.S_ISDIR(s.st_mode):
            raise ValueError('Unsafe directory: ' + str(part))

def manifest_for(root, names):
    root = Path(root).resolve()
    if len(names) != len(set(names)):
        raise ValueError('Duplicate batch name')
    records = []
    for name in sorted(names):
        if Path(name).name != name or name in ['', '.', '..']:
            raise ValueError('Unsafe batch name')
        folder = root / 'data/jobs/batches' / name
        check_directory(folder)
        for p in [folder, *sorted(folder.rglob('*'))]:
            s = p.lstat()
            if not (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)):
                raise ValueError('Unsupported source type: ' + str(p))
            before = stamp(p)
            record = {'path': safe_name(p.relative_to(root).as_posix()),
                      'type': 'file' if p.is_file() else 'directory',
                      'size': s.st_size if p.is_file() else 0, 'mode': stat.S_IMODE(s.st_mode),
                      'mtime_ns': s.st_mtime_ns, 'uid': s.st_uid, 'gid': s.st_gid,
                      'source_stamp': before}
            if p.is_file():
                record['sha256'] = sha_file(p)
            if before != stamp(p):
                raise ValueError('Source changed while hashing: ' + str(p))
            records.append(record)
    return {'format': 'public-job-feed-batch-archive-1',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source_root': str(root), 'batch_names': sorted(names), 'records': records,
            'limits': 'File bytes, relative paths, modes and modification times. No claim to restore macOS ACLs, extended attributes, creation times, or original ownership.'}

def manifest_bytes(manifest):
    return (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()

def assert_sources(root, manifest, content=False):
    expected = {r['path'] for r in manifest['records']}
    actual = set()
    for name in manifest['batch_names']:
        folder = Path(root) / 'data/jobs/batches' / name
        for p in [folder, *folder.rglob('*')]:
            actual.add(p.relative_to(root).as_posix())
    if actual != expected:
        raise ValueError('Source inventory changed')
    for r in manifest['records']:
        p = Path(root) / r['path']
        if stamp(p) != r['source_stamp']:
            raise ValueError('Source metadata changed: ' + r['path'])
        if content and r['type'] == 'file' and sha_file(p) != r['sha256']:
            raise ValueError('Source content changed: ' + r['path'])

class HashReader:
    def __init__(self, reader):
        self.reader = reader
        self.hash = hashlib.sha256()
    def read(self, size=-1):
        value = self.reader.read(size)
        self.hash.update(value)
        return value

def create_archive(root, destination, manifest, progress=print):
    assert_sources(root, manifest)
    with Path(destination).open('xb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', compresslevel=6, mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode='w|', format=tarfile.PAX_FORMAT) as tar:
                data = manifest_bytes(manifest)
                info = tarfile.TarInfo(META); info.size = len(data); info.mode = 0o600
                tar.addfile(info, io.BytesIO(data))
                for i, r in enumerate(manifest['records'], 1):
                    p = Path(root) / r['path']
                    if stamp(p) != r['source_stamp']:
                        raise ValueError('Source changed before archive read')
                    info = tarfile.TarInfo(r['path'])
                    info.type = tarfile.REGTYPE if r['type'] == 'file' else tarfile.DIRTYPE
                    info.size = r['size']; info.mode = r['mode']; info.uid = r['uid']; info.gid = r['gid']
                    sec, nano = divmod(r['mtime_ns'], 1000000000)
                    info.mtime = sec; info.pax_headers = {'mtime': f'{sec}.{nano:09d}'}
                    if r['type'] == 'file':
                        with p.open('rb') as source:
                            reader = HashReader(source); tar.addfile(info, reader)
                        if reader.hash.hexdigest() != r['sha256']:
                            raise ValueError('Source changed during archive read: ' + r['path'])
                    else:
                        tar.addfile(info)
                    if stamp(p) != r['source_stamp']:
                        raise ValueError('Source changed during archive read')
                    if i % 2500 == 0:
                        progress(json.dumps({'phase': 'archive', 'members': i, 'total': len(manifest['records'])}), flush=True)
        raw.flush(); os.fsync(raw.fileno())
    assert_sources(root, manifest)

def verify_restore(archive, manifest, restore_root=None, restore_batches=(), progress=print):
    expected = {r['path']: r for r in manifest['records']}
    seen = set(); selected = set(restore_batches); restored = []
    if selected - set(manifest['batch_names']):
        raise ValueError('Unknown restore batch')
    if restore_root:
        restore_root = Path(restore_root)
        restore_root.mkdir(mode=0o700)  # Must be a new isolated directory.
        check_directory(restore_root)
    elif selected:
        raise ValueError('Missing restore directory')
    manifest_seen = False
    with gzip.open(archive, 'rb') as gz:
        with tarfile.open(fileobj=gz, mode='r|') as tar:
            for info in tar:
                safe_name(info.name)
                if info.name == META:
                    if manifest_seen or not info.isfile() or info.size != len(manifest_bytes(manifest)):
                        raise ValueError('Invalid archive manifest member')
                    if tar.extractfile(info).read() != manifest_bytes(manifest):
                        raise ValueError('Embedded manifest mismatch')
                    manifest_seen = True
                    continue
                if info.name not in expected or info.name in seen:
                    raise ValueError('Unexpected or duplicate archive path: ' + info.name)
                seen.add(info.name); r = expected[info.name]
                if info.size != r['size'] or info.mode != r['mode'] or info.uid != r['uid'] or info.gid != r['gid']:
                    raise ValueError('Archive size or mode mismatch')
                sec, nano = divmod(r['mtime_ns'], 1000000000)
                if info.pax_headers.get('mtime') != f'{sec}.{nano:09d}':
                    raise ValueError('Archive modification time mismatch')
                if not ((r['type'] == 'file' and info.isfile()) or (r['type'] == 'directory' and info.isdir())):
                    raise ValueError('Unsafe archive member type')
                should_restore = PurePosixPath(info.name).parts[3] in selected
                target = restore_root / info.name if should_restore else None
                if r['type'] == 'directory':
                    if target:
                        target.mkdir(parents=True, exist_ok=False); restored.append(r)
                    continue
                h = hashlib.sha256(); n = 0
                source = tar.extractfile(info)
                out = None
                try:
                    if target:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        check_directory(target.parent)
                        out = target.open('xb')
                    while chunk := source.read(CHUNK):
                        h.update(chunk); n += len(chunk)
                        if out: out.write(chunk)
                    if out: out.flush(); os.fsync(out.fileno())
                finally:
                    if out: out.close()
                if n != r['size'] or h.hexdigest() != r['sha256']:
                    raise ValueError('Archive content mismatch: ' + info.name)
                if target:
                    os.chmod(target, r['mode']); os.utime(target, ns=(r['mtime_ns'], r['mtime_ns']))
                    restored.append(r)
                if len(seen) % 2500 == 0:
                    progress(json.dumps({'phase': 'verify', 'members': len(seen), 'total': len(expected)}), flush=True)
        # Consume the gzip trailer too. This detects truncation and a bad CRC.
        while tail := gz.read(CHUNK):
            if any(tail):
                raise ValueError('Unexpected trailing archive data')
    if not manifest_seen or seen != set(expected):
        raise ValueError('Missing archive members')
    for r in reversed(restored):
        target = restore_root / r['path']
        if r['type'] == 'directory':
            os.chmod(target, r['mode']); os.utime(target, ns=(r['mtime_ns'], r['mtime_ns']))
    for r in restored:
        p = restore_root / r['path']; s = p.stat()
        if stat.S_IMODE(s.st_mode) != r['mode'] or s.st_mtime_ns != r['mtime_ns']:
            raise ValueError('Restored metadata mismatch: ' + r['path'])
        if r['type'] == 'file' and (s.st_size != r['size'] or sha_file(p) != r['sha256']):
            raise ValueError('Restored file mismatch: ' + r['path'])
    actual = {p.relative_to(restore_root).as_posix() for p in restore_root.rglob('*') if p.is_file()} if restore_root else set()
    if actual != {r['path'] for r in restored if r['type'] == 'file'}:
        raise ValueError('Restored file inventory mismatch')
    return {'verified_archive_files': sum(r['type'] == 'file' for r in expected.values()),
            'verified_archive_directories': sum(r['type'] == 'directory' for r in expected.values()),
            'verified_source_bytes': sum(r['size'] for r in expected.values()),
            'restored_batches': sorted(selected), 'restored_files': len(actual),
            'restored_bytes': sum(r['size'] for r in restored),
            'all_archive_paths_and_hashes_match': True, 'restore_disk_hashes_and_metadata_match': True,
            'gzip_trailer_checked': True}
