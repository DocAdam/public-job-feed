# Employment Type verification

## Release verification update — 2026-10-24

**Current result: NEEDS REVIEW.** The one approved refresh completed as run `455b725d-9dc4-48c2-bb7a-8e0b24bea81c`, package `20261024-0954`. Its cleaned public CSV has 715 rows. Feed and history validation passed. The current backup failed because the strict check found extra metadata files. A Variable schedule parser correction now passes all 38 isolated tests, but it has not been used in a new production release.

See the [current release report](employment-type-release-verification-20261024.md) for the complete acceptance ledger, source counts, timings, failures, and exact CSV range. The live Sheet is unchanged.

The remainder of this document is the earlier implementation snapshot. Its old approval state and NOT VERIFIED entries describe that earlier point in time. The Greenhouse preservation failure remains part of the record.

Derived implementation report. Date: 2026-10-24. No live refresh or Sheet import was performed.

## Result

Implementation tests pass. The final isolated preview has 714 public rows. The package validator reports WARN, with zero failures and 3 warnings. A test-report preservation exception remains: the first Greenhouse test run replaced two existing reports. See the protection section.

## Final preview

Input: `/Users/adampugh/GitHub/public-job-feed/data/jobs/public/public-job-feed-deduped-top.json`. SHA-256: `5fae34c444889fd6646b9b85284c0f1a420126f440077c5951c1b7b9d7748fcb`. Input size: 5,669,757 bytes. The input has 831 saved shortlist records. Existing package eligibility excludes 36 records. The eligible detailed population is 795 records. Location grouping produces 744 rows. Saved URL results then remove 30 rows, leaving 714 public rows. The saved check dates run from 2026-10-24T12:39:45.604Z to 2026-10-24T12:40:30.850Z. No URL was checked again.

| Population | Denominator | Stated schedule | Stated terms | Neither | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Eligible detailed records | 795 | 38 | 41 | 719 | 0 |
| Public rows | 714 | 28 | 36 | 652 | 0 |

Schedule and terms populations can overlap. Detailed counts include a stated dimension retained in conflict evidence. Public counts describe visible supported labels. Conflicts have their own count. Source totals below use the displayed representative for a grouped public row. They do not count every underlying source posting.

Old location grouping: 744. New location grouping: 744. Change: 0. Earlier duplicate selection is already present in this saved input. The preview cannot measure the full-feed row change from the new earlier selection rules. Synthetic tests cover that rule.

The final preview has 16 public columns. Its table and pivot source range is `01_good_documentation_jobs!A1:P715`, including the header. Public label examples include `Full-time`, `Contract`, `Part-time; Freelance`, and `Full-time; Internship`. The full parser tests also cover `Part-time; Contract` and `Full-time; Contract`.

### Display counts by source

| Source | Denominator | Not stated | Full-time | Internship | Freelance | Contract | Full-time; Internship | Part-time | Part-time; Freelance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lever | 70 | 55 | 11 | 0 | 3 | 1 | 0 | 0 | 0 |
| ashby | 64 | 59 | 2 | 1 | 1 | 0 | 1 | 0 | 0 |
| greenhouse | 252 | 239 | 6 | 3 | 2 | 2 | 0 | 0 | 0 |
| direct-employer | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| workday | 194 | 179 | 1 | 5 | 0 | 7 | 0 | 2 | 0 |
| icims | 92 | 88 | 1 | 1 | 0 | 0 | 0 | 2 | 0 |
| bamboohr | 41 | 31 | 0 | 4 | 3 | 1 | 0 | 1 | 1 |
| All public rows | 714 | 652 | 21 | 14 | 9 | 11 | 1 | 5 | 1 |

Detailed source/label counts are in [employment-type-coverage.json](../../previews/employment-type-20261024/20261024-0840/employment-type-coverage.json). Each source object gives its denominator.

### Preview validation warnings

- 23 rows have Last Checked older than 7 days.
- 5 rows have Last Checked older than 14 days.
- Company Coverage CSV is missing: /Users/adampugh/GitHub/public-job-feed/previews/employment-type-20261024/20261024-0840/02_company_coverage.csv

