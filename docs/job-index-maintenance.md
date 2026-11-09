# Keeping job listings current

The Public Job Feed keeps a recent snapshot for each catalog board. Catalog discovery and scheduled board checks can run in parallel. The release is built only after the required maintenance work finishes.

## Run the normal refresh

Run `launchers/Refresh Job Feed.command`. It:

1. Refreshes catalogs when the last completed catalog pipeline is older than 24 hours.
2. Refreshes current good-match boards and a bounded cross-ATS sample of other due boards.
3. Fetches newly added catalog boards by stable `ATS + slug` keys.
4. Indexes the new batches and reports snapshot freshness.
5. Builds the Public Job Feed release and Google Sheets package.

A source download is validated before it replaces the last-known-good file. Invalid JSON, zero rows, and an unapproved row-count decline above 20% use the previous source and appear as warnings in `data/catalogs/catalog-manifest.json`.

## Scheduled maintenance

Run `launchers/Install Passive Job Index Refresh.command` once to install the provided macOS `launchd` job. It performs a larger maintenance pass at 4:00 AM and 4:00 PM without rebuilding the reader-facing Google Sheets package. The next manual refresh uses those recent board snapshots.

The scheduled job is not installed automatically by repository updates. Its definition is `launchers/com.public-job-feed.maintain-index.plist.example` and its logs are written under `data/jobs/logs/`.

## Useful commands

- `npm run catalogs:refresh-safe -- --max-age-hours 24` refreshes and validates catalog generations.
- `npm run jobs:maintain-index -- --dry-run false` runs catalog and due-board maintenance.
- `npm run jobs:refresh-due -- --dry-run true --limit-total 250` previews exact board selections.
- `npm run jobs:board-freshness` rebuilds the ATS freshness report.
- `npm run jobs:test-catalog-maintenance` runs catalog fallback and key-scheduling regression tests.

## Where to look when something needs review

- `data/catalogs/catalog-manifest.json`
- `data/catalogs/crawl/catalog-queue-diff.json`
- `data/jobs/state/board-state.json`
- `data/jobs/reports/board-freshness-report.md`
- `data/jobs/reports/job-index-maintenance-run.md`

The older offset planner remains available for recovery and historical comparisons, but the normal launcher no longer uses it.

## Run records and status

`jobs:maintain-index` and `Run Overnight Index Catch-Up.command` use the
existing refresh record format. Each new run has its own UUID, source path
and hash, Git revision, arguments, start time, end time, terminal status,
and exit reason. A restart creates a new record. It does not replace an
earlier run record.

Read these files under `data/jobs/reports/`:

| File | Meaning |
| --- | --- |
| `index-runs/<RunId>.json` | Durable maintenance or catch-up record. |
| `index-runs/<RunId>/due.json` and `catalog-delta.json` | Scope results, batch names, and counts. A result is saved after each completed ATS group. |
| `job-index-maintenance-run.json` and `.md` | Latest maintenance result. The JSON also shows a running attempt before work starts. |
| `overnight-index-catch-up-run.json` | Latest catch-up result, with a reference to each maintenance cycle. |
| `board-maintenance-results.json` | Latest scope checkpoint. Use the run-specific path for older results. |

Latest files can change while another run waits for the lock. Use the UUID
file to follow one run. Catch-up records save `ActiveCycle` before they start
a command. This gives a recovery reference if the launcher stops before it
can save the cycle result. Older logs and reports are not converted.

`RunOrigin` records `overnight_catch_up`, `full_refresh`, or a known passive
launchd service. `INDEX_RUN_ORIGIN` can provide an explicit origin. Otherwise,
the value is `UNKNOWN`. The code does not infer a schedule from the time.
`ParentRunId` links a maintenance cycle to its catch-up or feed run when known.

### Read counts and status together

`Counts` counts fetch-log **attempt outcomes**, not unique boards or network
requests. `Successful`, `Empty`, `Failed`, `Skipped`, and `Unknown` add up to
`Total`. A skipped outcome can occur without a network request. A board checked
in two scopes or cycles contributes two outcomes. Catch-up totals add the
recorded cycle counts. They do not include attempts from earlier runs.

