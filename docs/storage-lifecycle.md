# Storage lifecycle

This guide explains which generated job-data files are current inputs, which are compact historical records, and when older artifacts can be retired.

## Current data

Keep these files available:

- `data/jobs/public/public-job-feed-latest.json` and `.csv`: the canonical current feed. Job Finder reads the JSON; the Google Sheets package reads the CSV.
- `data/jobs/index/board-latest-fetch.json`: the latest successful or empty fetch for every board. Merges use it when it matches the current batch index.
- Batch folders named by `SourceBatch` in that board-state file: these hold the current raw payload for a board.
- `data/jobs/index/history/fetch-events/YYYY-MM.jsonl.gz`: compact, immutable board-check history for freshness, reliability, and coverage analysis.

## Retention policy

- Keep raw batch folders for 30 days.
- Keep any older raw folder still named by the current board-state index.
- Keep compact monthly fetch-event history for 24 months online. Keep monthly aggregate reports indefinitely.
- Retain full historical job descriptions only when an explicit research or audit need requires a snapshot. Long-term comparisons should use listing identity, public fields, and change hashes rather than repeated description text.
- Keep one active streaming-validation run and matching baseline for 14 days. Preserve its completed manifest in `.audit/`, then remove the temporary outputs.

## Batch output format

Batch JSON is the machine-readable source used by the index and merge steps. New batches do not create the large `public-job-feed-batch.csv` by default. Create it only for a manual investigation:

```sh
npm run jobs:fetch-batch -- --include-batch-csv true
```

The maintenance and known-good refresh commands accept the same flag.

## Planning raw-batch retirement

After a normal index run, create a dry-run plan:

```sh
npm run jobs:plan-batch-retention
```

The plan protects current source batches and recent folders. It marks only superseded folders as `RETIRE_CANDIDATE` and writes:

- `data/jobs/reports/batch-retention-plan.md`
- `data/jobs/reports/batch-retention-plan.csv`
- `data/jobs/reports/batch-retention-plan.json`
- `data/jobs/reports/batch-retention-plan.manifest.json`

The JSON row list keeps its existing format. The new manifest binds that list to
source hashes, the 30-day policy, and the validation results. The planner checks
every indexed batch against the folder inventory. It compares full board state
and state rebuilt from the retained folders. It also checks every usable raw
fetch event against the saved monthly history, including diagnostic fields.
Unfinished collection markers cause a folder to be kept for review.

To save a review outside the production reports folder:

```sh
npm run jobs:plan-batch-retention -- --output-dir /absolute/path/to/review
npm run jobs:retire-batches -- --plan-dir /absolute/path/to/review --output-dir /absolute/path/to/review
```

The second command is a dry run. It repeats the source and history checks. Both
commands read the saved batch data; they do not collect jobs or rebuild the
production index. File sizes in the plan are logical bytes. They are an estimate
of recoverable space, not a promise of free disk space after removal.

A plan expires after 24 hours. A changed input, changed decision, missing
manifest, mismatched inventory, unsafe path, symbolic link, damaged ledger,
missing fetch event, or changed board state stops cleanup. Old row-only plans
must be replaced. A new batch requires a normal approved index run and a new
plan; the planner does not update an index to make its own checks pass.

Removal still needs approval for the exact candidate list and a decision about
raw-payload archives. The ledger keeps fetch events, not all job descriptions.
Only after that review, add `--apply` to the same retirement command. Raw-batch cleanup is
never part of the daily refresh. The approved October 20, 2026 operation later
removed 762 archived batch folders. Its
[final receipt](plans/batch-cleanup-20261020T192135Z/README.md) records the exact
scope and preservation checks. That old list is not a current removal plan.

### Shared batch maintenance lock

Collection through `fetch-batch-jobs.js`, the full `index-batches.js` operation,
retention planning, and retirement use `data/jobs/batches/.batch-maintenance.lock`.
The index acquires it before reading any batch or writing any output. Retirement
holds it from validation through the last removal. Collection holds it before
writing its first run marker until its final marker is saved. Custom collection
roots use their own lock in that root; batch names must be single folder names.

A competing command fails before it enters its operation. It does not queue or
retry. Separate collection processes for the same root are thus serialized;
board requests within one collection still use the configured concurrency.
The lock does not stop manual file changes or programs that bypass these entry
points. Stop those writers before cleanup. The planner also checks file metadata
before and after validation to detect changes during its read.

