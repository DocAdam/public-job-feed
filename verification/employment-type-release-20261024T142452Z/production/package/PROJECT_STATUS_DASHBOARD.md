# Project Status Dashboard

Internal status dashboard for the public-job-feed project. This is not public-facing documentation.

Generated: 2026-10-24T14:57:13.723Z
Package run: 20261024-0954

Package snapshot: feed validation is complete. History and backup run after this snapshot.
Read data/jobs/reports/project-status-dashboard.md for their final results.

## Refresh Run Evidence

- Run ID: 455b725d-9dc4-48c2-bb7a-8e0b24bea81c
- Status: RUNNING
- Launcher: /Users/adampugh/GitHub/public-job-feed/launchers/Refresh Job Feed.command
- Launcher SHA-256: c8bc35baccefbaf9f1187dd52890de1d9faadb94851234137d29804f02039026
- Git revision: 96067095fd634c6f5e0d9d2f381423997a743b11
- Working tree changed: true
- Arguments: []

## History and 1Pugh Backup

No history/backup result for this refresh. Backup is not verified for this run.

## Source Report Dates

Status age limits: 24 hours for operational reports; seven days for inventory. Missing dates remain unknown.

| Source | Generated (UTC) | Age (hours) | Status |
| --- | --- | ---: | --- |
| latestSummary | 2026-10-24T14:40:16.295Z | 0.3 | CURRENT |
| sliceSummary | 2026-10-24T14:53:05.573Z | 0.1 | CURRENT |
| dedupeSummary | 2026-10-24T14:53:05.573Z | 0.1 | CURRENT |
| atsHealthSummary | 2026-10-24T14:53:08.878Z | 0.1 | CURRENT |
| crawlCoverageSummary | 2026-10-24T14:54:44.274Z | 0 | CURRENT |
| cleanupSummary | 2026-08-24T12:12:31.253Z | 1466.7 | STALE |
| boardFreshness | 2026-10-24T14:38:12.436Z | 0.3 | CURRENT |
| atsAnomaly | 2026-10-24T14:38:12.621Z | 0.3 | CURRENT |
| inventorySummary | 2026-08-24T12:12:31.054Z | 1466.7 | STALE |
| archiveSummary | 2026-06-02T16:24:36.089Z | 3454.5 | STALE |
| releaseTest | 2026-10-24T14:56:44.845Z | 0 | CURRENT |
| outputValidation | 2026-10-24T14:57:13.569Z | 0 | CURRENT |
| evidenceReview | 2026-10-24T14:55:56.104Z | 0 | CURRENT |
| packageTest | 2026-10-24T14:57:01.613Z | 0 | CURRENT |
| fullTest | 2026-10-24T14:57:13.427Z | 0 | CURRENT |
| scoringTest | 2026-10-24T14:57:02.140Z | 0 | CURRENT |
| trendTest | 2026-10-24T14:57:02.722Z | 0 | CURRENT |
| unknownCategories | 2026-10-24T14:55:55.937Z | 0 | CURRENT |

## Public Feed Status

- Total rows: 836867
- Writer focus rows: 51870
- Strong/top rows: 998
- Remote writer focus rows: 2565
- Salary detected rows: 84431
- Review needed rows: 585531

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
- ashby: WARN; 366/1001 recent results failed (36.56%); matched-board change: OK
- bamboohr: OK; 293/1844 recent results failed (15.89%); matched-board change: OK
- greenhouse: OK; 162/1474 recent results failed (10.99%); matched-board change: OK
- icims: OK; 56/520 recent results failed (10.77%); matched-board change: ALERT
- lever: WARN; 426/1054 recent results failed (40.42%); matched-board change: OK
- workday: OK; 0/540 recent results failed (0%); matched-board change: OK
Baseline-change alerts and absolute failure rates are separate. No baseline alert does not mean low failures.
- ATS anomaly alerts: 2
- WARN: icims HTTPFailure 0% -> 10.38%
- WARN: icims ZeroJob 0% -> 12.31%

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
- Attempted in 7 days: 40028 (79.78%)
- Successful snapshots in 7 days: 22715 (45.28%)
- Current failed boards: 22055 (43.96%)
- Board state generated: 2026-10-24T14:36:06.833Z
- Due boards: 12787
- Never attempted: 0
- Retry-delayed failed boards: 17218
- Due failed boards: 4837
- Freshness consistency: PASS

## Unknown Title Categories

- Input jobs: 715
- Unknown jobs: 8 (1.12%)
- ADJACENT_TECH_REVIEW: 2
- POSSIBLE_CLASSIFICATION_GAP: 5
- MANUAL_REVIEW: 1

## Retained Jobs for Review

- Rows: 40; package: 20261024-0954; live URL checks: false; roles flagged for writing review: 0
- Evidence: data/jobs/reports/package-evidence-review.md
- URL check time and board fetch time are separate. Job status uses attributed user observations where available.

## Automated Tests

- Current output validation: PASS
- Full suite: PASS (package 20261024-0954)
- Package validation: WARN
- Package copy consistency: PASS
- Package warning: 30 rows have Last Checked older than 7 days.
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
- Current release: 20261024-0954
- Previous release: 20261024-0739
- Row difference: -36
- A tier difference: 0
- B tier difference: 0
- C tier difference: -5
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