`QueueBefore` and `QueueAfter` count unique active, fetch-eligible boards.
`DueBoards` means that the saved retry date is due at `ObservedAt`.
`RetryDelayedFailedBoards` means that a failed board has a later retry date.
`FailedBoards` includes both due and delayed failures. These are point-in-time
counts; do not add them across cycles. `StateGeneratedAt` gives the saved
state date. Catch-up reads board state directly, so an older freshness report
does not control its stop decision.

| Status | Meaning |
| --- | --- |
| `RUNNING` | No terminal result is saved. The process can be active or can have stopped without a final record. |
| `COMPLETE` | The requested pass ended without recorded fetch failures or warnings. Due work can remain after a bounded pass. Read `ExitReason`. |
| `COMPLETE_WITH_WARNINGS` | The command ended, but some attempts failed, some outcomes were incomplete, or failures wait for retry. |
| `FAILED` | All recorded attempts failed, a required command failed, or saved state could not be read. |
| `BLOCKED` | The maintenance lock remained active through the existing wait period. |
| `STOPPED` | The run reached the no-progress or cycle limit. |
| `INTERRUPTED` | The process caught an interruption and saved a terminal record. |

`FetchHealth` is separate: `HEALTHY`, `PARTIAL_FAILURE`, `ALL_FAILED`,
`INCOMPLETE`, or `NOT_ATTEMPTED`. An empty board response is a valid outcome.
Zero attempts do not establish source health. `QueueState` is also separate:
`DUE_REMAINING`, `QUEUE_EXHAUSTED`, `RETRY_DEFERRED`, or `UNKNOWN`.
An all-failed cycle returns a nonzero code and cannot print a healthy
completion message, even if every failed board now waits for retry.

`ExitReason` identifies `pass_finished`, `queue_exhausted`, `retry_deferred`,
`all_failed`, `command_failure`, `unreadable_state`, `overlap`, `no_progress`,
`cycle_limit`, `interrupted`, or `dry_run`. Catch-up keeps its existing
100-cycle limit, three-cycle no-progress limit, per-cycle budget, and board
caps. This change does not add a schedule or a new lock.

Feed, history, backup, and publication are separate results. Index-only
records set all four to `NOT_RUN`. A parent feed refresh has its own
`refresh-run.json`. Its history and backup results must have the same run ID
in `daily-history-backup.json`. Index status never confirms a Sheet or
Substack publication.

### Recovery and remaining limits

1. Read the UUID record, its scope checkpoints, and its batch records. For
   `RUNNING`, first check whether the recorded process and its children still
   run. Do not start a second run to test status.
2. If a lock remains, check its owner before any recovery action. Keep an
   unverified lock. The existing maintenance lock can remove a lock whose
   valid PID is no longer active; unreadable or invalid owners require manual
   review. Feed, batch, and history locks retain their existing rules.
3. After the owner has stopped and lock recovery is complete, use the same
   maintenance command or catch-up launcher when the next collection is
   approved. Keep board state and earlier batches. Wait for the existing
   retry dates; do not reset state to force failed boards into the queue.

Each completed ATS group saves its batch, board state, and count checkpoint
before the next group starts. Batch names include a UUID, including when
`--run-id` is reused. A restart cannot overwrite an earlier batch with that
label. A corrupt saved board state causes a failure instead of an empty reset.

This is partial resume. Requests inside an unfinished ATS group are not saved
one at a time and can need another fetch. A stop between batch output, state,
and checkpoint writes can leave those files at different stages. Keep all
three for review; recorded counts can be incomplete. A caught `SIGTERM` waits
for current child commands to stop before the maintenance lock is released.
`SIGKILL`, a power loss, or a record write failure can leave `RUNNING` records
and locks. The code does not rewrite them as confirmed interruptions on restart.
The separate batch command's `--resume true` still skips saved terminal
outcomes, including failures. It does not force a failed board retry.

### Local verification

Run `npm run jobs:test-index-run-records`. It uses small temporary fixtures
and mocked fetch results. It checks success, empty results, mixed failures,
all-failed cycles, retry delay, interruption and restart, overlap, command
failure, unreadable state, no progress, and cycle limits. It does not run a
live collection or establish production run success.

