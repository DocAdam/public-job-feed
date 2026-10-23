# Job history migration plan

Status: proposed; not implemented. Reviewed on October 19, 2026.

This phase permits file review and planning only. The current database, historical CSV files, production README, validation record, and report must remain unchanged until migration approval. No backup, replacement, scheduler change, or production update was performed in this phase.

## Decision and scope

Keep DuckDB and the current command names. Replace the repeated physical storage with the tested storage model only after the normal commands can read and write that model safely. Use a separate candidate and a checked backup. Do not change the live database in place to convert its schema.

The proposed first migration includes the 152 dated packages through `20261019-0616`. This changes both the storage format and the available history: the current database contains only the first 131 packages. Packages created after this cutoff are deferred to a later normal update. They must not enter the migration without being added to its reviewed input manifest.

Historical CSV packages remain the source of truth and stay in place. This plan does not include source deletion, crawler archive cleanup, job fetching, Sheets updates, publication, new dependencies, or changes to Job Finder. A return to the saved feed remains a reappearance, not a confirmed employer repost.

## Current files: verified findings

The review used the current source files, direct read-only database queries, and SHA-256 file hashes. [The evidence file](job-history-migration-plan-evidence.json) records the checks. [The prior full-history review](job-history-full-memory-review.md) records the previous test runs; those full tests were not rerun during planning.

| Item | Current state |
| --- | --- |
| Live database | `data/jobs/history/jobs-history.duckdb`; 131 snapshots; 94,079 raw `03` rows; 94,069 resolved observations; 83,474 raw `01` rows; 40 exceptions |
| Live latest snapshot | `20260928-0552`; 853 observations, 767 inclusions, 86 excluded |
| Saved dated packages | 152 valid packages; no malformed dated folder names found |
| Tested candidate | 152 snapshots; 111,624 raw `03` rows; 111,614 resolved observations; 98,896 raw `01` rows; 40 exceptions |
| Candidate latest snapshot | `20261019-0616`; 878 observations, 743 inclusions, 135 excluded |
| Candidate size | 662.01 MiB; the same-history old-format control is 2,168.51 MiB |
| Prior full-history peak estimate | 750.47 MiB against a 768 MiB test limit; only 17.53 MiB of margin |
| File checks | All 2,927 protected regular files and all 19 reviewed JavaScript files match the prior results |
| Temporary files | Candidate, old-format control, and compaction backup still exist and match their recorded hashes |

Live database hash:

`b584af978612407331b443287e93e6aa3c99b443dbef0e58c0bbe60db940b4b7`

Candidate hash:

`a5bebe470fe279a4d87ed817d3b6b63405ca65d146638eeffba46e0f471ac9cd`

Candidate location:

`/private/var/folders/py/60zw0pcx2lb7zp_4cms5c3900000gn/T/job-history-bounded-B2D5Pb/prototype.duckdb`

The candidate's `backup-*.duckdb` is a pre-compaction copy of the new format. It is **not** a backup of the live 131-snapshot database. The temporary directory is not durable backup storage.

The only matching user LaunchAgent configuration found runs `jobs:maintain-index` at 04:00 and 16:00. It is not a configured history importer. Repository history entry points are manual commands. This review did not prove the absence of every external scheduler or application. Recheck active users of the database before replacement. No open file handles were reported at the inspection instant; that observation is not a lock. The existing `latest/06_full_firehose.csv` symlink is outside the dated-package import and the regular-file hash check.

## Required implementation before replacement

These are proposed changes, not completed work or commands that can run now.

