# Full-history temporary candidate review

Status: **candidate built; migration blocked**. Review date: October 19, 2026.

The candidate preserves the saved job data and produces the same report as the independent old-format control. The full-size lifecycle SQL query still exceeds the database memory limit. Full-size compaction has not passed. Keep the current database in service.

This is an implementer review. [Detailed results and file hashes](job-history-full-candidate-results.json) record successful checks, failed attempts, final regression results, and temporary files. No production migration occurred.

## Data preservation

The source inventory has 152 snapshots, from `20260602-1810` through `20261019-0616`. The current database contains the first 131, through `20260928-0552`.

| Measure | Full candidate | Result |
| --- | ---: | --- |
| Snapshots | 152 | Pass |
| Raw `03` rows | 111,624 | Pass |
| Raw `01` rows | 98,896 | Pass |
| Resolved posting observations | 111,614 | Pass |
| Canonical posting keys | 3,419 | Same as independent control |
| Job keys | 3,361 | Same as independent control |
| Unmatched `01` exception rows | 40 | Pass |
| Excess duplicate canonical rows | 10 | All preserved |
| Shared description values | 3,345 | Measured |
| Content versions | 8,701 | Measured |

The July 15 package retains all 929 raw `03` rows and 919 resolved observations. All ten excess duplicate rows remain. Exception rows remain separate; they do not create invented canonical observations.

The September 28 boundary remains 853 resolved observations, 767 matched good-job inclusions, and 86 excluded rows. The October 19 candidate endpoint has 878 observations, 743 inclusions, and 135 excluded rows. These are saved-feed counts, not proof that an employer opened or closed a job.

Each imported package passed its row-by-row source comparison and integrity checks. The 131-snapshot prefix passed all 12 existing SQL read interfaces and the complete report against the production database opened read-only. Independent import timestamps were checked for type and non-null values; they are separate build events.

On the final code, comparison with the independently built 152-snapshot v1 control passed exact values, raw JSON bytes, column order/types, counts, and snapshot references for the first ten interfaces:

- snapshots and posting observations;
- source files and source artifacts;
- both raw-row interfaces and good-job exceptions;
- historical content metrics, historical role metrics, and snapshot summaries.

The comparison then failed at `posting_lifecycle` because of memory use. It did not reach the complete `daily_market_metrics` comparison. The endpoint queries passed, but they do not replace that missing full comparison. A separate comparison of the entire report, using the existing renderer and a fixed generation time, passed for all 152 snapshots.

Two no-op imports of the latest snapshot left the closed candidate file hash exactly unchanged. Final read-only checks also left both the candidate and the v1 control hashes unchanged.

The candidate contains 3,720 shortlist presence periods across 3,419 canonical subjects, and 3,574 export presence periods across 3,043 export subjects. These describe saved-feed presence. They do not establish confirmed employer reposts.

## Memory and disk use

MiB means 1,048,576 bytes. GiB means 1,073,741,824 bytes.

Memory estimates add the controller high-water mark to its largest sequential worker high-water mark. These peaks need not occur together. The estimate excludes unrelated processes and test dispatchers. Failed workers did not return their peak RSS, so the observed maximum is not a bound on every failed attempt.

| Check | Measured estimate | Gate | Result |
| --- | ---: | ---: | --- |
| Highest completed phase across full-history attempts | 842.22 MiB | 768 MiB | Fail |
| Full original v1 source scan | 824.73 MiB | 768 MiB | Fail |
| Final complete eight-package regression workflow | 668.41 MiB | 768 MiB | Pass |
| Final 32-snapshot validation-memory regression | 761.39 MiB | 768 MiB | Pass; 6.61 MiB margin |
| Final 32-snapshot compaction-memory regression | 636.89 MiB | 768 MiB | Pass |

Database settings remain 192 MB, one thread, and a 2 GB spill limit. No limit or dependency was changed. The sample passes do not qualify the full archive. The full scan still exceeds the process-memory gate, and the full lifecycle query reaches the database memory limit.

| File or disk measure | Size | Interpretation |
| --- | ---: | --- |
| Full candidate | 1,018.76 MiB | Retained; not compacted |
| Independent full v1 control | 2,168.76 MiB | Retained; same 152 snapshots |
| Unaccepted compacted copy | 660.01 MiB | Failed validation; removed after evidence capture |
| Main test directory sampled peak | 6.94 GiB | Below its 16 GiB guard |
| Main test plus first-attempt directory sampled peak | 7.19 GiB | Includes the older failed attempt |
| Lowest measured free volume space | 105.20 GiB | Above the 32 GiB floor |
| Retained temporary directory after cleanup | 3.12 GiB | Candidate, control, and small test records |

The candidate file before compaction is about 53.0% smaller than the full v1 control. This is a same-history file-size comparison, not a successful compaction result or a claim of recovered production disk space. The current database and CSV archive are still present.

Disk use was sampled each second and at phase boundaries. Peaks between samples can be missed. Empty staging directories outside the owned directory and ordinary test logs are outside this measurement.

## Changes and failures found

