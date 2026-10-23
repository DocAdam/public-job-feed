# History update and tested 1Pugh backup

Status: PASS. Completed 21 October 2026. No user data was deleted.

## Updated history

The normal history writer imported two new snapshots, for 154 total through
20261021-0636. It staged and audited the update, saved the previous database,
and accepted generation 7b0f654d-4b3c-4d7f-818b-182bda807b74.

| Check | Result |
| --- | ---: |
| Snapshots | 154 |
| Raw top-match rows | 113,352 |
| Resolved observations | 113,342 |
| Raw good-job rows | 100,346 |
| Canonical keys | 3,439 |
| Job keys | 3,383 |
| Preserved good-job exceptions | 40 |
| Resolved duplicate raw rows retained | 10 |
| Latest resolved / good / excluded | 862 / 719 / 143 |
| Audit errors / pending snapshots | 0 / 0 |

A repeated update imported zero snapshots and left database bytes and the
accepted journal unchanged. The database is 939,798,528 bytes.
SHA-256: `a3891cb3331c63d7b3e3394484649b4b5b34627d68b712fb9012190498b6ce2b`.

## Backup and restore

Backup: `/Volumes/1Pugh/Public Job Feed Archives/history-backup-20261021T120102Z`.
Package size: 1,647,651,680 bytes (1.53 GiB).
It contains the current database, all 2,929 dated source-package files in a
compressed archive, 237 runtime files in a separate archive, accepted metadata,
verification records, restore instructions, and package checksums.

The drive UUID and separate external device were checked. The database copy ran
under the shared history lease. Every source/runtime archive file was read,
restored, and hashed. Both gzip trailers passed. The complete package checksum
list was checked again after finalization.

The restored code audited the restored database against the restored source
packages. Its audit matched the production audit exactly. Its history report
matched the accepted report exactly, and its lifecycle query returned 3,439
canonical keys. The restored database hash stayed unchanged.

The restore test used the installed locked dependencies through NODE_PATH.
A clean-machine dependency install and production recovery cutover were not run.
The old accepted-operation record is backup evidence, not a portable live journal.

## Preservation and checks

All 2,965 original package files and links passed the final before/after check.
All historical CSV bytes are unchanged. Existing archive and recovery copies
remain. The normal writer added a checked before-update database backup.
The database update also regenerated its README, validation, and history report.
No launcher, schedule, dependency, or production program file changed in this task.

Passed: production audit, no-op update, full external restore audit, exact report
comparison, lifecycle query, jobs:test-history, jobs:test-history-content, helper
syntax checks, and git diff --check. Locks and WAL files were absent at final
verification. Source warnings remain distinct from structural audit errors.

## Next reviews

- restore-test-cleanup-review.md: three optional cleanup candidates totaling
  5.88 GiB. No files were deleted.
- daily-backup-plan.md: add a separate history update/audit/backup step after
  successful feed validation, with clear missing-drive status and a tested
  recovery retention policy. This is a design only; the daily launcher is unchanged.

Machine-readable evidence: validation.json, update-result.json, audit.json,
no-op-result.json, backup-manifest.json, restored-audit.json,
restored-report-check.json, and restore-test-cleanup-plan.json.

The execution helpers here are one-time review tools, not production commands.
Do not rerun them against their existing output folders.
