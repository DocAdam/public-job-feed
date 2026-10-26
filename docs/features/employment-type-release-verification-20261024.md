# Employment Type release verification — 2026-10-24

This report retains the October 24 result. See the [October 25 follow-up](employment-type-release-verification-20261025.md) for the recovery backup and new production run.

**Overall result: NEEDS REVIEW.** The approved refresh completed. Its public package and history passed validation. The current backup failed. A parser correction now passes isolated tests, but it has not been used in a new production release. The work is not fully complete.

## Code and run identity

- Production run: `455b725d-9dc4-48c2-bb7a-8e0b24bea81c`.
- Package: `20261024-0954`.
- Time: 2026-10-24 09:31:24 to 10:11:12 CDT. Elapsed: 2388.318 seconds (39 minutes 48 seconds).
- Git revision: `96067095fd634c6f5e0d9d2f381423997a743b11`; working tree had changes. No commit was made.
- Launcher SHA-256: `c8bc35baccefbaf9f1187dd52890de1d9faadb94851234137d29804f02039026`.
- No conflicting lock was present. No lock waiting was observed. About 0.13 seconds separated driver start from run-record creation; this includes startup and is not a separate lock timing.

The parser and related source files were held unchanged through the run. The correction was applied afterward. Original run code, final source hashes, and the applied-file manifest are retained. Thus the production result and the corrected working code are distinct states.

[Run result](../../verification/employment-type-release-20261024T142452Z/production/process-result.json) · [Preflight](../../verification/employment-type-release-20261024T142452Z/production/preflight.json) · [Applied fix](../../verification/employment-type-release-20261024T142452Z/isolated/applied-parser-fix.json) · [Final code hashes](../../verification/employment-type-release-20261024T142452Z/isolated/release-final-code-hashes.json)

## Isolated tests

All 38 normal-suite commands passed before production. This included every one of the 21 commands previously left unrun. The final corrected code also passed all 38 commands. A later focused run passed against the applied workspace source.

Tests used a copy-on-write copy of the complete saved data tree. The full release test counted every row in the saved 2.88 GB CSV. Freshness and saved trend/package checks used that same fixed copy. Fixture-only tests remain fixture evidence. The passive-launcher smoke test reads paths bound to the real repository; it ran there under OS write and network restrictions. No schedule was changed.

The OS denied network access and writes outside the isolated directory. A Node guard blocked one initial HTTPS call before a request was sent. The guard self-test, per-command logs, input hashes, and source-population notes are retained. Production data had zero changes after the first isolated suite.

[Initial full suite](../../verification/employment-type-release-20261024T142452Z/isolated/suite-results.json) · [Final full suite](../../verification/employment-type-release-20261024T142452Z/isolated/release-final-suite-results.json) · [Applied-source focused tests](../../verification/employment-type-release-20261024T142452Z/isolated/post-apply-focused-results.json) · [Fixed input hashes](../../verification/employment-type-release-20261024T142452Z/isolated/input-hashes.json)

| Command | Final isolated result | Milliseconds |
| --- | --- | ---: |
| `jobs:test-employment-type` | PASS | 182 |
| `jobs:test-employment-integration` | PASS | 4435 |
| `jobs:test-history-backup` | PASS | 23260 |
| `jobs:test-history-finalization` | PASS | 12550 |
| `jobs:test-catalog-maintenance` | PASS | 231 |
| `jobs:test-batch-history` | PASS | 6299 |
| `jobs:test-board-freshness` | PASS | 397 |
| `jobs:test-ats-errors` | PASS | 144 |
| `jobs:test-failure-investigation` | PASS | 265 |
| `jobs:test-board-probe` | PASS | 255 |
| `jobs:test-passive-launcher` | PASS | 141 |
| `jobs:test-ats-alert` | PASS | 138 |
| `jobs:test-title-category` | PASS | 138 |
| `jobs:test-dedupe-select` | PASS | 139 |
| `jobs:test-core-pipeline` | PASS | 148 |
| `jobs:test-streaming-export-phase-1` | PASS | 300 |
| `jobs:test-release` | PASS | 15958 |
| `jobs:test-gsheet-grouping` | PASS | 157 |
| `jobs:test-gsheet-package` | PASS | 255 |
| `jobs:test-url-health` | PASS | 138 |
| `jobs:test-gsheet-url-pruning` | PASS | 140 |
| `jobs:test-scoring` | PASS | 149 |
| `jobs:test-greenhouse-normalize` | PASS | 148 |
| `jobs:test-job-finder-consumer` | PASS | 142 |
| `jobs:compare-last-release` | PASS | 145 |
| `jobs:test-trends` | PASS | 148 |
| `jobs:test-us-remote-report` | PASS | 139 |
| `jobs:test-international-remote-report` | PASS | 146 |
| `jobs:test-all-remote-report` | PASS | 283 |
| `jobs:test-substack-full-report` | PASS | 162 |
| `jobs:test-content-metrics` | PASS | 167 |
| `jobs:test-status-dashboard` | PASS | 152 |
| `jobs:test-refresh-launcher` | PASS | 3483 |
| `jobs:test-curated-submissions` | PASS | 160 |
| `jobs:test-refresh-reports` | PASS | 364 |
| `jobs:test-review-improvements` | PASS | 166 |
| `jobs:test-history` | PASS | 4819 |
| `jobs:test-history-content` | PASS | 819 |

