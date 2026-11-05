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
