# Storage prototype: compaction memory review

Status: The revised prototype passed the requested compaction memory and regression checks. Full migration has not started. The current database and historical CSV files remain unchanged.

This is an implementer review of measured tests. It updates the memory finding in [the prior review](job-history-compaction-sql-recovery-review.md). The prior review remains a record of the earlier code. Detailed results are in [the results JSON](job-history-compaction-memory-results.json).

## Changes and checks

The exact wide-row comparison now stays in DuckDB. It checks one snapshot and eight value columns at a time. Each group includes the unique snapshot and canonical URL keys. Both comparison directions use `EXCEPT ALL`. The audit checks key validity, column names and types, counts, object inventories, and constraints. Temporary comparison tables are removed after success or failure.

The audit no longer returns pages of full posting text to JavaScript. Fingerprints hash each string or JSON field before they serialize the small row summary. The digest still includes each named field, NULL state, row count, and value hash. The exact copy comparison and raw-row hash checks remain separate checks. Stored descriptions are not changed.

The runner starts a new worker process for each compaction, query setup, file fingerprint, and recovery operation. Process exit releases its native allocations. Each worker must pass the existing temporary-directory owner and writer-lease checks. It cannot select a production output path. Active readers and competing operations are refused. Child errors reach the caller and clear the runner's busy state.

The settings remain 192 MB for DuckDB, one database thread, a 2 GB temporary spill limit, and a 128 MiB worker JavaScript heap. The test controller uses a 256 MiB heap. No dependency, production command, metric rule, or storage schema was changed in this phase. Direct low-level helpers still run in their caller's process; the runner is the tested entry point for memory isolation.

New tests detect changed late columns, values swapped between rows, JSON byte-order changes, NULL/string/empty/zero/false differences, missing or extra rows, duplicate or missing keys, and missing snapshots. They check fingerprint sensitivity and temporary-table cleanup. Worker tests cover ownership, active readers, concurrent calls, errors, recovery, and rollback.

## Measured memory

MiB means 1,048,576 bytes. Each combined estimate is the controller's peak plus the largest sequential child peak. These peaks need not occur at the same time. The synthetic test dispatcher is excluded. These are test limits, not an OS memory ceiling.

| Test | Combined estimate | Limit | Result |
| --- | ---: | ---: | --- |
| Eight saved packages: imports, setup, audits, repeated compaction, rollback | 677.23 MiB | 768 MiB | Pass |
| Eight synthetic snapshots, 3,200 raw rows | 501.22 MiB | 768 MiB | Pass |
| 32 synthetic snapshots, 12,800 raw rows | 654.09 MiB | 768 MiB | Pass |
| Fourfold synthetic input growth | 152.88 MiB increase | 256 MiB | Pass |

The saved controller peaked at 112.14 MiB. Its largest file worker peaked at 506.44 MiB. Its largest import worker peaked at 565.11 MiB. Both synthetic cases compact twice, check data after each operation, restore the prior file, and check again. Synthetic row and content-version counts are asserted from stored fingerprints.

The separate legacy v1 build and equivalence control peaked at 1,487.11 MiB. Including its controller, the complete test estimate was 1,599.23 MiB. **The entire test harness is not qualified under 768 MiB.** The prior monolithic test reached 1490.69 MiB in its parent process. Its structure mixed compaction, audits, and v1 control work, so that number is not a direct before/after compaction measurement. The revised results identify these costs separately.

The existing bounded-import test also passed: 742.30 MiB for saved data, 506.34 MiB for eight synthetic snapshots, and 754.50 MiB for 32. Its growth was 248.16 MiB. Its remaining margin is small.

During development, wide SQL comparisons exceeded the fixed database setting. The first larger fingerprint test also failed when it built large JSON copies of descriptions. The final column groups and field hashes passed the reruns. The limits were not raised.

## Data and file results

The eight saved packages retained 5,185 raw 03 rows, 4,590 raw 01 rows, 5,175 resolved observations, and three exception rows. All ten excess duplicate rows from July 15 remain covered. All 12 SQL read interfaces and the complete report matched the v1 control. All 37 prototype database objects passed the copy check. No-op imports, repeated compaction, and rollback preserved logical data and stored import times.

The compact eight-package file was 74.51 MiB, compared with 106.76 MiB for the equivalent v1 control: 30.21% smaller. Repeated compaction produced 74.01 MiB. Physical packing can vary. Backups remain in the owned directory until test cleanup, so this is a file-size result, not total disk space reclaimed.

The recovery suite passed process-kill checks before and after import commit and at six compaction stages. It also passed copy and rename failures, damaged-backup refusal, stale/live/malformed lease checks, pending-log refusal, and refusal to roll back over a later import. No hardware power-loss or physically full-disk test was performed.

## Validation and protection

All 15 test commands listed in the results JSON ran and passed. These include copy comparison, worker guards, saved compaction, compaction growth, SQL compatibility, recovery, storage, lifecycle, bounded import, and all six history/content/remote-report regression commands. All seven changed JavaScript files passed syntax checks. Tracked changes and the new files passed whitespace checks.

The before/after hash check covered 3,167 existing files. Only the three intended existing code files changed. All 2,927 protected saved-package and warehouse files retained their hashes and file inventories. This includes 2,924 package files and three warehouse files. The production database SHA-256 remains:

`b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`

No default production build, update, audit, or report command ran. Test builds and reports used temporary files. No source fetch, external sheet edit, publication, dependency change, commit, or push occurred. Existing unrelated changes remain in place.

## Files changed in this phase

| File | Change |
| --- | --- |
| `src/lib/job-history-prototype-files.js` | Narrow exact comparisons and smaller field fingerprints |
| `src/lib/job-history-bounded-runner.js` | Isolated file workers, query setup, fingerprints, and worker memory statistics |
| `src/scripts/job-history-file-worker.js` | New owned-prototype operation worker |
| `src/scripts/test-job-history-compaction.js` | Isolated control work and explicit prototype memory assertion |
| `src/scripts/test-job-history-copy-comparison.js` | New exact comparison and fingerprint corruption checks |
| `src/scripts/test-job-history-file-worker.js` | New worker guards and failure/recovery checks |
| `src/scripts/test-job-history-compaction-memory.js` | New 8/32-snapshot repeated compaction memory checks |
| This review and its results JSON | Measurements, validation, and remaining limits |

## Review decision

The tested prototype compaction and audit path now passes its memory limits. Keep the current warehouse and CSV files in place. Stop at this phase boundary.

Before a full candidate run, define a bounded comparison with the existing warehouse and a temporary-disk budget. The legacy v1 test control remains memory-heavy. A separate full-history candidate must measure imports, queries, audits, compaction, recovery, and temporary disk use. It must reconcile the existing 131-snapshot prefix, all 40 historical exception rows, and all newer saved packages. None of those full-archive checks is claimed here.

Production writer integration, production file replacement, code rollback, and source retention remain separate work. No source deletion or migration has been performed.
