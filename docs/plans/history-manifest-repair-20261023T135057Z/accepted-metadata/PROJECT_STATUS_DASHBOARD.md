# Project Status Dashboard

Internal status dashboard for the public-job-feed project. This is not public-facing documentation.

Generated: 2026-10-21T11:38:46.192Z
Package run: 20261021-0636

## Refresh Run Evidence

- Run ID: e1a21824-d113-404f-9094-f1182c28b072
- Status: COMPLETE
- Launcher: /Users/adampugh/GitHub/public-job-feed/launchers/Refresh Job Feed.command
- Launcher SHA-256: de160d2cd3cd807f34104102b6e4248feba6c12056c136ef17707aaaecd6386c
- Git revision: 16e43cfbebed594d1f815e5135450e0d650a4915
- Working tree changed: true
- Arguments: []

## Source Report Dates

Status age limits: 24 hours for operational reports; seven days for inventory. Missing dates remain unknown.

| Source | Generated (UTC) | Age (hours) | Status |
| --- | --- | ---: | --- |
| latestSummary | 2026-10-21T11:23:01.879Z | 0.3 | CURRENT |
| sliceSummary | 2026-10-21T11:35:10.259Z | 0.1 | CURRENT |
| dedupeSummary | 2026-10-21T11:35:10.259Z | 0.1 | CURRENT |
| atsHealthSummary | 2026-10-21T11:35:13.406Z | 0.1 | CURRENT |
| crawlCoverageSummary | 2026-10-21T11:36:46.531Z | 0 | CURRENT |
| cleanupSummary | 2026-08-24T12:12:31.253Z | 1391.4 | STALE |
| boardFreshness | 2026-10-21T11:21:08.771Z | 0.3 | CURRENT |
| atsAnomaly | 2026-10-21T11:21:08.939Z | 0.3 | CURRENT |
| inventorySummary | 2026-08-24T12:12:31.054Z | 1391.4 | STALE |
| archiveSummary | 2026-06-02T16:24:36.089Z | 3379.2 | STALE |
| releaseTest | 2026-10-21T11:38:18.685Z | 0 | CURRENT |
| outputValidation | 2026-10-21T11:38:45.988Z | 0 | CURRENT |
| evidenceReview | 2026-10-21T11:38:09.312Z | 0 | CURRENT |
| packageTest | 2026-10-21T11:38:34.986Z | 0 | CURRENT |
| fullTest | 2026-10-21T11:38:45.850Z | 0 | CURRENT |
| scoringTest | 2026-10-21T11:38:35.509Z | 0 | CURRENT |
| trendTest | 2026-10-21T11:38:36.076Z | 0 | CURRENT |
| unknownCategories | 2026-10-21T11:38:09.151Z | 0 | CURRENT |

## Public Feed Status

- Total rows: 835741
- Writer focus rows: 51538
- Strong/top rows: 1029
- Remote writer focus rows: 2512
- Salary detected rows: 84029
- Review needed rows: 592363

## Deduped Export Status

- Export profile: daily (release-run-summary.json)
- Deduped firehose rows: Skipped by daily profile
- Deduped writer focus rows: Skipped by daily profile
- Deduped strong/top rows: 862
- Deduped remote writer focus rows: Skipped by daily profile

## ATS Health

- ashby: SCALE_NOW (Supported public API has solid success rate and meaningful job volume.)
- greenhouse: SCALE_NOW (Supported public API has solid success rate and meaningful job volume.)
- lever: SCALE_NOW (Supported public API has solid success rate and meaningful job volume.)
- workday: KEEP_BEST_EFFORT (Fetcher can produce jobs, but this ATS remains best-effort or inconsistent.)
- bamboohr: KEEP_BEST_EFFORT (Fetcher can produce jobs, but this ATS remains best-effort or inconsistent.)
- icims: KEEP_BEST_EFFORT (Fetcher can produce jobs, but this ATS remains best-effort or inconsistent.)

These recommendations are based on historical fetch totals. Check recent health before increasing volume.
ATS included: direct-employer|ashby|greenhouse|lever|workday|bamboohr|icims
Workday now uses paginated POST search and iCIMS uses public HTML search parsing; both remain low-concurrency best-effort sources.

