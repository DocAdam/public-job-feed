# History writer integration review

> Follow-up: the approved production migration was accepted at 2026-10-19 20:50 CDT. See [the production migration review](job-history-production-migration-review.md). The integration results below describe the earlier pre-migration state.

Status: implementation and isolated checks are complete. Production migration is not approved and has not occurred.

This review updates the implementation status in the earlier migration plan. The earlier plan and its evidence remain unchanged as historical records.

## Scope

This phase connects the tested storage format to the normal history commands. All replacement and recovery tests use separate files. The production database, saved source packages, production README, validation record, and report remain protected. No fetch, Sheets update, publication, scheduler change, dependency change, commit, or push is part of this phase.

## Implementation

- `jobs-history.js` now selects the writer from the actual database format. Existing old-format files keep the original writer. New-format files use the bounded worker importer. An ordinary build or update cannot convert an existing file. Unknown or mixed schemas stop the operation. The encoded format marker remains `history-storage-prototype-1`.
- Build, update, audit, report, query, compaction, and migration use one database lock. The lock has a process ID and a random owner value. Explicit recovery can take over a well-formed lock from a dead process. An active owner, unknown lock, pending operation, WAL file, symlink, or writable hard link causes a stop.
- A new-format update uses a separate working copy. Each added snapshot keeps its raw rows and metrics in one transaction. A fresh build loads the private raw history first, then calculates metrics once before the complete file is checked and accepted. The active file changes only after the complete multi-snapshot update passes. A later import failure leaves the active file unchanged. Compaction is an explicit operation; it is not part of every update.
- Migration preparation compares all 12 public SQL interfaces and report text with a complete old-format control. Approval binds the database, candidate, control, code, source hashes, operation ID, and backup path. Apply checks these inputs again. It does not trust a previously checked path if its bytes have changed.
- Replacement saves a checked copy of the database, companion records, and exact runtime source. It flushes files and directories before replacement. The journal records `prepared`, `replaced`, and `accepted`. Recovery checks actual file hashes when a process stops between those steps. It preserves a failed generation before restore.
- Recovery before acceptance restores the original database and companion files, including prior absence. Recovery after acceptance refuses the old, incomplete backup. A separate recovery command builds an old-format candidate through every accepted snapshot and compares it before it produces a new approval record.
- Validation records separate raw rows, resolved observations, good-job inclusions, and exceptions. Warnings remain separate from structural errors. Reports keep their current text and calculations. A hidden record identifies the database generation and hash used for each saved report.

The existing topic, work-arrangement, role, baseline, and coverage rules were not changed. Reappearance still means a return to the saved feed. It does not prove an employer repost.

## Commands and file effects

The existing npm build, update, audit, and report names remain. New maintenance commands require explicit paths and have no production-path defaults:

```sh
node src/scripts/manage-jobs-history.js prepare --database DATABASE --candidate CANDIDATE --control OLD_FORMAT_CONTROL --root SOURCES --record APPROVAL_JSON
node src/scripts/manage-jobs-history.js apply --record APPROVAL_JSON
node src/scripts/manage-jobs-history.js recover --database DATABASE
node src/scripts/manage-jobs-history.js recovery-candidate --database DATABASE --candidate NEW_RECOVERY_FILE --root ACCEPTED_SOURCES --record APPROVAL_JSON
node src/scripts/jobs-history.js compact --database DATABASE --root SOURCES
```

These are usage templates, not commands run on production. A new-format build at a new, isolated path uses `--format v2`. Preparation writes an approval record with `approved: false`. Apply requires explicit approval of that exact record. The recovery source root must contain exactly the accepted inventory; later, unaccepted packages need a separate source selection.

The implementation uses `DATABASE.operations/OPERATION_ID/` for backup and runtime records, `DATABASE.next-OPERATION_ID` for staging, and `DATABASE.history-operation.json` for the journal. This replaces the plan's proposed sibling backup folders. Staging and the active file share a parent filesystem. The approval record includes the actual backup path. Existing backups are never overwritten.

The shared lock coordinates project commands. It cannot stop an unrelated application from opening a file after the open-handle check. Close external database tools before any approved replacement. A stopped recovery process can leave the secondary recovery lock for manual review. The code does not remove an unknown recovery lock automatically.

## Storage limits and retained files

The database setting remains 192 MB with one thread and a 2 GB spill limit. The qualification gate remains a 768 MiB conservative process estimate. This is a measured test gate, not an operating-system memory limit. Each estimate adds the controller peak to the largest worker bound, including nested parser workers. It applies to one command process tree. It does not sum separate concurrent tests or unrelated applications. Disk checks retain the 16 GiB work limit and the 32 GiB free-space floor. Runtime disk checks occur at operation and package boundaries. The full rehearsal samples its test directory every second. A second monitor counts all new test work plus the durable candidate and control. Brief monitor restart gaps and between-sample peaks remain measurement limits.