The first attempt imported 54 snapshots, then failed at July 18. The whole-history SQL reconstruction check exceeded the database memory setting. The transaction rolled back. Reconstruction now selects payloads and text for one snapshot at a time. It still checks every raw row, including duplicates and exceptions.

A later import failed at October 6 in the payload-to-text reference check. That check now derives a narrow table of expected hashes before its full join. Missing references and mismatched hashes remain errors. Import failures now identify their stage.

The old compatibility view expanded every source column into a correlated structure. At full size, even count and identity checks could retain too much data. Common aggregate fields now use scalar extraction. Other fields use groups of at most eight decoded columns. The first scalar-only revision caused a saved-sample compaction regression; the grouped version fixed it. All 17 existing regression commands passed on the final code.

A full-size incremental import failed while refreshing SQL compatibility and metrics inside its import transaction. The candidate build continued by importing the remaining saved rows first, then preparing query interfaces and metrics separately. This is an initial-build test. The final incremental writer has **not** been requalified after the later audit changes.

Full fingerprinting and the full compaction comparison failed at `posting_lifecycle`. Compaction failed before it wrote a replacement journal or replaced the original candidate. Recovery reopened and checked that original. The compaction attempt took about 7 minutes 53 seconds. It was not repeated after the final grouping change because the final full SQL check still fails at the same lifecycle interface. There is no validated full-size compacted file.

The v1 build worker stopped without returning success, but left the completed database, completion hash, and a dead writer lease. The disk monitor had a race: a temporary directory could disappear between its metadata check and directory read. The monitor could treat that normal cleanup as a fault and terminate the worker. This race was reproduced and fixed; the exact cause and peak RSS of the interrupted worker were not retained. They remain unknown.

After explicit stale-lease recovery, the saved control's completion hash, counts, and stored metric audit passed. Full raw-data comparisons and independent report equivalence also passed. This evidence validates the saved control's contents; it does not supply the missing successful worker return or memory measurement.

The monitor now tolerates removed staging directories, waits for pending samples, and records a monitor error and termination information on failure. Its self-test covers byte accounting, symlink rejection, and removal during a directory scan.

## Tests and protected files

All 17 commands below passed their final run. Earlier failures are retained in the results JSON; none was counted as a pass before its correction.

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

The disk-monitor self-test also passed:

```sh
node src/scripts/test-job-history-full-candidate.js --self-test
```

All five changed JavaScript files passed syntax checks. Tracked and changed-untracked whitespace checks passed. Lifecycle corruption tests now check raw hashes at both ends of history, damaged reconstruction text, missing payload/text links, and mismatched text references. Each fixture mutation is rolled back.

The before/after comparison covered 3,179 existing regular files. Only the three intended existing code files changed. All 2,924 saved-package regular files and all three production warehouse files retained their hashes and file inventory. The complete protected-file hash manifest is in the results JSON.

The pre-existing `latest/06_full_firehose.csv` symlink was outside the original regular-file hash baseline. Its target bytes were not checked. This limitation does not affect the dated CSV packages used by the test.

The production database SHA-256 remains:

`b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`

No production build, update, audit, or report command ran. No historical source file, Job Finder record, dependency, external sheet, publication, commit, or remote repository changed.

## Files changed in this phase

| File | Change |
| --- | --- |
| `src/lib/job-history-bounded-storage.js` | Partitioned reconstruction, narrow reference audit, error-stage context |
| `src/lib/job-history-sql-compatibility.js` | Scalar aggregate fields and bounded field-decode groups |
| `src/scripts/test-job-history-lifecycle.js` | Additional reconstruction/reference corruption cases |
| `src/scripts/job-history-full-candidate-worker.js` | New owned-candidate inventory, counts, comparison, and report checks |
| `src/scripts/test-job-history-full-candidate.js` | New full-history experiment, owned resume, measurements, guards, and self-test |
| This review and `job-history-full-candidate-results.json` | Results, failures, file hashes, and migration limits |

Existing unrelated edits remain in place. The new harness is an explicit test, not a production command. Its count expectations describe this October 19 archive. A fresh run creates a new owned temporary directory. Resume requires that directory's owner token. Existing controls are never overwritten. Temporary build state is not suitable for production readers until preparation and validation finish.

## Retained candidate and next step

The temporary candidate is at:

`/private/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/job-history-bounded-BljI6a/prototype.duckdb`

The same directory contains `v1-control.duckdb`. The failed first candidate and unaccepted compaction copy were removed after their evidence was saved. No source archive cleanup occurred. Temporary files can be removed by the operating system; these are review artifacts, not durable production backups.

Before migration:

1. Bound the full lifecycle SQL and copy comparison without losing exact value checks.
2. Test the full-size incremental import again with atomic metric updates.
3. Reduce full source-scan memory and rerun a clean full-history workflow with the corrected monitor.
4. Require successful full compaction, all 12 SQL comparisons, recovery/rollback, and source-hash checks before planning production replacement.

Source deletion, archive cleanup, production writer integration, and production cutover remain outside this phase.
