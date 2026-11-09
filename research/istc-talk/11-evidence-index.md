# Source and evidence index

Review date: October 27, 2026. Repository baseline: `f4af4c2a8352daa89f31d3abb77bb43edd67a6df`. Six staged files existed before this task. Current implementation means the inspected local files. Saved operation results retain their own dates. No application test or production workflow ran for this review. The earlier research version remains in commit `f40a789`.

Confidence values:

- **Confirmed:** the named source directly supports the bounded claim.
- **Partially Supported:** evidence supports part of the claim; the remaining limit is stated.
- **Needs Confirmation:** personal history, live state, or author intent is not established.

Paths below are repository-relative. Symbols give more stable references than line numbers alone. Metrics have dates and populations in [06-project-metrics.md](06-project-metrics.md). A saved report is evidence of its recorded result, not a new validation of production state.

## Current implementation and saved-result claims

### C01

**Claim:** Public Job Feed prepares local files for Good Doc Jobs. Its normal launcher does not upload to Google Sheets or publish to Substack.

**Evidence type:** current code and operating documentation. **Sources:** [README.md](../../README.md), opening and maintainer guidance; [Refresh Job Feed.command](../../launchers/Refresh%20Job%20Feed.command), ordered commands; [build-gsheet-package.js](../../src/scripts/build-gsheet-package.js), package writers. **Confidence:** Confirmed for this workflow. **Limit:** separate saved publication evidence is C45-C46. No live access check ran here.

### C02

**Claim:** six configured public catalog definitions feed normalized board and crawl data; catalog validation can retain usable prior inputs.

**Evidence type:** code. **Sources:** [catalog-sources.js](../../src/config/catalog-sources.js), exported array; [catalog-refresh.js](../../src/lib/catalog-refresh.js), `parseCatalogText`, `fetchCatalog`; [build-crawl-queue.js](../../src/scripts/build-crawl-queue.js), board and queue outputs. **Confidence:** Confirmed. **Limit:** catalog membership is not verified employer coverage. No external catalog request ran here.

### C03

**Claim:** routine batch collection imports Ashby, Greenhouse, Lever, Workday, BambooHR, and iCIMS. TalentBrew is a separate probe. Collection is bounded.

**Evidence type:** code. **Sources:** [fetch-batch-jobs.js](../../src/scripts/fetch-batch-jobs.js), `supportedAts`, provider imports, `bestEffortAts`; [workday.js](../../src/lib/ats/workday.js), `fetchWorkdayBoard` and `maximumJobs`; [icims.js](../../src/lib/ats/icims.js), `fetchICIMSBoard` and `maximumPages`; [probe-talentbrew-board.js](../../src/scripts/probe-talentbrew-board.js). **Confidence:** Confirmed. **Limit:** a code cap is not proof that a particular board lost results.

### C04

**Claim:** provider normalizers map content into shared fields and retain selected source identifiers, URLs, and fetch time. The normalized feed is not a full raw-response archive.

**Evidence type:** code and schema. **Sources:** [jobs-normalize.js](../../src/lib/jobs-normalize.js), `normalizeGenericAtsJob` and provider normalizers; [job-export.js](../../src/lib/job-export.js), `publicFeedHeaders`. **Confidence:** Confirmed. **Limit:** descriptions can be stripped text, snippets, or title fallback. Raw-prefixed fields are selected values.

### C05

**Claim:** the operational path is the launcher and scripts importing `src/lib/` helpers. The new core/API structure has not replaced every operational route.

**Evidence type:** call sites and migration record. **Sources:** [package.json](../../package.json), scripts; [fetch-batch-jobs.js](../../src/scripts/fetch-batch-jobs.js), normalizer/provider imports; [job-export.js](../../src/lib/job-export.js), `buildJobExportArtifacts`; [src/index.js](../../src/index.js), `processCatalog`; [MIGRATION_CONTRACT.md](../../docs/archive/refactoring/MIGRATION_CONTRACT.md), migration register. **Confidence:** Confirmed. **Limit:** the archived register is context; current imports control the workflow claim.

### C06

**Claim:** boards use ATS plus slug identity and status-based due intervals, with exponential failure delay capped at seven days.

**Evidence type:** code. **Sources:** [board-registry.js](../../src/lib/board-registry.js), `boardKey`, `enumerateBoardEntries`; [board-state.js](../../src/lib/board-state.js), `STATUS_INTERVAL_HOURS`, `getIntervalHours`, `selectBoards`; [maintain-board-index.js](../../src/scripts/maintain-board-index.js), option parsing and deadline; [refresh-job-index.js](../../src/scripts/refresh-job-index.js), `main`, parallel catalog/due calls and later catalog-delta pass. **Confidence:** Confirmed. **Limit:** these are configured rules, not guaranteed check times.

### C07

**Claim:** merge selects the latest successful or empty board result; errors do not act as successful emptiness. A newer empty result suppresses older rows.

**Evidence type:** code and fixtures. **Sources:** [merge-batches.js](../../src/scripts/merge-batches.js), `updateLatestLiveFetchByBoard`, `keepFreshBoardRow`, `loadDerivedLatestFetchByBoard`; [batch-history.js](../../src/lib/batch-history.js), `isLiveFetch`; [test-batch-history.js](../../src/scripts/test-batch-history.js). **Confidence:** Confirmed. **Limit:** preserving prior rows can retain stale jobs. Absence is not closure evidence.

### C08

**Claim:** approved direct-employer intake extracts JobPosting data; temporary failures can retain a verified cached row, while 404/410 invalidates it.

