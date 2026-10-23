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
2. After the feed checks pass, use the existing history writer to import new
   dated packages. Audit the result. Keep its existing recovery and disk guards.
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
7. Record the results and then build the final status dashboard. The backed-up
   source packages reflect the completed feed checks, before this last dashboard
   sync. The CSV files do not change in that sync.

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

The policy is enabled in the desktop refresh. Saved reports for October 22,
2026 record feed `COMPLETE`, history `PASS`, and backup `PASS` for run
`07b4e7ee-68de-44eb-846e-4ba6a37350f2`, through snapshot `20261022-0622`.
The commit review did not independently restore that external backup.

The October 23 feed completed, but history failed on a source hash mismatch for
`20261022-0622/gsheet-package-manifest.json`. Backup was `NOT_RUN`. This is not
a current successful history audit. Preserve the source file, accepted history,
and failure evidence for a separate review. Do not rewrite saved hashes or
rebuild history to bypass the failure. See the
[dated checkpoint](plans/history-checkpoint-2026-10-23.md).

A full restore adds time and temporary disk use to each new backup. Use current
run reports for measured results; the small isolated tests do not establish a
full-history duration.