| Area and current file | Required behavior |
| --- | --- |
| `src/scripts/jobs-history.js`, `src/lib/jobs-history.js` | Detect the actual storage format before writes. Dispatch supported old and new formats to their own writers and audits. Reject unknown or mixed schemas. An ordinary update must never convert the format. |
| `src/lib/job-history-bounded-storage.js`, `job-history-bounded-runner.js`, worker scripts | Add a production adapter for the exact approved database path. Retain process boundaries, fixed limits, source checks, and atomic row/metric updates. Keep temporary-directory ownership checks for test APIs. Do not remove those checks to make a production path work. |
| Format detection | The current marker is `history-storage-prototype-1`. That value is also embedded in encoded raw rows. Do not rename it as a cosmetic release change. Map the checked marker and schema signature to the supported writer; record the runtime release separately in the migration manifest. A real encoding change needs a new tested conversion. |
| Locks and recovery | Use one database-scoped protocol for build, update, audit, report, query, compaction, and migration. Reuse the `.history-lock` path so the current writer also refuses overlap. Add owner identity and a migration state record. A parent may pass a checked lease to its workers; workers must not acquire a second conflicting lock. |
| `src/lib/jobs-history-report.js`, report/query scripts | Preserve metric definitions and report sections. Use the shared read/maintenance protocol and tested database settings. A maintenance operation must block new readers and require existing readers to close. External database tools must also close. |
| `src/lib/job-history-prototype-files.js` | Reuse the checked copy, compare, reopen, and recovery logic through a separate production coordinator. Its existing API cannot perform a live migration. Keep compaction backups distinct from migration backups. |
| Metadata and daily use | Keep command names and options. Preserve the current all-or-nothing behavior of a command that adds several snapshots. Add generation IDs to validation/report records so a stale record cannot appear current. Update operational documentation only as part of the approved release. |

The current importer creates and writes physical tables. The candidate exposes several of those names as views. Running the old writer against that candidate is not supported. The old `build` command can also replace the database with the old format. Therefore, file replacement alone is not an acceptable migration.

The new writer is atomic for one snapshot. To preserve the existing multi-snapshot command contract with bounded memory, stage an update in a separate working copy, import and validate each missing snapshot there, then accept the whole copy. A failed later snapshot must leave the live database unchanged. An update with no missing snapshots must leave its closed database bytes unchanged. Test this production update path; prototype tests alone do not prove it. Do not add compaction to every daily update.

## Phase 1: prepare and rehearse away from production

After approval for implementation, prepare the adapter and coordinator above against isolated files. No production replacement occurs in this phase.

1. Record an exact code manifest, Node version, dependency lock hash, input cutoff, source hashes, and expected counts. The inspected runtime is Node `v26.3.1` with `@duckdb/node-api` `1.5.5-r.5`. Keep those versions for qualification.
2. Create a durable migration directory outside the source archive. Proposed paths are `data/jobs/history-migrations/<migration-id>/` for work and `data/jobs/history-backups/<migration-id>/` for backup. These paths do not exist as a result of this plan. Confirm the work directory and live database use the same filesystem. Reject symlinks and path escapes.
3. Copy the retained candidate into the work directory without changing the original. Verify its hash before and after the copy. Rebuild from saved packages if the candidate is missing or differs. Do not treat a file in the OS temporary directory as a release artifact.
4. Qualify the candidate under the final adapter code. If views or metadata change, give it a new hash and repeat affected comparisons. Verify the original 131-snapshot prefix against the live database and all 152 snapshots against the independent original-parser control. Use a 131-snapshot rehearsal database before appending the remaining 21 packages, as the existing full-history test does. Do not compare full-history lifecycle endpoints with the shorter history by merely filtering snapshot IDs.
5. Rehearse the real command entry points on a disposable copy at the final directory and filename layout. Cover build, update, audit, report, query, compaction, and recovery. Use explicit database and report-output paths. Never test the new writer by pointing an unqualified command at production.
6. Test a normal incremental import, an older late import that changes a baseline, and a failed second import in a multi-snapshot update. Verify raw rows and metrics commit together. Repeat an unchanged update twice and compare closed file hashes.
7. Inject failures at every replacement boundary. Test stale locks, active readers, a competing writer, source changes, wrong hashes, insufficient disk, WAL files, and restart recovery. Reopen every restored file with a compatible reader.
8. Save the final candidate and code hashes, test results, estimated peak memory, peak disk use, and proposed live paths in an approval record. A restart or failed attempt remains in the record. Do not describe a resumed build as an uninterrupted clean run.

Retain the 192 MB DuckDB setting, one thread, 2 GB spill limit, and 768 MiB process-estimate gate. The prior measurement has little margin. The new permanent-path update and migration workers must be measured again. Reserve up to 16 GiB for new work and keep at least 32 GiB free throughout the operation; check the combined backup, staging, control, failed-copy, and recovery requirements. Existing retained test directories also consume space. Do not raise a limit to turn a failed test into a pass.