**Evidence type:** code and test source. **Sources:** [curated-submissions.js](../../src/lib/curated-submissions.js), `parseJobPosting`, `loadCuratedSubmissionRows`, `confirmedClosed`; [test-curated-submissions.js](../../src/scripts/test-curated-submissions.js). **Confidence:** Confirmed. **Limit:** merge can make network requests through this route. Approval alone is not proof of current inclusion.

### C09

**Claim:** broad-feed duplicate fields use ATS/raw-ID job keys, query-free canonical URLs, and company/title/location keys. Those rules have identity risks.

**Evidence type:** code plus bounded interpretation. **Source:** [job-dedupe.js](../../src/lib/job-dedupe.js), `getJobKey`, `getCanonicalURLKey`, `getCompanyTitleLocationKey`, `addDedupeFields`. **Confidence:** Confirmed for the algorithm. **Limit:** raw IDs may be board-local; URL query removal can erase job identity. The code does not prove universal unique-vacancy identity.

### C10

**Claim:** export selection resolves strong posting keys before weak duplicate keys. It selects a deterministic representative, records its reason, and merges employment evidence.

**Evidence type:** code and fixtures. **Sources:** [dedupe-select.js](../../src/lib/dedupe-select.js), `getDedupeKeys`, `groupRows`, `compareRows`, `selectDedupedRows`; [test-dedupe-select.js](../../src/scripts/test-dedupe-select.js), alias fixtures; [test-employment-type.js](../../src/scripts/test-employment-type.js), variants, same-posting conflicts, and bridge tests. **Confidence:** Confirmed as implementation. **Limit:** URL query removal still risks identity errors. Remote fields affect ranking ties. Employment variants restrict weak grouping, not a strong posting match.

### C11

**Claim:** Writer Fit v3 is rule-based, with title/domain/quality signals, non-writer penalties, title exceptions, and a high-tier guardrail. It does not add remote points.

**Evidence type:** code and fixture inputs. **Sources:** [writer-fit-score.js](../../src/lib/writer-fit-score.js), `scoreWriterFit`, `applyV3Penalties`, `applyTitleMatchFloor`; [writer-fit-regression.json](../../test/writer-fit-regression.json); [test-scoring.js](../../src/scripts/test-scoring.js), fixture evaluation. **Confidence:** Confirmed. **Limit:** not personal matching or measured precision/recall. The test script writes saved results and was not run here.

### C12

**Claim:** the top predicate is tier A/B OR `STRONG_MATCH` title bucket; daily/full profiles create different slice sets.

**Evidence type:** code. **Source:** [export-public-slices.js](../../src/scripts/export-public-slices.js), `isStrongMatch`, `getSlices`, `getDedupedSliceInputs`, option parsing. **Confidence:** Confirmed. **Limit:** the top set is not A/B-only, and daily mode does not imply every full slice was refreshed.

### C13

**Claim:** remote and U.S.-eligibility values are text heuristics. Hybrid signals take priority; North America/Americas can contribute a broad U.S. signal.

**Evidence type:** code. **Source:** [work-arrangement.js](../../src/lib/work-arrangement.js), `getRemoteStatus`, `getUSRemoteEligible`, `detectWorkArrangement`. **Confidence:** Confirmed. **Limit:** not a specific state, country authorization, or employer-confirmed eligibility check.

### C14

**Claim:** public remote reports require Remote arrangement plus explicit location evidence. Generic Remote is excluded; a multi-region row can qualify twice.

**Evidence type:** code and fixture tests. **Sources:** [us-remote-daily-report.js](../../src/lib/us-remote-daily-report.js), `hasExplicitUsLocation`, `isConfirmedUsRemote`; [international-remote-daily-report.js](../../src/lib/international-remote-daily-report.js), `hasExplicitInternationalLocation`, `isConfirmedInternationalRemote`; [U.S. tests](../../src/scripts/test-us-remote-daily-report.js); [international tests](../../src/scripts/test-international-remote-daily-report.js). **Confidence:** Confirmed. **Limit:** cautious lexical rules can miss eligible jobs. “Confirmed” in a function name means this rule's result.

### C15

**Claim:** posted date, fetch time, package time, and historical observation have different meanings. Greenhouse DatePosted can fall back to updated_at.

**Evidence type:** code and saved validation. **Sources:** [jobs-normalize.js](../../src/lib/jobs-normalize.js), `getGreenhouseDatePosted` and Workday mapping; [simple-public-export.js](../../src/lib/simple-public-export.js), `getAgeDays`, `formatUtcDateTime`; [test-gsheet-package.js](../../src/scripts/test-gsheet-package.js), forward-date and age checks. **Confidence:** Confirmed as implementation. **Limit:** the October 25 saved package test has zero forward-date warnings. Do not reuse an overwritten earlier report as current observed evidence.

### C16

**Claim:** public rows reduce fields and can group exact normalized company/title/Employment Type variants across different locations while retaining additional application links.

**Evidence type:** code and fixtures. **Sources:** [simple-public-export.js](../../src/lib/simple-public-export.js), `SIMPLE_PUBLIC_HEADERS`, `buildSimplePublicRow`; [build-gsheet-package.js](../../src/scripts/build-gsheet-package.js), `getPublicSheetGroupingKey`, `groupPublicSheetCountryPostings`, `getGroupedWorkArrangement`, date helpers; [grouping tests](../../src/scripts/test-gsheet-grouping.js); [employment tests](../../src/scripts/test-employment-type.js). **Confidence:** Confirmed. **Limit:** 16 public columns. Conflict rows stay separate. Dates and arrangement can summarize several postings; a display row is not necessarily one vacancy.

### C17