## Observed production data

The normal collection checked 300 boards and received 35,563 job records. All 35,563 normalized batch employment contracts matched their merged canonical records. The canonical feed has 836,867 records: 35,565 observations at or after this run started, including two curated records, and 801,302 retained older observations. Source observation dates were not replaced with export dates. Successful raw API bodies are not archived; source tracing starts at the normalized evidence.

| New source | Records | Records with structured evidence, including unknown labels |
| --- | ---: | ---: |
| ashby | 6820 | 6820 |
| bamboohr | 608 | 608 |
| greenhouse | 10585 | 2400 |
| icims | 1328 | 0 |
| lever | 11271 | 11058 |
| workday | 4951 | 4610 |

Ashby employmentType, Lever commitment, BambooHR employmentStatusLabel, Workday timeType on individual records, and Greenhouse employment metadata were observed. New iCIMS cards had no structured employment field. Explicit text can still supply a value. Detail-only Workday and iCIMS values remain unknown. Novel labels such as Full-Time plus Holidays and Freelancer can remain unknown structured evidence when outside the controlled mapping; an explicit title can still supply a term.

[Source excerpts and field counts](../../verification/employment-type-release-20261024T142452Z/production/new-source-review.json) · [Full artifact checks](../../verification/employment-type-release-20261024T142452Z/production/artifact-verification.json)

## Public and detailed coverage

| Population | Denominator | Stated schedule | Stated terms | Neither | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Detailed shortlist | 831 | 184 | 52 | 605 | 0 |
| Eligible detailed records before grouping | 795 | 177 | 51 | 577 | 0 |
| Cleaned public rows | 715 | 146 | 46 | 532 | 0 |

Schedule and terms populations overlap. Public source counts below use each grouped row’s displayed representative. They do not count every underlying source posting.

| Displayed source | Public rows | Labels and counts |
| --- | ---: | --- |
| lever | 70 | Full-time: 41; Full-time; Regular: 1; Regular: 4; Freelance: 4; Contract: 1; Not stated: 18; Full-time; Contract: 1 |
| ashby | 64 | Full-time: 42; Internship: 1; Not stated: 16; Contract; Freelance: 1; Full-time; Internship: 1; Contract: 2; Part-time: 1 |
| greenhouse | 253 | Not stated: 227; Full-time: 19; Freelance: 2; Internship: 3; Contract: 2 |
| direct-employer | 1 | Not stated: 1 |
| workday | 194 | Not stated: 166; Full-time: 14; Contract: 7; Internship: 3; Part-time: 2; Full-time; Internship: 2 |
| icims | 92 | Not stated: 88; Part-time: 2; Internship: 1; Full-time: 1 |
| bamboohr | 41 | Contract: 1; Full-time: 14; Part-time; Contract; Freelance: 1; Internship: 4; Full-time; Permanent: 1; Not stated: 16; Part-time; Freelance: 2; Contract; Freelance: 1; Part-time: 1 |

