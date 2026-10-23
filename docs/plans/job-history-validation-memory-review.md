# Storage prototype: old-format validation memory review

Status: The old-format validation passed the measured memory limits and regression checks. The current database and all historical CSV files remain unchanged. Full migration has not started.

This is an implementer review. It updates the open validation-memory finding in [the previous review](job-history-compaction-memory-review.md). The earlier report remains a record of that phase. [Detailed results](job-history-validation-memory-results.json) contain the commands, measured values, hashes, and limits.

## What changed

The v1 control now has three sequential worker steps: source scan, database build and audits, then comparison. Each worker exits before the next starts. This releases parsing and native database allocations between steps. The controller receives small results.

The scan worker calls the existing v1 scanner with its original parser. It saves the original staged rows and scan metadata in the owned temporary directory. The build worker calls the existing `runHistory` build with those scan results. It keeps the original schema, ingestion, metric refresh, transaction, both audits, checkpoint, and closed-file replacement. It does not build the control from prototype rows.

Two programmatic options let tests supply the staged scan and database settings. Normal history commands retain their previous scanner and settings. A fixture compares the phased control with an independent default v1 build. This passed for every SQL read interface and the report.

Each database worker uses the existing 192 MB database setting, one thread, and a 2 GB spill limit. Validation workers use a 256 MiB JavaScript heap. Source packages above 32 MiB are refused. No limit was raised and no dependency was added.

The SQL comparison reuses the compaction helper. It checks one snapshot and eight value columns at a time, with the unique row keys in every group. Both `EXCEPT ALL` directions remain. It checks exact values and JSON bytes, column order and types, row counts, missing/duplicate identities, and orphan snapshot references. The other 11 read interfaces and the complete report remain in the comparison. Import timestamps are independent build events; their type and non-null state are checked on both sides. No-op and compaction checks still preserve prototype import times exactly.

The comparison opens both database files read-only. Source inventories and source/staged-file hashes are checked before and after the control build. A completion marker records the closed control hash. Comparison refuses an incomplete or changed control. The worker refuses an existing control as a build destination. Successful builds remove only their owned staging files.

## Measured results

Each estimate is the controller peak plus the largest sequential child peak. These peaks can occur at different times. MiB means 1,048,576 bytes. The synthetic benchmark dispatcher is excluded. These are test gates, not an OS-enforced memory ceiling.

| Workflow | Combined memory estimate | Limit | Result |
| --- | ---: | ---: | --- |
| Previous complete saved-data test, including old v1 validation | 1,599.23 MiB | 768 MiB | Exceeded |
| Revised complete saved-data test | 672.58 MiB | 768 MiB | Pass |
| Eight synthetic snapshots, including original v1 validation | 517.05 MiB | 768 MiB | Pass |
| 32 synthetic snapshots, including original v1 validation | 729.28 MiB | 768 MiB | Pass |
| Fourfold validation input growth | 212.23 MiB increase | 256 MiB | Pass |

The complete saved-data estimate fell by 57.9%. Both measurements use the same eight saved packages and include old-format validation. The revised whole-test assertion counts imports, query setup, compaction, fingerprints, recovery, the original v1 scan/build/audits, and SQL/report comparison. No old-format worker is excluded from this assertion.

| Saved-data component | Worker peak |
| --- | ---: |
| Original v1 scan | 524.88 MiB |
| Original v1 build and both audits | 476.55 MiB |
| Read-only SQL/report comparison | 391.86 MiB |
| Controller | 114.92 MiB |

The SQL command runs the saved-data phase first, then the small independent fixtures. It takes the maximum of the phase bounds. Each phase includes the controller high-water mark through that phase and its largest worker; later fixture allocations cannot overlap completed saved-data workers. The first fixture-first run failed its memory assertion. The corrected full SQL command passed at 659.69 MiB.

The separate saved SQL phase, including a fresh reopen and second comparison, measured 659.69 MiB. The 32-snapshot validation has 38.72 MiB of margin. The existing bounded-import suite also passed; its largest isolated estimate was 751.91 MiB. The margins remain limited.

Both synthetic cases check all 12 read interfaces and the report twice. They assert stored row counts and verify that both database file hashes remain unchanged after comparison. The cases contain 3,200 and 12,800 raw rows. They do not represent a full archive migration.

