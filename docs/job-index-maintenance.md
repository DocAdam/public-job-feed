# Job Index Maintenance

The job feed now maintains a persistent snapshot for every catalog board. Catalog discovery and due-board refreshes start in parallel; the public release is built only after required maintenance finishes.

## Manual public refresh

Run `launchers/Refresh Job Feed.command`. It:

1. Refreshes catalogs when the last completed catalog pipeline is older than 24 hours.
2. Refreshes current good-match boards and a bounded cross-ATS sample of other due boards.
3. Fetches newly added catalog boards by stable `ATS + slug` keys.
4. Indexes the new batches and reports snapshot freshness.
5. Builds the public release and Google Sheets package.

A source download is validated before it replaces the last-known-good file. Invalid JSON, zero rows, and an unapproved row-count decline above 20% use the previous source and appear as warnings in `data/catalogs/catalog-manifest.json`.

## Passive maintenance

Run `launchers/Install Passive Job Index Refresh.command` once to install the provided macOS `launchd` job. It performs a larger maintenance pass at 4:00 AM and 4:00 PM without publishing the Sheet. The next manual refresh consumes those recent board snapshots.

The passive job is intentionally not installed automatically by repository updates. Its definition is `launchers/com.public-job-feed.maintain-index.plist.example` and its logs are written under `data/jobs/logs/`.

## Useful commands

- `npm run catalogs:refresh-safe -- --max-age-hours 24` refreshes and validates catalog generations.
- `npm run jobs:maintain-index -- --dry-run false` runs catalog and due-board maintenance.
- `npm run jobs:refresh-due -- --dry-run true --limit-total 250` previews exact board selections.
- `npm run jobs:board-freshness` rebuilds the ATS freshness report.
- `npm run jobs:test-catalog-maintenance` runs catalog fallback and key-scheduling regression tests.

The primary diagnostics are:

- `data/catalogs/catalog-manifest.json`
- `data/catalogs/crawl/catalog-queue-diff.json`
- `data/jobs/state/board-state.json`
- `data/jobs/reports/board-freshness-report.md`
- `data/jobs/reports/job-index-maintenance-run.md`

The older offset planner remains available for recovery and historical comparisons, but the normal launcher no longer uses it.
