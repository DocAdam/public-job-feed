# Monthly fetch-history writer review

Reviewed: 20 October 2026. Status: implemented and passed isolated tests. No production indexing, database update, or batch retirement was run by this task. No batch deletion is approved by this review.

## Result

The monthly writer now merges saved and incoming events by `EventId`. Rebuilding an index after old raw batches are retired no longer removes their saved events. Repeated identical records are kept once. Conflicting records with the same ID stop the write for review.

The current board-state calculation is unchanged. It uses the supplied raw batch logs, not the historical ledger. A failed fetch does not replace a prior successful or empty fetch. Historical records cannot cause a retired source batch to reappear as current state.

Changed source files:

- `src/lib/batch-history.js`: preserves the existing event projection and board selection; delegates durable monthly writes; exports explicit recovery.
- `src/lib/batch-history-ledger.js`: reads and validates saved months, merges events, streams staged gzip output, flushes writes, publishes complete files by rename, and publishes board state last. Adds an exclusive writer lock and explicit dead-owner recovery.
- `src/scripts/test-batch-history.js`: runs the new recovery suite through the existing test command.
- `src/scripts/test-batch-history-recovery.js`: 18 test groups, including real child-process interruption and an isolated copy of the actual index entry point.
- `docs/storage-lifecycle.md`: documents merge behavior, failure handling, recovery, and the remaining retirement checks.

No dependency or package command was added. Existing unrelated work was preserved.

## Tests and review

All six commands passed:

```text
npm run jobs:test-batch-history
npm run jobs:test-catalog-maintenance
node src/scripts/test-failure-investigation.js
npm run jobs:test-board-freshness
npm run jobs:test-history
npm run jobs:test-history-content
```

The expanded batch-history command includes the original tests and 18 recovery groups. The groups cover removed fixture batches, late arrivals, diagnostic text, repeated rebuilds, empty input, conflicting IDs, damaged gzip, invalid JSON and UTF-8, wrong-month records, duplicate saved IDs, record-size limits, file-write failure, active locks, unknown lock data, unknown staging paths, and unsafe links.

Five tests stop a real child process with SIGKILL: before the first temporary write, after a partial gzip write, after a completed staged file, between monthly file replacements, and before board-state replacement. Each test checks that old events remain, current state stays unchanged until publication, an active owner cannot be recovered, dead-owner recovery removes only owned staging, and retry completes without duplicate events.

The integration test runs the real `index-batches.js` entry point inside a temporary project. It physically removes only synthetic fixture batch folders, rebuilds twice, then adds a new fixture batch and rebuilds twice again. Old events remain, current board selection stays correct, and the new event is added once.

Code review confirmed that all changed months are staged before publication, corrupt or conflicting saved data stops publication, unchanged monthly files keep their bytes and modification time, and a stopped writer cannot be mistaken for a completed write. An initial crash-test attempt exposed a test-child lifecycle issue; the test now keeps the child alive until the parent kills it. The final suite passed all 18 groups.

## Saved-data rehearsal

The rehearsal copied the five saved monthly ledgers to a new temporary folder and read production fetch logs. All writes occurred inside the temporary folder. The folder was removed after the rehearsal.

- Indexed batch entries: 1,898.
- Current/recent usable batches supplied to the test: 1,132.
- Old batch inputs omitted only in the test: 762.
- Supplied fetch-log rows: 405,131.
- Saved events preserved: **590,622** across five monthly files.
- Current board records preserved: **29,551**, including source batch, status, fetch time, and job count.
- Two consecutive subset rebuilds: zero added events and zero changed monthly files. Every monthly file retained its exact hash.
- One clearly marked synthetic event: added once; a second run added zero events. This record existed only in the temporary copy.
- Measured peak process memory: 936.75 MiB with a 768 MiB JavaScript heap limit. This is a measurement, not a fixed process-memory guarantee. The writer still holds incoming events and one decoded saved month in memory; it streams compressed output. The separate index script still reads batch payloads as before.

The fresh rehearsal used 762 omitted inputs, rather than the earlier plan's 758. The saved index and the 30-day cutoff had advanced. These counts are test inputs, not a new approved deletion list.

## Protected data and concurrent refresh

The broad preservation check did not pass unchanged for the whole output tree. A refresh process was already running when this task began. Its recorded start was 06:08:28 CDT, before the protection baseline. Its status log records the public-feed rebuild, package export, link checks, and latest-file sync. This task did not start, stop, or undo that process.

The follow-up check compared all 40,387 baseline files and links:

- **40,371** retained their content hashes and metadata.
- All **37,163 collection-batch files** were unchanged.
- All **2,889 files in the original dated packages** were unchanged.
- All **295 database, recovery, and migration-evidence files** were unchanged.
- All other original protected files, including the monthly ledgers and index files, were unchanged.
- **16 `latest` export files or links** changed during the independent refresh. The full-firehose link itself still points to the same path; its target content changed.
- **20 new files** appeared in package `20261020-0629`. No baseline file was lost.

The existing 152-snapshot warehouse was kept unchanged. The refresh's new package was not imported by this task. A production history audit may therefore report a pending snapshot until a separately authorized update imports it. No production history audit or update was run in this phase.

Evidence for the concurrent activity is saved in `concurrent-refresh.json`. `preservation-review.json` lists each change. Do not describe the whole output tree as unchanged or restore the old `latest` files over the refresh output.

## Remaining limits before batch cleanup

The event-loss defect is fixed and tested. This does not make the current retirement executor ready for an unattended deletion run.

1. Prepare a fresh retention list after active refresh and index work completes. Recheck age, exact paths, source references, ledger coverage, and recovery requirements against that same state.
2. Review and test the retirement executor's guards. It currently checks the current board subset, but it does not enforce a ledger-coverage check or bind the plan to exact input hashes. The monthly writer lock does not cover the earlier batch-index writes or the retirement executor. Use a shared maintenance boundary before enabling deletion.
3. Test refusal of a changed plan/index, a protected source, invalid paths, and concurrent indexing. These retirement-executor tests were not part of this writer change.
4. Decide whether full raw payloads need an external verified archive. The event ledger preserves fetch history, not every historical job description.
5. Obtain separate approval for the exact batch list before removal.

Atomic replacement applies to each file, not to the entire index as one transaction. A stopped publish can leave some months with new events and other months with their old events. All prior events remain. Keep input batches until a complete successful retry. Recovery removes only known staging files from a dead owner; it does not repair a damaged canonical ledger or recover a file deleted outside the writer. Restore a checked backup in those cases. Unknown locks and interrupted recovery guards require manual review. Non-cooperating external writes remain outside the writer lock.

## Evidence files

- `checks.json` and the six test logs: exact commands, exit codes, and durations.
- `rehearsal.json` and `rehearsal.cjs`: saved-data test results and the isolated test driver.
- `protected-before.jsonl.gz`, `preservation-review.json`, and `concurrent-refresh.json`: preservation baseline and observed concurrent changes.
- `validation.json`: final source hashes, syntax checks, whitespace check, and review status.

Only the code, tests, documentation, and review evidence changed through this task. No production database, recovery copy, original historical package, or collection batch was modified by this task. No production batch was deleted. No commit, push, publication, or dependency installation ran.
