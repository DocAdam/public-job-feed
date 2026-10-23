# Job history retention and cleanup plan

Update, 20 October 2026: the monthly writer fix, shared batch lock, and retention checks passed their tests. A fresh plan lists 762 candidates with 49.12 GiB of logical file data. The production dry run passed with zero deletions. See the [fresh plan and safeguard review](batch-retention-safeguards-20261020/README.md). The older numbers and defect status below describe the 19 October review; they are not a current deletion list. Batch cleanup still needs separate approval and a raw-payload archive decision.

Update, 20 October 2026: the approved old test-folder cleanup is complete. Available disk space increased by 6.87 GiB. All protected files passed the final hash check. See [cleanup results](job-history-test-cleanup-20261020/README.md). Other cleanup phases remain unapproved and were not run.

Status: proposed only. Reviewed on 19 October 2026, America/Chicago. No files were deleted, moved, compressed, or replaced. Only this plan and its evidence files were added. Production code, the database, and historical source files were not changed.

## Decision

Start with the old history test files. They can release **6.87 GiB** after approval and the checks below. Keep the production database, the complete migration candidate, the old-format control, the production backup, and all saved CSV packages.

A separate batch cleanup has a measured **48.75 GiB** of candidates. It is **blocked by a history-preservation defect**. Do not run the current batch retirement command to apply this plan. If that defect is fixed and all checks pass, the first two phases could release **55.62 GiB** in total. The two groups do not overlap.

These are file-size estimates, not a promise of free disk space. One GiB is 1,073,741,824 bytes. The inventory also records allocated blocks. Shared APFS blocks and filesystem snapshots can reduce the actual space released. A move to another folder on this disk does not release space.

## Current storage

| Group | File size | Decision |
| --- | ---: | --- |
| Raw collection batches | 113.87 GiB | Keep current inputs; review old batches in phase 2 |
| Current public feed and saved slices | 17.34 GiB | Keep; some views are distinct or older |
| Two history test folders | 6.87 GiB | Phase 1 |
| Historical CSV package tree | 3.32 GiB | Keep all packages |
| Migration review copies and evidence | 2.77 GiB | Keep candidate and control for recovery |
| Production history, backup, and evidence | 2.44 GiB | Keep |
| Five older ZIP archives | 0.82 GiB | Keep until archive contents and recovery needs are checked |

The active database itself is only **0.646 GiB (662.01 MiB)**. It is not the main cause of disk use.

Scope: all regular files under `data/jobs`, the two remaining history test folders in the system temporary directory, and a separate repository scan for other CSV, database, archive, and large files. The scan excluded `.git` and `node_modules`. It did not inspect the rest of the computer, other projects, external drives, or cloud backups. No external backup is assumed to exist. Links were recorded but their target bytes were not counted twice.

## Phase 1: retire the old history test files

The following five database files account for **7,376,531,456 bytes**. This is the conservative space estimate; keep the small test records in a durable evidence folder before removing the old test folders.

| Temporary folder and file | Bytes | GiB |
| --- | ---: | ---: |
| `job-history-bounded-BljI6a/v1-control.duckdb` | 2,274,111,488 | 2.118 |
| `job-history-bounded-BljI6a/prototype.duckdb` | 1,068,249,088 | 0.995 |
| `job-history-bounded-B2D5Pb/backup-1b69a10c-f5ba-482d-8bb6-8411bff07877.duckdb` | 1,066,151,936 | 0.993 |
| `job-history-bounded-B2D5Pb/v1-control.duckdb` | 2,273,849,344 | 2.118 |
| `job-history-bounded-B2D5Pb/prototype.duckdb` | 694,169,600 | 0.646 |

Both folders are under `/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/`. `/private/var/…` names the same files; do not count it as another copy.

- `job-history-bounded-B2D5Pb/prototype.duckdb` is byte-identical to the active database and the kept `candidate.duckdb`.
- Its `v1-control.duckdb` is byte-identical to the kept migration control. Its third database is a test compaction backup, not the production backup. Its operation record says `complete`.
- `job-history-bounded-BljI6a` is the earlier failed test. Its databases have different file hashes. They are superseded test artifacts, not verified byte duplicates. The later successful full-history test and accepted production migration replace their test role. Keep the failure records for diagnosis.
- No database handles, writer locks, recovery locks, or WAL files were found for these test files during this review. This is a point-in-time check.

