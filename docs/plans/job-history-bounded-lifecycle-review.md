# Bounded processing and lifecycle: results and review

Status: Phase 2 prototype tests passed within the tested scope. Full migration has not started.
Scope: Public Job Feed only. The current database and historical source files are unchanged.

## Review decision

The prototype now processes one capped package at a time, writes and reads small batches, and derives posting history from saved evidence. It passed the saved-package comparison, lifecycle tests, and memory growth test.

Keep the current database in place. Before a full migration, complete the wide SQL compatibility checks, final-file compaction checks, and process failure/recovery checks. These tests do not establish full-archive correctness or production readiness.

This is a code and results review by the implementing agent. It is not an independent review. Exact measurements and validation records are in [the results file](job-history-bounded-lifecycle-results.json).

## Processing changes

The previous prototype retained complete text, row, and content catalogs in JavaScript. The new path keeps those catalogs in DuckDB. Each batch checks exact stored values before it reuses a hash.

The processing limits are:

| Control | Limit or rule |
| --- | --- |
| Source package | 32 MiB across the required and supported optional files; reject larger packages |
| Staged record | 4 MiB; reject larger records |
| Write batch | At most 32 rows and normally at most 512 KiB; one larger record can use the record limit |
| Read page | At most eight raw rows or event boundaries |
| Import worker | One package, then process exit; 128 MiB V8 heap setting |
| DuckDB | One thread, 192 MB memory setting, 2 GB temporary spill limit |
| Benchmark parent | Fresh process with a 256 MiB V8 heap setting |

These settings are not an operating-system RAM cap. DuckDB and Node have native allocations outside those limits. The tests therefore measure resident memory as well.

The existing parser still determines CSV field values. A framing adapter calls it one record at a time and converts its intermediate strings to complete strings before it retains the row. This avoids retaining a package-sized collection of per-character string structures. Tests cover multiline and quoted fields, CRLF, tabs, blank rows, and trailing spaces. The saved-file comparison checks every recovered row against the existing importer.

The scanner has one optional parser argument. Production commands continue to use their existing parser by default. Duplicate selection, URL membership, role/topic calculations, and baseline rules were not replaced.

Each import worker can write only to a newly created temporary prototype with a matching random owner token. No production output path is accepted. The worker verifies copied source bytes, checks the source files again before commit, and stops on changed old sources. A global column-name registry also catches schema collisions across separate packages.

Native appender handles are reused within a worker. Event queries use a temporary DuckDB table of narrow boundary references, then return small pages. This avoids recalculating all window queries for every page. The table is removed when the iterator finishes or the caller stops early.

## Memory evidence

The final test used fresh processes. Each value below is the conservative sum of the parent process's peak and the largest import worker's peak. Those peaks can occur at different times.

| Test | Packages | Raw rows | Conservative combined peak |
| --- | ---: | ---: | ---: |
| Saved packages | 8 | 9,775 | 619.88 MiB |
| Synthetic input | 8 | 3,200 | 438.92 MiB |
| Synthetic input | 32 | 12,800 | 631.61 MiB |

All three passed the 768 MiB test threshold. Four times the synthetic input increased the combined estimate by 192.69 MiB, below the 256 MiB growth threshold. The large synthetic test retained 6,400 distinct content versions and checked 6,200 content-change events.

These are measured checks for the listed populations. They do not prove a fixed RSS ceiling for arbitrary data, a much larger archive, or callers that collect an entire iterator into memory. The compatibility reader still materializes one capped package when existing metric code needs arrays.

Earlier trials did not pass. The single-process design exceeded the memory threshold. A 128 MiB worker also failed while the original whole-package parser retained intermediate strings. Process isolation, record-at-a-time parsing, batch reads, and temporary event references were added before the successful final run. No test threshold was raised to obtain a pass.

## Lifecycle behavior

Two histories remain separate:

- Shortlist history uses the exact saved CanonicalURLKey from 03.
- Public-export history uses the existing normalized primary Apply Link from 01. Duplicate export rows count once for presence but remain in raw storage. Unmatched rows remain export-only evidence.

The views and reader now provide:

- First and last observed snapshot and time.
- Number of observed snapshots and dates.
- Presence periods and the first absent snapshot after each period.
- First observation, content change, schema change, absence, and reappearance events.
- Before/after content references, changed field names, and actual source-row references.
- Observed span in hours when the timestamps are comparable.
- Flags for presence at the archive's first or last snapshot, missing calendar days, uncertain clocks, and changed source coverage.

A missing calendar day is not an absence. A valid empty snapshot can establish absence from the saved feed. A failed, missing, or incomplete expected package stops the ordered import sequence. It does not become an empty successful run.

A content change after a gap compares against the last observed content and labels the gap. A newly available field is a schema change, not a proven edit to the posting. A return is a reappearance, not a confirmed repost. No event means that the employer closed the job.

Coverage warnings use the existing coverage helper. A temporary coverage change between observations remains visible even when endpoint counts match. Unknown or backward clocks produce an uncertain time flag; an uncertain observed span is NULL, not a fabricated duration.

## Correctness results

