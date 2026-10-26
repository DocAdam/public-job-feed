# Daily history and 1Pugh backup

The desktop **Refresh Job Feed** launcher now updates history and checks a backup
on 1Pugh after feed validation passes. The final dashboard shows the feed,
history, and backup results separately. No new schedule is required.

The command is `npm run jobs:history-daily`. It uses the normal project paths.
It does not collect jobs, change historical CSV files, or publish data.
Do not run a manual history writer or change packages while a refresh is active.

## Sequence and checks

1. Take a lock for the complete refresh. A second launcher stops and must be
   retried after the first finishes. An interrupted owner needs manual review; locks do not expire
   by age. The lock releases before the completed terminal waits for a key.
2. After the feed checks pass, finalize the current package dashboard and both
   manifest formats. Check its package ID and reported paths. Then import new
   dated packages and audit history. The daily history command refuses a pending
   package with a dashboard from another run or an incorrect dashboard size.
   Keep the existing recovery, source-hash, and disk guards.
3. Identify 1Pugh by its mount path, external device, writable state, and volume
   UUID `A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1`.
4. Hold the history lease while making a new compressed backup. Include the
   closed database, every file in each dated source package, the accepted journal,
   history companions and report, source code, launchers, and dependency lock file.
5. Restore every file into a temporary local folder. Check every file's size and
   SHA-256 hash. Audit the restored database with the saved source code. Rebuild
   the history report and require an exact match. Check that the database hash
   did not change. Recheck all source hashes and the drive before acceptance.
6. Save `VERIFIED.json` only after those checks pass. Rename the new folder from
   `.pending-...` to `daily-...`. An earlier verified backup is never overwritten.
7. Record the results and build the final status dashboard in `data/jobs/reports/`
   only. Do not sync either package copy after import. The package dashboard is
   explicitly marked as a snapshot before history and backup. Its bytes and both
   manifests remain unchanged after that point.

Before a manual history update for a new package, use
`npm run jobs:status -- --sync-package` after feed validation. This command
preserves the complete manifest CSV schema. It and the package builder refuse
to change a package that history already contains. The history lease covers the
package writes, so an active history writer or reader also stops them.

The new backup root is:

```text
/Volumes/1Pugh/Public Job Feed Archives/daily-history-v1
```

The first run creates an ownership marker in this new folder. Existing backup
folders, local archives, raw batches, historical CSVs, and existing recovery
operations are outside this policy. The workflow does not adopt them.

An unchanged source, database, and runtime inventory reuses a backup only after
fresh checksum checks. This result is `UNCHANGED`. Its last full restore-test
date remains visible. A changed inventory creates a complete new backup.

## Missing drive and failures

A missing drive gives `History: PASS; Backup: SKIPPED` if the history checks pass.
No substitute folder is created under `/Volumes`. The last verified backup date
and snapshot remain visible. A later connected run backs up all accepted history,
including updates made while the drive was absent.

A wrong drive, insufficient space, copy failure, changed source, or failed
restore test gives a backup failure. The previous verified backup stays intact.
The incomplete external folder stays for review. The owned temporary restore
folder is removed after the check. A failed history update or audit prevents a
new backup. A successful feed result remains separate from these results.

Read `data/jobs/reports/daily-history-backup.md` or the final dashboard. The JSON
report has the same results. A dashboard only uses backup status from its own
refresh run; old success must not appear as success for a new run.

## Retention for new daily backups

This policy applies only to verified backups made by the new workflow:

- Keep the latest 14 verified backups.
- Also keep the newest verified backup in each of the last three calendar months,
  using UTC. These may overlap the latest 14.
- Keep any backup needed by a retained daily recovery operation or the current
  accepted journal. Keep future-dated folders too.
- Keep unknown, incomplete, and interrupted-removal folders for manual review.
- Before any removal, recheck all managed backup checksums, the drive identity,
  the history lease, and the current database hash. A failed check stops removal.

For new local recovery operations, keep the current operation and at least the
latest two registered generations. Remove only an older `before.duckdb` payload
when both its before and after database hashes have verified external backups.
Keep its small manifests, runtime files, and test records. Save a receipt before
removal so an interrupted removal can resume. A pre-existing operation is never
registered for this policy.

Proven obsolete payloads can be removed before the next history update, as well
as after a successful backup. Without 1Pugh, no retention runs. If retained local
copies reach the writer's 16 GiB operation limit or 32 GiB free-space guard,
history stops safely until the drive returns or an operator reviews the data.

A missing external backup prevents retirement of the local copy that needs it.
Thus the policy can keep more than 14 backups or two local generations. It is a
minimum recovery set, not a fixed disk-space cap. Complete daily copies also
repeat source data; this first version does not deduplicate backup contents.

## Restore

From this project, use a new destination outside the backup folder:

```sh
node src/scripts/restore-history-backup.js \
  '/Volumes/1Pugh/Public Job Feed Archives/daily-history-v1/daily-REPLACE-WITH-REAL-NAME' \
  '/absolute/path/to/new-restore-folder'
```

This command verifies the stored checksums, restores every file, audits history,
and checks the saved report. It refuses an existing destination. It does not
replace production. Inspect the restored result before any manual migration.

The restore uses this project's installed dependencies. Their versions are in
its saved `runtime/package-lock.json`. On a replacement machine, recover the
saved runtime and install those locked versions before running the audit. The
backup manifest maps each logical file path to a numbered gzip payload and
records both stored and restored hashes. The format uses standard JSON and gzip.

## Tests and limits

Run `npm run jobs:test-history-backup`. The tests use temporary folders, a small
real history database, and a simulated drive. They cover a missing/wrong drive,
new history while disconnected, full restore and report checks, repeated runs,
failed copies, corruption, changed sources, active writers, retention, and
recovery after local expiry. Launcher tests check ordering and lock release.
Run `npm run jobs:test-history-finalization` to check package finalization,
complete manifest columns, refusal of writes after import, and a second daily
import and backup. These tests use temporary data and a simulated drive.

