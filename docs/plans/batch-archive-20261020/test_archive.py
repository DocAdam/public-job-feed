import gzip
import io
import json
import os
from pathlib import Path
import tarfile
import uuid
from archive_batches import manifest_for, manifest_bytes, create_archive, verify_restore, sha_file, stamp

# Keep the small test records for review. No removal function is used.
root = Path(__file__).resolve().parent / ('fixture-tests-' + uuid.uuid4().hex)
root.mkdir()
source = root / 'source'; batch = source / 'data/jobs/batches/synthetic'
batch.mkdir(parents=True)
(batch / 'nested').mkdir()
(batch / 'nested/unicode-µ.json').write_text('{"Description":"Synthetic test — café\\nsecond line"}\n')
(batch / 'empty.csv').write_bytes(b'')
(batch / 'binary.bin').write_bytes(bytes(range(256)) * 7)
for f in batch.rglob('*'):
    os.utime(f, ns=(1700000000123456789, 1700000000123456789))
manifest = manifest_for(source, ['synthetic'])
archive = root / 'valid.tar.gz'
quiet = lambda *a, **k: None
create_archive(source, archive, manifest, quiet)
result = verify_restore(archive, manifest, root / 'restored', ['synthetic'], quiet)
assert result['verified_archive_files'] == 3 and result['restored_files'] == 3
passed = ['nested paths, Unicode, empty and binary files; full round trip; nanosecond times']

def rejects(label, action):
    try: action()
    except (ValueError, OSError, EOFError, tarfile.TarError): passed.append(label)
    else: raise AssertionError('Expected refusal: ' + label)

rejects('existing archive cannot be overwritten', lambda: create_archive(source, archive, manifest, quiet))
rejects('existing restore directory cannot be overwritten', lambda: verify_restore(archive, manifest, root / 'restored', ['synthetic'], quiet))
rejects('unknown restore batch', lambda: verify_restore(archive, manifest, root / 'bad-restore', ['other'], quiet))
rejects('duplicate batch names', lambda: manifest_for(source, ['synthetic', 'synthetic']))
rejects('path traversal batch name', lambda: manifest_for(source, ['../outside']))
# These files are new corrupt test artifacts, not edits to the valid archive.
truncated = root / 'truncated.tar.gz'; truncated.write_bytes(archive.read_bytes()[:-12])
rejects('truncated archive', lambda: verify_restore(truncated, manifest, progress=quiet))
badcrc = root / 'bad-crc.tar.gz'; payload = bytearray(archive.read_bytes()); payload[-8] ^= 1; badcrc.write_bytes(payload)
rejects('gzip checksum failure', lambda: verify_restore(badcrc, manifest, progress=quiet))

def crafted(name, members, embedded=None):
    file = root / name
    with tarfile.open(file, 'w:gz') as tar:
        data = manifest_bytes(manifest) if embedded is None else embedded
        info = tarfile.TarInfo('__archive__/manifest.json'); info.size = len(data); info.mode = 0o600
        tar.addfile(info, io.BytesIO(data))
        for member in members:
            if isinstance(member, str):
                info = tarfile.TarInfo(member); info.size = 1; tar.addfile(info, io.BytesIO(b'x'))
            else: tar.addfile(member)
    return file
rejects('wrong embedded manifest', lambda: verify_restore(crafted('wrong-manifest.gz', [], b'{}'), manifest, progress=quiet))
rejects('missing archive paths', lambda: verify_restore(crafted('missing.gz', []), manifest, progress=quiet))
rejects('unsafe archive path', lambda: verify_restore(crafted('traversal.gz', ['../escape']), manifest, progress=quiet))
rejects('unexpected archive member', lambda: verify_restore(crafted('extra.gz', ['unlisted']), manifest, progress=quiet))
link = tarfile.TarInfo('data/jobs/batches/synthetic'); link.type = tarfile.SYMTYPE; link.linkname = '/tmp'
rejects('archive link is refused', lambda: verify_restore(crafted('link.gz', [link]), manifest, progress=quiet))
wrong = json.loads(json.dumps(manifest)); next(r for r in wrong['records'] if r['type'] == 'file')['sha256'] = '0'*64
rejects('changed expected hash', lambda: verify_restore(archive, wrong, progress=quiet))
def rewrite_valid(name, change):
    target = root / name
    with tarfile.open(archive, 'r:gz') as src, tarfile.open(target, 'w:gz') as dst:
        for info in src:
            data = src.extractfile(info).read() if info.isfile() else None
            if change == 'bytes' and info.name.endswith('binary.bin'):
                data = bytes([data[0] ^ 1]) + data[1:]
            dst.addfile(info, io.BytesIO(data) if data is not None else None)
            if change == 'duplicate' and info.name.endswith('binary.bin'):
                dst.addfile(info, io.BytesIO(data))
    return target
rejects('same-size member corruption', lambda: verify_restore(rewrite_valid('bad-content.gz', 'bytes'), manifest, progress=quiet))
rejects('duplicate member path', lambda: verify_restore(rewrite_valid('duplicate.gz', 'duplicate'), manifest, progress=quiet))
# A changed source must fail before the output archive is created.
(batch / 'new-synthetic.txt').write_text('fixture only')
rejects('source inventory changed', lambda: create_archive(source, root / 'refused.gz', manifest, quiet))
assert not (root / 'refused.gz').exists()
result = {'status': 'PASS', 'checks': passed, 'count': len(passed), 'fixtures': str(root)}
(root.parent / 'unit-tests.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