The public CSV has the original 15 columns in their original positions, followed by Employment Type in column P. Internal evidence is absent from that CSV. Schema, coverage, instructions, manifest sizes, and dated/latest copies agree. The daily profile does not produce a formula CSV; formula parity and post-prune synchronization passed in isolation.

The normal URL check examined 744 rows. It pruned 29 deterministic failures and retained 12 ambiguous failed checks under the existing safe rules. The final count is 715. A retained ambiguous check does not prove a job is open. The package test returned WARN: 30 rows were last checked more than 7 days ago, including 5 more than 14 days ago. Its failure list was empty.

## Controlled count and identity comparison

On the same 836,867 canonical input records, both old and new selection rules used 998 strong-match candidates and selected 831 records. Both yielded 795 eligible records and 744 rows after location grouping. Selection and grouping deltas are zero on this input. Scores and identity keys were unchanged when employment fields were removed from those same 998 candidates.

The previous cleaned public package had 714 rows. The new package has 715 because safe pruning removed 29 rows rather than 30. Three application URLs changed while their JobKeys stayed the same. One additional Formlabs row was retained: its old check matched closed-page text, and its current check was Good. This does not establish an employer repost or reopening.

[Controlled comparison and score checks](../../verification/employment-type-release-20261024T142452Z/production/artifact-verification.json) · [Changed URLs with stable keys](../../verification/employment-type-release-20261024T142452Z/production/url-change-identities.json) · [Public row changes and saved checks](../../verification/employment-type-release-20261024T142452Z/production/public-row-changes.json)

## Defect found and corrected after the run

Bare Variable in occupational text was treated as a schedule. For example, Senior Variable Compensation Manager incorrectly conflicted with a structured Full-time value. A second issue treated valid variable hours or shifts as contradictory to Full-time or Part-time hours.

The correction requires an hours, shift, schedule, or time qualifier in free text. Structured and labeled Variable values remain valid. If hours are explicitly Full-time or Part-time, that category is displayed; compatible variability remains in evidence. Older unsupported matches retain their original RawValue, source field, URL, and observation date, with unknown Value, RejectedValue, and ReviewReason. This is a derived correction, not a new source check.

The export path validates the record shape first, applies this bounded correction, and then validates the resolved contract. This permits older normalized records to load without rewriting their source batches. Genuine Full-time versus Part-time contradictions still produce Needs review.

An isolated projection of the current 836,867-record feed changes 153 records. It produces zero invalid contracts and zero provenance differences. None of the 998 strong-match candidates changes. No production feed, package, history database, or backup was modified by this projection or the source fix.

**Remaining production gap:** the actual canonical file still contains the earlier classifications. The corrected code has not been verified through a new approved production release. The imported package is preserved. A new release must use a new package ID; this task did not perform it.

[Correction tests and applied files](../../verification/employment-type-release-20261024T142452Z/isolated/applied-parser-fix.json) · [Current-corpus projection](../../verification/employment-type-release-20261024T142452Z/isolated/current-corpus-candidate-projection.json)

## History and backup

**History: PASS.** The normal audit accepted package 20261024-0954 as snapshot 158. A separate read-only query confirmed 831 observations, all with employment status and valid JSON evidence. The database hash agrees with the accepted audit.

**Backup: FAILED.** The current run reported Unexpected backup files. The pending bundle contains all 3,303 required members and 3,304 additional ._ files with AppleDouble headers and com.apple.provenance metadata. The workflow’s restored audit and report comparison completed, but final bundle acceptance failed. The pending bundle was not promoted or treated as verified.

Pending bundle: `/Volumes/1Pugh/Public Job Feed Archives/daily-history-v1/.pending-daily-20261024T150337153Z-c4157863-62fc-4940-af26-d65164ae0dcb`.

The exact process that created the metadata files was not verified. Copying one observed sidecar into a synthetic isolated bundle reproduced the unchanged verifier’s rejection. That test is not a real database restore or backup retry. Strict extra-file and checksum checks remain in effect.

The retained LastVerified result is for package 20261024-0739 at 07:53 CDT, not this run. No current accepted backup exists. Backup recovery needs a separate reviewed action and approval. No substitute location, external cleanup, or backup retry was created.