These are saved-data and preview-scope warnings. No dates were changed to remove them. The 744-row comparison package is the earlier isolated preview. The 30-row difference comes from replaying saved safe-prune outcomes. Employment grouping changes zero rows on this input.

## Tests

16 selected regression commands passed. The final command log retains output, exit codes, and durations. Package validation also completed with zero failures. The integration test includes the existing scoring test in its temporary project.

| Command | Result | Duration ms |
| --- | --- | ---: |
| `npm run jobs:test-employment-type` | PASS | 170.18 |
| `npm run jobs:test-employment-integration` | PASS | 4072.74 |
| `npm run jobs:test-dedupe-select` | PASS | 138.01 |
| `npm run jobs:test-gsheet-grouping` | PASS | 140.33 |
| `npm run jobs:test-core-pipeline` | PASS | 138.1 |
| `npm run jobs:test-streaming-export-phase-1` | PASS | 278.18 |
| `npm run jobs:test-greenhouse-normalize -- --report-dir previews/employment-type-20261024/verification/greenhouse` | PASS | 139.8 |
| `npm run jobs:test-history` | PASS | 4762.41 |
| `npm run jobs:test-history-content` | PASS | 789.88 |
| `npm run jobs:test-gsheet-url-pruning` | PASS | 133.25 |
| `npm run jobs:test-url-health` | PASS | 128.42 |
| `npm run jobs:test-curated-submissions` | PASS | 146.61 |
| `npm run jobs:test-refresh-reports` | PASS | 343.63 |
| `npm run jobs:test-title-category` | PASS | 132.27 |
| `npm run jobs:test-job-finder-consumer` | PASS | 135.38 |
| `npm run jobs:test-refresh-launcher` | PASS | 3225.45 |

The first regression pass failed jobs:test-refresh-reports because a newly added dependency was absent from its small temporary project. CSV serialization was then made independent of extraction. The unchanged report fixture now passes. The initial and final result files retain this history.

After the regression group, focused and integration tests were also run with the corrected Workday search-response dates and URLs, URL-prune metadata updates, formula synchronization, and the actual Clean Broken Links sync function. Those checks passed. The last test also validates an isolated latest copy against its sibling source package. The package validator now resolves that source relative to the selected package. The full launcher was not run.

The final targeted command log is [final-targeted-results.json](../../previews/employment-type-20261024/verification/final-targeted-results.json). It includes the final package validator and Bash syntax check.

The normal full runner was not executed. It writes production report paths and includes saved-corpus checks. These normal-suite commands were not run in their default production context:

- `jobs:test-history-backup`
- `jobs:test-history-finalization`
- `jobs:test-catalog-maintenance`
- `jobs:test-batch-history`
- `jobs:test-board-freshness`
- `jobs:test-ats-errors`
- `jobs:test-failure-investigation`
- `jobs:test-board-probe`
- `jobs:test-passive-launcher`
- `jobs:test-ats-alert`
- `jobs:test-release`
- `jobs:test-scoring`
- `jobs:compare-last-release`
- `jobs:test-trends`
- `jobs:test-us-remote-report`
- `jobs:test-international-remote-report`
- `jobs:test-all-remote-report`
- `jobs:test-substack-full-report`
- `jobs:test-content-metrics`
- `jobs:test-status-dashboard`
- `jobs:test-review-improvements`

The new tests are registered in package.json testSuites. No dependency was added. The tests use offline fixtures and temporary projects/databases. No collector was run.

## Runtime measurements

Fixed input: 831 records, hash `5fae34c444889fd6646b9b85284c0f1a420126f440077c5951c1b7b9d7748fcb`, Node v26.3.1. Nine measured repetitions followed one warmup. Median copy-only time: 0.128 ms. Median copy plus extraction: 53.989 ms. Median added time: 53.862 ms.

One final preview measured extraction at 66.056 ms, public package creation at 27.136 ms, and post-load processing/output at 183.201 ms. The last measure starts after the input read and JSON parse. It includes extraction, comparison grouping, saved URL result replay, and output writes.