Before approved cleanup:

1. Check the exact paths, ownership markers, file hashes, and absence of active processes or pending operations again. Stop if anything differs.
2. Save the small result and operation records in a durable review folder. Omit or redact owner capability tokens, including tokens inside saved error commands. Confirm the saved evidence is readable.
3. Confirm that the active database, kept candidate, kept control, and production backup still match the accepted migration record. Run the history audit and test restoration from the kept candidate in an isolated folder.
4. Remove only these two obsolete owned test folders. Do not use a broad temporary-folder wildcard. Record the removed paths, hashes, and before/after free space.
5. Confirm that all historical source hashes and the active database hash are unchanged. Run the history audit again.

No phase 1 cleanup or new restoration test ran in this review.

## Keep the recovery set

| File | GiB | Retention reason |
| --- | ---: | --- |
| `data/jobs/history/jobs-history.duckdb` | 0.646 | Active 152-snapshot history |
| `data/jobs/history-migrations/20261019-writer-review/candidate.duckdb` | 0.646 | Complete compact copy, same bytes as the accepted database |
| `data/jobs/history-migrations/20261019-writer-review/v1-control.duckdb` | 2.118 | Independent complete 152-snapshot old-format control |
| `data/jobs/history/jobs-history.duckdb.operations/9819f508-ece7-430f-9016-aae7e46e5078/before.duckdb` | 1.791 | Checked pre-migration backup; only 131 snapshots |

Keep the operation journal, operation directory, source manifests, runtime backup, validation records, and companion reports with this set. The 131-snapshot backup is not a complete rollback for the accepted 152-snapshot database.

There is also a code dependency: `recoverHistory` in `src/lib/job-history-migration.js` checks that the recorded backup exists before it handles an accepted operation. Do not remove `before.duckdb` or edit the journal by hand. A safe backup-expiry command needs tests before this payload can be retired.

Proposed later policy, not implemented:

- Review the migration copies after 30 days and at least three successful imports that add new snapshots. No-op updates do not count.
- Keep the active database and at least the two most recent successful prior generations. Keep a verified monthly recovery copy for three months. One file can meet more than one retention rule.
- Keep at least one verified complete recovery copy outside this computer before local long-term copies are removed. Test restoration; a hash alone does not prove a usable recovery.
- Keep small audit and migration records indefinitely. Never expire a pending operation or the only complete recovery copy.
- Retire the old-format control only when it has no remaining test or rollback role and a complete recovery path passes. This could release a further **2.12 GiB**. It is not part of phase 1 or the batch total.
- Review backup growth monthly. The current writer retains a prior database for each accepted replacement; it has no automatic expiry. Its disk limit is a stop condition, not a retention policy. Do not add a deletion schedule in this phase.

## Phase 2: raw collection batches — blocked

The existing 30-day rule gives these measured results:

| Classification | Folders | GiB |
| --- | ---: | ---: |
| Current source for at least one board | 743 | 53.70 |
| Recent, not a current source | 381 | 11.43 |
| Older, superseded candidates | 758 | 48.75 |
| Index status requires review | 4 | 0.00 |

The four review entries had zero regular-file bytes; this does not make them safe to delete. Keep them for review. The separate batch evidence file lists every candidate and its measured size.

Read-only checks passed:

- The board-state file matches the index's count of 1,882 usable batches.
- Rebuilding board state in memory from the protected folders gave the same 29,551 boards, source batches, statuses, and fetch times.
- All 185,163 candidate fetch-log rows have matching records in the compressed monthly ledgers, for the fields those ledgers store. No missing or differing record was found.

**Blocking finding:** `src/scripts/index-batches.js` supplies logs from the folders that exist. `writeDerivedBatchHistory` in `src/lib/batch-history.js` groups those logs by month and replaces the monthly files. It does not merge them with saved history. Thus, a later index run after retirement can discard the old fetch history. This finding comes from code review; no production index rebuild or deletion was run.