[Current history/backup result](../../verification/employment-type-release-20261024T142452Z/production/reports/daily-history-backup.json) · [Read-only history checks](../../verification/employment-type-release-20261024T142452Z/isolated/history-readonly-verification.json) · [Backup file diagnosis](../../verification/employment-type-release-20261024T142452Z/production/backup-failure-diagnosis.json) · [Isolated rejection reproduction](../../verification/employment-type-release-20261024T142452Z/isolated/backup-sidecar-reproduction.json)

## Runtime

| Stage | This run seconds | Prior run seconds |
| --- | ---: | ---: |
| Step 1 | 409 | 859 |
| Step 2 | 926 | 856 |
| Step 3 | 64 | 65 |
| Step 4 | 21 | 20 |
| Step 5 | 52 | 48 |
| Step 6 | 1 | 1 |
| Step 7 | 76 | 67 |
| Package finalization | 0 | 0 |
| History and backup check | 839 | 768 |
| Step 8 | 0 | 1 |

Total launcher elapsed time was 2,388.318 seconds. Stage times are the launcher’s integer measurements; startup and other overhead need not sum exactly. The prior run used different boards and source results. Its timing does not isolate feature overhead. The earlier 54 ms shortlist benchmark is not the cost of a daily refresh.

## Preservation and remaining work

All 222 reports were preserved before the approved workflow replaced them. Saved contents and modification dates still match. Existing source-batch and dated-package metadata and link targets have zero changes and zero missing entries. The normal workflow updated its generated history README and validation output; their prior contents are retained. No imported package was repaired.

The two Greenhouse reports replaced during the earlier implementation task remain a historical preservation failure. Their prior timestamps were not invented or restored. This run caused no additional report-preservation failure.

The final code needs a new approved production release to qualify the parser correction. The failed backup needs reviewed recovery and a backup-only retry through the normal safeguards. These actions were not taken. The live Google Sheet remains unchanged.

## Acceptance ledger

Each JSON entry gives a requirement, status, evidence path, run ID, package ID, input hash, and limit. [Full acceptance records](../../verification/employment-type-release-20261024T142452Z/acceptance.json)

