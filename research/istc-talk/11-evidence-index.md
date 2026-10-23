# Source and evidence index

Research date: 2026-10-22. Repository baseline: `73ec53ddbdc8162a5d1b32823b9c00149b92219a`. Many runtime files were already modified or untracked. “Current” below means the inspected local implementation. It does not mean all changes are committed, deployed, or freshly tested.

Confidence values:

- **Confirmed:** the named source directly supports the bounded claim.
- **Partially Supported:** evidence supports part of the claim; the remaining limit is stated.
- **Needs Confirmation:** personal history, live state, or author intent is not established.

Paths below are repository-relative. Symbols give more stable references than line numbers alone. Metrics have dates and populations in [06-project-metrics.md](06-project-metrics.md). A saved report is evidence of its recorded result, not a new validation of production state.

## Current implementation and saved-result claims

### C01

**Claim:** Public Job Feed prepares local files for Good Doc Jobs. The inspected launcher does not upload to Google Sheets or publish to Substack.

**Evidence type:** current code and operating documentation. **Sources:** [README.md](../../README.md), “Names used in this guide” and “For maintainers”; [Refresh Job Feed.command](../../launchers/Refresh%20Job%20Feed.command), ordered command sequence; [build-gsheet-package.js](../../src/scripts/build-gsheet-package.js), package writers. **Confidence:** Confirmed for the inspected workflow. **Limit:** live Sheet content/access was not checked.

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

**Claim:** export selection joins rows through shared keys, then picks a deterministic representative with a recorded reason.

**Evidence type:** code and fixture. **Sources:** [dedupe-select.js](../../src/lib/dedupe-select.js), `getDedupeKeys`, `groupRows`, `compareRows`, `selectDedupedRows`; [test-dedupe-select.js](../../src/scripts/test-dedupe-select.js), `aliasRows`, `roleRows`. **Confidence:** Confirmed. **Limit:** stable selection does not prove semantic duplicate accuracy. Remote fields affect ranking ties.

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

**Claim:** posted date, fetch time, package time, and history observation are different concepts. Greenhouse DatePosted can fall back to updated_at.

**Evidence type:** code and saved warning. **Sources:** [jobs-normalize.js](../../src/lib/jobs-normalize.js), `getGreenhouseDatePosted`, Workday date mapping; [simple-public-export.js](../../src/lib/simple-public-export.js), `getAgeDays`, `formatUtcDateTime`; [test-gsheet-package-results.json](../../data/jobs/reports/test-gsheet-package-results.json), `PostedDateMovedForwardSamples`. **Confidence:** Confirmed. **Limit:** the saved continuing-role example is not proof of reposting.

### C16

**Claim:** simple public rows reduce fields and can group exact company/title variants across different locations while keeping additional application links.

**Evidence type:** code and fixture. **Sources:** [simple-public-export.js](../../src/lib/simple-public-export.js), `SIMPLE_PUBLIC_HEADERS`, `buildSimplePublicRow`; [build-gsheet-package.js](../../src/scripts/build-gsheet-package.js), `groupPublicSheetCountryPostings`, `getGroupedWorkArrangement`, `getEarliestPostedDate`, `getNewestLastChecked`; [test-gsheet-grouping.js](../../src/scripts/test-gsheet-grouping.js). **Confidence:** Confirmed. **Limit:** grouped arrangement/dates summarize members; a display row need not be one vacancy.

### C17

**Claim:** exact reviewed posting URLs can be excluded before public grouping, while raw records and scores remain available.

**Evidence type:** code, review, and saved audit. **Sources:** [public-package-eligibility.js](../../src/lib/public-package-eligibility.js), `packageEligibility`; [public-package-role-exclusions.json](../../src/config/public-package-role-exclusions.json); [job-scope-review-2026-10-12.md](../../docs/job-scope-review-2026-10-12.md); [public-package-exclusions.csv](../../data/jobs/gsheet-package/20261022-0622/public-package-exclusions.csv). **Confidence:** Confirmed. **Limit:** configured review decisions and affected rows in one package are different populations.

### C18

**Claim:** primary-link checking uses HTTP, destination, and selected content patterns; safe pruning retains ambiguous failures.

