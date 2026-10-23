# Restore-test cleanup proposal

Status: review only. No deletion is approved or performed by this record.

These three folders contain test copies. The complete archives, source packages,
production database, and production recovery files are separate and must remain.

| Exact candidate folder | Files | Logical file size |
| --- | ---: | ---: |
| `/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/20261020-762-batches/restore-test` | 117 | 0.84 GiB |
| `/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/1pugh-restore-test-20261020T190242Z` | 117 | 0.84 GiB |
| `/Users/adampugh/GitHub/public-job-feed/docs/plans/history-backup-20261021T120102Z/restore-test` | 3,167 | 4.19 GiB |

Total: **5.88 GiB** (6,310,113,758 bytes).
This is the size of files that could be removed, not a guarantee of extra free
space. APFS snapshots and shared blocks can delay or reduce the measured gain.

## Evidence

- Both old complete batch archive packages passed their saved checksum lists.
- All 117 files in each old sample restore match the complete archive manifest.
- The new history backup passed full file restoration, source-hash checks,
  database audit, report equality, and a lifecycle query.
- The new restore folder contains 3,167 files.
- No historical CSV file was changed. All 2,965 original source files and links
  in the package tree matched their before records.

## Before approved deletion

Repeat the archive checks and candidate hashes. Confirm there are no open handles,
active restores, history writers, or pending operations. Stop if a path, file,
hash, or drive identity differs. Save the check results outside the candidate
folders. Delete only explicitly approved folders, never a parent or wildcard.
Measure available space before and after, and verify the kept data again.

## Keep

- Both complete 762-batch archives, their manifests, and verification records.
- The new complete history backup on 1Pugh.
- All production CSV packages, the active database, and every recovery operation.
- All review JSON, logs, hashes, and reports in this review folder. The new
  restore-test subfolder alone is a candidate; its parent is not.

Exact per-file hashes and sizes: restore-test-cleanup-plan.json.
No cleanup command was generated or run.