**Claim:** exact reviewed posting URLs can be excluded before public grouping, while raw records and scores remain available.

**Evidence type:** code, review, and saved audit. **Sources:** [public-package-eligibility.js](../../src/lib/public-package-eligibility.js), `packageEligibility`; [public-package-role-exclusions.json](../../src/config/public-package-role-exclusions.json); [job-scope-review-2026-10-12.md](../../docs/job-scope-review-2026-10-12.md); [public-package-exclusions.csv](../../data/jobs/gsheet-package/20261025-0724/public-package-exclusions.csv). **Confidence:** Confirmed. **Limit:** configured review decisions and affected rows in one package are different populations.

### C18

**Claim:** primary-link checking uses HTTP, destination, and selected content patterns; safe pruning retains ambiguous failures.

**Evidence type:** code and fixtures. **Sources:** [job-url-health.js](../../src/lib/job-url-health.js), `classifyUrlIssue`, `checkJobUrl`, `readResponseSample`; [check-gsheet-url-health.js](../../src/scripts/check-gsheet-url-health.js), `isPrunableFailure`, `shouldKeepReviewRow`; [test-job-url-health.js](../../src/scripts/test-job-url-health.js). **Confidence:** Confirmed. **Limit:** rate limit can have `ok=true` for retention. Not comprehensive employer or secondary-link verification.

### C19

**Claim:** the saved October 25 link check records 761 checked rows, 29 pruned rows, 732 kept rows, and 12 retained uncertain failures.

**Evidence type:** dated saved result and bounded CSV counts. **Sources:** [URL summary](../../data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs-url-check-summary.json), `CheckedAt`, `TotalRows`, `PrunedRows`, `KeptRows`, `KeptAmbiguousFailureRows`; the same package's before-prune CSV. **Confidence:** Confirmed as saved evidence. **Limit:** check time is `2026-10-25T12:26:13.346Z`; not live status. See M07-M08.

### C20

**Claim:** daily comparison uses normalized application-link membership with a fallback key. Added and removed do not establish employer posting or closure.

**Evidence type:** code and fixed saved report. **Sources:** [us-remote-daily-report.js](../../src/lib/us-remote-daily-report.js), `jobKey`, `compareRows`; [daily-jobs-review.js](../../src/lib/daily-jobs-review.js), comparison helpers; [October 25 report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/all-remote-daily-report.md), package IDs and membership counts. **Confidence:** Confirmed. **Limit:** URL, grouping, filtering, and source changes can change membership. M12 describes October 24 to 25; N07 describes October 25 to 26.

### C21

**Claim:** the history runtime detects the installed format. Saved validation reports v2. History consumes dated package sources, separately from current-feed merge.

**Evidence type:** code/schema and saved result. **Sources:** [job-history-runtime.js](../../src/lib/job-history-runtime.js), `detect`, `runHistory`; [jobs-history.js](../../src/lib/jobs-history.js), `discover`, `scan`; [job-history-storage.js](../../src/lib/job-history-storage.js), `TABLES`; [job-history-bounded-storage.js](../../src/lib/job-history-bounded-storage.js), schema creation; [October 25 validation copy](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json), `historyValidation.format`; [later local validation](../../data/jobs/history/validation.json), generation and latest package. **Confidence:** Confirmed for code and saved states. **Limit:** no database was opened here. A normal update is not a format migration.

### C22

**Claim:** raw detailed/public rows, selected observations, public membership, and unmatched exceptions are separate history populations.

**Evidence type:** code/schema and saved result. **Sources:** [jobs-history.js](../../src/lib/jobs-history.js), `scan`; [job-history-storage.js](../../src/lib/job-history-storage.js), `TABLES`; [fixed validation copy](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json), `historyValidation` counts and warnings. **Confidence:** Confirmed. **Limit:** canonical resolution inherits identity assumptions. Ten excess raw detailed rows and 40 public exceptions remain in the October 25 population. Counts are not interchangeable.

### C23

**Claim:** lifecycle code derives first observation, absence, return, content change, and schema change with uncertainty flags.

**Evidence type:** code and saved qualification record. **Sources:** [job-history-lifecycle.js](../../src/lib/job-history-lifecycle.js), `installLifecycleViews`, `compareContent`, `lifecycleEvents`; [test-job-history-lifecycle.js](../../src/scripts/test-job-history-lifecycle.js); [full-memory review](../../docs/plans/job-history-full-memory-review.md), lifecycle comparisons. **Confidence:** Confirmed as implementation and saved qualification. **Limit:** events describe feed presence; no closure/repost inference. Some comments retain earlier prototype wording.

### C24

**Claim:** SQL compatibility views and historical reports support package analysis; their values are not market-wide statistics.

**Evidence type:** SQL in code and saved report. **Sources:** [job-history-sql-compatibility.js](../../src/lib/job-history-sql-compatibility.js), compatibility view definitions; [jobs-history.js](../../src/lib/jobs-history.js), `views`; [jobs-history-report.js](../../src/lib/jobs-history-report.js), `coverageChange`, `renderReport`; [jobs-history-report.md](../../data/jobs/reports/jobs-history-report.md). **Confidence:** Confirmed. **Limit:** no coverage-threshold crossing does not establish unchanged collection coverage.

### C25

**Claim:** the default slice command still uses the legacy exporter. Streaming opt-in invokes non-publishing SQLite staging; test publication is separate.