- Change from baseline: OK
- Absolute recent failure status: OK
- ashby: OK; 2/109 recent results failed (1.83%); matched-board change: OK
- bamboohr: OK; 1/1030 recent results failed (0.1%); matched-board change: OK
- greenhouse: OK; 0/146 recent results failed (0%); matched-board change: OK
- icims: OK; 0/20 recent results failed (0%); matched-board change: INSUFFICIENT_DATA
- lever: OK; 17/110 recent results failed (15.45%); matched-board change: OK
- workday: OK; 0/40 recent results failed (0%); matched-board change: INSUFFICIENT_DATA
Baseline-change alerts and absolute failure rates are separate. No baseline alert does not mean low failures.
- ATS anomaly alerts: 0

## Crawl Coverage

Coverage records attempts. It does not confirm successful fetches or open jobs.

- Catalog accounted for percent: 100
- Remaining supported crawl rows: 0

ATS completion statuses:
- ashby: COMPLETE (100% coverage, 0 remaining)
- bamboohr: COMPLETE (100% coverage, 0 remaining)
- greenhouse: COMPLETE (100% coverage, 0 remaining)
- icims: COMPLETE (100% coverage, 0 remaining)
- lever: COMPLETE (100% coverage, 0 remaining)
- workday: COMPLETE (100% coverage, 0 remaining)

## Snapshot Freshness

- Catalog pipeline: complete
- Catalog completed: 2026-10-21T10:53:35.226Z
- Fetch-eligible boards: 50170
- Attempted boards: 50170
- Attempted in 7 days: 46065 (91.82%)
- Successful snapshots in 7 days: 25992 (51.81%)
- Current failed boards: 21978 (43.81%)
- Board state generated: 2026-10-21T11:19:17.908Z
- Due boards: 6303
- Never attempted: 0
- Retry-delayed failed boards: 19995
- Due failed boards: 1983
- Freshness consistency: PASS

## Unknown Title Categories

- Input jobs: 719
- Unknown jobs: 9 (1.25%)
- ADJACENT_TECH_REVIEW: 2
- POSSIBLE_CLASSIFICATION_GAP: 6
- MANUAL_REVIEW: 1

## Retained Jobs for Review

- Rows: 64; package: 20261021-0636; live URL checks: false; roles flagged for writing review: 0
- Evidence: data/jobs/reports/package-evidence-review.md
- URL check time and board fetch time are separate. Job status uses attributed user observations where available.

## Automated Tests

- Current output validation: PASS
- Full suite: PASS (package 20261021-0636)
- Package validation: WARN
- Package copy consistency: PASS
- Package warning: 5 rows have Last Checked older than 7 days.
- Package warning: 5 rows have Last Checked older than 14 days.
- Release Test Status: PASS
- Release Test Failures: 0
- Release Test Warnings: 0
- Scoring Test Status: PASS
- Scoring Test Failures: 0
- Trend Test Status: PASS
- Trend Test Warnings: 0
- Trend Test Failures: 0
- Release Comparison Status: PASS
- Comparison mode: Small run summaries
- Current release: 20261021-0636
- Previous release: 20261020-0629
- Row difference: 130
- A tier difference: -3
- B tier difference: -1
- C tier difference: -3
- Coverage difference: 0

## Legacy Offset Plan (Recovery Only)

The normal refresh command uses the persistent key-based scheduler; this older plan is retained only for recovery and historical comparison.

- Ready command count: 0
- Stale completed ready commands: 0

- Legacy skipped rows: 7

## Storage / Inventory

- inventorySummary: 2026-08-24T12:12:31.054Z (STALE). These figures describe that saved report.
- Total files: 27275
- Total size bytes: 139797803316
- Release count: 0
- Batch count: 1144
- Merged count: 5
- Large file count: 1274

## Cleanup / Archive

- cleanupSummary: 2026-08-24T12:12:31.253Z (STALE). These figures describe that saved report.
- archiveSummary: 2026-06-02T16:24:36.089Z (STALE). These figures describe that saved report.
- Cleanup delete candidates: 0
- Archive candidate count: 0
- Archive candidate size bytes: 36933220
- Archive files created: 1
- Deleted folders count: 0

## Suggested Next Action

Run npm run jobs:maintain-index -- --dry-run false to refresh due boards by stable ATS + slug keys.

## Key Command Reminders

- `npm run jobs:maintain-index -- --dry-run false`
- `npm run jobs:board-freshness`
- `npm run jobs:public-release`
- `npm run jobs:crawl-coverage`
- `npm run jobs:test-all`
- `npm run jobs:inventory`
- `npm run jobs:cleanup`
- `npm run jobs:archive`
