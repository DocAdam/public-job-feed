# Approved old test-folder cleanup

Completed: 2026-10-20 06:15 CDT. Only the two approved old history test folders were removed. The production database, production recovery copies, historical CSV packages, collection batches, and runtime files are unchanged.

## Space recovered

- Removed 18 files: five test databases and 13 test records. All 13 records were saved in `test-records/` first. Owner tokens were redacted in ten records; other contents were preserved. The record manifest stores the original and saved hashes.
- Removed file bytes: 7,377,244,916 (6.87059 GiB).
- Removed allocated bytes: 7,377,285,120.
- Available disk space immediately before cleanup: 105,064,620,032 bytes (97.85 GiB).
- Available disk space three seconds after cleanup: 112,441,942,016 bytes (104.72 GiB).
- Observed increase: **7,377,321,984 bytes (6.87 GiB; 7.38 GB)**.

The observed disk change can include other system activity. The preserved records and check evidence also use a small amount of disk space. The temporary restoration copy was removed before the cleanup measurement, so it is not included in this gain.

Removed folders:

- `/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/job-history-bounded-BljI6a`
- `/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/job-history-bounded-B2D5Pb`

## Checks completed

1. Checked the exact file inventory, ownership markers, file hashes, and absence of active file handles, locks, or unfinished operations. One empty DuckDB spill directory had a modification time before the retention review; it contained no extra data.
2. Saved and verified all 13 test records before any removal.
3. Verified the active database, kept compact candidate, complete old-format control, and original production backup against the accepted migration hashes.
4. Ran the production history audit before cleanup. It passed with zero structural errors.
5. Copied the kept compact candidate to an isolated test file. The copy had the same SHA-256 hash. Its full audit matched the production audit, and the report command generated a report through snapshot `20261019-0616`. The copy retained its hash after these checks. The production database was never replaced.
6. Rechecked protected file metadata, target hashes, and saved records. Removed only the exact approved files and their two folders. Saved each removal to `deleted-files.jsonl`.
7. Ran the production history audit again. Its result matched the first audit. Existing source warnings remained; no structural error was found.
8. Recomputed hashes for all **40,601 protected files or links**, including **37,163 collection-batch files** and **2,925 package files or links**. Content hashes, file inventory, file metadata, and the package link target matched the saved baseline.
9. Confirmed that both old folders are absent and the production history lock was released. No WAL or recovery lock remains.

The database still has 152 snapshots, 111,624 raw top-match rows, 111,614 resolved observations, 98,896 raw good-job rows, and 40 exceptions. The latest snapshot still has 878 observations and 743 good-job inclusions.

## Evidence

- `test-records/` and `test-record-manifest.json`: preserved test records and hashes.
- `target-inventory.json` and `deleted-files.jsonl`: exact removal inventory.
- `recovery-checks.json`, `restored-copy-audit.json`, and `restored-report.md`: isolated restoration results.
- `production-audit-before.json` and `production-audit-after.json`: production audit results.
- `protected-before.jsonl.gz` and `final-verification.json`: protected-file baseline and final full-hash verification.
- `deletion-result.json`: measured disk change.
- `execution-status.json`: successful completion and released history lock.
- `checks.py` and `execute.cjs`: one-time execution record; do not reuse as a general cleanup command.

The monthly fetch-history writer defect remains unchanged. No collection batch, CSV package, retained production backup, or migration control was removed. No job fetch, index rebuild, publication, dependency change, or commit ran. This task used recovery and preservation checks; it did not run the full application regression suite.
