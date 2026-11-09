# Metrics for the talk

Review date: October 27, 2026. These are saved results and bounded local calculations. No collection, database query, full-feed scan, or benchmark ran for this review.

## Recommended numbers

Use one fixed example from **October 25, package `20261025-0724`**: 1,017 selected candidates become 847 representatives; 761 primary-link rows are checked; 29 rows are removed and 12 uncertain failures are kept; the final table has 732 display rows. These are processing counts. They are not counts of verified unique vacancies.

The latest local package is from October 26 and has 735 display rows. The saved Sheet publication check covers 732 rows from October 25. Do not combine these as one current result.

## Sources and dates

The short source names below refer to repository-relative paths:

- **V25:** [artifact-verification.json](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json). Saved review generated `2026-10-25T12:40:33.751Z`. Its run started at `12:02:42.486Z` and completed at `12:36:30.191Z` on October 25. This review read the small report, not its multi-gigabyte input.
- **R25:** [fixed daily report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/all-remote-daily-report.md). These are fixed review copies, not the mutable current report directory.
- **P25:** [dated package](../../data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv). Public CSV SHA-256: `460338c0067c15a64196c836b83032b4309c6095f08b8e03b70b27ebbadbc963`. Generated package time is `2026-10-25 12:24 UTC`; URL check time is `2026-10-25T12:26:13.346Z`.
- **P26:** [dated package](../../data/jobs/gsheet-package/20261026-0638/01_good_documentation_jobs.csv). Public CSV SHA-256: `a34cca8df3e48bf1f5e53620142943228c12a8a3be22006bf3da606369ca3f01`. Generated package time is `2026-10-26 11:38 UTC`; URL check time is `2026-10-26T11:40:10.459Z`.

All artifact times below are UTC unless stated. Package folder names alone do not establish timezone. The public CSVs were counted with a CSV parser, excluding the header.

## Main metric register

