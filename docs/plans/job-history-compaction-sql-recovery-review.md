# Storage prototype: SQL, compaction, and recovery review

Status: The SQL, compaction, and recovery checks passed for the tested samples. A compaction memory gate remains open. Full migration has not started.

Scope: Public Job Feed only. All writes use owned temporary databases and copied test inputs. The current warehouse and saved CSV files remain unchanged. This is a review by the implementing agent, not an independent review.

## SQL read compatibility

The prototype now exposes all 12 existing SQL read interfaces: snapshots, posting observations, source files, source artifacts, both raw-row tables, exceptions, both stored metric tables, and the three existing summary views.

The tests compare column names, column order, types, total counts, every row and value, and exact raw JSON. They compare a fresh v1 control with the same eight saved packages. They also compare the complete report at a fixed generation time. Import timestamps are separate events in the two builds. Their type and non-null value are checked; later no-op and file tests preserve the prototype timestamps exactly.

The saved sample contains 5,185 raw 03 rows, 4,590 raw 01 rows, 5,175 resolved observations, all ten excess duplicate rows from July 15, and three exception rows. It covers four 01 header layouts and the old warehouse endpoint and latest saved package used by the plan.

Fixture tests also cover invalid and empty numeric/Boolean fields, Unicode and control characters, an empty successful snapshot, an empty history, two no-op updates, and a late snapshot that changes the seven-day baseline. A separate late schema addition matches v1's incremental column order.

The existing metric calculation, membership, classification, baseline, and report helpers remain in use. A schema registry preserves column order. Small per-observation records preserve the scanner's company-key fallback and selection rule. Import metadata stores the original inclusion-rate conversion, including its exact floating-point result.

Raw JSON is reconstructed from a per-payload prefix, a shared description, and a suffix. Each reconstructed value must match its saved raw-row hash. These SQL templates repeat some short fields already in the codec envelope. This is an intentional space cost: repeated JSON-array expansion exceeded the fixed query-memory setting. Description text remains shared. The storage measurements include this cost, the metric tables, SQL views, lifecycle views, and recovery metadata stored in the database.

These are SQL **read** contracts. Views do not provide the old tables' write interface or their catalog-level primary-key metadata. The new backing tables retain constraints. Production writer dispatch, daily integration, and production code/schema rollback remain separate work. No default production history command was changed.

## Compaction and file checks

The compactor can operate only in a newly created temporary prototype directory with the correct random owner token. It does not accept a production database path. All prototype writers and the compactor use an exclusive lease.

The compactor copies the schema into a new file, loads parent tables before dependent tables, checkpoints the copy, and compares all objects and constraints. The initial automatic database copy failed because its data load order violated foreign keys. The corrected path retains the constraints and derives load order from DuckDB's constraint catalog.

The copy method follows DuckDB's documented fresh-file approach. See the [DuckDB compaction reference](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space). A checkpoint alone is not treated as proof that disk space was reclaimed.

Wide observation comparisons use eight-row keyset pages. Other comparisons use per-snapshot SQL differences where possible. This avoids an archive-sized JavaScript row cache and two simultaneous wide JSON expansions. The memory setting remains 192 MB. File tests also compare physical-table fingerprints and small derived-view values. Wide views have their shapes and counts checked in those fingerprints; separate row comparisons and raw hashes check their values.

A closed candidate must reopen and pass its audit before file replacement. A durable operation record names both files and stores their hashes. Replacement uses same-directory renames and retains the prior file. The promoted file must reopen and pass again before the operation is marked complete.

The saved-file test compacts seven packages, imports the eighth, retries that import twice, compacts again, compares the result with v1, repeats compaction, and restores the prior file. It checks stored import times as well as row data. Tiny fixture files need not shrink; the saved-data test requires an actual reduction.

| Closed file | Size |
| --- | ---: |
| Seven packages before compaction | 109.76 MiB |
| Seven packages after compaction | 63.51 MiB |
| After the eighth import | 131.01 MiB |
| Eight packages after compaction | 76.01 MiB |
| Equivalent eight-package v1 control | 106.26 MiB |
| Repeated eight-package compaction | 74.51 MiB |

The eight-package compact file is 28.47% smaller than the equivalent v1 control. All 37 database objects and their constraints passed the copy comparison. File sizes vary between runs because physical packing is not deterministic. Logical rows and import times remained unchanged through both no-op retries, repeated compaction, and rollback.

The full compaction test process reached 1490.69 MiB (1.46 GiB) peak resident memory despite a 256 MiB V8 heap setting and 192 MB DuckDB setting. The largest import worker reached 572.27 MiB separately. These are different process peaks, not a measured simultaneous total. The compaction test has no passing RSS-limit assertion. Its functional pass must not be treated as a memory qualification. Native allocations can exceed the configured heap/database settings.

The separate bounded-import regression still passed its 768 MiB conservative combined-peak threshold. Its saved sample measured 726.62 MiB; the 8- and 32-package synthetic cases measured 506.50 and 753.39 MiB. Fourfold input growth added 246.89 MiB, below the 256 MiB growth threshold. The margin is small.

## Recovery checks

Tests stop a real worker with SIGKILL at these points:

- Before an import commits.
- After an import commits, with a non-empty write-ahead log.
- Before a file copy and after the copy.
- After the operation record is saved.
- After the original file is renamed.
- After the candidate file is promoted.
- After the operation is marked complete.

