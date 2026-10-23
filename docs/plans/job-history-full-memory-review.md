# Full-history memory, lifecycle, and compaction review

Status: prototype checks passed. No migration started. The current database and historical CSV files are unchanged.

This is an implementer review of measured tests on the October 19, 2026 saved archive. It updates [the prior full-history review](job-history-full-candidate-review.md). The prior report remains a record of the earlier failures. [Detailed results](job-history-full-memory-results.json) include phase measurements, failed attempts, regression results, and the protected-file hash manifest.

## Result

The temporary candidate contains all 152 saved snapshots. Its raw rows, resolved observations, exceptions, metrics, and reports match an independent full build made with the original parser and old database schema. All 12 public SQL interfaces passed exact schema/value comparisons twice. Report text also matched with a fixed report-generation time. Independent build timestamps (`snapshots.imported_at`) are checked for type and non-NULL values, not equal wall-clock values. The copy and no-op checks preserve their exact values. The first 131 snapshots separately matched the current database before the remaining 21 were added.

The qualification candidate started empty. It was resumed after one update-code fault during development; that update rolled back and its retry passed. This was not one uninterrupted run of a single code revision. The final path keeps report views active and updates metrics in the same transaction as every new snapshot. It does not use the earlier deferred-metrics workaround.

| Preserved data | Full candidate |
| --- | ---: |
| Snapshots | 152 |
| Raw `03` rows | 111,624 |
| Raw `01` rows | 98,896 |
| Resolved posting observations | 111,614 |
| Canonical posting keys | 3,419 |
| Historical job keys | 3,361 |
| Unmatched `01` exception rows | 40 |
| Reusable description texts | 3,345 |
| Content versions | 8,701 |

All 929 July 15 raw `03` rows remain present, including the ten excess duplicate rows. They resolve to 919 observations. September 28 still has 853 observations, 767 matched inclusions, and 86 excluded rows. October 19 has 878 observations, 743 matched inclusions, and 135 excluded rows. The current production database still has 131 snapshots; it was not extended.

Two repeated imports left the closed candidate file hash exactly unchanged. Compaction compared all 37 tables and views, checked constraints, reopened the compacted file, and verified the promoted temporary file. Full-size recovery passed. A separate full-size compaction/recovery/rollback probe also passed; it restored its original temporary file. Smaller recovery tests cover interrupted operations and damaged recovery records.

## Memory and disk

The database setting remains 192 MB, with one thread and a 2 GB spill limit. The test limit remains 768 MiB. Small append buffers, allocator release settings, separate parsing workers, and shorter-lived database instances reduce retained memory. No dependency was added.

| Check | Conservative memory estimate | Result |
| --- | ---: | --- |
| Highest completed phase: `compact` | 750.47 MiB | Pass |
| Full lifecycle events | 370.17 MiB | Pass |
| Full compaction | 750.47 MiB | Pass |
| Full original-parser scan | 688.52 MiB | Pass |
| Full old-format build and audit | 623.88 MiB | Pass |
| Full SQL/report comparison, second pass | 674.62 MiB | Pass |
| 32-snapshot old-format validation test | 670.58 MiB | Pass |
| 32-snapshot compaction test | 549.31 MiB | Pass |

The fourfold-input memory increase was 197.00 MiB for old-format validation and 161.75 MiB for compaction. Both are below the unchanged 256 MiB growth limit.

The estimate adds the controller high-water mark to the largest worker bound for that phase. It includes nested parser workers and sample-generation workers. Those peaks need not occur together. It excludes unrelated processes and test dispatchers. It is not an OS memory ceiling. Failed processes that did not return measurements have unknown peak memory. These measurements qualify the worker-based test path, not arbitrary embedded use of the library. The measured margin is only 17.53 MiB; larger archives still need qualification.

| Disk measure | Size |
| --- | ---: |
| Full candidate before compaction | 1016.76 MiB |
| Accepted compacted candidate | 662.01 MiB |
| Independent old-format full control | 2168.51 MiB |
| Candidate directory sampled peak | 6.92 GiB |
| Lowest sampled free volume space | 99.26 GiB |

The compacted candidate is 34.9% smaller than its pre-compaction file and 69.5% smaller than the same-history old-format control. Compaction took 487.5 seconds, including exact comparison and reopen checks. The prior file remains available as a rollback copy. These sizes do not mean that production disk space was recovered. The current database and all source archives remain present.

Disk use was sampled each second and at phase boundaries. Between-sample peaks can be missed. The directory stayed below its 16 GiB limit, and free volume space stayed above 32 GiB. Other development directories and logs are outside the per-candidate disk figure.

## Changes reviewed