Example record extract, derived from an all-failed fixture. This is not a
production result. Actual records also include source identity, dates, cycle
references, and queue observation dates.

```json
{
  "Kind": "CATCH_UP",
  "Status": "FAILED",
  "ExitReason": "all_failed",
  "ExitCode": 1,
  "FetchHealth": "ALL_FAILED",
  "QueueState": "RETRY_DEFERRED",
  "Counts": {
    "Unit": "attempts",
    "Total": 2,
    "Successful": 0,
    "Empty": 0,
    "Failed": 2,
    "Skipped": 0,
    "Unknown": 0
  },
  "QueueAfter": {
    "Unit": "unique_active_fetch_eligible_boards",
    "DueBoards": 0,
    "RetryDelayedFailedBoards": 2,
    "FailedBoards": 2
  },
  "Results": {
    "Feed": "NOT_RUN",
    "History": "NOT_RUN",
    "Backup": "NOT_RUN",
    "Publication": "NOT_RUN"
  }
}
```

## Board identity during state synchronization

`src/lib/board-state.js` uses an exact `ATS|slug` coverage match first.
For company-key fallback, it now keeps the board key that the existing ATS
URL reader extracts from `CareerSiteURL` or `EstimatedFetchURL`. If that key
is known and differs from the catalog board key, synchronization rejects
the coverage row. The rule applies to saved records and new records.
Exact-board success and empty coverage still update normally.

This check prevents coverage for `ashby|workos` from updating
`ashby|workos-inc` only because both have company key `workos`. When the
coverage row is rejected, the saved failure status, dates, error,
diagnostic, failure count, and retry date remain in the board record.
Normal catalog metadata updates still apply.

### Evidence and scope

Saved evidence read on 2026-11-05 included:

- `data/jobs/reports/company-coverage.json`: Ashby coverage for company key
  `workos`, URL `https://jobs.ashbyhq.com/workos`, success at
  `2026-11-05T10:00:34.079Z`.
- `data/jobs/reports/crawl-attempted.json`: separate `workos` success and
  `workos-inc` HTTP 404 failure at `2026-11-05T10:00:34.203Z`.
- `data/jobs/state/board-state.json`, generated at
  `2026-11-05T11:53:44.365Z`: `ashby|workos-inc` was failed, with its own
  diagnostic and retry date. This saved record alone does not establish
  which earlier values came from exact-board attempts.

A local fixture with an older saved failure reproduced the mismatch before
the fix. Company coverage replaced failure fields for a different slug.
The fixture passes with the identity check.

This code change does not repair existing records. It does not change board
selection limits, check intervals, retry policy, or batch resume. Workday
and iCIMS retain their existing exclusion from company-key fallback.

### Open question: coverage without usable board identity

Some legacy rows can lack a URL from which the existing reader can extract
a board key. Their current fallback behavior is unchanged. This fix does
not decide whether those rows should be accepted, rejected, or migrated.
Assess their source evidence and uses before a separate policy change.
URL-reader rules and URL-field precedence are also unchanged.

### Separate recommendation: assess potentially affected saved state

With separate approval, perform a read-only assessment of companies with
multiple board keys for the same ATS. Compare saved state and coverage
against exact-board fetch logs and retained history. Record source paths,
board keys, URLs, attempt dates, and evidence limits for each candidate.
Do not use a saved `LastSuccessAt` alone as proof of an exact-board success.
Keep legacy rows without usable identity in a separate result group.

Report confirmed mismatches, possible mismatches, and unknown cases before
proposing any repair. Missing history can prevent a reliable decision.
Any state repair, retry reset, new fetch, or collection run needs a separate
scope and approval. No such action is part of this fix.

### Fixture checks

Run `node src/scripts/test-board-state-identity.js`, or run
`npm run jobs:test-catalog-maintenance`, which includes these fixtures.
They check success and empty coverage for different slugs with the same
company key, complete failure-record retention, new-board isolation,
exact-board updates and precedence, selection limits, intervals, and
batch resume. The resume fixture uses a temporary repository copy and
blocks external fetches. Saved success, empty, failed, and skipped outcomes
remain skipped under `--resume true`.