**Evidence type:** dispatcher code and runbook. **Sources:** [export-public-slices-entrypoint.js](../../src/scripts/export-public-slices-entrypoint.js), `useStreaming` and target selection; [STREAMING_EXPORT_OPERATIONS.md](../../STREAMING_EXPORT_OPERATIONS.md), safety boundary; [export-public-slices-streaming-dry-run.js](../../src/scripts/export-public-slices-streaming-dry-run.js), `main`; [export-run-store.js](../../src/adapters/storage/export-run-store.js), `ExportRunStore`. **Confidence:** Confirmed. **Limit:** runbook performance figures are historical test figures, not current production measurements. The design's proposed streaming-slice-export module is not the implemented orchestration path.

### C26

**Claim:** the saved October 25 dispatch reports PASS for 38 commands, while the package result is WARN. Execution status and data warnings differ.

**Evidence type:** code and fixed saved results. **Sources:** [run-test-suite.js](../../src/scripts/run-test-suite.js), `executeTests`; [saved test results](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/test-all-results.json), Tests and PackageRun; [saved package result](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/test-gsheet-package-results.json), warnings; [output validation](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/refresh-output-validation.json). **Confidence:** Confirmed as saved evidence. **Limit:** no new tests ran. Warning population: 24 rows older than seven days, including five older than fourteen. See M20.

### C27

**Claim:** the current launcher holds an outer lock, checks package output, finalizes metadata before history, then records later status outside the imported package. Backup failure can remain a warning after feed checks.

**Evidence type:** code and saved receipts. **Sources:** [Refresh Job Feed.command](../../launchers/Refresh%20Job%20Feed.command), ordered blocks; [feed-refresh-lock.js](../../src/lib/feed-refresh-lock.js); [daily-history-backup.js](../../src/lib/daily-history-backup.js); [October 25 run receipt](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/refresh-run.json); [history and backup result](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/daily-history-backup.json). **Confidence:** Confirmed for code and the dated run. **Limit:** that receipt records an earlier revision with working-tree changes. C43 explains finalization; C44 explains later separate backup recovery. Receipt success is not continuous backup assurance.

### C28

**Claim:** the repository schedule example requests passive index maintenance at 04:00 and 16:00, not direct public publication.

**Evidence type:** example configuration. **Sources:** [com.public-job-feed.maintain-index.plist.example](../../launchers/com.public-job-feed.maintain-index.plist.example), `ProgramArguments`, `StartCalendarInterval`; [Install Passive Job Index Refresh.command](../../launchers/Install%20Passive%20Job%20Index%20Refresh.command). **Confidence:** Confirmed as example configuration. **Limit:** installed/loaded state was not inspected. Do not state a guaranteed live schedule.

### C29

**Claim:** the fixed October 25 artifact check records 836,592 broad feed records. A separate mutable October 26 summary records 836,383.

**Evidence type:** saved checks and producer summary. **Sources:** [fixed artifact report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json), `canonical.rows`, `controlledComparison`; [current summary](../../data/jobs/public/public-job-feed-latest-summary.json), GeneratedAt and TotalRows; [merge-batches.js](../../src/scripts/merge-batches.js), `createMergedSummary`. **Confidence:** Confirmed as saved counts. **Limit:** no full-feed recount. Do not use the current mutable summary as proof of the earlier count. See M01-M04 and C47.

### C30

**Claim:** package `20261025-0724` has 732 final public rows. Its fixed report separates arrangement, explicit remote subsets, membership, and searchable-text metrics.

**Evidence type:** bounded CSV count and fixed saved report. **Sources:** [dated public CSV](../../data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv); [fixed report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/all-remote-daily-report.md); [content-metrics.js](../../src/lib/content-metrics.js); [jobs-snapshot.js](../../src/lib/jobs-snapshot.js). **Confidence:** Confirmed as saved data. **Limit:** no current live count. Topic matches are mentions, not confirmed requirements. See M06, M09-M15, M25.

### C31

**Claim:** the October 25 same-input check records 1,017 strong candidates and 847 selected rows, a reduction of 170.

**Evidence type:** fixed saved comparison and code. **Sources:** [artifact report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json), `controlledComparison.strongCandidates`, `newSelected`; [dedupe-select.js](../../src/lib/dedupe-select.js), `selectDedupedRows`. **Confidence:** Confirmed as saved result. **Limit:** not proof of 170 duplicate vacancies. Both compared rule sets select 847 on this input. The later October 26 summary has different counts. See M05 and N02.

### C32

**Claim:** the October 25 saved report records attempted coverage of 50,170/50,170 stable board keys.

**Evidence type:** fixed report and counter implementation. **Sources:** [coverage summary](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/crawl-coverage-summary.json), CoverageUnit and GeneratedAt; [report-crawl-coverage.js](../../src/scripts/report-crawl-coverage.js); [board-coverage.js](../../src/lib/board-coverage.js). **Confidence:** Confirmed as saved evidence. **Limit:** attempted at least once, not successful or recent. See M16.

### C33

**Claim:** the October 25 saved board report distinguishes attempts, recent successful snapshots, failed states, due boards, and retry delay. A later October 27 report has its own counters.

**Evidence type:** saved reports and code. **Sources:** [fixed October 25 report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/board-freshness-report.json), GeneratedAt, StateGeneratedAt, Overall; [later mutable report](../../data/jobs/reports/board-freshness-report.json), same fields; [report-board-freshness.js](../../src/scripts/report-board-freshness.js). **Confidence:** Confirmed as saved evidence. **Limit:** reports are not one synchronized feed snapshot. See M17 and N06.

### C34

**Claim:** the fixed October 25 history check reports 159 snapshots, distinct raw/selected counts, 40 exceptions, and retained source anomalies. Later local validation reports 160 snapshots through October 26.