| Requirement | Status | Limit |
| --- | --- | --- |
| Baseline instructions, Git state, code and lock checks | PASS | No conflicting lock; code matched the baseline before the single launch. |
| Preserve current reports before normal overwrite | PASS | 222 reports retained with the same contents and modification dates; differences zero. |
| Earlier Greenhouse reports preserved before their original overwrite | FAIL | Earlier reports had already been replaced before this task. Their previous timestamps are not recoverable. |
| All remaining normal-suite commands run in isolation | PASS | 38/38 pass. Fixed copy of saved data. Launcher path smoke test read original configuration under the same write/network restrictions. |
| Final correction passes the complete suite | PASS | 38/38 pass; parser, export, test and fixture bytes matched the applied source. |
| Final correction passes the current full-corpus projection | PASS | 836867 current records; 153 changed, zero invalid contracts or source-provenance differences; zero strong-match changes. No production file was rewritten. |
| No network requests during isolated checks | PASS | OS denied network access. One initial HTTPS call was blocked before transmission. Node guard and containment self-test retained. |
| Exactly one normal production refresh | PASS | One launch marker; normal launcher exited 0. No retry or second refresh. |
| Distinct package from this refresh | PASS | Package 20261024-0954 belongs to this run. |
| Public column is appended; evidence is internal | PASS | Original 15 headers are unchanged. Employment Type is column P. No internal evidence is public. |
| Public labels validate | PASS | 715 rows: schedule 146, terms 46, neither 532, conflicts 0. Schedule and terms overlap. |
| Schema, final coverage, and import range agree | PASS | Schema and final coverage agree with 715 rows and range A1:P716. |
| Manifest sizes and formats agree | PASS | No manifest size or format differences in dated and latest copies. |
| Latest and dated copies agree | PASS | Public CSV, schema, coverage, and import instructions have equal hashes. |
| Current URL check and safe prune completed | PASS | 744 rows checked; 29 deterministic failures removed; 12 ambiguous checks retained; final 715. |
| Production suite belongs to this run | PASS | 38 commands passed for run 455b725d-9dc4-48c2-bb7a-8e0b24bea81c. These tests preceded the parser fix. |
| Current refresh and package validation pass | PASS | Refresh validation passed with no failures. Package test WARN: 30 rows last checked more than 7 days ago; 5 of these more than 14 days ago. |
| Detailed CSV contains valid JSON arrays | PASS | All 831 detailed rows have valid evidence arrays. |
| Shortlist evidence survives detailed CSV | PASS | No evidence differences between shortlist and detailed CSV. |
| Canonical employment contract and observation dates validate | PASS | 836867 records passed shape/date checks; 35565 new observations and 801302 retained. Semantic defects are listed separately. |
| Free text Variable values require an explicit schedule | FAIL | FAIL in actual production output: 128 records have unqualified Variable text evidence. These are not all confirmed occupational false positives. |
| Variable hours or shifts do not contradict stated full-time or part-time hours | FAIL | FAIL in actual production output: 55 records have Variable and one known hours category marked as a conflict. This population overlaps the preceding check. |
| New normalized batch evidence survives merge | PASS | All 35563 collected batch records matched their canonical employment contracts. |
| Controlled selection reproduces actual shortlist | PASS | Same-input selection reproduced 831 records from 998 strong-match candidates. |
| Final public labels trace to current grouped shortlist | PASS | No differences between public labels and grouped shortlist evidence. |
| Employment fields do not change scores or identity keys on the same inputs | PASS | 998 strong-match candidates: no score or identity-key changes. |
| History result belongs to this run and package | PASS | Current report has run 455b725d-9dc4-48c2-bb7a-8e0b24bea81c; History PASS and Backup FAILED. Prior LastVerified is not current success. |
| History current package audited and stored | PASS | Read-only query: 831 observations, no missing status, no invalid evidence JSON. Audit passed for package 20261024-0954. |
| Backup for this run accepted | FAIL | History PASS; Backup FAILED: Unexpected backup files. Prior LastVerified is not a backup for this run. |
| Backup failure diagnosed without bypassing validation | PASS | 3304 extra AppleDouble-header sidecars, no missing payload members. Synthetic isolated fixture reproduces strict rejection. No external repair or retry. |
| Corrected parser observed in a new production release | NOT VERIFIED | Fix was applied only after the approved run. Existing canonical output and imported package remain unchanged. |
| Source fields that need additional Workday or iCIMS detail requests | NOT VERIFIED | Outside this release; no additional detail requests were added. |
| Raw successful ATS response bodies independently inspected | NOT VERIFIED | Normal collector does not retain successful response bodies. Actual trace starts at normalized batch evidence. |
| All older source batches and dated packages preserved | PASS | No existing batch or dated-package metadata or link target changed or disappeared. Full byte hashes of all 69 GB of old batches were not computed. |
| Live Sheet unchanged | PASS | No import, table resize, filter, pivot, or Sheet API write was performed. |
| No commit, push, PR, dependency, schedule or Job Finder-record change | PASS | Only feature source, tests, documentation and approved normal-workflow outputs changed. Local consumer export belongs to this repository. |

Final file hashes, source hashes, 58 local links, JavaScript syntax, and Git whitespace checks passed. No active refresh or backup process or lock remains. See [final checks](../../verification/employment-type-release-20261024T142452Z/final-review.json).

## Exact CSV and proposed Sheet range

CSV: [/Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/20261024-0954/01_good_documentation_jobs.csv](/Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/20261024-0954/01_good_documentation_jobs.csv)

Proposed main-table, filter, and pivot source range: `01_good_documentation_jobs!A1:P716`. It includes the header and all 715 data rows. No Sheet import, resize, filter, or pivot change was made.

## Paths changed by this verification task

- src/lib/employment-type.js
- src/lib/job-export.js
- src/scripts/test-employment-type.js
- src/scripts/fixtures/employment-type/README.md
- src/scripts/fixtures/employment-type/variable-compensation-normalized-20261024.json
- src/scripts/fixtures/employment-type/variable-hours-normalized-20261024.json
- README.md
- docs/features/employment-type.md
- docs/features/employment-type-verification.md
- docs/features/employment-type-release-verification-20261024.md
- verification/employment-type-release-20261024T142452Z/ — baseline, isolated-test, and production evidence.

Pre-existing feature edits remain. The approved normal workflow changed generated data and reports. No commit, push, pull request, dependency installation, schedule change, publication, or Job Finder-record change was made.