Before batch cleanup, preserve existing ledger events during index rebuilds and test that behavior. The test must remove source batches only in an isolated fixture, rebuild the index twice, and prove that old events remain, new events are added once, current state is unchanged, and recovery works after an interrupted write. Also test fresh-plan checks, age rules, source references, unsafe paths, and a changed index.

Then prepare a fresh candidate list and repeat both the protected-state and ledger checks under a maintenance lock. Back up the ledgers, index, and proposed batch removals to a verified external archive if full raw job payload recovery is required. The compact ledger stores fetch history, not every job description. The jobs warehouse stores the saved shortlist and good-job data; it does not replace the full collection firehose. Removing these batches without that archive is a deliberate loss of older raw payloads and needs separate approval.

The 48.75 GiB figure includes batch CSVs. Do not add those CSV sizes again. No production retirement command was run.

## CSV copies and older exports

Repeated jobs in different dated files are evidence of presence over time. They are not, by themselves, redundant files.

The package tree contains 152 dated snapshots plus current and legacy exports. Its largest dated components are:

| Component | GiB | Treatment |
| --- | ---: | --- |
| `05_writer_focus.csv` in 23 older packages | 1.670 | Broader exports; not fully represented by the shortlist warehouse |
| `02_company_coverage.csv` | 0.763 | Preserve source coverage evidence |
| `03_top_matches_full.csv` | 0.599 | Required history source |
| `04_remote_writer_focus.csv` in 23 older packages | 0.169 | Preserve broader export history |
| `01_good_documentation_jobs.csv` | 0.025 | Required history source |

The importer also uses package manifests, source summaries, ATS health, package readme files, and start-here files. History audit and update require the saved sources at their current paths and verify their hashes. Report and release tools also read package paths. Do not remove or replace these files with links under this plan.

The scan found **271 byte-identical CSV groups**, with **0.96 GiB** of extra file copies if one file per group were kept. This is an upper bound for a future path-preserving storage design. It is **not approved reclaimable space**: groups cross required snapshots, public views, and batch files. It overlaps other groups in this plan and must not be added to the cleanup total. The evidence lists the hashes and paths.

`latest/06_full_firehose.csv` is already a link to the current public CSV. The merged-release CSV and JSON are also links. Deleting these links would release almost no space and could break consumers.

Keep `latest-clean` and `top-matches-only` for now. Together they use only about 16.33 MiB. They are legacy exports, not large savings. Keep the five ZIP archives as well: their directory listings were checked, but their full contents and restore behavior were not validated.

A later source-archive project can use lossless compression and restore-on-demand. Before any source removal, it must prove exact byte restoration for every package, preserve row order, all export fields, duplicates, exceptions, URLs, and dates, and make existing audit/report/update commands pass. No compression savings are claimed without measuring a proposed archive.

## Validation and limits

- SHA-256 checks matched all 2,924 regular package files to the migration baseline. The package link and its target also matched.
- All nine discovered history database files were hashed. Active database, durable candidate, durable control, and pre-migration backup matched the accepted records.
- The production operation is still `accepted`; its current README, validation file, and report match the journal. All 223 runtime/package files match the migration baseline.
- A second metadata check found no changes in the 44,336 scanned regular files. This detects size, modification-time, and inode changes; it is not a content hash check of every raw batch.
- No open database handles were reported. No full migration, application test suite, database write, package generation, live fetch, or publication ran for this review.
- The earlier accepted migration supplies database integrity and SQL parity evidence. Its database hashes were checked again here. New cleanup approval still requires a fresh audit and isolated restore test.
- Evidence is point-in-time. Refresh the plan if a daily collection or history update runs before cleanup.

Evidence: `job-history-retention-inventory.json`, `job-history-retention-batches.json`, `job-history-retention-extra.json`, and `job-history-retention-results.json` in this folder. The inventory stores measured sizes, database hashes, exact CSV duplicate groups, link targets, and source checks. These derived records contain no deletion script.
