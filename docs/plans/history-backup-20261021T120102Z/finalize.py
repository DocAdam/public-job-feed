"""Save verified backup evidence and a cleanup proposal. Does not delete files."""
import datetime
import json
from pathlib import Path
import subprocess
import backup as b

audit = json.loads((b.REVIEW / 'audit.json').read_text())
restored_audit = json.loads((b.REVIEW / 'restored-audit.json').read_text())
report = json.loads((b.REVIEW / 'restored-report-check.json').read_text())
noop = json.loads((b.REVIEW / 'no-op-result.json').read_text())
manifest = json.loads((b.REVIEW / 'backup-manifest.json').read_text())
assert audit == restored_audit and not audit['errors'] and not audit['pending_snapshots']
assert report['status'] == noop['status'] == 'PASS'
assert report['report_matches_accepted_generation']
b.volume_check()
sources = b.check_sources()
assert b.digest(b.DB) == b.digest(b.DEST / 'jobs-history.duckdb') == manifest['database_sha256']
for suffix in ['.history-lock', '.history-recovery-lock', '.wal']:
    assert not Path(str(b.DB) + suffix).exists(), suffix
    assert not Path(str(b.RESTORE / 'history/jobs-history.duckdb') + suffix).exists(), suffix

for name in ['restored-audit.json', 'restored-report-check.json', 'no-op-result.json', 'tests.log']:
    b.copy(b.REVIEW / name, b.DEST / 'verification' / name)

readme = '''# Verified job-history recovery backup

Status: PASS. Created and restore-tested on 21 October 2026.

This package contains the accepted history database, all 154 dated source
packages, program sources, dependency lock file, report, and audit records.
It is separate from the older 762-batch archive. Both archives remain in place.
The source archive contains all 2,929 regular files in the dated packages.
It excludes mutable latest views and raw collection batches.

## Verification completed

- Database SHA-256 matched the accepted production generation and restored copy.
- Every archived source and runtime file was restored and checked by SHA-256.
- Both gzip streams were read to EOF and passed their checksum checks.
- Restored database audit matched the live audit: 154 snapshots, no errors,
  no pending snapshots, 40 preserved exception rows, and 10 resolved duplicate rows.
- Restored report matched the accepted report exactly. Lifecycle query passed.
- Restored program code was used for the audit and report. Installed dependencies
  from the project were supplied through NODE_PATH; no dependency download was
  required. A clean-machine dependency installation was not tested.

## Files

- jobs-history.duckdb: accepted database, copied while holding the history lock.
- sources.tar.gz: paths start with snapshots/ and retain the original package names.
- runtime.tar.gz: paths start with runtime/ and contain src, launchers, and package files.
- manifest.json: each original source/runtime file and its hash; its copy-stage status
  is historical. VERIFICATION.json is the final result.
- metadata/: accepted report, validation, operation record, and source README.
- verification/: audit, report check, no-op check, and test output.
- SHA256SUMS: checksums for all other files in this package.

## Test a restore

Use a new, empty folder on the Mac. Do not extract over production files.

1. In this backup folder, run `shasum -a 256 -c SHA256SUMS`.
2. Copy jobs-history.duckdb into a new history/ folder in the restore folder.
3. Extract sources.tar.gz and runtime.tar.gz into the restore folder.
4. Use the recorded Node and package-lock versions. The test used the existing
   project node_modules through NODE_PATH. On a new machine, install the locked
   dependencies in the restored runtime before the audit.
5. Run the restored runtime/src/scripts/jobs-history.js audit with explicit
   --database and --root paths pointing to the restored database and snapshots.
6. Confirm all snapshot counts and hashes against VERIFICATION.json and manifest.json.

Do not install metadata/accepted-operation.json as a live operation journal.
It contains original paths and is retained as evidence. Production replacement
needs a separate reviewed recovery action, closed readers/writers, and validation
against the current accepted history. Do not restore an older generation over
newer history. The original local recovery copies remain unchanged.

ExFAT holds the package. The restore test used local APFS. Database and source
bytes are verified; no claim is made for full macOS ACL or extended-attribute recovery.
Nothing was published. No source CSV or old archive was changed or deleted.
'''
with (b.DEST / 'README.md').open('x') as f:
    f.write(readme)

