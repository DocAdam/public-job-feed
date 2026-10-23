# Metrics suitable for the talk

Research date: 2026-10-22. These are saved results or bounded local calculations. No fresh collection or full-feed scan ran. Retain the date and population when moving a number into a slide.

## Recommended numbers

Show **713 rows in the local public upload file**, **1,003 selected rows reduced to 836 duplicate representatives**, and **743 primary links checked, with 30 rows removed and 12 ambiguous failures retained**. These measures explain actual processing choices. Use the much larger internal feed count only to explain the difference between collection and presentation.

Do not call 713 the verified number of live jobs in the current public Sheet. The Sheet was not opened or checked. Do not call duplicate row reduction a measured number of duplicate vacancies eliminated.

## Main metric register

All times below are UTC as stored in the artifacts. The October 22 package is `20261022-0622`. The package README records approximately `2026-10-22T11:22:40.877Z`. Folder names alone are not timezone evidence.

| ID | Value and unit | Defined population | Source and observation time | Method | Limits |
| --- | --- | --- | --- | --- | --- |
| M01 | 837,215 records | Full current assembled internal feed, including low scores, quality flags, and possible duplicates | `data/jobs/public/public-job-feed-latest-summary.json`, `GeneratedAt=2026-10-22T11:09:20.856Z` | Read saved `TotalRows`; cross-check saved release test's expected and actual row totals | Not deduplicated vacancies, not a live check, and not the public table. Full JSON was not counted again. [C29](11-evidence-index.md#c29) |
| M02 | 21,344 company keys/labels | Company grouping in the M01 feed | Same summary/time as M01, `UniqueCompanies` | Producer counts unique CompanyKey, falling back to Company | Not verified distinct employers. Source labels can be intermediaries. [C29](11-evidence-index.md#c29) |
| M03 | 74,111 Remote; 59,913 Hybrid; 651,002 Onsite; 52,189 Unknown records | M01 full feed | Same summary/time as M01 | Read four saved work-arrangement counts; their sum equals 837,215 | Heuristic labels, not eligibility verification. Do not substitute these for public-package counts. [C29](11-evidence-index.md#c29) |
| M04 | 328,936 flagged rows; 167,801 duplicate-group labels | M01 full feed | Same summary/time as M01 | Read PossibleDuplicateCount and DuplicateGroupCount | Flags and group labels are not rows removed. They are not necessarily the connected components used by export selection. [C09](11-evidence-index.md#c09), [C29](11-evidence-index.md#c29) |
| M05 | 1,003 input rows; 836 output rows; 167 rows removed; 134 multi-row groups resolved | The `deduped-top` selection, before public-package exclusions, location grouping, and link cleanup | `data/jobs/public/slices/deduped/public-job-feed-dedupe-summary.json`, `GeneratedAt=2026-10-22T11:21:01.210Z` | Read saved values; verify 1,003 minus 836 equals 167 | Not full-feed deduplication. Ranking chooses representatives under imperfect identity keys. [C31](11-evidence-index.md#c31) |
| M06 | 38 excluded rows | Detailed top rows whose URLs match package exclusion policy in this package | `data/jobs/gsheet-package/20261022-0622/public-package-exclusions.csv`; package date above | Count CSV data rows, excluding header; review reason/date columns remain in source | Not the size of the configured exclusion list or a source deletion count. [C17](11-evidence-index.md#c17), [C30](11-evidence-index.md#c30) |
| M07 | 743 checked rows; 701 counted GoodRows; 42 counted BadRows | Primary application-link checks before pruning | `data/jobs/gsheet-package/20261022-0622/01_good_documentation_jobs-url-check-summary.json`, `CheckedAt=2026-10-22T11:23:47.980Z` | Read summary; bounded count of saved review and before-prune CSV gives 743 each | GoodRows uses the checker's `ok` flag. A rate-limited result can have `ok=true`; this is not a count of verified open jobs or necessarily unique HTTP requests. [C19](11-evidence-index.md#c19) |
| M08 | 30 rows pruned; 12 ambiguous failures kept | M07 link-check population | Same summary/time as M07 | Read `PrunedRows`, `KeptAmbiguousFailureRows`; 743 minus 30 equals 713 | Safe-removal rules are bounded rules. Remaining failures are not proven valid. Additional Apply Links are not established as fully checked. [C19](11-evidence-index.md#c19) |
| M09 | 713 public display rows | Final local `01_good_documentation_jobs.csv`, after exclusions, grouping, and safe link pruning | Dated package and `latest` copy; saved daily report `2026-10-22 11:23:50 UTC` | Bounded CSV row count gives 713; matches start-here, saved release test, and daily report | A grouped display row can represent several postings. Manual upload and current live Sheet match are unverified. [C30](11-evidence-index.md#c30) |
| M10 | 450 Onsite; 119 Remote; 114 Hybrid; 30 Unknown rows | M09 final public display rows | Same package and daily report as M09 | Bounded CSV category count; sum equals 713 | Grouped rows use a summary arrangement. Remote can mean one member of a group is Remote. [C16](11-evidence-index.md#c16), [C30](11-evidence-index.md#c30) |
| M11 | 494 exact display labels | Company column in M09 | Same package as M09 | Count distinct Company strings; saved daily report also gives 494 labels | Not verified unique employers. This is not the 540 normalized company keys in the detailed shortlist history. [C30](11-evidence-index.md#c30) |
| M12 | 29 added; 35 removed; 684 continuing rows | Public-list membership between `20261021-0636` and `20261022-0622` | Saved all-remote daily report, generated `2026-10-22 11:23:50 UTC`; previous count 719 in saved package test | Read additions/removals; derive continuing as 713 minus 29 and cross-check 719 minus 35 | Membership uses normalized primary application URL with fallback. Neither addition nor removal proves posting, closure, or hiring. [C20](11-evidence-index.md#c20), [C30](11-evidence-index.md#c30) |
| M13 | 32 U.S.-remote; 52 international-remote; 1 overlap; 83 unique qualifying rows | Explicit-location remote subsets of M09 | Same daily report/time as M09 | Read saved subset counts; 32 plus 52 minus 1 equals 83 | Generic Remote is excluded. These are location-rule results, not individual applicant eligibility. [C14](11-evidence-index.md#c14), [C30](11-evidence-index.md#c30) |
| M14 | 700 searchable rows; 13 without searchable text | M09, joined to detailed text at the primary application URL | Same daily report/time as M09 | Read saved text-coverage counts; 700 plus 13 equals 713 | Searchable text can be incomplete. Missing text is not a negative topic match. [C30](11-evidence-index.md#c30) |
| M15 | 261/700 AI mentions, 37.3%; 96/700 API mentions, 13.7%; 28/700 docs-as-code mentions, 4.0% | Only the 700 searchable rows in M14 | Same daily report/time as M09 | Saved phrase-match counts and rounded shares | Mentions can be company background, not duties or requirements. Do not headline a labor-market conclusion. [C30](11-evidence-index.md#c30) |
| M16 | 50,170 eligible board keys; 50,170 attempted; 100% attempted coverage | Stable ATS plus catalog slug board keys in saved coverage report | `data/jobs/reports/crawl-coverage-summary.json`, `2026-10-22T11:22:41.003Z` | Read saved totals and CoverageUnit | Attempted at least once, not successful or recent. Not the number of companies. [C32](11-evidence-index.md#c32) |
| M17 | 25,721 recent successful snapshots, 51.27%; 21,978 current failed boards, 43.81%; 9,657 due boards | 50,170 active eligible board keys in later maintenance state | `data/jobs/reports/board-freshness-report.json`, generated `2026-10-22T21:40:00.063Z`; state `21:33:15.093Z` | Read Overall counters; successful snapshots include successful empty results | Later than the morning package. Not one synchronized pipeline snapshot with M01-M16. Recent attempt coverage is a separate 91.46%. [C33](11-evidence-index.md#c33) |
| M18 | 155 snapshots; 114,188 raw detailed rows; 114,178 resolved observations; 101,059 raw public rows | Imported package history through `20261022-0622` | `data/jobs/history/validation.json`, generation `c4fe469c-5f61-46ea-8717-2f5e363fb804`; companion history report generated `2026-10-22T11:27:02.120Z` | Read saved validation counts; ten excess raw detailed rows remain preserved | Repeated observations across snapshots, not 114,178 unique jobs. Validation has no independent GeneratedAt field; associate it with its generation/latest snapshot, not a guessed time. [C34](11-evidence-index.md#c34) |
| M19 | 3,476 canonical keys; 3,419 job keys; 40 unmatched public-row exceptions | M18 history | Same validation/generation as M18 | Read saved distinct-key and exception counts | Different keys have different identity rules. Exceptions are preserved anomalies, not silently dropped rows. [C22](11-evidence-index.md#c22), [C34](11-evidence-index.md#c34) |
| M20 | 35 commands recorded with exit code 0 | Saved full test dispatch for package `20261022-0622` | `data/jobs/reports/test-all-results.json`, completed `2026-10-22T11:24:49.276Z` | Count Tests entries and inspect ExitCode; summary status PASS | Commands are not individual assertions. A saved package test is WARN with five rows older than 14 days. No suite was rerun for this research. [C26](11-evidence-index.md#c26) |
| M21 | 228 JavaScript files; 55 `test-*.js` command files | Existing tracked and untracked `src/` files at research baseline | Local source inventory, observed 2026-10-22 | Unique `git ls-files --cached --others --exclude-standard` paths; count `.js`, then `src/scripts/test-*.js` | Includes uncommitted files. Excludes dependencies and review helper copies. Counts files, not tests, quality, or historical growth. [C35](11-evidence-index.md#c35) |
| M22 | 34 minutes 20.060 seconds | One saved launcher run, including its recorded end-to-end steps | `data/jobs/reports/refresh-run.json`, `11:01:21.507Z` to `11:35:41.567Z` on 2026-10-22 | Subtract recorded timestamps | One run, with working-tree changes. Not a typical duration, speedup, or time saving. [C27](11-evidence-index.md#c27) |

## Reconciliations that matter

The useful count sequence is:

`837,215 broad records -> 1,003 selected top rows -> 836 duplicate representatives -> public eligibility and location grouping -> 743 rows checked -> 713 final display rows`.

The first arrow is filtering, not deduplication. The next removes 167 selected rows under duplicate rules. The public exclusion CSV records 38 rows. Do not describe the whole 836-to-743 reduction as duplicates. The final 30 removals come from link rules. No single “jobs removed” total describes these different operations accurately.

History validation's latest `total_postings=836` and `good_postings=713` describe detailed observations and public inclusion. Its `remote_postings=150` uses the detailed population. The reader report has 119 Remote display rows. Both can be correct because their populations and grouping differ.

`00_start_here.csv` retains a last-check range starting June 25. The post-prune package test reports June 30 as the oldest final row. The orientation file can describe a wider pre-cleanup set. Use the final CSV or post-prune test for final-row freshness, and keep the warning visible. [C37](11-evidence-index.md#c37)

## Optional historical storage measure

The October 19 full-memory review reports a 662.01 MiB compacted candidate and a 2,168.51 MiB same-history old-format control, described as 69.5% smaller. Population: the reviewed 152-snapshot candidate, not the later 155-snapshot database. Source: `docs/plans/job-history-full-memory-review.md`, “Memory and disk.” This is a saved experiment with retained copies, finite resource margins, and later separate migration acceptance. It does not measure total disk reclaimed or present production performance. Keep it for questions. [C39](11-evidence-index.md#c39)

## Measures that remain unavailable

- **Current live Sheet count:** needs a permitted review of the public Sheet and its displayed update time.
- **Verified distinct employers:** needs a reviewed employer-identity model; labels alone are insufficient.
- **Duplicate accuracy:** needs a labeled sample of true same-vacancy and separate-vacancy pairs.
- **Relevance precision and recall:** need a reviewed relevance set and a defined source population, including missed relevant jobs.
- **Time saved:** needs a recorded comparison with the earlier manual or Excel process.
- **Reader outcomes, traffic, or applications:** no supporting local result was established. Do not infer these from sharing links or feed size.
- **Market trends:** need a suitable stable population and a method to control collection and classification changes. Feed movement alone is insufficient.

No new benchmark, live count, accuracy estimate, or outcome measure is proposed as a completed result.