**Evidence type:** code and fixtures. **Sources:** [job-url-health.js](../../src/lib/job-url-health.js), `classifyUrlIssue`, `checkJobUrl`, `readResponseSample`; [check-gsheet-url-health.js](../../src/scripts/check-gsheet-url-health.js), `isPrunableFailure`, `shouldKeepReviewRow`; [test-job-url-health.js](../../src/scripts/test-job-url-health.js). **Confidence:** Confirmed. **Limit:** rate limit can have `ok=true` for retention. Not comprehensive employer or secondary-link verification.

### C19

**Claim:** the saved October 22 link check records 743 input rows, 30 pruned rows, 713 kept rows, and 12 retained ambiguous failures.

**Evidence type:** saved result and bounded CSV counts. **Sources:** [URL summary](../../data/jobs/gsheet-package/20261022-0622/01_good_documentation_jobs-url-check-summary.json), `CheckedAt`, `TotalRows`, `PrunedRows`, `KeptRows`; corresponding review and before-prune CSVs. **Confidence:** Confirmed as saved evidence. **Limit:** check time is `2026-10-22T11:23:47.980Z`; not current live status. See M07-M08.

### C20

**Claim:** daily comparison uses normalized application-link membership with a fallback key; added/removed do not prove employer posting or closure.

**Evidence type:** code and saved report. **Sources:** [us-remote-daily-report.js](../../src/lib/us-remote-daily-report.js), `jobKey`, `compareRows`; [daily-jobs-review.js](../../src/lib/daily-jobs-review.js), comparison helpers; [all-remote-daily-report.md](../../data/jobs/reports/all-remote-daily-report.md), October 22/21 package summary. **Confidence:** Confirmed. **Limit:** URL, grouping, filtering, or source changes can alter membership. See M12.

### C21

**Claim:** the local history runtime detects the installed format; saved validation reports v2. History consumes dated package sources, separately from current-feed merge.

**Evidence type:** code/schema and saved validation. **Sources:** [job-history-runtime.js](../../src/lib/job-history-runtime.js), `detect`, `runHistory`; [jobs-history.js](../../src/lib/jobs-history.js), `discover`, `scan`; [job-history-storage.js](../../src/lib/job-history-storage.js), `TABLES`; [job-history-bounded-storage.js](../../src/lib/job-history-bounded-storage.js), schema creation; [validation.json](../../data/jobs/history/validation.json), `format`. **Confidence:** Confirmed for implementation and saved state. **Limit:** no database was opened for this task; a normal update is not migration approval.

### C22

**Claim:** raw detailed/public rows, resolved observations, public membership, and unmatched exceptions are separate history evidence.

**Evidence type:** code/schema and saved result. **Sources:** [jobs-history.js](../../src/lib/jobs-history.js), `scan`, raw and exception types; [job-history-storage.js](../../src/lib/job-history-storage.js), `TABLES`; [validation.json](../../data/jobs/history/validation.json), duplicate and exception warnings. **Confidence:** Confirmed. **Limit:** canonical resolution inherits identity assumptions. Counts are not interchangeable.

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

**Claim:** saved test dispatch reports PASS for 35 commands, while the package test artifact is WARN. Dispatch success and data warnings are different states.

**Evidence type:** code and saved results. **Sources:** [run-test-suite.js](../../src/scripts/run-test-suite.js), `executeTests`; [test-all-results.json](../../data/jobs/reports/test-all-results.json), `Tests`, `PackageRun`, timestamps; [test-gsheet-package-results.json](../../data/jobs/reports/test-gsheet-package-results.json), warnings; [refresh-output-validation.json](../../data/jobs/reports/refresh-output-validation.json). **Confidence:** Confirmed as saved evidence. **Limit:** no new test run; warning includes stale rows and a moved date. See M20.

### C27

**Claim:** the current local launcher holds an outer refresh lock, runs ordered validation, updates history, checks backup, and records run identity. Backup failure can leave a warning after feed checks.