## Phase 2: backup after migration approval

Approval must identify the final code, candidate hash, source manifest, target path, backup path, and rollback policy. Approval of this plan alone does not replace the database. The steps below run only after approval to execute the migration.

1. Enter history maintenance mode. Prevent new history readers and writers, close open connections, and confirm no competing process holds the file. Recheck the live hash and the approved source hashes. Record newly created packages as deferred; do not silently add them to the target.
2. Require a closed database with no pending WAL or unfinished operation. If either exists, stop and preserve it. Do not delete a WAL or a lock to make the check pass. Resolve its owner and recovery state before making a standalone database backup.
3. Make a separate byte-for-byte copy of the live database in the durable backup directory. Do not use a hard link. Do not overwrite an existing backup. Flush the copy and its directory, compare size and SHA-256, and reopen the copy read-only. Check the 131-snapshot counts and latest snapshot against the recorded live state.
4. Back up `data/jobs/history/README.md`, `validation.json`, and `data/jobs/reports/jobs-history-report.md` if it exists. Record absence when a companion file does not exist. Also save the exact runtime source and dependency manifests needed for recovery, including existing uncommitted history changes. A Git commit ID alone is insufficient in this dirty checkout. Do not copy secrets or the crawler archive.
5. Store the original live hash, backup hash, candidate hash, source manifest, runtime versions, affected-code hashes, companion-file hashes, and completed checks in the migration manifest. Protect the backup from normal update commands. Test restoration from a copy of this backup in the isolated layout before proceeding.

This local backup supports migration rollback. It is not protection against loss of the computer or drive. A separate off-device backup can be arranged separately; this plan does not upload data.

## Phase 3: checked replacement

Keep the maintenance gate held for the complete operation.

1. Place the accepted, checkpointed, closed candidate in a staging file on the same filesystem as the live database. Compare its approved hash again. Validate it at the proposed final catalog/filename layout on a rehearsal copy so views cannot retain a temporary catalog binding.
2. Write and flush a `prepared` migration journal with the exact old, new, and backup hashes and the complete list of affected files. Use a temporary journal plus rename. Fail before replacement if any required backup or check is missing.
3. Replace the live database with the staged file by a same-filesystem rename. The original remains in the independent backup. Do not copy bytes over an open live database and do not use a cross-volume move as the replacement step.
4. Record `replaced`. Reopen the installed database with the production reader under the coordinator's held lease. Run its structural and source audits, count checks, lifecycle checks, and report checks. Validate source warnings separately from structural errors.
5. Create the new validation record, README, and report from the installed generation. Write each through a checked temporary file. The journal covers this multi-file step: separate file renames are not one atomic group. Do not release the gate or label the generation accepted while companion files are incomplete or inconsistent.
6. Record `accepted` only after the database and companion records agree. Release the gate. Keep the backup and journal. Do not start a fetch or change a scheduler. The next explicit history update may import deferred saved packages through the tested adapter.

If a process stops between a rename and its journal update, recovery must inspect file hashes. It must not infer the current generation from the journal state alone. An unknown hash, active owner, or unexpected WAL causes a stop for review, not a forced overwrite.

## Validation and acceptance

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Protected inputs | Source hashes and inventory unchanged; approved input cutoff explicit | Pass for this planning review |
| Exact data preservation | All raw rows, duplicate siblings, exception rows, schemas, and identities match the original-parser control | Passed in prior prototype tests; repeat on final adapter candidate |
| Duplicate policy | Latest valid `FetchedAt`, deterministic tie-break, selected row and anomaly metadata retained | Passed in prior tests; retain |
| Known source warnings | Ten excess July 15 canonical rows and all 40 unmatched `01` rows accounted for | Pass on reviewed candidate; never waive unaccounted rows |
| Structural audit | Zero unresolved duplicates, lost raw/exception rows, missing identity, collisions, hash mismatches, or integrity errors | Required for every accepted generation |
| Query/report compatibility | All 12 SQL interfaces match; report text matches a same-history control at a fixed generation time | Passed twice previously; repeat after integration |
| Import timestamps | Type/non-NULL parity across independent builds; exact preservation across copy and no-op | Passed previously; retain |
| Lifecycle | First/last fields including NULLs, presence periods, 18,535 current events, uncertainty and coverage flags | Passed previously; repeat on final candidate |
| Production commands and locking | Normal paths, both formats, unknown-format refusal, reader/writer coordination | Not implemented or verified |
| Multi-snapshot command atomicity | Failed later import leaves live file unchanged | Not verified for production adapter |
| Backup and restore | Durable checked live backup; restoration rehearsal | Not performed |
| Migration fault recovery | Every journal/rename/companion boundary and unknown-hash refusal | Prototype compaction tests passed; production migration not verified |
| Resource limits | Full final-path update and migration remain within unchanged limits | Prototype passed; final adapter not measured |
| Migration approval | Exact candidate, code, inputs, paths, and rollback record approved | Pending |

