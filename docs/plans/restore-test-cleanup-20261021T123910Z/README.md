# Approved restore-test cleanup

Status: PASS. Completed 21 October 2026. Only the three approved restore-test
folders were deleted. No backup, historical source, production database,
recovery copy, or saved test record was deleted or changed.

## Removed folders

| Exact folder | Files | Logical size |
| --- | ---: | ---: |
| `/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/20261020-762-batches/restore-test` | 117 | 0.84 GiB |
| `/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/1pugh-restore-test-20261020T190242Z` | 117 | 0.84 GiB |
| `/Users/adampugh/GitHub/public-job-feed/docs/plans/history-backup-20261021T120102Z/restore-test` | 3,167 | 4.19 GiB |

Total: 3,401 files, 6,310,113,758 bytes
(**5.88 GiB**).

## Measured space

- Available before deletion: 132,337,594,368 bytes (123.25 GiB).
- Available immediately after deletion: 136,859,172,864 bytes (127.46 GiB).
- Available after preservation checks: 136,805,990,400 bytes (127.41 GiB).
- Observed net increase: **4.16 GiB** (4,468,396,032 bytes).

Free-space readings include unrelated system activity. Snapshots and shared
blocks can delay or reduce the measured gain. No snapshot was changed or deleted.
The earlier larger file-size estimate is not a promise of immediate free space.

## Fresh checks

- Production history audit: PASS, 154 snapshots, zero structural errors or pending snapshots.
- Restore-test database audit against its restored sources: PASS.
- Complete local batch archive, 1Pugh batch archive, and new 1Pugh history backup:
  all saved checksum lists passed.
- All 3,401 candidate files matched the exact approved manifest, sizes, and hashes.
- File-use checks found no open candidate or production database handles.
- The history and batch locks stayed held throughout validation and removal.
- Protected files were hashed before deletion and checked again before and after
  removal. All 3,799 file/link records matched.
- Candidate paths and file identities were rechecked immediately before removal.
- Only exact reviewed folders were removed. Their parent folders remain.
- History and batch locks were released. All three candidate paths are absent.
- Helper syntax checks and git diff --check passed.

Protected files include both batch archives, the current history backup on
1Pugh, all historical CSV packages, the live database and companion records,
all database migration/recovery copies, and existing test/review records.
Directory modification/access times were not compared because child removal
changes parent directory timestamps. File bytes and recorded file metadata
were checked.

## Evidence and recovery

Fresh audits: production-audit.json and restored-audit.json. Exact removal
records: removed-1.json through removed-3.json. Preservation evidence:
protected-before.json, protected-after.json, and fresh-validation.json.
Measured result: validation.json. Final lock and path check: completion.json.

The old review records remain unchanged. Their retained-test paths now describe
historical evidence; this record documents the approved later cleanup.

Complete archives remain at:

- `/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/20261020-762-batches`
- `/Volumes/1Pugh/Public Job Feed Archives/20261020-762-batches`
- `/Volumes/1Pugh/Public Job Feed Archives/history-backup-20261021T120102Z`

Use each archive's README to restore into a new empty folder if required.
The helpers in this folder are one-time execution records. Do not rerun them.