**Evidence type:** saved validation and description. **Sources:** [fixed report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json), `historyValidation`; [later local validation](../../data/jobs/history/validation.json), generation, latest, counts, warnings; [history README](../../data/jobs/history/README.md). **Confidence:** Confirmed as saved evidence. **Limit:** package history before the initial Git commit does not date code development. Current staged companions are prior user work. See M18-M19 and N05.

### C35

**Claim:** the manifest declares CommonJS, Node 26.x, DuckDB, and better-sqlite3. The October 27 path inventory contains 239 source JavaScript files and 59 test command files.

**Evidence type:** manifest and bounded derived inventory. **Sources:** [package.json](../../package.json), type, engines, dependencies, testSuites; `git ls-files --cached --others --exclude-standard src/`, unique paths. **Confidence:** Confirmed for this checkout. **Limit:** counts files, not assertions or quality. No runtime version or dependency installation was checked. See M21.

### C36

**Claim:** the repository has an MIT license; npm private status and repository visibility are different matters.

**Evidence type:** license and manifest. **Sources:** [LICENSE](../../LICENSE); [package.json](../../package.json), `private: true`. **Confidence:** Confirmed for local license/manifest. **Limit:** public repository reachability and contribution policy need Adam's confirmation.

### C37

**Claim:** some documentation describes wider or older behavior than current code, and some output labels use different populations.

