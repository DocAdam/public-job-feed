import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
from archive_batches import manifest_for, manifest_bytes, create_archive, verify_restore, assert_sources, sha_file

root = Path(__file__).resolve().parents[3]
evidence = Path(__file__).resolve().parent
output = root / 'data/jobs/archives/20261020-762-batches'
plan_file = root / 'docs/plans/batch-retention-safeguards-20261020/batch-retention-plan.json'
binding_file = plan_file.with_name('batch-retention-plan.manifest.json')
rows = json.loads(plan_file.read_text()); binding = json.loads(binding_file.read_text())
candidates = [r for r in rows if r['Action'] == 'RETIRE_CANDIDATE']
index = {r['BatchName']: r for r in json.loads((root / 'data/jobs/index/batch-index.json').read_text())}
assert len(candidates) == 762 and sum(r['SizeBytes'] for r in candidates) == 52741474676
samples = [max(candidates, key=lambda r: r['SizeBytes'])]
for ats in sorted({r['ATS'] for r in candidates}):
    if ats not in {r['ATS'] for r in samples}:
        samples.append(min((r for r in candidates if r['ATS'] == ats and index[r['BatchName']]['PublicFeedRows'] > 0), key=lambda r: r['SizeBytes']))
required = int(binding['totals']['candidateBytes'] * 1.01) + sum(r['SizeBytes'] for r in samples) + 10 * 2**30
assert shutil.disk_usage(output.parent).free > required, 'Insufficient free space for safe staging'
output.mkdir(mode=0o700)  # Never replace an existing run.
start = time.monotonic()
print('Build source manifest', flush=True)
manifest = manifest_for(root, [r['BatchName'] for r in candidates])
manifest['retention_plan_binding'] = binding
manifest['candidate_decisions'] = candidates
manifest['retention_plan_sha256'] = sha_file(plan_file)
manifest['restoration_test_batches'] = [r['BatchName'] for r in samples]
assert sum(r['type'] == 'file' for r in manifest['records']) == 14875
assert sum(r['size'] for r in manifest['records']) == 52741474676
with (output / 'manifest.json').open('xb') as f:
    f.write(manifest_bytes(manifest)); f.flush(); os.fsync(f.fileno())
with (output / 'retention-plan.json').open('xb') as f:
    f.write(plan_file.read_bytes()); f.flush(); os.fsync(f.fileno())
staged = output / 'batches.tar.gz.partial'
print('Create complete archive', flush=True)
create_archive(root, staged, manifest)
archive_hash = sha_file(staged)
archive_size = staged.stat().st_size
print(json.dumps({'phase': 'archive-written', 'bytes': archive_size, 'sha256': archive_hash}), flush=True)
print('Verify every archived file and restore six complete sample batches', flush=True)
result = verify_restore(staged, manifest, output / 'restore-test', manifest['restoration_test_batches'])
assert sha_file(staged) == archive_hash, 'Archive changed during verification'
assert_sources(root, manifest, content=True)
result.update({'status': 'PASS', 'source_batches': len(candidates), 'archive_bytes': archive_size,
               'archive_sha256': archive_hash, 'manifest_sha256': sha_file(output / 'manifest.json'),
               'archive_name': 'batches.tar.gz', 'seconds': round(time.monotonic()-start, 2),
               'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'source_content_and_metadata_unchanged': True,
               'restore_copies_kept': True, 'source_deletions': 0,
               'independent_copy_created': False,
               'protection_check': 'Pending full protected-data comparison before final archive name is published'})
with (output / 'verification.json').open('x') as f:
    f.write(json.dumps(result, indent=2)+'\n'); f.flush(); os.fsync(f.fileno())
print(json.dumps(result, indent=2), flush=True)