The saved sample still covers all four 01 header layouts, the July 15 duplicate rows, all three known exception URLs, the September 28 warehouse endpoint, and the October 19 package.

| Check | Result |
| --- | ---: |
| Raw 03 rows recovered exactly | 5,185 |
| Raw 01 rows recovered exactly | 4,590 |
| Resolved observations | 5,175 |
| Duplicate excess rows retained | 10 |
| Unmatched 01 rows retained in this sample | 3 |
| Posting identities | 2,402 |
| Content versions | 2,998 |
| Description values | 2,228 |

All reconstructed populations, metric values, role counts, and fixed-time report text matched a v1 database built from the same eight packages. This is sample parity. The other 37 historical exception rows and the full archive have not been imported into the new prototype.

Deepnote's Technical Writer has eight sample observations, one content version, and no content changes. The older 60-run reuse test also still passes.

Synthetic tests passed for:

- A → B → A reuse, content changes, and field availability changes.
- Separate shortlist/export presence and export-only exceptions.
- Multiple snapshots per day, missing calendar days, empty snapshots, and single-observation spans.
- One absence event at the first valid absent snapshot, followed by a return with changed content.
- Initial/final uncertainty and unknown or conflicting timestamps.
- Two no-op updates with unchanged event keys and periods.
- Late insertion producing the same lifecycle result as a chronological rebuild.
- Changed source rejection, source mutation before commit, transaction errors, and overlapping writer rejection.
- Exact hash conflicts, lost exceptions, altered text, invalid selected-row references, cross-snapshot column collisions, and size limits.
- Temporary ownership checks and event-cursor cleanup after early iteration exit.

## Disk results and limits

The isolated saved-sample file was 103.01 MiB. The v1 control in the parity test was 106.26 MiB. A separate bounded parity run produced a 105.01 MiB file, so final file size is not byte-for-byte deterministic.

The isolated file reported 57.5 MiB of used blocks and 45.5 MiB of free blocks. Repeated small transactions and checkpoints leave reusable free space in the file. Free blocks are not reclaimed disk space. The earlier 53 MiB prototype result must not be presented as the current bounded implementation's file size.

Do not claim a large physical storage reduction yet. Test a compact final candidate file and its rebuild/update behavior before a migration. The 114 GiB crawler archive remains outside this work.

## Files changed

| File | Change |
| --- | --- |
| `src/lib/job-history-bounded-storage.js` | New batch writer/reader, capped package staging, integrity checks, owned temporary database handling, and source verification. |
| `src/lib/job-history-bounded-runner.js` | New sequential import-worker controller. |
| `src/scripts/job-history-storage-worker.js` | New single-package worker with ownership checks. |
| `src/lib/job-history-lifecycle.js` | New derived periods, event boundaries, summaries, and paged event reader. |
| `src/scripts/test-job-history-bounded.js` | New saved-data parity and isolated memory growth tests. |
| `src/scripts/test-job-history-lifecycle.js` | New lifecycle, parser, update, failure, and integrity tests. |
| `src/lib/jobs-history.js` | Optional parser injection; default production path unchanged. |
| `src/lib/job-history-storage.js` | Exposes the existing prototype schema and appender helper for reuse. |
| `src/scripts/test-job-history-storage.js` | Allows a reader adapter in the v1 comparison helper and exposes sample IDs. |

No dependency, npm command, launcher, schedule, publication, or external sheet was changed. The previous storage prototype remains as a test reference.

## Validation and protection

Passed:

```sh
node src/scripts/test-job-history-bounded.js
node src/scripts/test-job-history-lifecycle.js
node src/scripts/test-job-history-storage.js
npm run jobs:test-history
npm run jobs:test-history-content
npm run jobs:test-content-metrics
npm run jobs:test-all-remote-report
npm run jobs:test-us-remote-report
npm run jobs:test-international-remote-report
git diff --check
```

Syntax checks passed for all nine changed or added JavaScript files. Separate whitespace checks covered untracked files.

The before/after hash check covered 3,159 existing files. Only the three intended existing code files changed. The other 3,156 matched, including all 2,924 saved-package files and all three warehouse files. Source and warehouse file inventories also matched. The database SHA-256 is unchanged. Unrelated project work was preserved.

No default production history build, update, audit, or report command was run. All new database writes used temporary prototypes or fixture controls. Temporary databases and copied fixtures were removed.

## Before a full migration

| Gate | Status |
| --- | --- |
| Sample row preservation and report parity | Passed |
| Lifecycle and update semantics in fixtures | Passed |
| Measured memory limits and fourfold growth trial | Passed for the tested populations |
| Full archive reconciliation, including all 40 exceptions | Not run |
| All existing wide typed SQL query contracts | Not implemented in the new storage path |
| Existing metric refresh after a late insertion in the new path | Not integrated; lifecycle equality alone does not prove metric refresh |
| Final-file compaction and later update size behavior | Not verified |
| Process-kill recovery, database promotion, and rollback | Not qualified; transaction rollback is a narrower test |
| Production replacement and daily integration | Not started |

The next step is to close these compatibility, compaction, and recovery gaps in temporary test databases. A full historical migration remains a separate reviewed step.
