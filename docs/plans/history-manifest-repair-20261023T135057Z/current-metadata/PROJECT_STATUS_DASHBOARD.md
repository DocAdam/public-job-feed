# Project Status Dashboard

Internal status dashboard for the public-job-feed project. This is not public-facing documentation.

Generated: 2026-10-22T11:35:41.735Z
Package run: 20261022-0622

## Refresh Run Evidence

- Run ID: 07b4e7ee-68de-44eb-846e-4ba6a37350f2
- Status: COMPLETE
- Launcher: /Users/adampugh/GitHub/public-job-feed/launchers/Refresh Job Feed.command
- Launcher SHA-256: 45a85a94956e49a9bcde2209295ca58097352b5ea0dbc4d89b76995743215a31
- Git revision: 16e43cfbebed594d1f815e5135450e0d650a4915
- Working tree changed: true
- Arguments: []

## History and 1Pugh Backup

- History: PASS
- Backup: PASS
- Latest history snapshot: 20261022-0622
- Last verified backup: 2026-10-22T11:35:28.784Z
- Last backed-up snapshot: 20261022-0622

## Source Report Dates

Status age limits: 24 hours for operational reports; seven days for inventory. Missing dates remain unknown.

| Source | Generated (UTC) | Age (hours) | Status |
| --- | --- | ---: | --- |
| latestSummary | 2026-10-22T11:09:20.856Z | 0.4 | CURRENT |
| sliceSummary | 2026-10-22T11:21:01.210Z | 0.2 | CURRENT |
| dedupeSummary | 2026-10-22T11:21:01.210Z | 0.2 | CURRENT |
| atsHealthSummary | 2026-10-22T11:21:04.429Z | 0.2 | CURRENT |
| crawlCoverageSummary | 2026-10-22T11:22:41.003Z | 0.2 | CURRENT |
| cleanupSummary | 2026-08-24T12:12:31.253Z | 1415.4 | STALE |
| boardFreshness | 2026-10-22T11:07:30.095Z | 0.5 | CURRENT |
| atsAnomaly | 2026-10-22T11:07:30.268Z | 0.5 | CURRENT |
| inventorySummary | 2026-08-24T12:12:31.054Z | 1415.4 | STALE |
| archiveSummary | 2026-06-02T16:24:36.089Z | 3403.2 | STALE |
| releaseTest | 2026-10-22T11:24:20.896Z | 0.2 | CURRENT |
| outputValidation | 2026-10-22T11:24:49.427Z | 0.2 | CURRENT |
| evidenceReview | 2026-10-22T11:23:49.714Z | 0.2 | CURRENT |
| packageTest | 2026-10-22T11:24:37.425Z | 0.2 | CURRENT |
| fullTest | 2026-10-22T11:24:49.276Z | 0.2 | CURRENT |
| scoringTest | 2026-10-22T11:24:38.005Z | 0.2 | CURRENT |
| trendTest | 2026-10-22T11:24:38.620Z | 0.2 | CURRENT |
| unknownCategories | 2026-10-22T11:23:49.554Z | 0.2 | CURRENT |

## Public Feed Status

- Total rows: 837215
- Writer focus rows: 51715
- Strong/top rows: 1003
- Remote writer focus rows: 2534
- Salary detected rows: 84388
- Review needed rows: 591080

## Deduped Export Status

- Export profile: daily (release-run-summary.json)
- Deduped firehose rows: Skipped by daily profile
- Deduped writer focus rows: Skipped by daily profile
- Deduped strong/top rows: 836
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
- Absolute recent failure status: HIGH
- ashby: WARN; 75/281 recent results failed (26.69%); matched-board change: OK
- bamboohr: WARN; 470/2044 recent results failed (22.99%); matched-board change: OK
- greenhouse: OK; 232/2118 recent results failed (10.95%); matched-board change: OK
- icims: OK; 0/520 recent results failed (0%); matched-board change: OK
- lever: HIGH; 464/690 recent results failed (67.25%); matched-board change: OK
- workday: OK; 0/540 recent results failed (0%); matched-board change: OK
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
- Catalog completed: 2026-10-22T11:01:23.289Z
- Fetch-eligible boards: 50170
- Attempted boards: 50170
- Attempted in 7 days: 46621 (92.93%)
- Successful snapshots in 7 days: 25797 (51.42%)
- Current failed boards: 21973 (43.8%)
- Board state generated: 2026-10-22T11:05:40.486Z
- Due boards: 3777
- Never attempted: 0
- Retry-delayed failed boards: 20700
- Due failed boards: 1273
- Freshness consistency: PASS

## Unknown Title Categories

- Input jobs: 713
- Unknown jobs: 9 (1.26%)
- ADJACENT_TECH_REVIEW: 2
- POSSIBLE_CLASSIFICATION_GAP: 6
- MANUAL_REVIEW: 1

## Retained Jobs for Review

- Rows: 15; package: 20261022-0622; live URL checks: false; roles flagged for writing review: 0
- Evidence: data/jobs/reports/package-evidence-review.md
- URL check time and board fetch time are separate. Job status uses attributed user observations where available.

## Automated Tests

- Current output validation: PASS
- Full suite: PASS (package 20261022-0622)
- Package validation: WARN
- Package copy consistency: PASS
- Package warning: 5 rows have Last Checked older than 7 days.
- Package warning: 5 rows have Last Checked older than 14 days.
- Package warning: 1 continuing rows moved Posted Date forward by more than 1 day(s): ashby: 1.
- Package warning: 1 continuing rows have lower Age (Days) than the previous package: ashby: 1.
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
- Current release: 20261022-0622
- Previous release: 20261021-0636
- Row difference: 1474
- A tier difference: -24
- B tier difference: -1
- C tier difference: -2
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

Review current ATS failure causes before increasing crawl volume. See board-freshness-report.md and ats-anomaly-alert.md.

## Key Command Reminders

- `npm run jobs:maintain-index -- --dry-run false`
- `npm run jobs:board-freshness`
- `npm run jobs:public-release`
- `npm run jobs:crawl-coverage`
- `npm run jobs:test-all`
- `npm run jobs:inventory`
- `npm run jobs:cleanup`
- `npm run jobs:archive`