These measurements use one saved shortlist on one machine. Cache and machine load affect them. They do not measure collection, the full canonical feed, URL checks, history updates, or a daily refresh. This change adds zero network requests. The final code was measured again in benchmark-final.json. Earlier benchmark runs are retained separately.

## Protection and compatibility

All 34,006 existing data entries were checked by file metadata and symlink targets. No saved batch, archive, production package, or database entry changed. The two history files that were already changed have the same SHA-256 values as the baseline. Job Finder records, schedules, dependencies, Git index, commits, remotes, and the live Sheet were not changed.

Two existing test reports were replaced by the initial Greenhouse test command:

- `data/jobs/reports/test-greenhouse-normalize-results.json`
- `data/jobs/reports/test-greenhouse-normalize-results.md`

The reports directory modification time also changed. The previous report bytes were not saved before that command, so the old GeneratedAt values were not restored. Later Greenhouse tests used --report-dir. This is a preservation failure for those two test reports. The protected-state report records the exact metadata differences. No timestamp was reset to conceal the write.

Legacy and v2 temporary history databases accepted 18 old and 18 new records. All 36 observations remained available. The old new-field values were null. The new evidence arrays remained valid JSON strings. A comparison with the current 714-row package also found the same application links, row order, and values in all 15 old public columns. Only the appended Employment Type column is new. The comparison replays the same saved URL results. See public-column-comparison-final.json. History audits passed. Old package validation passed. New-schema missing-column rejection passed. Existing fields were compared through the actual merge; scoring and identity key tests passed. URL-prune and latest-copy metadata, formula rows, and manifest sizes also passed the temporary integration checks.

## Acceptance matrix

| Requirement | Status | Evidence or limit |
| --- | --- | --- |
| Read instructions and Git state; preserve existing history changes | PASS | Baseline recorded; history file hashes unchanged. |
| Retain review CSV and distinguish source excerpts from derived/synthetic cases | PASS | Fixture provenance manifest and README; all 18 cases tested. |
| Define schedule, terms, status, evidence, stable CSV serialization | PASS | Feature contract, schema validation, JSON round-trip tests. |
| Preserve received Ashby, Lever, BambooHR, Workday, Greenhouse, iCIMS fields | PASS | Source normalizers and focused tests. No detail requests added. |
| Keep unknown labels; missing structured values permit explicit text | PASS | Unknown evidence, null BambooHR field, empty metadata, Union/OTHER cases. |
| Conservative current-role text; no pay/location inference | PASS | Positive, negative, HTML, punctuation, applicant, future, and past cases. |
| Keep source observation date and source URL | PASS | Original dates retained; Workday tests use saved search request metadata. |
| Retain multiple terms and explicit schedule alternatives | PASS | Controlled terms, Contract/Freelance, schedule alternative tests. |
| Flag contradictions and retain both evidence values | PASS | Source conflict and same-posting identity tests, including streaming. |
| Preserve different employment variants and Not stated | PASS | Earlier selection, core compatibility, location grouping, bridge tests. |
| Keep JobKey and existing source/ranking/score rules | PASS | Identity tests, score comparison, existing scoring regression in sandbox. |
| Preserve valid location summaries and application links | PASS | Existing grouping regression and new combined-label cases. |
| Trace actual normalization, batch, merge, shortlist, and public paths | PASS | Integration uses real merge and daily slice scripts in a temporary project. |
| Detailed JSON/CSV evidence survives all intermediate stages | PASS | Batch projection, actual merge, slice CSV/JSON, temporary history queries. |
| Append public Employment Type; preserve other column positions | PASS | 16 headers; new column last; no evidence in simple output. |
| Public and formula outputs agree | PASS | Same values and grouped row order tested. |
| Daily package includes new schema, coverage, and import instructions | PASS | Shared builder, URL prune, formula synchronization, and actual launcher sync function tested in temporary paths. |
| Update dictionary sources and generated instructions | PASS | build-public-release.js and build-gsheet-package.js sources updated. |
| Create isolated preview without overwriting latest or imported packages | PASS | New preview directory; protected metadata check. |
| Report coverage, source/label counts, conflicts, and denominators | PASS | Two populations and full source/display counts retained. |
| Derive Sheet range; explain combined-label filtering | PASS | Range from actual headers and rows; import instructions use Text contains. |
| Old records and old package schema remain valid | PASS | Focused tests and old-package validation. |
| Old/new package history compatibility in temporary databases | PASS | Legacy and v2 imports and audits, 36 observations each. |
| No archive, production package, database, or Job Finder change | PASS | Protected metadata check; existing history file hashes unchanged. |
| Keep every pre-existing test report unchanged | FAIL | Initial Greenhouse command replaced two report files; prior timestamps not recovered. |
| Run relevant regression tests and register focused tests | PASS | 16 commands passed; focused and integration scripts registered. |
| Run the complete normal suite | NOT VERIFIED | Default suite includes production report writes and saved-corpus checks; exact unrun commands listed above. |
| Measure extraction/preview and state limits | PASS | Fixed input hash, repeated benchmark, one-run preview timings. |
| No new network request, dependency, commit, push, PR, or publication | PASS | Offline code path and command review; no such actions taken. |
| Documentation and future approved refresh/import steps | PASS | README and feature document; local package and publication steps separated. |
| Recover structured fields discarded from old batches | NOT VERIFIED | No reconstruction or history rewrite attempted; normal future collection can supply them. |
| Detail-only Workday/iCIMS coverage | NOT VERIFIED | Outside this release. The board path leaves unsupported dimensions unknown. |
| Full-feed row-count and daily-refresh runtime effects | NOT VERIFIED | Saved shortlist preview and fixed-dataset benchmark only. |
| Live production refresh, URLs, Sheet table/pivot, and filters | NOT VERIFIED | Not authorized or performed. |

