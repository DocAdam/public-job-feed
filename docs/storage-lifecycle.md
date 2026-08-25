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

Before a retirement is applied, verify that rebuilding latest board state from the protected folders produces the same board count, source batch, status, and fetch timestamp. The retirement command should remain an explicit maintenance action; it is never part of the daily refresh.

After reviewing the plan, run the guarded executor:

```sh
npm run jobs:retire-batches -- --apply
```

It repeats the protected-subset validation before deleting anything and refuses unsafe paths or stale board state.

## Release outputs

The public latest files are canonical. The current all-ATS merged-release full JSON and CSV are compatibility links to those files rather than duplicate copies. Merge summaries and diagnostics remain in `data/jobs/merged/public-feed-release/`.

In a full slice build, the firehose slice is also a compatibility link to the canonical public feed. Other slices are materialized because they contain distinct filtered or deduplicated views. Daily builds continue to skip expensive full slices.

## Recovery

Raw batch folders are not deleted until their state is represented by both the derived board-state index and the compressed history ledger. If a derived index is missing, stale, or invalid, the merge automatically falls back to reading the existing batch fetch logs.