**Evidence type:** code and saved receipts. **Sources:** [Refresh Job Feed.command](../../launchers/Refresh%20Job%20Feed.command), refresh lock, history-daily block, completion; [feed-refresh-lock.js](../../src/lib/feed-refresh-lock.js); [daily-history-backup.js](../../src/lib/daily-history-backup.js); [batch-history-ledger.js](../../src/lib/batch-history-ledger.js); [refresh-run.json](../../data/jobs/reports/refresh-run.json); [daily-history-backup.json](../../data/jobs/reports/daily-history-backup.json). **Confidence:** Confirmed for code and recorded run. **Limit:** runtime files contain uncommitted work. Morning receipt predates current HEAD and records a dirty tree. Receipt is not continuous backup assurance.

### C28

**Claim:** the repository schedule example requests passive index maintenance at 04:00 and 16:00, not direct public publication.

**Evidence type:** example configuration. **Sources:** [com.public-job-feed.maintain-index.plist.example](../../launchers/com.public-job-feed.maintain-index.plist.example), `ProgramArguments`, `StartCalendarInterval`; [Install Passive Job Index Refresh.command](../../launchers/Install%20Passive%20Job%20Index%20Refresh.command). **Confidence:** Confirmed as example configuration. **Limit:** installed/loaded state was not inspected. Do not state a guaranteed live schedule.

### C29

**Claim:** the saved full-feed summary records 837,215 records and associated labels/classifications on October 22.

**Evidence type:** saved producer summary. **Sources:** [public-job-feed-latest-summary.json](../../data/jobs/public/public-job-feed-latest-summary.json); [merge-batches.js](../../src/scripts/merge-batches.js), `createMergedSummary`; [test-release-results.json](../../data/jobs/reports/test-release-results.json). **Confidence:** Confirmed as saved counts. **Limit:** no full-feed recount. See M01-M04 for exact time and populations.

### C30

**Claim:** package `20261022-0622` has 713 final public rows; the saved daily report separates arrangement, explicit remote subsets, membership changes, and searchable-text metrics.

**Evidence type:** bounded CSV count and saved reports. **Sources:** [public jobs CSV](../../data/jobs/gsheet-package/20261022-0622/01_good_documentation_jobs.csv); [all-remote-daily-report.md](../../data/jobs/reports/all-remote-daily-report.md); [content-metrics.js](../../src/lib/content-metrics.js); [jobs-snapshot.js](../../src/lib/jobs-snapshot.js). **Confidence:** Confirmed for saved local data. **Limit:** not a live public Sheet count. Topic matches are mentions, not requirements. See M06, M09-M15.

### C31

**Claim:** the saved deduped-top summary records 1,003 input rows, 836 output rows, 167 removed rows, and 134 resolved multi-row groups.

**Evidence type:** saved summary and code. **Sources:** [dedupe summary](../../data/jobs/public/slices/deduped/public-job-feed-dedupe-summary.json); [dedupe-select.js](../../src/lib/dedupe-select.js), `selectDedupedRows` summary. **Confidence:** Confirmed as saved result. **Limit:** one selected view, not global duplicate elimination. See M05.

### C32

**Claim:** saved attempted coverage is 50,170/50,170 stable board keys at its October 22 morning report time.

**Evidence type:** saved report and counter implementation. **Sources:** [crawl-coverage-summary.json](../../data/jobs/reports/crawl-coverage-summary.json), `CoverageUnit`; [report-crawl-coverage.js](../../src/scripts/report-crawl-coverage.js); [board-coverage.js](../../src/lib/board-coverage.js). **Confidence:** Confirmed as saved evidence. **Limit:** attempted at least once, not successful or recent. See M16.

### C33

**Claim:** the later October 22 freshness report distinguishes recent attempts, successful snapshots, failed boards, due boards, and retry delay.

**Evidence type:** saved report and code. **Sources:** [board-freshness-report.json](../../data/jobs/reports/board-freshness-report.json), `GeneratedAt`, `StateGeneratedAt`, `Overall`; [report-board-freshness.js](../../src/scripts/report-board-freshness.js). **Confidence:** Confirmed as saved evidence. **Limit:** later than the morning feed; not one atomic population observation with it. See M17.

### C34