- Source parsing runs in a short-lived worker before database writes. Raw reconstruction selects a small page of references before it reads their payloads. All raw-row hash and source checks remain active.
- Lifecycle SQL selects first and last row identities before it decodes their fields. It preserves NULL endpoint values. The full lifecycle API produced 18,535 unique events and matched independently counted period boundaries.
- Compaction stages both sides of each bounded exact comparison. It closes and reopens database instances between relations and observation snapshots. Temporary comparison tables are removed after success or failure.
- The old-format control uses the original parser in one package worker at a time. Its build uses the original ingestion and audit helpers. Explicit collection releases completed native query results in this test worker.
- Prospective report metrics are calculated before write buffers are held. The existing metric, topic, role, time, and baseline helpers supply the values. Results are stored and audited inside the import transaction. Narrow temporary audit scopes use the pre-read source metadata; the writer lease, raw/run count audit, and final source hashes protect that input. The public SQL view remains unchanged in meaning.
- Test sample creation exits before import or compaction. Its memory is still counted. Rollback tests verify both raw rows and metric tables, remove temporary scopes, and compare a successful retry with the old-format control.

The code review found no remaining blocker for this prototype test phase. This is not production approval. Lifecycle periods describe saved-feed presence. Absence does not prove closure, and a later return does not prove an employer repost.

## Failures retained

Earlier full-size imports and copies exceeded the database or process-memory limits. The fixes above reduce the active data and release native memory sooner; they do not raise the limits. An intermediate count-derived snapshot view was removed after it caused a full count-query failure. The final implementation retains the original snapshot view contract.

A development update failed with a metric-plan shape mismatch while code was changing. It rolled back and passed after restart with consistent code. The final regression batch also found excess growth in the compaction stress-test controller. Separating sample creation fixed that test; its rerun passed both limits. The original failed results remain in the evidence. A passed retry does not supply the missing memory measurement for a failed attempt.

## Tests and protected files

All 17 commands passed on their final run. The compaction-memory command required the correction and rerun described above.

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

The disk-monitor self-test, syntax checks for changed JavaScript, tracked whitespace checks, and full-file whitespace checks also passed. Tests covered raw preservation, duplicate selection, exceptions, source hashes, late history, NULL endpoints, schema collisions, atomic rollback, exact SQL/report values, repeated imports, and recovery.

All 2,927 protected regular files retained their hashes and inventory: 2,924 saved-package files and three production history files. The pre-existing `latest/06_full_firehose.csv` symlink target was outside the regular-file baseline and was not checked.

Production database SHA-256:

`b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`

No production build, update, audit, or report command ran. No source archive, Job Finder record, dependency, external sheet, publication, commit, or remote repository changed. Existing unrelated edits remain in place.

## Files changed in this phase

- `src/scripts/job-history-validation-control.js`
- `src/scripts/job-history-validation-worker.js`
- `src/scripts/test-job-history-copy-comparison.js`
- `src/scripts/test-job-history-sql.js`
- `src/scripts/test-job-history-validation.js`
- `src/scripts/job-history-full-candidate-worker.js`
- `src/scripts/test-job-history-validation-memory.js`
- `src/scripts/test-job-history-compaction-memory.js`
- `src/scripts/test-job-history-full-candidate.js`
- `src/scripts/test-job-history-lifecycle.js`
- `src/scripts/job-history-file-worker.js`
- `src/scripts/job-history-storage-worker.js`
- `src/lib/job-history-sql-compatibility.js`
- `src/lib/job-history-bounded-storage.js`
- `src/lib/job-history-prototype-files.js`
- `src/lib/job-history-bounded-runner.js`
- `src/scripts/job-history-prepare-worker.js`
- `src/scripts/job-history-validation-scan-worker.js`
- `src/lib/job-history-prototype-metrics.js`

This review and `job-history-full-memory-results.json` record the results. Earlier phase reports remain unchanged.

## Retained candidate and phase boundary

The accepted temporary candidate is:

`/private/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/job-history-bounded-B2D5Pb/prototype.duckdb`

Its directory also contains the independent `v1-control.duckdb`, rollback backup, and test records. Temporary files can be removed by the operating system; they are review artifacts, not durable production backups.

Two superseded scratch candidates from this run were removed after their results were saved. Earlier in this run, six failed compacted copies and a scan-only scratch candidate were also removed. The current accepted candidate directory uses 3.76 GiB, including its control and rollback file. The earlier review candidate directory remains at 3.11 GiB. No source archive cleanup occurred.

The next phase must define production writer integration, a checked backup, a controlled replacement, reader restart behavior, and rollback. It must also check the current source inventory again. No production replacement, source deletion, archive compaction, or daily workflow change is authorized or performed by this phase.
