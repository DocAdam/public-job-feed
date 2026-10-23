# Daily history backup integration review

Status: implemented and tested. Enabled for the next desktop refresh.
No live refresh, production history update, production backup, or production
retention ran for this task.

## Result

The existing launcher now updates and audits history after feed validation.
It makes a compressed 1Pugh backup, restores every file in a temporary folder,
checks all hashes, audits the restored database, and checks the restored report.
The dashboard separates feed, history, and backup results. A missing drive skips
backup and retention; history can still accept new snapshots.

New daily backups use a separate owned folder. Keep the latest 14 verified
backups, the newest in each of the last three calendar months, and all versions
needed by retained daily recovery records. Only newly registered local recovery
payloads can expire, with before and after database versions proven on the drive.
The current recovery operation and at least the latest two generations remain.
Existing backups and recovery operations are not adopted by this policy.

## Validation

- All 35 configured suites passed on the final code. This includes the new
  backup tests, history tests, content/report tests, and launcher/status tests.
- The isolated backup test used a real small v2 database and verified a complete
  restore, exact report, no-op reuse, missing/wrong drive, new history without
  the drive, corrupt copies, source changes, and active-writer refusal.
- Retention tests checked legacy and current recovery preservation, resumed
  local retirement after interruption, current recovery, deterministic monthly
  retention, pinned versions, corrupted backups, and a changed current database.
- The launcher test confirmed ordering, refusal of concurrent refreshes, release
  before the terminal pause, and separate feed success when backup cannot run.
- Syntax checks passed for all 11 changed JavaScript files and the launcher.
- `git diff --check` passed.
- All 3,557 original protected file/link records passed preservation checks.
  The production database, historical CSVs, local archives, existing external
  backups, recovery copies, and migration evidence are unchanged.
- A read-only 1Pugh check confirmed the configured UUID and directory-flush support.
  No new daily backup folder or production backup state was created.

A late durability test found a missing helper export. It was fixed. The final
full-suite run includes that fix. Earlier logs remain as test records.

## Files and evidence

See `implementation-files.json` for the 16 implementation/documentation paths
and final hashes. These include four new libraries, four new scripts, the daily
backup guide, and edits to the launcher, dashboard, test configuration, launcher
tests, shared directory helper, and existing guides. Unrelated prior work remains.

See `full-suite-final.log`, `full-suite-results.json`, `syntax-and-diff.json`,
`preservation-check.json`, `drive-read-check.json`, and `validation.json`.
The full before-inventory remains in `protected-before.json`.

Operating instructions are in `docs/daily-history-backups.md` at the project root.
The next normal refresh is the first production acceptance run. Inspect its
history and backup status. A new backup needs extra time and temporary disk space;
no full-history duration is claimed from the small isolated test.