Recovery removes a well-formed lease only when its process is no longer alive. An unfinished replacement restores the prior verified file. A completed replacement stays in place unless rollback is requested. A committed import survives recovery; an unfinished import leaves no rows or metrics. Retrying a committed import is a no-op.

Tests also cover a live writer, explicit rollback, a real rename failure, an injected copy failure, a damaged rollback file, a malformed writer lease, and a rollback request after a new import. Rollback is refused when an unapplied write-ahead log exists or the current file no longer matches the recorded replacement. This prevents rollback from silently losing a later import.

Recovery attempts have a separate short-lived lock. If that recovery process itself stops while it owns this lock, manual review is required. The code does not guess that an unknown or malformed lock is safe to remove. Failed copies and rollback files can remain in the owned test directory until it is disposed. No automatic source or production-file cleanup was added.

These tests qualify process failures, not hardware power loss or a physically full disk. Production replacement, code-version rollback, and daily launchers were not tested or changed.

## Validation and protection

Commands, measurements, and file hashes are recorded in [the results JSON](job-history-compaction-sql-recovery-results.json). The checks include the three new SQL/compaction/recovery tests, the prior storage/bounded/lifecycle tests, the history/content/report regressions, JavaScript syntax checks, and tracked and untracked whitespace checks.

Commands run successfully for their stated functional checks:

```sh
node src/scripts/test-job-history-sql.js
node --max-old-space-size=256 src/scripts/test-job-history-compaction.js
node src/scripts/test-job-history-recovery.js
node src/scripts/test-job-history-bounded.js
node src/scripts/test-job-history-storage.js
node src/scripts/test-job-history-lifecycle.js
npm run jobs:test-history
npm run jobs:test-history-content
npm run jobs:test-content-metrics
npm run jobs:test-all-remote-report
npm run jobs:test-us-remote-report
npm run jobs:test-international-remote-report
git diff --check
```

All nine changed JavaScript files passed syntax checks. Tracked and untracked code passed whitespace checks. The current database was not rebuilt, updated, audited, or reported through a default production command. The tests used explicit temporary paths.

The full before/after comparison covered 44,217 existing files. Only the three intended existing code files changed. All 2,924 saved-package files and all three warehouse files matched their original hashes. Their file inventories also matched. The warehouse hash remained `b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`.

No source fetch, external sheet change, publication, dependency, commit, or production migration occurred. Unrelated work remains in place. All test databases and copied fixtures are removed by the test cleanup.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/job-history-sql-compatibility.js` | New typed SQL views, stable column order, and shared metric refresh. |
| `src/lib/job-history-prototype-owner.js` | New temporary-directory ownership and writer/recovery leases. |
| `src/lib/job-history-prototype-files.js` | New compaction, closed-file checks, operation record, and rollback/recovery. |
| `src/lib/job-history-bounded-storage.js` | SQL templates, exact import/selection metadata, integrity checks, layout guard, lease use, and transactional metric refresh. |
| `src/lib/job-history-bounded-runner.js` | Compaction and recovery entry points restricted to its owned prototype. |
| `src/lib/jobs-history.js` | Exposes existing column/type definitions and views for reuse; production defaults stay the same. |
| `src/scripts/test-job-history-sql.js` | New full read-contract and report comparisons, late metric refresh, and schema-order tests. |
| `src/scripts/test-job-history-compaction.js` | New saved-data size, update, no-op, repeat-compaction, and rollback tests. |
| `src/scripts/test-job-history-recovery.js` | New killed-process and file-failure tests. |
| This review and its results JSON | Scope, measurements, checks, and remaining gates. |

## Review decision and remaining gates

Keep the current database and sources in place. The requested functional checks are complete for the sample, but do not start full migration yet. First reduce native memory growth in the complete compaction/audit path and measure it in fresh processes. The current whole-test peak exceeds the prior 768 MiB benchmark reference. That benchmark covered import workers; it does not qualify the new file workflow.

| Gate | Review result |
| --- | --- |
| All 12 SQL read interfaces, values, and report text | Passed for eight saved packages and fixtures |
| Late snapshot metric refresh and late schema addition | Passed |
| Smaller closed file with equivalent evidence | Passed for eight saved packages |
| Subsequent import, two no-ops, repeat compaction, rollback | Passed |
| Killed-process and listed file-failure recovery | Passed |
| Existing bounded-import memory tests | Passed, with limited headroom |
| Memory qualification for the full compaction/audit workflow | Open; measured peak is too high to call bounded |
| Full archive, production writer, and cutover | Not started |

The full archive remains untested in the new layout. The next separate phase must recheck the source inventory, reconcile the old 131-snapshot prefix, preserve all 40 historical exception rows, and validate the newer saved packages. Sample results must not be reported as full-archive results.

The normal bounded-import benchmark is close to its memory threshold. A full candidate needs its own measured query, import, compaction, temporary-disk, and recovery checks. Reconstructed wide SQL can use more memory and CPU than physical wide tables. No arbitrary SQL workload or larger archive has a proven memory ceiling.

The compactor retains rollback files. A smaller candidate file is not the same as reclaimed total disk space while old files and CSVs remain. This work does not address the separate large crawler archive. No source removal, archive movement, or full migration is authorized by this phase.