Backups are retained. No retention or deletion policy is enabled. Repeated updates will therefore use more backup space and can reach the work limit. A separate retention decision is required before unattended daily use. This integration does not remove the historical CSV copies or solve the separate crawler-archive storage problem.

## Verification results

All 17 existing regression commands passed. The new integration suite passed 24 test groups. Four additional refusal probes passed. After the final metadata change, the SQL, bounded-storage, integration, history, and history-content suites passed again. After the worker change, the file-worker, compaction-memory, compaction, and recovery suites passed again. Syntax checks passed for all 20 changed or new JavaScript files. `git diff --check` passed. The evidence JSON records the exact commands and exit codes. The normal `jobs:history-audit`, `jobs:history-report`, and query commands also passed with explicit separate candidate and output paths. No default production audit or report command was run.

The integration suite covers both formats, exact SQL and report values, two byte-identical no-op updates, shared locks, all-or-nothing multi-snapshot updates, normal command entry points, checked migration backups, eight failure boundaries, repeated recovery, a killed writer, an interrupted restore, complete recovery candidate creation, and refusal of unsupported or unsafe inputs. The additional probes cover a corrupt backup, an unknown active-file hash, source changes after approval, and an unknown legacy lock.

| Full-history check | Result | Conservative peak memory |
| --- | --- | ---: |
| Restore original 131-snapshot file after an injected replacement failure | Passed; original file hash restored | 316.02 MiB |
| Checked 131-to-152 migration on an isolated file | Passed | 669.55 MiB |
| Two unchanged updates | Passed; database bytes did not change | 687.34 / 639.17 MiB |
| Full 152-snapshot production audit | Passed | 646.91 MiB |
| Full public SQL and report comparison | Passed | 634.28 MiB |
| Fresh production build of 131 snapshots | Passed | 766.22 MiB |
| Exact 131-snapshot SQL and report comparison with production | Passed; production opened read-only | 560.06 MiB |
| One production update adds the remaining 21 real snapshots | Passed | 712.45 MiB |
| Exact 152-snapshot SQL and report comparison with the original-parser control | Passed | 573.22 MiB |
| Late empty fixture plus a full-size copied package | Passed after the metadata fix | 707.91 MiB |
| Full production compaction | Passed; exact object comparison and reopen checks | 708.00 MiB |
| Audit after compaction | Passed; 154 test snapshots, 112,502 raw rows, 40 exceptions | 593.31 MiB |
| Complete old-format recovery candidate through all 152 accepted snapshots | Passed; all public values and report matched; test approval remained false | 637.20 MiB |

The preserved counts are:

| Measure | Current 131 snapshots | Complete 152-snapshot candidate |
| --- | ---: | ---: |
| Raw `03` rows | 94,079 | 111,624 |
| Resolved observations | 94,069 | 111,614 |
| Raw `01` rows | 83,474 | 98,896 |
| Unmatched good-job exceptions | 40 | 40 |
| Duplicate canonical rows retained | 10 | 10 |
| Historical canonical keys | 2,973 | 3,419 |
| Historical job keys | 2,923 | 3,361 |
| Latest resolved / included / excluded | 853 / 767 / 86 | 878 / 743 / 135 |

The latest candidate snapshot is `20261019-0616`. The current database ends at `20260928-0552`. The difference includes 21 saved source packages; it is not a storage-format change to the job facts. All 12 public SQL interfaces and the report are checked against the matching history length.

A direct query also confirmed that `20260715-0556` retains 929 raw rows, 919 resolved observations, and 10 duplicate rows. All 40 unmatched rows retain reason `no_matching_top_match_url`.

The 154-snapshot test contains two synthetic packages inside a temporary test root. It is not a migration candidate and does not represent two new source runs.

The largest completed process estimate is 766.22 MiB. This leaves only 1.78 MiB below the 768 MiB limit. A measured pass does not guarantee that every later run will fit. Do not increase the limit to hide a failed run. The fixed database memory setting and bounded workers remain in use. Normal runtime commands do not impose an operating-system RSS cap.

## Development failures and fixes

The first full-history audit attempts exceeded the fixed database memory setting. The audit now reads source metadata one snapshot at a time and runs separate summary counts. Three preliminary full rehearsals were stopped before replacement while the implementation was being completed. Their original test database hashes were unchanged. These were interrupted attempts, not passed tests.

