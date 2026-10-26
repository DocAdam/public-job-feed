# Project Status Dashboard

Internal status dashboard for the public-job-feed project. This is not public-facing documentation.

Generated: 2026-10-24T12:41:42.457Z
Package run: 20261024-0739

Package snapshot: feed validation is complete. History and backup run after this snapshot.
Read data/jobs/reports/project-status-dashboard.md for their final results.

## Refresh Run Evidence

- Run ID: 5d4d1517-8a37-4794-ad2b-4fd728768371
- Status: RUNNING
- Launcher: /Users/adampugh/GitHub/public-job-feed/launchers/Refresh Job Feed.command
- Launcher SHA-256: c8bc35baccefbaf9f1187dd52890de1d9faadb94851234137d29804f02039026
- Git revision: 96067095fd634c6f5e0d9d2f381423997a743b11
- Working tree changed: false
- Arguments: []

## History and 1Pugh Backup

No history/backup result for this refresh. Backup is not verified for this run.

## Source Report Dates

Status age limits: 24 hours for operational reports; seven days for inventory. Missing dates remain unknown.

| Source | Generated (UTC) | Age (hours) | Status |
| --- | --- | ---: | --- |
| latestSummary | 2026-10-24T12:25:58.480Z | 0.3 | CURRENT |
| sliceSummary | 2026-10-24T12:37:46.592Z | 0.1 | CURRENT |
| dedupeSummary | 2026-10-24T12:37:46.592Z | 0.1 | CURRENT |
| atsHealthSummary | 2026-10-24T12:37:49.685Z | 0.1 | CURRENT |
| crawlCoverageSummary | 2026-10-24T12:39:25.664Z | 0 | CURRENT |
| cleanupSummary | 2026-08-24T12:12:31.253Z | 1464.5 | STALE |
| boardFreshness | 2026-10-24T12:24:03.355Z | 0.3 | CURRENT |
| atsAnomaly | 2026-10-24T12:24:03.523Z | 0.3 | CURRENT |
| inventorySummary | 2026-08-24T12:12:31.054Z | 1464.5 | STALE |
| archiveSummary | 2026-06-02T16:24:36.089Z | 3452.3 | STALE |
| releaseTest | 2026-10-24T12:41:15.162Z | 0 | CURRENT |
| outputValidation | 2026-10-24T12:41:42.306Z | 0 | CURRENT |
| evidenceReview | 2026-10-24T12:40:33.978Z | 0 | CURRENT |
| packageTest | 2026-10-24T12:41:31.024Z | 0 | CURRENT |
| fullTest | 2026-10-24T12:41:42.171Z | 0 | CURRENT |
| scoringTest | 2026-10-24T12:41:31.536Z | 0 | CURRENT |
| trendTest | 2026-10-24T12:41:32.078Z | 0 | CURRENT |
| unknownCategories | 2026-10-24T12:40:33.816Z | 0 | CURRENT |

## Public Feed Status

- Total rows: 836903
- Writer focus rows: 51858
- Strong/top rows: 998
- Remote writer focus rows: 2565
- Salary detected rows: 84432
- Review needed rows: 585527

## Deduped Export Status

- Export profile: daily (release-run-summary.json)
- Deduped firehose rows: Skipped by daily profile
- Deduped writer focus rows: Skipped by daily profile
- Deduped strong/top rows: 831
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

- Change from baseline: WARN
- Absolute recent failure status: WARN
- ashby: WARN; 366/967 recent results failed (37.85%); matched-board change: OK
- bamboohr: OK; 293/1821 recent results failed (16.09%); matched-board change: OK
- greenhouse: OK; 162/1459 recent results failed (11.1%); matched-board change: OK
- icims: OK; 56/510 recent results failed (10.98%); matched-board change: ALERT
- lever: WARN; 426/1021 recent results failed (41.72%); matched-board change: OK
- workday: OK; 0/520 recent results failed (0%); matched-board change: OK
Baseline-change alerts and absolute failure rates are separate. No baseline alert does not mean low failures.
- ATS anomaly alerts: 2
- WARN: icims HTTPFailure 0% -> 10.59%
- WARN: icims ZeroJob 0% -> 12.55%

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
- Catalog completed: 2026-10-24T12:09:47.051Z
- Fetch-eligible boards: 50170
- Attempted boards: 50170
- Attempted in 7 days: 45357 (90.41%)
- Successful snapshots in 7 days: 25816 (51.46%)
- Current failed boards: 22055 (43.96%)
- Board state generated: 2026-10-24T12:22:06.450Z
- Due boards: 10707
- Never attempted: 0
- Retry-delayed failed boards: 19433
- Due failed boards: 2622
- Freshness consistency: PASS

## Unknown Title Categories

- Input jobs: 714
- Unknown jobs: 8 (1.12%)
- ADJACENT_TECH_REVIEW: 2
- POSSIBLE_CLASSIFICATION_GAP: 5
- MANUAL_REVIEW: 1

## Retained Jobs for Review

- Rows: 27; package: 20261024-0739; live URL checks: false; roles flagged for writing review: 0
- Evidence: data/jobs/reports/package-evidence-review.md
- URL check time and board fetch time are separate. Job status uses attributed user observations where available.

## Automated Tests

- Current output validation: PASS
- Full suite: PASS (package 20261024-0739)
- Package validation: WARN
- Package copy consistency: PASS
- Package warning: 16 rows have Last Checked older than 7 days.
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
- Current release: 20261024-0739
- Previous release: 20261023-0624
- Row difference: 10
- A tier difference: -1
- B tier difference: 0
- C tier difference: -11
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