A caught error releases the command's own lock. A process killed during work
leaves a lock. Do not remove it by age alone or with a wildcard. Review its
recorded host, PID, operation, and start time; confirm that its owner has stopped.
Unknown ownership needs manual review. After an interrupted index, keep all raw
batches, recover any monthly writer staging as described below, and arrange a
complete index retry before making a new retention plan. Removing a lock alone
does not prove that indexing finished. The outer lock must be reviewed as well
as the monthly writer lock. There is no automatic outer-lock recovery command.

Removal is not one atomic transaction across all folders. An interrupted removal
can leave only part of the list removed. The next check refuses an inventory
that no longer matches its index. Keep the plan and any external archive for
manual recovery; do not retry an old deletion list without review.

## Release outputs

The public latest files are canonical. The current all-ATS merged-release full JSON and CSV are compatibility links to those files rather than duplicate copies. Merge summaries and diagnostics remain in `data/jobs/merged/public-feed-release/`.

In a full slice build, the firehose slice is also a compatibility link to the canonical public feed. Other slices are materialized because they contain distinct filtered or deduplicated views. Daily builds continue to skip expensive full slices.

## Recovery

Raw batch folders are not deleted until their state is represented by both the derived board-state index and the compressed history ledger. If a derived index is missing, stale, or invalid, the merge automatically falls back to reading the existing batch fetch logs.

### Monthly history writes

The monthly writer merges saved events with incoming events by `EventId`. It keeps
events whose raw batch folders are no longer present. Identical events are stored
once. A conflicting event with the same ID stops the write; it does not replace
the saved event. The writer checks saved months even when no incoming row belongs
to that month. A damaged gzip file, invalid record, duplicate saved ID, or record
larger than 4 MiB stops the write.

The writer stages all changed months before it publishes any file. Each staged
file is flushed, then replaces its target with an atomic rename. The containing
directory is flushed after the rename. It publishes `board-latest-fetch.json`
last. Current board state still comes only from the supplied raw batch logs;
historical events do not restore an old board result to current state.

An interrupted publish can leave some months with new events and other months
with their prior events. Every published month contains its saved events. Keep
the raw inputs until the whole index run succeeds. A retry adds the missing
events without adding duplicates. An unchanged monthly file is not rewritten.
The returned `eventCount` counts all retained events, including months with no
current input. `addedEventCount` and `changedMonths` describe that write.

### Interrupted writer recovery

The writer holds `.fetch-history.lock` in the index output folder. A second
writer stops while that lock exists. A process stop can leave the lock and
temporary files in place.

The exported `recoverFetchHistory(outputDir)` function in
`src/lib/batch-history.js` is an explicit recovery operation. After confirming
that the recorded owner on this computer is no longer running, it removes only
that owner's temporary files and lock. It does not promote temporary files,
delete monthly ledgers, or change board state. Retry indexing from the retained
raw inputs after recovery.

Recovery refuses an active owner, unknown lock data, unexpected staging paths,
or unsafe links. An interrupted recovery can leave
`.fetch-history-recovery.lock`; this requires manual review. Do not remove lock
files or staging files with a wildcard.

These checks protect the monthly writer. The shared batch lock described above
now also covers the full index and retirement operations. Neither lock grants
approval to remove batches. The direct low-level history helpers retain their
own writer lock; they are not a substitute for the guarded batch entry points.

Run `npm run jobs:test-batch-history` for the existing checks and the isolated
recovery and retention suites. The suites also run the real index entry point
in temporary projects, test competing processes, and remove synthetic batches
only. They do not index or retire production batches.

## History database and recovery evidence

Normal history commands select the writer from the existing database format.
An ordinary build or update does not approve a storage-format migration.
Migration, replacement, and recovery need an exact reviewed scope, checked
source and code hashes, and the applicable approval record. The
[writer integration review](plans/job-history-integration-review.md) records the
command effects. The [accepted migration review](plans/job-history-production-migration-review.md)
records the later October 19 execution.

Keep database operation folders, journals, approved records, runtime copies,
source manifests, and retained controls with their recovery bindings. A backup
from before an accepted migration can contain fewer snapshots than the current
database. Do not copy an old database over a newer accepted history. Review a
recovery candidate that covers every accepted snapshot. A former test path or
approval template is not a current recovery command.

Use [Daily history and 1Pugh backup](daily-history-backups.md) for the current
managed daily-backup and restore procedure. That policy does not adopt legacy
backups, archives, or migration controls. This document cleanup does not approve
any data, backup, or Git-object removal.

The [review-record index](plans/README.md) groups completed operations, earlier
failures, remaining limits, and final receipts. It also maps the three redundant
log copies removed by P01 to equal retained logs. Original manifests and dated
results remain unchanged. Use current operating guides for a new operation;
do not rerun historical execution helpers or old removal lists.