| ID | Value and unit | Population | Source and date | Method | Limits |
| --- | --- | --- | --- | --- | --- |
| M01 | 836,592 records | Broad assembled feed used in the October 25 release review | V25, `canonical.rows`, October 25 | Read saved full-artifact check | Includes retained observations, weak matches, and possible duplicates. Not a fresh full-feed recount. [C29](11-evidence-index.md#c29) |
| M02 | 21,354 company keys/labels | Separate October 26 broad feed of 836,383 records | `data/jobs/public/public-job-feed-latest-summary.json`, `2026-10-26T11:24:26.753Z` | Read `UniqueCompanies`; producer uses CompanyKey with Company fallback | Different date from M01. Not verified distinct employers. [C47](11-evidence-index.md#c47) |
| M03 | 74,072 Remote; 59,956 Hybrid; 650,216 Onsite; 52,139 Unknown records | M02 broad feed | Same summary and time as M02 | Read saved category totals; sum is 836,383 | Text-rule labels, not personal eligibility. Not the public table. |
| M04 | 319,885 flagged rows; 162,936 duplicate-group labels | M02 broad feed | Same summary and time as M02 | Read `PossibleDuplicateCount` and `DuplicateGroupCount` | Flags and labels are not rows removed or proved duplicate vacancies. |
| M05 | 1,017 candidates; 847 representatives; 170 fewer rows | October 25 strong-candidate set before package exclusions and grouping | V25, `controlledComparison`, October 25 | Read candidates and new selection; subtract 847 from 1,017 | Same-input old/new rule sets both select 847. This does not prove 170 duplicate vacancies. [C31](11-evidence-index.md#c31) |
| M06 | 36 excluded rows | M05 representatives affected by exact-URL public policy | P25 `public-package-exclusions.csv`; V25 newEligible=811 | Count exclusion CSV; check 847 minus 36 equals 811 | Not the number of configured decisions or deleted source jobs. |
| M07 | 761 checked rows; 720 GoodRows; 41 BadRows | Primary application-link rows before safe pruning | P25 `01_good_documentation_jobs-url-check-summary.json`, `2026-10-25T12:26:13.346Z` | Read saved summary; count before-prune CSV | GoodRows uses the checker retention flag. Not unique HTTP requests or verified open jobs. [C19](11-evidence-index.md#c19) |
| M08 | 29 pruned; 12 uncertain failures retained | M07 rows | Same source/time as M07 | Read PrunedRows and KeptAmbiguousFailureRows; 761 minus 29 equals 732 | Remaining failures are not established as valid. Secondary link network checks are not established. |
| M09 | 732 display rows; 16 columns | Final October 25 public CSV | P25; URL check time above | Parse CSV; cross-check V25 and publication report | A row can combine several postings. Publication has a separate dated check. [C30](11-evidence-index.md#c30) |
| M10 | 461 Onsite; 125 Remote; 116 Hybrid; 30 Unknown rows | M09 display rows | P25 and R25 `all-remote-daily-report.md`, generated `2026-10-25 12:26:15 UTC` | Count CSV categories; sum equals 732 | Grouped arrangement can summarize mixed members. |
| M11 | 502 distinct display labels | Company column in M09 | Same CSV/report as M10 | Count distinct Company strings; cross-check report | Labels can include intermediaries. Not a reviewed employer count. |
| M12 | 22 added; 5 removed; 710 continuing rows | Public URL membership from `20261024-0954` to `20261025-0724` | R25 daily report; fixed `verification/backup-recovery-release-20261025T114249Z/final/public-row-comparison.json`, October 25 | Read counts; check 732 minus 22 = 715 minus 5 = 710 | Membership can change through rules or sources. No posting, closure, or hiring inference. |
| M13 | 33 U.S.-remote; 59 international-remote; 1 overlap; 91 unique rows | Explicit-location Remote subsets of M09 | R25 daily report, same time as M10 | Read saved counts; 33 + 59 - 1 = 91 | These report filters differ from the all-country Sheet remote view. Not applicant eligibility. |
| M14 | 718 searchable rows; 14 without matched text | M09 joined to detailed text by main application URL | R25 daily report, same time as M10 | Read text coverage; 718 + 14 = 732 | Text can be partial. Missing text is not a negative topic result. |
| M15 | 273/718 AI mentions (38.0%); 98/718 API mentions (13.6%); 36/718 docs-as-code mentions (5.0%) | Only M14 searchable rows | R25 daily report, same time as M10 | Read phrase counts and rounded shares | A company description can contain the phrase. These are not confirmed requirements or market estimates. |
| M16 | 50,170 known board keys; all attempted at least once | Stable ATS plus catalog slug keys | R25 `crawl-coverage-summary.json`, `2026-10-25T12:24:57.170Z` | Read totals and CoverageUnit | 100% attempted is not complete, successful, or recent employer coverage. |
| M17 | 21,299 recent successful snapshots (42.45%); 22,061 failed states; 21,047 due boards | 50,170 active eligible board keys | R25 `board-freshness-report.json`, generated `2026-10-25T12:09:08.935Z`; state `12:07:10.333Z` | Read Overall counters | Different time from M16. Successful snapshots include usable empty results. These are board states, not job status. |
| M18 | 159 snapshots; 117,530 raw detailed rows; 117,520 selected observations; 103,934 raw public rows | Package history through `20261025-0724` | V25 `historyValidation`, generation `2b1dae2f-4112-493d-8252-e1a14d0832d1`, October 25 | Read saved validation fields | Repeated observations across dates, not distinct jobs. No database audit ran here. |
| M19 | 3,523 canonical keys; 3,469 job keys; 40 public-row exceptions; 10 excess raw detailed rows | M18 history | Same source/generation as M18 | Read keys, exceptions, duplicate_canonical_rows | Identity rules differ. Preserved exceptions are not missing employer facts. |
| M20 | 38 commands with exit code zero | Saved October 25 test dispatch | V25 `tests`, completed `2026-10-25T12:27:39.997Z`; R25 package test at `12:27:28.667Z` | Count Tests entries and inspect exit codes | Commands are not assertions. Package result is WARN: 24 rows older than seven days, including five older than fourteen days. No tests reran here. |
| M21 | 239 JavaScript source files; 59 test command files | `src/` paths in the October 27 local checkout | Bounded `git ls-files --cached --others --exclude-standard src/` inventory, baseline f4af4c2 | Count unique `.js` and `src/scripts/test-*.js` paths | File counts do not measure quality or assertion count. Review copies and dependencies are excluded. |
| M22 | 33 minutes 47.705 seconds | One October 25 launcher execution | V25 run start `12:02:42.486Z`, finish `12:36:30.191Z` | Subtract receipt timestamps | Saved process timing reports 2,028.128 seconds with a wider measurement boundary. Do not treat either as typical speed or time saved. Backup stopped before full restore in this run. |
| M23 | 11,728 cells compared; zero value differences | Main Sheet range A1:P733, including header and M09 rows | `verification/sheet-publication-20261025-0724-20261025T221638Z/final/publication-report.md`, verified `2026-10-25T22:38:09.016Z` | Read saved full read-back result; 733 times 16 = 11,728 | Verification record, not a live check by this task. Numeric/date/blank comparison rules are stated there. |
| M24 | 125 expected and returned remote groups; zero missing/extra/duplicate groups | Later Sheet view from the M09 source, exact Work Arrangement = Remote | `verification/remote-only-view-20261026103340Z/verification.json`, October 26 operation | Read status and counters; cross-check README and 125 Remote CSV rows | All countries; no Location filter. Not the 91 explicit-location report rows or worldwide eligibility. Browser check found clipped text. |
| M25 | 202 stated schedules; 48 stated terms; 492 neither; zero conflicts | M09 public rows | P25 `employment-type-coverage.json`, final post-prune output | Read public coverage and count byLabel totals | Schedule and terms overlap. Not stated means no supported value in obtained evidence. It does not mean the employer has no such policy. |

## Later local observations

These entries show what existed at review time. They do not replace the fixed October 25 talk example.

| ID | Value and unit | Population, source, date, and method | Limits |
| --- | --- | --- | --- |
| N01 | 735 display rows; 506 company labels; 127 Remote, 116 Hybrid, 463 Onsite, 29 Unknown | P26 parsed CSV; cross-check `data/jobs/reports/all-remote-daily-report.md`, generated `2026-10-26 11:58:58 UTC` | Local output only. No saved publication of this package was established in this review. |
| N02 | 1,014 input rows; 846 representatives; 168 removed | `data/jobs/public/slices/deduped/public-job-feed-dedupe-summary.json`, `2026-10-26T11:37:04.432Z`; read saved counters | Before public package rules; not proved duplicate vacancies. |
| N03 | 762 checked; 679 GoodRows; 83 BadRows; 27 pruned; 56 uncertain failures retained | P26 URL summary at `2026-10-26T11:40:10.459Z`; read saved counters, check 762 - 27 = 735 | Retention flags do not prove link validity. More retained failures do not by themselves prove worse employer data. |
| N04 | 260 stated schedules; 53 stated terms; 435 neither; zero conflicts | P26 final public coverage, denominator 735; read `employment-type-coverage.json` | Dimensions overlap. Changed coverage can reflect new source observations. |
| N05 | 160 snapshots; 118,376 raw detailed rows; 118,366 observations; 104,669 raw public rows; 40 exceptions | `data/jobs/history/validation.json`, generation `56f268bd-5c76-4839-b378-a81bc6a1c6f8`, latest `20261026-0638`; read saved validation | No independent GeneratedAt in this file. Identify generation and last package; do not assign an invented audit time. Current staged file is prior user work. |
| N06 | 26,089 recent successful snapshots (52%); 22,024 failed states; 3,868 due boards | 50,170 eligible keys in `data/jobs/reports/board-freshness-report.json`; generated `2026-10-27T17:47:53.487Z`, state `17:45:48.657Z`; read Overall | Later than N01-N05. Not a synchronized feed snapshot or proof of live job status. |
| N07 | 10 added; 7 removed; 725 continuing rows | P26 versus P25 public membership; saved daily report at `2026-10-26 11:58:58 UTC`; check 735 - 10 = 732 - 7 | List changes only. Do not mix with M12's earlier comparison. |

## Reconciliations that matter

The October 25 sequence is:

`836,592 broad records -> 1,017 candidates -> 847 representatives -> 811 eligible detailed records -> 761 grouped rows -> 732 final rows`.

Filtering, duplicate selection, exact exclusions, location grouping, and link removal are different operations. The 170-row selection reduction is not the full 836,592-to-732 change. The employment comparison records zero selection and grouping differences between its two rule sets on the same input. It does not establish that every real vacancy survived.

The October 25 history has 154 Remote detailed observations. The public table has 125 Remote display rows. The explicit-location reports have 91 unique qualifying rows. The later Sheet remote view has 125 results. Each count has a different rule or population.

The October 26 local sequence differs: 846 representatives, 34 exact exclusions, 812 eligible records, 762 pre-prune rows, and 735 final rows. This is not evidence that the October 25 Sheet was updated.

## Optional historical storage measure

The October 19 [full-memory review](../../docs/plans/job-history-full-memory-review.md), section Memory and disk, reports a 662.01 MiB compacted candidate and a 2,168.51 MiB old-format control, or 69.5% smaller. Population: that reviewed 152-snapshot history. These are saved experimental results. They do not measure current production speed or total disk reclaimed. Retained copies still use space. [C39](11-evidence-index.md#c39)

## Unavailable measures

A current live Sheet count needs a separately authorized read. Distinct employer counts need reviewed identity rules. Duplicate accuracy and relevance precision/recall need labeled evaluation samples. Time saved needs a measured comparison with the earlier process. Reader traffic, applications, and hiring outcomes have no supporting local result here. Market conclusions need a suitable stable population and controls for source and rule changes.

No new accuracy estimate, user outcome, benchmark, or market conclusion is presented as a completed result.