## Exact affected paths

Implementation and durable evidence paths:

- `README.md`
- `docs/features/employment-type-verification.md`
- `docs/features/employment-type.md`
- `launchers/Clean Broken Links.command`
- `package.json`
- `previews/employment-type-20261024/ (isolated previews and verification files; see README.md)`
- `src/adapters/exports/csv-builder.js`
- `src/adapters/exports/export-dedupe.js`
- `src/adapters/exports/stream-record-writers.js`
- `src/adapters/storage/export-run-store-worker.js`
- `src/core/deduplication/job-dedupe.js`
- `src/core/models/job-record.js`
- `src/core/pipeline/engine.js`
- `src/lib/csv.js`
- `src/lib/dedupe-select.js`
- `src/lib/employment-type-report.js`
- `src/lib/employment-type.js`
- `src/lib/job-export.js`
- `src/lib/jobs-normalize.js`
- `src/lib/simple-public-export.js`
- `src/scripts/benchmark-employment-type.js`
- `src/scripts/build-gsheet-package.js`
- `src/scripts/build-public-release.js`
- `src/scripts/check-gsheet-url-health.js`
- `src/scripts/export-public-slices-streaming-dry-run.js`
- `src/scripts/export-public-slices.js`
- `src/scripts/fixtures/employment-type/ (30 evidence and documentation files; see provenance.json)`
- `src/scripts/preview-employment-type.js`
- `src/scripts/test-employment-integration.js`
- `src/scripts/test-employment-type.js`
- `src/scripts/test-greenhouse-normalize.js`
- `src/scripts/test-gsheet-package.js`

The two overwritten report files are listed in the protection section. The pre-existing history edits are not part of this change. The fixture manifest lists every retained evidence file. The preview README lists final outputs and the earlier preliminary preview.

## Remaining steps

The next production refresh requires separate approval. Use the existing launcher, then inspect the new schema, coverage, conflicts, URL checks, history result, and backup result. A later Sheet import also requires approval. Use that package's actual range, preserve remote_jobs_pivot, and check the last row and Text contains filters in the live Sheet. See the feature document for the commands and steps.