**Claim:** saved history validation reports 155 snapshots through October 22, distinct raw/resolved counts, 40 exceptions, and older source packages.

**Evidence type:** saved validation and companion description. **Sources:** [validation.json](../../data/jobs/history/validation.json), `generation`, `latest`, count fields, `warnings`, `header_variants`; [history README](../../data/jobs/history/README.md). **Confidence:** Confirmed as saved evidence. **Limit:** a package ID from June does not date the application's implementation. No live database audit ran. See M18-M19.

### C35

**Claim:** the manifest declares CommonJS, Node 26.x, DuckDB and better-sqlite3; the bounded baseline contains 228 source JavaScript files and 55 test command files.

**Evidence type:** manifest and derived file inventory. **Sources:** [package.json](../../package.json), `type`, `engines`, `dependencies`, `testSuites`; `src/` path inventory from `git ls-files --cached --others --exclude-standard`. **Confidence:** Confirmed for this baseline. **Limit:** includes uncommitted files. File counts do not measure test assertions or quality. See M21.

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

## Historical claims from Git and dated records

Git author dates below establish recorded changes. They do not establish first invention or public release. Commit IDs are local reachable history; no remote access ran.

### H01

**Claim:** the earliest inspected project commit already contains the JavaScript/shell feed application. **Type:** Git tree/history. **Commit:** `4b257ee8`, author date 2026-08-13. **Paths:** `package.json`, `src/lib/ats/`, `src/scripts/`, `launchers/`. **Reference:** `git ls-tree -r 4b257ee8` and initial commit stat. **Confidence:** Confirmed. **Limit:** imported code can predate the commit. No workbook/Power Query path was found in the inspected reachable path history.

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

**Type:** dated operational review and result, not Git release history. **Sources:** [job-history-production-migration-review.md](../../docs/plans/job-history-production-migration-review.md), acceptance and installed-data sections; [results JSON](../../docs/plans/job-history-production-migration-results.json), `status`, `generation`, checks. **Commit:** no isolated commit of all runtime work established. **Confidence:** Confirmed as saved acceptance record. **Limit:** receipt covers 152 snapshots. Current saved validation covers 155. Old prototype reviews do not override the later acceptance, and old backups need not contain later history.

### H11

**Claim:** reviewed exact-posting scope exclusions were committed on October 12. **Type:** Git change and review. **Commit:** `16e43cfb`, 2026-10-12. **Paths:** `src/config/public-package-role-exclusions.json`, `src/lib/public-package-eligibility.js`, `docs/job-scope-review-2026-10-12.md`. **Confidence:** Confirmed. **Limit:** title words alone do not define the exclusion policy.

### H12

**Claim:** current HEAD indexes completed reviews and records a narrow documentation cleanup. **Type:** Git change. **Commit:** `73ec53dd`, 2026-10-22. **Paths:** `docs/plans/README.md` and cleanup record links. **Confidence:** Confirmed. **Limit:** does not commit the many existing runtime changes. It is not the revision recorded in the morning refresh receipt.

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
| Start-here freshness | October 22 orientation range starts June 25. | Post-prune package validation reports June 30 as the oldest final row and five rows older than 14 days. | Use final-row evidence for final freshness; label orientation metadata as a wider/pre-cleanup view. Do not hide warnings. |
| PASS, WARN, COMPLETE | Saved dispatch says PASS; launcher says COMPLETE. | Package result says WARN. Later board report has many current failures. Dispatcher checks exit codes; launcher backup failure can be a warning. | Keep execution success, warning state, freshness, and source health separate. |
| Coverage and population | Orientation says 100% coverage. Full and public reports have different totals. | Coverage unit is ATS plus slug attempted at least once. Public rows are filtered/grouped/pruned. | Put the population and source time next to each count. |

## Recheck before using the evidence publicly

1. Use the dated package/report, not an unqualified `latest` path, for a fixed talk claim.
2. Recheck current source symbols if code changes after this research.
3. Confirm live Sheet access and capture a dated image only with a permitted review.
4. Keep local file paths, diagnostic previews, backup details, and operation records out of audience screenshots.
5. Confirm personal history and author judgment with Adam. No score, history event, or saved response supplies those facts.