Keep raw `03` counts, resolved observations, matched good-job membership, and unmatched `01` exceptions separate in the new validation record. For the present cutoff, require 3,419 canonical keys and 3,361 job keys. July 15 must retain 929 raw rows and 919 resolved observations. Source warnings are acceptable only when every affected row is preserved. A structural failure blocks acceptance.

Use the 17 regression commands listed in [the full-memory review](job-history-full-memory-review.md), plus the new adapter and migration fault tests. Run changed-JavaScript syntax and whitespace checks. Run the existing audit/report command names only against explicit rehearsal paths until execution is approved. The existing audit scans the supplied source root and creates a lock and temporary staging files; do not treat it as a side-effect-free planning query. Do not compare the new 152-snapshot report with the old 131-snapshot report and call the expected catch-up changes a format regression.

## Rollback steps

### Failure before acceptance

1. Keep maintenance mode active and close all new-format connections. Record the error and actual hashes.
2. If the live file still has the old approved hash, leave it in place. Repair the journal state from evidence; do not replace a correct file again.
3. If the new file is installed, preserve it and any WAL as a failed-generation artifact. Verify the old backup. Stage a copy of that backup and restore it by same-filesystem rename. Preserve the original backup itself.
4. Restore the backed-up companion records and their prior absence states. Use a reader/writer compatible with the old format. Prefer the tested backward-compatible dispatcher. If code rollback is necessary, restore only the release-owned files whose hashes still match the release manifest. Never reset the whole dirty repository or overwrite later user edits.
5. Reopen read-only, check the original live hash, 131-snapshot counts, latest date, and report/validation generation. Record `rolled_back`, then release maintenance mode. A failed restore leaves maintenance mode active and all evidence intact.

### Rollback after acceptance or later imports

Do not blindly restore the 131-snapshot backup: it would remove the 21 newly accepted packages from the live view, plus any later imports.

1. Stop history writes and readers. Preserve the current database, WAL if present, accepted manifests, code version, and companion records.
2. Use the preserved CSV packages to build a separate old-format database through the latest accepted snapshot manifest. Use the bounded original-parser validation path through a tested recovery adapter. Validate every accepted snapshot, row, exception, and report before replacement.
3. Qualify this recovery build for memory and disk at its actual size. Then install the checked old-format file and compatible runtime under the same journal and maintenance protocol. Generate matching validation/report records.
4. If a complete recovery build is not possible, remain in maintenance mode and report the exact missing coverage. Any fallback that exposes only the old 131-snapshot history requires explicit approval and must label that reduced coverage. Never describe it as a complete rollback.

## Review conclusion and approval boundary

The tested data model is suitable for the next integration phase. A live replacement is not ready today. The blocking items are production format dispatch, permanent-path ownership, shared reader/writer coordination, multi-snapshot command atomicity, and a tested migration/backup coordinator.

The plan resolves three operational risks: it distinguishes the compaction backup from a live migration backup, includes code and companion records in recovery, and prevents rollback from silently discarding later accepted history. It preserves the user's dirty working tree and source archive.

Only this plan and its evidence record are added in this phase. The next deliverable should be the isolated production adapter and migration rehearsal, followed by a concrete approval record. No database replacement, backup deletion, source cleanup, or automatic retention rule is approved by this document.