The policy is enabled in the desktop refresh. Saved reports for October 22,
2026 record feed `COMPLETE`, history `PASS`, and backup `PASS` for run
`07b4e7ee-68de-44eb-846e-4ba6a37350f2`, through snapshot `20261022-0622`.
The commit review did not independently restore that external backup.

The October 23 feed completed, but history initially failed on a source hash
mismatch for `20261022-0622/gsheet-package-manifest.json`. Backup was `NOT_RUN`. The
[dated checkpoint](plans/history-checkpoint-2026-10-23.md) preserves that result.
The approved repair imported the pending `20261023-0624` snapshot. The new history
audit and the full 1Pugh backup restore test passed. History now has 156 snapshots.
See the [repair record](plans/history-manifest-repair-20261023T135057Z/README.md)
for evidence and limits. Recorded source hashes were not rewritten. The repair
did not rebuild the database or remove existing backup and recovery copies.

A full restore adds time and temporary disk use to each new backup. Use current
run reports for measured results; the small isolated tests do not establish a
full-history duration.

## Backup-only verification and metadata checks

Use `npm run jobs:history-backup` to audit and back up the current accepted
history generation. This command takes the normal refresh lock and history
lease. It does not import packages, collect jobs, build exports, or run
retention. It uses the same backup creator, complete temporary restore,
restored database audit, exact report comparison, and final bundle check as
the daily workflow. It writes `history-backup-only.json` and
`history-backup-only.md` in `data/jobs/reports/`. A failure gives a nonzero exit
code and retains the prior accepted-backup record.

The October 24 attempt failed the final inventory check because its pending
bundle contained 3,304 extra AppleDouble files. The original failed result and
candidate remain evidence. The exact process that created these files is not
verified. Small file-creation tests on the same drive did not reproduce them.
No claim is made that COPYFILE_DISABLE prevents this failure.

New manifests select `metadataPolicy: appledouble-provenance-v1`. This rule
permits only the observed 4,096-byte encoding with one 11-byte
`com.apple.provenance` value. All other bytes must match the fixed profile in
`src/lib/history-backup-metadata.js`. This includes the attribute table, zero
Finder data, padding, and the observed blank resource-fork representation.
The sidecar must name a required file or the payload directory in its own
directory. A name that starts with `._` is insufficient. Other encodings,
attributes, resource-fork content, unknown files, unsafe paths, and symbolic
links fail verification.

Verification records the permitted metadata files and their hashes. It does
not delete them, remove extended attributes, restore them as payload, or use
them to replace required files. Every required payload size and checksum,
restore audit, and report comparison remains mandatory. A failed candidate
stays pending. The accepted-backup record changes only after verification
and promotion pass.

Manifests without this policy retain their original exact-file checks. An
unknown policy fails. The payload format and restore process are unchanged.
Use the updated verifier for a new bundle that contains permitted metadata;
the bundle includes this verifier in its saved runtime. The earlier failed
candidate is not changed to select the new policy.

The backup tests cover the exact observed bytes, every fixed profile byte,
normal and older bundles, missing or changed payloads, unrelated files,
misleading metadata names, unsafe paths, symlinks, incomplete proofs,
interrupted creation, final rejection, and state updates after acceptance.

## October 25 verification result

The new metadata rule passed the complete 38-command isolated suite and the
focused backup tests. A real backup-only operation then passed every restore
and acceptance check for generation 66646ce5-b440-47c2-a8a8-75c003da4c28,
package 20261024-0954. The accepted bundle had zero metadata sidecars. The
exact observed sidecar case was verified in isolation.

The one subsequent refresh accepted generation
2b1dae2f-4112-493d-8252-e1a14d0832d1, package 20261025-0724. Its backup failed
the normal local space guard before candidate creation. At measurement, the
3,329-member inventory needed 4.29 GiB for restore plus the unchanged 32 GiB
reserve. Free space was 34.25 GiB; required space was 36.29 GiB. The shortfall
was about 2.05 GiB. The prior recovery backup does not cover this generation.

Do not repeat the full refresh. Restore local headroom, check the exact current
inventory and space again, then use `npm run jobs:history-backup` for a new
backup-only attempt. Do not weaken the reserve, use an alternate restore
location to avoid it, or label the prior backup as current. At that checkpoint, a proposed move
of one older test snapshot remained unapproved. The approved follow-up below
records its later execution. See the
[release report](features/employment-type-release-verification-20261025.md).

## Approved relocation follow-up

The user approved only the exact prior-test-snapshot relocation in the saved
proposal. The copied 4,017,995,774-byte file passed a complete SHA-256 check
before its local path was replaced with a symbolic link. The external copy,
exact original timestamps, both paths, verified hash and rollback instructions
are preserved. The external filesystem stores the copied dates at lower
precision; the exact values remain in the receipt. No other existing file was
moved or deleted.

Actual local restore space then passed: 37.95 GiB free against 36.29 GiB
required, including the unchanged 32 GiB reserve. One backup-only attempt
passed complete restore of all 3,329 payloads, the restored audit, exact report
comparison and final bundle acceptance. It covers generation
2b1dae2f-4112-493d-8252-e1a14d0832d1 and package 20261025-0724. No packages
were imported. The old failed daily result remains unchanged; this success is
a new linked result.

See the [current release report](features/employment-type-release-verification-20261025.md)
for the accepted folder, run ID, proof and relocation receipt. Do not remove the
external snapshot copy. The symbolic link needs that drive to be connected.
The feed refresh and live Sheet were not changed by this follow-up.