**Evidence type:** source comparison. **Sources:** the [conflict register below](#documentation-and-code-conflicts), with paired files and symbols. **Confidence:** Confirmed for the named differences. **Limit:** no application or existing documentation fixes were made.

### C38

**Claim:** saved failure sampling distinguishes bad catalog metadata, response behavior, and unresolved cause instead of assigning one universal provider failure.

**Evidence type:** saved diagnostic review and derived fixture. **Sources:** [failure-evidence-sampling.md](../../docs/failure-evidence-sampling.md), September 29 result and control comparisons; [failure-probes-2026-09-29.json](../../src/scripts/fixtures/failure-probes-2026-09-29.json); [board-probe.js](../../src/lib/board-probe.js); [failure-diagnostics.js](../../src/lib/failure-diagnostics.js). **Confidence:** Partially Supported for causal interpretation; Confirmed for recorded sample behavior. **Limit:** sample results are not population failure-rate estimates. No probes ran here.

### C39

**Claim:** local full-history storage work retained failed memory attempts before later qualification; bounded processing preserved SQL/report meaning and source evidence.

**Evidence type:** dated implementer reviews, results, and code. **Sources:** [earlier full-candidate review](../../docs/plans/job-history-full-candidate-review.md); [later full-memory review](../../docs/plans/job-history-full-memory-review.md), “Failures retained,” measurements, SQL comparisons; [full-memory results](../../docs/plans/job-history-full-memory-results.json); [job-history-prototype-files.js](../../src/lib/job-history-prototype-files.js); [job-history-bounded-runner.js](../../src/lib/job-history-bounded-runner.js). **Confidence:** Confirmed as documented/saved qualification. **Limit:** not independently rerun, not current general performance, and not total disk savings. Migration acceptance is H10, a separate event.

### C40

**Claim:** Substack outputs are writing inputs. The full report resolves the selected detailed shortlist, rather than all collected records.

**Evidence type:** code and publication guide. **Sources:** [report-substack-full.js](../../src/scripts/report-substack-full.js); [substack-full-report.js](../../src/lib/substack-full-report.js); [substack-publication.md](../../docs/substack-publication.md); [README.md](../../README.md), daily reports. **Confidence:** Confirmed. **Limit:** the publication URL, selected article, editorial intent, and actual publication require Adam's input.

### C41

**Claim:** the README says the Sheet is free, optional support does not change feed access, and the project does not make application decisions or track outcomes.

**Evidence type:** documented product boundary. **Source:** [README.md](../../README.md), opening description, freshness, and product limits. **Confidence:** Partially Supported as documented policy. **Limit:** external service settings, reader usage, and outcomes were not audited. Do not infer traffic or success metrics.

### C42

**Claim:** employment extraction separates schedule, terms, status, and evidence. It requires explicit current-role text, retains unknown labels, and flags conflicts. Current rules distinguish Variable Compensation from variable hours.

**Evidence type:** code, source fixtures, synthetic cases, and dated release review. **Sources:** [employment-type.js](../../src/lib/employment-type.js), `extractEmploymentType`, `textEvidence`, `fieldsFromEvidence`, `ensureEmploymentType`, `employmentVariant`; [jobs-normalize.js](../../src/lib/jobs-normalize.js), provider mappings; [focused tests](../../src/scripts/test-employment-type.js); [integration tests](../../src/scripts/test-employment-integration.js); [fixture README](../../src/scripts/fixtures/employment-type/README.md); [October 25 review](../../docs/features/employment-type-release-verification-20261025.md), parser and source limits. **Commit:** `d5cf771`. **Confidence:** Confirmed as implementation and saved release evidence. **Limit:** no new detail requests. Successful raw responses were not archived. A normalized source excerpt is not an original response capture. The tested rejected-item migration was not observed in the current production batches.

### C43

**Claim:** a dashboard sync after history import caused a source-hash failure. The repair finalized package metadata before import and added guarded-write and pending-dashboard checks.

**Evidence type:** dated failure/repair records, code, and fixtures. **Sources:** [repair README](../../docs/plans/history-manifest-repair-20261023T135057Z/README.md), cause, scope, and retained failures; [package-history-guard.js](../../src/lib/package-history-guard.js), `withMutablePackage`, `checkPendingDashboards`; [package-manifest.js](../../src/lib/package-manifest.js), `manifestCsv`; [launcher](../../launchers/Refresh%20Job%20Feed.command), finalization order; [tests](../../src/scripts/test-history-package-finalization.js). **Commit:** `9606709`. **Confidence:** Confirmed for documented cause, code, and saved repair checks. **Limit:** guards protect those writers, not arbitrary filesystem edits. The earlier accepted dashboard can be older historical status.

### C44

**Claim:** backup-only recovery audits the accepted generation without collection or import. New bundles can use a narrow observed-metadata policy; full restore, audit, report comparison, and final acceptance remain required.

**Evidence type:** code and dated recovery checks. **Sources:** [daily-history-backup.js](../../src/lib/daily-history-backup.js), `backupOnly`, `createBackup`, `restoreAudit`; [history-backup-files.js](../../src/lib/history-backup-files.js), `verifyBundle`; [history-backup-metadata.js](../../src/lib/history-backup-metadata.js), `provenanceOnly`, `counterpart`; [tests](../../src/scripts/test-history-backup-metadata.js); [October 25 review](../../docs/features/employment-type-release-verification-20261025.md), separate failed and successful backup records. **Commit:** `d419fa1`. **Confidence:** Confirmed as code and saved recovery evidence. **Limit:** the metadata producer remains unknown. A later success does not rewrite the original failure or prove every future backup.

### C45

**Claim:** saved October 25 publication records report that the Sheet main table matched package `20261025-0724`, after separate pivot and hyperlink repairs.

**Evidence type:** retained operation report and machine read-back checks. **Sources:** [publication report](../../verification/sheet-publication-20261025-0724-20261025T221638Z/final/publication-report.md), main table, repairs, and acceptance; [full comparison](../../verification/sheet-publication-20261025-0724-20261025T221638Z/readback/full-final-comparison.json); [acceptance](../../verification/sheet-publication-20261025-0724-20261025T221638Z/final/acceptance.json). **Commit preserving records:** `f4af4c2`. **Confidence:** Confirmed as dated saved evidence. **Limit:** this review did not access the Sheet. The October 25 native visual check was not available. Later visual evidence is C46.

### C46

**Claim:** a later October 26 operation changed the Sheet remote pivot to exact Work Arrangement = Remote with no Location restriction. Saved checks match 125 expected groups and links; the browser check found clipped text at fixed widths.

**Evidence type:** saved operation and verification. **Sources:** [remote-view README](../../verification/remote-only-view-20261026103340Z/README.md); [verification.json](../../verification/remote-only-view-20261026103340Z/verification.json), status, rule, counters, mainUnchanged, visualStatus. **Commit preserving records:** `f4af4c2`. **Confidence:** Confirmed as dated evidence. **Limit:** this view differs from explicit-country report subsets. Neither establishes worldwide eligibility or live state today. No screenshot was captured for this research.

### C47

**Claim:** later local evidence describes package `20261026-0638` with 735 public rows and history through that package. The October 27 board report is a later observation.

**Evidence type:** bounded CSV count, saved summaries, and prior staged validation. **Sources:** [October 26 public CSV](../../data/jobs/gsheet-package/20261026-0638/01_good_documentation_jobs.csv); [its URL summary](../../data/jobs/gsheet-package/20261026-0638/01_good_documentation_jobs-url-check-summary.json); [employment coverage](../../data/jobs/gsheet-package/20261026-0638/employment-type-coverage.json); [full-feed summary](../../data/jobs/public/public-job-feed-latest-summary.json), GeneratedAt; [history validation](../../data/jobs/history/validation.json), generation/latest; [board report](../../data/jobs/reports/board-freshness-report.json), times and Overall. **Confidence:** Confirmed as saved local evidence. **Limit:** no Sheet publication of this later package was established. Mutable files may change. See N01-N07 and the fingerprints below.

## Historical claims from Git and dated records

Git author dates below establish recorded changes. They do not establish first invention or public release. Commit IDs are local reachable history; no remote access ran.

### H01

**Claim:** the earliest inspected project commit already contains the JavaScript/shell feed application. **Type:** Git tree/history. **Commit:** `4b257ee8`, author date 2026-08-13. **Paths:** `package.json`, `src/lib/ats/`, `src/scripts/`, `launchers/`. **Reference:** `git ls-tree -r 4b257ee8` and initial commit stat. **Confidence:** Confirmed. **Limit:** imported code can predate the commit. No original Excel/Power Query implementation was identified. The two `.xlsx` paths in later history are October 25 Sheet verification exports, not the origin workbook.

### H02

**Claim:** architecture extraction and streaming staging were added in August. **Type:** Git changes and current dispatcher. **Commits:** `7306e44b`, `b5cfb06b`, `596d2fe4`, author dates 2026-08-14. **Paths:** `src/core/`, `src/adapters/exports/`, `src/scripts/export-public-slices-entrypoint.js`, root streaming design/runbook. **Confidence:** Confirmed. **Limit:** current default is still legacy export; extraction is not full migration.

### H03

**Claim:** managed generated-data retention was introduced. **Type:** Git change. **Commit:** `5796d5a8`, 2026-08-25. **Paths:** `src/scripts/plan-batch-retention.js`, `src/scripts/retire-batches.js`, `src/lib/batch-history.js`, and `docs/storage-lifecycle.md`. **Confidence:** Confirmed for the commit milestone. **Limit:** the current local guide and code include later safeguards. Actual cleanup operations have separate evidence.

### H04

**Claim:** direct-employer submissions and TalentBrew probing were added as distinct features. **Type:** Git changes. **Commits:** `b60ba443`, `a38d658b`, 2026-08-24. **Paths:** `src/lib/curated-submissions.js`, curated scripts/tests; `src/lib/ats/talentbrew.js`, `src/scripts/probe-talentbrew-board.js`. **Confidence:** Confirmed. **Limit:** probing did not add TalentBrew to the routine six-provider list.

### H05

**Claim:** public ATS connection guides were added. **Type:** Git change. **Commit:** `ff97e87c`, 2026-08-29. **Paths:** `docs/connect-public-ats-job-boards.md`, `docs/ats-connections/`. **Confidence:** Confirmed. **Limit:** examples describe observed interfaces; some mappings differ from current code.

### H06

**Claim:** remote report shortcuts, reviewed link overrides, and empty Ashby shell removal were recorded before international/focused report additions. **Type:** Git changes. **Commits:** `5bedf13b`, `b06d4eb4`, `91d0ab6b`, `f6ab1a92` on 2026-09-01; `3a73da8d` on September 5; `ce1cdbc9` on September 8. **Paths:** `package.json`, `src/lib/job-url-health.js`, `src/lib/public-job-url-overrides.js`, remote report scripts/libs. **Confidence:** Confirmed. **Limit:** commit order is not user adoption evidence.

### H07

**Claim:** reporting and package provenance were strengthened in September. **Type:** Git change sets. **Commits:** `efba3249`, `03546311` on 2026-09-23; `e6c22f7e` on September 25. **Paths:** `src/lib/package-status.js`, `src/lib/board-coverage.js`, `src/scripts/record-refresh-run.js`, `src/scripts/validate-refresh-output.js`, dashboard/review scripts, launcher. **Confidence:** Confirmed. **Limit:** the author's motivating incident is not established by the change set alone.

### H08

**Claim:** content metrics and a local DuckDB history/report layer were committed on September 29. **Type:** Git changes. **Commits:** `765df58b`, `2faf9c2c`, 2026-09-29. **Paths:** `src/lib/content-metrics.js`, `src/lib/jobs-history.js`, `src/lib/jobs-history-report.js`, history scripts/tests, `package.json`. **Confidence:** Confirmed. **Limit:** later local v2 storage work is not part of this historical commit claim.

### H09

**Claim:** the September 27 study was committed later, and structured failure diagnostics followed. **Type:** Git changes plus dated research. **Commits:** `47e29988`, `3d85e440`, 2026-09-29. **Paths:** `reports/research/ats-behavior-2026-09-27/`, `src/lib/failure-diagnostics.js`, `src/lib/ats-error-classification.js`, investigation scripts. **Confidence:** Confirmed. **Limit:** study date, sample date, and commit date differ. Later sampling remains local work.

### H10

**Claim:** a saved receipt records accepted production history migration on 2026-10-19 at 20:50 CDT, after separate qualification.

**Type:** dated operational review and result, not Git release history. **Sources:** [job-history-production-migration-review.md](../../docs/plans/job-history-production-migration-review.md), acceptance and installed-data sections; [results JSON](../../docs/plans/job-history-production-migration-results.json), `status`, `generation`, checks. **Later runtime commit:** `bf15378`, October 23. The receipt itself dates the earlier operation. **Confidence:** Confirmed as saved acceptance record. **Limit:** receipt covers 152 snapshots. Current saved validation covers 155. Old prototype reviews do not override the later acceptance, and old backups need not contain later history.

### H11

**Claim:** reviewed exact-posting scope exclusions were committed on October 12. **Type:** Git change and review. **Commit:** `16e43cfb`, 2026-10-12. **Paths:** `src/config/public-package-role-exclusions.json`, `src/lib/public-package-eligibility.js`, `docs/job-scope-review-2026-10-12.md`. **Confidence:** Confirmed. **Limit:** title words alone do not define the exclusion policy.

### H12

**Claim:** an October 22 commit indexes completed reviews and a narrow documentation cleanup. **Type:** Git change. **Commit:** `73ec53dd`, 2026-10-22. **Paths:** `docs/plans/README.md` and cleanup records. **Confidence:** Confirmed. **Limit:** historical baseline only. It is not the current HEAD or the revision of every later runtime result.

### H13

**Claim:** compact history, fetch-event preservation, daily backup, and package-finalization controls were committed October 23. **Type:** Git changes. **Commits:** `bf15378`, `1f4f305`, `e3988e0`, `9606709`. **Paths:** `src/lib/job-history-bounded-storage.js`, `src/lib/batch-history-ledger.js`, `src/lib/daily-history-backup.js`, `src/lib/package-history-guard.js`, `launchers/Refresh Job Feed.command`, repair evidence. **Confidence:** Confirmed. **Limit:** some saved operation dates predate these commits.

### H14

**Claim:** employment fields, source evidence, schema propagation, and boundary tests were committed October 26. **Type:** Git change plus dated feature records. **Commit:** `d5cf771`. **Paths:** `src/lib/employment-type.js`, normalizers, exporters, grouping, tests, `docs/features/employment-type.md`. **Confidence:** Confirmed. **Limit:** implementation and release records describe October 24 to 25. The commit does not date first use.

### H15

**Claim:** a narrow metadata policy and backup-only route were committed October 26. **Type:** Git change. **Commit:** `d419fa1`. **Paths:** `src/lib/history-backup-metadata.js`, `src/lib/history-backup-files.js`, `src/lib/daily-history-backup.js`, backup tests. **Confidence:** Confirmed. **Limit:** recorded recovery attempts occurred earlier. Unknown metadata-file cause remains unknown.

### H16

**Claim:** release, recovery, Sheet publication, and remote-view evidence were saved in the October 26 documentation commit. **Type:** Git tree plus dated operation reports. **Commit:** `f4af4c2`. **Paths:** `docs/features/`, `verification/sheet-publication-20261025-0724-20261025T221638Z/`, `verification/remote-only-view-20261026103340Z/`. **Confidence:** Confirmed. **Limit:** publication date is October 25; remote-view change is October 26. These are not automatic launcher steps.

## Supplied history and unverified personal claims

### P01

**Claim:** the project began because documentation-job searching was frustrating; the first solution used Excel and Power Query; Adam publishes about the work through Working Notes.

**Evidence type:** Adam's supplied task request, outside the repository. **Repository path/commit:** none established for the original workbook or exact transition date. README and current publication guides support the present names and writing workflow, but not the complete origin story. **Confidence:** Needs Confirmation for presentation-ready dates, examples, motives, and personal wording. **Action:** obtain a workbook/image, one real search example, and a selected article. Do not fill the gaps with inference.

## Documentation and code conflicts

| Topic | Documentation or label | Current evidence | Research resolution |
| --- | --- | --- | --- |
| Source for the main public jobs table | `docs/public-job-feed-data.md` says the CSV feed is the source for the Sheets package. | `build-gsheet-package.js:loadTopMatchesRows`, `buildSimpleTopFiles` use deduplicated top JSON for simple jobs. Full CSV supports other package files/links. | Name top-match JSON as the simple table's direct source. Do not describe a full-CSV upload. |
| Completed architecture migration | Earlier `docs/archive/refactoring/REFACTOR_SUMMARY.md` language includes “Now wraps core pipeline.” | Provider normalizers remain implemented in `src/lib/jobs-normalize.js`; operational scripts call them. `src/adapters/ingestion/index.js` is a registry. The migration contract also warns about incomplete migration. | Show the actual script/lib route. Keep the API/core layer transitional. |
| API watchlist loading | The reusable API offers `loadWatchlist`; root `config/title-watchlist.md` exists. | `config-loader.js` sets a `config/` base and appends `config/title-watchlist.md`, which constructs a doubled config path. The normal refresh reads `data/config/job-titles.md` directly. | Static path concern only; not executed or fixed. Do not make the API wrapper the live demonstration entry point. |
| iCIMS source URL requirement | `docs/ats-connections/icims.md` says a slug-only board should be skipped until a verified public URL exists. | `src/lib/ats/icims.js:getICIMSFetchUrl` constructs a careers host when no direct URL exists. | Describe the fallback honestly and retain uncertainty about source identity. |
| Workday wrapper examples | `docs/ats-connections/workday.md` lists a `data` wrapper among accepted forms. | `workday.js:extractJobs` accepts top-level array, jobPostings, jobs, or data.jobPostings; not every generic data-array form. | Cite implementation for exact accepted shapes. Guide examples are not universal contracts. |
| Streaming readiness | Root design/runbook includes performance and later-publication plans. | The dispatcher opts into a non-publishing dry run only. | Call it staging/qualification, not the normal production publisher. |
| Early storage status | Earlier candidate reviews say migration has not started. | Later accepted migration record and saved v2 validation describe later states. | Keep each dated review's scope. Do not use an old phase limit as current status. |
| Dated status headings | Earlier feature sections say the live Sheet is unchanged or import is still pending. | The top dated status and saved publication records describe a later October 25 publication and October 26 view change. | Keep each dated section as historical evidence. Do not treat an earlier acceptance ledger as current status. |
| Publication checks | The October 25 publication report has no native visual acceptance. | The later October 26 remote-view record reports a browser check and clipped text. | Successful cell and link checks do not establish a readable layout. Keep both dates and limits. |
| PASS, WARN, COMPLETE | Saved dispatch says PASS; launcher says COMPLETE. | Package result says WARN. Later board report has many current failures. Dispatcher checks exit codes; launcher backup failure can be a warning. | Keep execution success, warning state, freshness, and source health separate. |
| Coverage and population | Orientation says 100% coverage. Full and public reports have different totals. | Coverage unit is ATS plus slug attempted at least once. Public rows are filtered/grouped/pruned. | Put the population and source time next to each count. |

## Recheck before using the evidence publicly

1. Use the dated package/report, not an unqualified `latest` path, for a fixed talk claim.
2. Recheck current source symbols if code changes after this research.
3. Confirm live Sheet access and capture a dated image only with a permitted review.
4. Keep local file paths, diagnostic previews, backup details, and operation records out of audience screenshots.
5. Confirm personal history and author judgment with Adam. No score, history event, or saved response supplies those facts.

## Fingerprints of selected mutable evidence

Observed October 27, 2026. A later file at the same path can differ. These hashes identify the bytes inspected, not an added archive or a fresh execution. Dates and populations remain in the metric register.

| Repository-relative path | SHA-256 |
| --- | --- |
| `data/jobs/public/public-job-feed-latest-summary.json` | `1de1989d6b12747aa9aa40d553803302bf8e5fc3a955915eb18a4f79865cb1fd` |
| `data/jobs/public/slices/deduped/public-job-feed-dedupe-summary.json` | `5ca077e9831df0b7339e7354c3c86ddfcbfa869909cf7aedf5fa388ef63155b2` |
| `data/jobs/reports/board-freshness-report.json` | `7b01d386922cb6d1b0574d20492552139d073d4cdaa5b67a1334263dea47a8b0` |
| `data/jobs/history/validation.json` | `5f5d16dda774b80607565ca9e574e0d7bf0b3075c100474f74dbf5bd61ab2186` |
| `data/jobs/reports/all-remote-daily-report.md` | `b17bd75e77e6d1a6450c46903bacbd3e35d21fa4c13f12317fba04bf3cb6947b` |