An early full rehearsal exceeded the process limit at 809.27 MiB. An early fresh build exceeded it at 837.66 MiB. A later full-size late-import operation also exceeded the process limit; that first harness did not save the exact failed peak. The evidence does not invent that value. The operation had completed only in its disposable test folder. Its journal and failed result were saved before that test folder was reset.

The fixes reuse small hash buffers, release worker memory between operations, calculate fresh-build metrics once, and read historical metric metadata one snapshot at a time. The existing metric helpers receive the same values. Topic matching, role rules, work arrangements, and baseline selection remain unchanged. Exact SQL and report tests check the result.

The full recovery build was paused for about seven minutes while compaction finished. Completed test files were then removed, and recovery resumed. This kept the combined work below the disk limit. Its recorded elapsed time includes that pause.

The final checks were completed in several runs during development. They are not one uninterrupted run of the whole large test under a single final code hash. The final small integration suite was rerun after the last metadata change. The full prefix update and failed late-import phase were also rerun. The evidence retains the earlier failures and the later results.

## Files changed in this phase

| Group | Files |
| --- | --- |
| Production access and replacement | `src/lib/job-history-access.js`, `job-history-runtime.js`, `job-history-migration.js`, `job-history-parity.js` |
| Existing writer and report | `src/lib/jobs-history.js`, `jobs-history-report.js` |
| Memory and metric preparation | `src/lib/job-history-bounded-storage.js`, `job-history-bounded-runner.js`, `job-history-prototype-metrics.js`, `job-history-sql-compatibility.js` |
| Command entry points and workers | `src/scripts/jobs-history.js`, `query-jobs-history.js`, `report-jobs-history.js`, `manage-jobs-history.js`, `job-history-runtime-worker.js`, `job-history-file-worker.js` |
| Tests | `src/scripts/test-job-history-sql.js`, `test-job-history-integration.js`, `test-job-history-integration-worker.js`, `test-job-history-integration-full.js` |
| Review records | `docs/plans/job-history-integration-review.md`, `job-history-integration-results.json` |

The JSON evidence lists exact paths and code hashes. Other dirty files were present before this phase. They were not included in this change.

## Approval boundary

The separate review folder is `data/jobs/history-migrations/20261019-writer-review/`. It contains a 662.01 MiB candidate and a complete old-format control. Together, these two files use 2.76 GiB. The original retained candidates are left in place. The checked approval record at `data/jobs/history-migrations/20261019-writer-review/approval.json` binds the current code, source manifest, file hashes, target, and backup path; it remains `approved: false`.

No production backup or replacement is performed during preparation. The preparation command briefly creates the shared lock and opens the production database read-only. A later approved apply operation makes and checks the backup before replacement. A changed code file, source inventory, source hash, database, candidate, or control invalidates the record.

Migration approval remains separate from backup retention, source cleanup, and unattended daily operation. This phase does not authorize those actions. A later manual migration must still recheck the exact approval record. The small memory margin and retained-backup growth are the main operational limits.

The reserved production backup path is `/Users/adampugh/GitHub/public-job-feed/data/jobs/history/jobs-history.duckdb.operations/9819f508-ece7-430f-9016-aae7e46e5078/before.duckdb`. It does not exist yet. The record identifies operation `9819f508-ece7-430f-9016-aae7e46e5078`. The candidate SHA-256 is `a5bebe470fe279a4d87ed817d3b6b63405ca65d146638eeffba46e0f471ac9cd`.

## Final preservation and storage review

All 2,927 protected regular files in the baseline match their original hashes. This includes the production history files and saved package files. The production report also matches its original hash. The existing `latest/06_full_firehose.csv` symlink target was outside the regular-file baseline. The package manifest, dependency lock, and launchers match the start-of-phase baseline. The three checked files in the prior retained full-history candidate directory also match their original hashes.

The production database remains the original 131-snapshot file. No production backup, replacement journal, or WAL file was created. The preparation lock was released. No live jobs were fetched. No Sheets, publishing, scheduler, commit, push, or dependency action was performed.

The combined new-work monitor recorded a peak of 15.23 GiB and a minimum of 89.62 GiB free. Both passed the unchanged limits. This includes temporary test files and the durable review copies. The completed temporary full-history and prefix-test directories were removed after their results were saved. The synthetic 154-snapshot database and the test recovery approval paths no longer exist; those records are test evidence, not files to apply.

The durable candidate, control, generated candidate report, and approval record remain in the review folder. The two databases use 2.76 GiB. Earlier retained candidates, the current database, and all historical source files remain in place. This phase therefore adds review storage; it does not reclaim production or source-archive space.

Review conclusion: the production writer and isolated migration paths passed the stated checks. The exact candidate and approval record are available for a later migration decision. Continue to require a checked backup and monitored manual replacement. Do not treat these results as approval for unattended imports or source deletion.