## Correctness and failure checks

The saved sample retained 5,185 raw 03 rows, 4,590 raw 01 rows, 5,175 resolved observations, and three exception rows. It includes all ten excess duplicate rows from July 15. All 12 read interfaces and the complete report matched v1. Compaction still compared all 37 prototype objects. Repeated compaction, no-op imports, rollback, and the existing recovery tests passed.

New tests reject an incorrect owner token, an active writer, changed source content, new source files or snapshots, changed staged rows, an existing control destination, changed control bytes, and a missing completion marker. They verify that a failed pre-build check leaves no control database and that successful builds remove staging files.

Corruption tests detect late-column changes, values swapped between rows, JSON byte changes, NULL/zero/false differences, duplicate or NULL identities, orphan snapshots, missing/extra rows, and changed schemas. They also check temporary-table cleanup and control-catalog detachment after failure. The shared copy-comparison tests retain their NULL/string/empty checks.

During development, database limits alone were insufficient. Separating build from comparison also left too much scan memory in the build process. The final three-step path passed. No failing trial is counted as a pass.

## Tests run

All 17 commands below passed their final run. The failed initial SQL memory check and its correction are recorded in the results JSON:

```sh
node src/scripts/test-job-history-validation.js
node --max-old-space-size=256 src/scripts/test-job-history-validation-memory.js
node --max-old-space-size=256 src/scripts/test-job-history-compaction-memory.js
node src/scripts/test-job-history-copy-comparison.js
node src/scripts/test-job-history-file-worker.js
node --max-old-space-size=256 src/scripts/test-job-history-compaction.js
node src/scripts/test-job-history-recovery.js
node src/scripts/test-job-history-sql.js
node src/scripts/test-job-history-bounded.js
node src/scripts/test-job-history-storage.js
node src/scripts/test-job-history-lifecycle.js
npm run jobs:test-history
npm run jobs:test-history-content
npm run jobs:test-content-metrics
npm run jobs:test-all-remote-report
npm run jobs:test-us-remote-report
npm run jobs:test-international-remote-report
```

All nine changed JavaScript files passed syntax checks. `git diff --check` and whitespace checks for the changed untracked files passed. No default production build, update, audit, or report command ran. Test builds and reports used temporary paths.

## Protected files and changed files

The before/after check covered 3,173 existing files. Only five intended existing code files changed. All 2,924 saved-package files and all three warehouse files retained their hashes and file inventories. The current database SHA-256 remains:

`b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`

| File | Change in this phase |
| --- | --- |
| `src/lib/jobs-history.js` | Optional programmatic scanner and database settings; normal defaults remain |
| `src/lib/job-history-prototype-files.js` | Shared exact observation comparison and orphan guard |
| `src/scripts/job-history-validation-worker.js` | New isolated v1 scan, build, and read-only comparison worker |
| `src/scripts/job-history-validation-control.js` | New sequential worker helper and phase memory results |
| `src/scripts/test-job-history-compaction.js` | Complete workflow memory assertion, including v1 validation |
| `src/scripts/test-job-history-sql.js` | Shared comparison, isolated saved-data control, and reopen memory check |
| `src/scripts/test-job-history-copy-comparison.js` | Expected error text for the shared helper |
| `src/scripts/test-job-history-validation.js` | New source/control guards, default-build equivalence, and corruption tests |
| `src/scripts/test-job-history-validation-memory.js` | New 8/32-snapshot validation memory and repeated read-only checks |
| This review and its results JSON | Measurements, validation, and limits |

Existing unrelated work remains in place. No source fetch, sheet change, publication, dependency change, commit, push, or production migration occurred.

## Review decision

The tested old-format validation now passes the memory gate that was open in the prior phase. Stop before full migration and retain the current database and CSV files.

The next separate phase should build a temporary full-history candidate with measured memory and disk limits. It must reconcile the existing 131-snapshot prefix, all 40 historical exception rows, and all newer saved packages. The full selected-history v1 build can still grow with the data. Its sample result does not prove a fixed memory ceiling for the full archive.

Full-archive reconciliation, production writer integration, production replacement, and rollback remain unverified. Source deletion and archive cleanup remain outside this work.