verification = {
    'status': 'PASS_EXTERNAL_BACKUP_AND_FULL_RESTORE',
    'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'backup': str(b.DEST), 'restore_test': str(b.RESTORE), 'volume_uuid': b.UUID,
    'database_sha256': manifest['database_sha256'], 'database_bytes': manifest['database_bytes'],
    'generation': manifest['generation'],
    'counts': {k: audit[k] for k in ['snapshots', 'observations', 'raw_top_match_rows',
        'raw_good_job_rows', 'canonical_urls', 'job_keys', 'good_job_exceptions', 'duplicate_canonical_rows']},
    'latest': audit['latest'], 'audit_errors': audit['errors'], 'pending_snapshots': audit['pending_snapshots'],
    'source_warning_count': len(audit['warnings']),
    'source_archive_files_verified': len(manifest['source_files']),
    'runtime_archive_files_verified': len(manifest['runtime_files']),
    'live_and_restored_audits_match': True, 'restored_report_matches': True,
    'lifecycle_query_passed': True, 'no_op_update_passed': True,
    'protected_source_records_checked': len(sources), 'source_changes': 0, 'deletions': 0,
    'tests_passed': ['jobs:test-history', 'jobs:test-history-content'],
    'daily_launcher_changed': False,
    'limits': 'Restore used the backed-up program code with the existing installed Node dependencies. No clean-machine dependency install or production cutover was run.',
}
b.save(b.DEST / 'VERIFICATION.json', verification)
files = sorted(p for p in b.DEST.rglob('*') if p.is_file())
checksums = {str(p.relative_to(b.DEST)): b.digest(p) for p in files}
with (b.DEST / 'SHA256SUMS').open('x') as f:
    for name, sha in checksums.items():
        f.write(f'{sha}  {name}\n')
subprocess.run(['sync'], check=True)
for name, sha in checksums.items():
    assert b.digest(b.DEST / name) == sha, name
verification['backup_total_bytes'] = sum(p.stat().st_size for p in b.DEST.rglob('*') if p.is_file())
verification['final_package_checksums_passed'] = len(checksums)
b.save(b.REVIEW / 'validation.json', verification)

old = json.loads((b.REVIEW / 'old-restore-cleanup-review.json').read_text())
expected = {r['path']: r for r in manifest['source_files'] + manifest['runtime_files']}
expected['history/jobs-history.duckdb'] = {'sha256': manifest['database_sha256'], 'bytes': manifest['database_bytes']}
restored_files = []
for p in sorted(b.RESTORE.rglob('*')):
    assert not p.is_symlink(), p
    if not p.is_file():
        continue
    rel = str(p.relative_to(b.RESTORE))
    e = expected[rel]
    assert b.digest(p) == e['sha256'] and p.stat().st_size == e['bytes'], p
    restored_files.append({'path': rel, 'bytes': e['bytes'], 'sha256': e['sha256'], 'mtime_ns': p.stat().st_mtime_ns})
assert {r['path'] for r in restored_files} == set(expected)
candidates = old['candidates'] + [{
    'path': str(b.RESTORE), 'files': restored_files, 'file_count': len(restored_files),
    'bytes': sum(r['bytes'] for r in restored_files),
    'role': 'New full history restore test; verified external backup and local production sources remain',
}]
plan = {
    'status': 'REVIEW_ONLY_NOT_AUTHORIZED_FOR_DELETION', 'created_at': verification['completed_at'],
    'candidates': candidates, 'candidate_bytes': sum(c['bytes'] for c in candidates),
    'archive_checks': old['archive_checks'], 'new_backup_validation': str(b.REVIEW / 'validation.json'),
    'deletions': 0,
    'requirements_before_any_deletion': ['Explicit approval for the exact paths',
        'Fresh external/local archive checksums and unchanged candidate hashes',
        'No open handles or active restore/history process',
        'Keep all manifests, test records, source CSV files, production database and recovery operations',
        'Remove only the approved restore-test paths; do not use a wildcard or delete their parent folders'],
}
b.save(b.REVIEW / 'restore-test-cleanup-plan.json', plan)
print(json.dumps({'status': verification['status'], 'backup_bytes': verification['backup_total_bytes'],
                  'cleanup_candidates': len(candidates), 'candidate_bytes': plan['candidate_bytes'], 'deletions': 0}, indent=2))
