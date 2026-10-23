# Production job-history migration review

Status: accepted at 2026-10-19 20:50 CDT. All migration checks passed. No rollback was needed.

The production database now uses the reviewed compact format and contains 152 snapshots through `20261019-0616`. The original database had 131 snapshots through `20260928-0552`. The 21 additional snapshots came from saved packages. No jobs were fetched.

## Approval and backup

The user explicitly approved this migration. The execution used the reviewed candidate, source manifest, code hash, operation ID, and reserved backup path. The prepared `approval.json` remains the historical review record with `approved: false`. The execution copy, `execution-9819f508/authorized-approval.json`, records the user's approval and has `approved: true`.

Generation: `9819f508-ece7-430f-9016-aae7e46e5078`.

Backup: `/Users/adampugh/GitHub/public-job-feed/data/jobs/history/jobs-history.duckdb.operations/9819f508-ece7-430f-9016-aae7e46e5078/before.duckdb`.

The backup was copied and flushed before replacement. Its size is 1,922,838,528 bytes (1.79 GiB). Its SHA-256 matches the original database: `b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`. The backup reopened successfully and passed the 131-snapshot audit. A separate restoration copy also passed its audit and matched the same hash. That test copy was then removed; the actual backup remains.

The old README, validation record, report, and all 223 runtime/package files were copied and checked before replacement. No runtime source or dependency file changed during this migration.

## Installed data

| Check | Accepted result |
| --- | ---: |
| Snapshots | 152 |
| Raw `03` rows | 111,624 |
| Resolved posting observations | 111,614 |
| Raw `01` rows | 98,896 |
| Historical canonical keys | 3,419 |
| Historical job keys | 3,361 |
| Good-job exceptions | 40 |
| Duplicate raw rows retained | 10 |
| Latest resolved / included / excluded | 878 / 743 / 135 |
| History events | 18,535 |
| Structural audit errors | 0 |

The July 15 snapshot retains 929 raw rows and 919 resolved observations. All 40 unmatched rows retain reason `no_matching_top_match_url`. These preserved source conditions remain warnings. They are not structural errors. History events describe observed feed changes; they do not prove employer closure or reposting.

The installed database is 694,169,600 bytes (662.01 MiB). Its SHA-256 is `a5bebe470fe279a4d87ed817d3b6b63405ca65d146638eeffba46e0f471ac9cd`, exactly matching the reviewed candidate.

## Validation run

- All 17 existing regression commands passed again.
- The integration suite passed all 24 test groups, including replacement failures, recovery, locks, and multi-snapshot atomicity.
- Syntax checks passed for all 20 reviewed JavaScript files. The execution helpers also ran or passed syntax checks. `git diff --check` passed before migration.
- The normal `jobs:history-audit` and `jobs:history-report` commands passed against the explicit candidate path before production replacement. The production audit used the same bounded audit worker while the migration lock was held.
- Two actual update calls with no new input imported zero snapshots and left the candidate hash unchanged.
- The reviewed candidate passed the complete original-parser control comparison again before replacement.
- After replacement, the installed database passed its structural, row-preservation, identity, source-hash, metric, and inventory audits. All 12 public SQL interfaces and the full report matched the same-history control.
- The installed README, validation record, and report matched the saved generation and their expected hashes. The saved report also matched a fresh render from the installed metrics.
- All data acceptance checks ran before the journal changed to `accepted`. A failure at that point would have used the checked backup recovery path. No such failure occurred.
- The final check confirmed accepted journal state, database and backup hashes, companion hashes, unchanged code, and absence of locks and WAL files.

The evidence JSON records the exact commands, results, events, and file paths. The external execution helpers are retained in the execution folder. They used the reviewed runtime; they did not change its code.

## Source preservation

All 2,924 regular source files match the pre-migration inventory and hashes. The one source symlink and its file target also match. This includes all historical CSV files. The source archive was not edited, renamed, compressed, or deleted.

The candidate and control files also retain their reviewed hashes. No Sheets update, publication, scheduler change, commit, push, or dependency change was made.

## Resources and retained storage

| Measure | Result | Limit |
| --- | ---: | ---: |
| Conservative migration process estimate | 705.11 MiB | 768 MiB |
| Sampled process-tree memory peak | 660.89 MiB | 768 MiB |
| Sampled work-space peak | 8.15 GiB | 16 GiB |
| Minimum free space | 96.99 GiB | At least 32 GiB |

The conservative estimate adds the main process peak, largest worker bound, and a 64 MiB allowance for the controller. Disk measurements include review copies, the active database, backup operations, restore-test copy, and staging. Samples were taken each second; between-sample peaks can be missed. The worker peak records add a separate high-water check. No resource limit failed.

The backup, reviewed candidate, complete control, and execution evidence remain. The smaller active database does not mean that total disk space was recovered. No backup-retention or CSV-cleanup policy was enabled.

## Current files and future recovery

The migration changed the production database and its three companion files:

- `data/jobs/history/jobs-history.duckdb`
- `data/jobs/history/README.md`
- `data/jobs/history/validation.json`
- `data/jobs/reports/jobs-history-report.md`

It added the checked backup operation, journal, execution records, and this review. The normal history commands now select the compact writer from the installed format. Existing schedules were not changed.

The original backup contains only 131 snapshots. After acceptance, do not restore it as if it contained the complete 152-snapshot history. A later storage-format recovery must preserve every accepted snapshot. The reviewed old-format control covers the current 152 snapshots; later imports would require a complete updated recovery candidate and fresh validation.

Full evidence: [job-history-production-migration-results.json](job-history-production-migration-results.json).
