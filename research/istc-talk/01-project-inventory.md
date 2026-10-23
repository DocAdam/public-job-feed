# Project inventory

Scope: local implementation inspected on 2026-10-22. See [the evidence rules](README.md#evidence-rules). This is a research summary.

## What this application is

Public Job Feed is a local data pipeline. It obtains public job-board data, applies common fields and review rules, and prepares files for a public Google Sheet called Good Doc Jobs. It also creates local reports and writing inputs. The main refresh is a Bash launcher that calls Node.js scripts. It is not a web server or a hosted job-search interface. Upload to the Sheet is manual. [C01](11-evidence-index.md#c01), [C05](11-evidence-index.md#c05)

## Main entry points

| Entry point | Plain-language purpose | Status and limit |
| --- | --- | --- |
| `launchers/Refresh Job Feed.command` | Runs the normal local refresh, package checks, reports, history update, and backup check. | Current local workflow. Has uncommitted changes. Do not run for this research. |
| `launchers/Refresh Job Feed.desktop-wrapper.sh` | Starts the repository launcher from a desktop entry. | Current wrapper. The recorded run identifies the launcher used. |
| `package.json` | Maps named commands to scripts and defines the main test list. | Current command register. It is not proof that every command runs on a schedule. |
| `src/scripts/refresh-job-index.js` | Refreshes source catalogs and maintains due boards under a maintenance lock. | Current. Does not publish the public Sheet. |
| `src/scripts/build-public-release.js` | Indexes saved batches, merges the current feed, builds slices and release support files. | Current. `daily` and `full` profiles differ. Full archive creation is off by default. |
| `src/scripts/build-gsheet-package.js` | Makes simple reader rows and detailed files for manual upload. | Current. The simple jobs table starts from deduplicated top-match JSON. |
| `src/scripts/check-gsheet-url-health.js` | Checks application links and can remove selected failures from the package. | Current. Network and write effects are possible; not run here. |
| `src/scripts/report-all-remote-daily.js` | Compares saved packages and makes daily views or a Substack input. | Current. Report generation writes files. |
| `src/scripts/jobs-history.js` | Runs history build, update, or audit through the format-aware runtime. | Current local history route. Not an ingestion source for the main feed. |
| `src/index.js` | Exposes a reusable JavaScript library interface. | Transitional API. The operational scripts still import provider and export helpers from `src/lib/`. |

Evidence: [C05](11-evidence-index.md#c05), [C21](11-evidence-index.md#c21), [C27](11-evidence-index.md#c27).

## Directory roles

| Directory or file | Role | Treatment in this investigation |
| --- | --- | --- |
| `src/scripts/` | Command entry points, report writers, tests, and worker processes. | Read as implementation. No scripts executed. |
| `src/lib/` | Active provider adapters, normalization, scoring, deduplication, reports, and storage helpers. | Primary operational evidence. |
| `src/core/` | Extracted models, classification, and a reusable pipeline engine. | Transitional implementation. Check consumers before calling it the production route. |
| `src/adapters/` | Export components, SQLite streaming store, and provider registry. | Mixed: active helper copies and optional staging workflows. |
| `src/config/` | Catalog sources and exact posting exclusions. | Current code configuration. |
| `config/` | Settings and an API-oriented watchlist. | Present, but not the normal refresh watchlist route. |
| `data/config/` | Operational title list and local intake configuration. | Read-only source material. Main scripts use `data/config/job-titles.md`. |
| `data/catalogs/` | Imported catalogs, normalized board data, crawl queue, and catalog reports. | Generated/imported evidence. No catalog scan or refresh. |
| `data/jobs/batches/` | Saved normalized job batches, fetch logs, and run markers. | Read-only collection results. No bulk traversal. |
| `data/jobs/index/` | Batch index, current successful/empty board results, and compressed fetch-event history. | Derived operational inputs. |
| `data/jobs/state/` | Maintenance state, locks, and curated cache. | Operational state. Not modified. |
| `data/jobs/public/` | Current full feed, selected views, data dictionary, and optional release archives. | Generated outputs. Summaries read; large feed not scanned. |
| `data/jobs/gsheet-package/` | Dated packages and the `latest` package. | Generated upload files and saved comparison history. |
| `data/jobs/history/` | DuckDB history database and companion validation/description files. | Saved results only. Database not opened. |
| `data/jobs/reports/` | Status, health, tests, comparison reports, and publication inputs. | Bounded saved evidence. Different reports can have different source dates. |
| `test/`, `src/scripts/fixtures/` | Small test inputs and historical examples. | Safe examples; not live employer facts. |
| `docs/`, root design files | Operating guides, proposed designs, and review records. | Cross-checked against code. |
| `docs/archive/` | Earlier architecture and migration records. | Historical evidence, not current operating instructions. |
| `docs/plans/` | Reviews, failed attempts, migration evidence, and completed operation records. | Historical receipts. Old helper scripts must not be rerun. |
| `reports/research/ats-behavior-2026-09-27/` | A prior saved-data study of provider behavior. | Historical research with its own population and date. |

## Technologies and dependencies

- **JavaScript and Node.js:** CommonJS modules and standalone command scripts. `package.json` declares Node `26.x`. This is a configured requirement, not a runtime version measured here.
- **Bash:** the normal refresh launcher uses `#!/bin/bash`. Other shell launchers support macOS operations.
- **SQL and DuckDB:** local history storage and analytical views. `@duckdb/node-api` is declared as `^1.5.5-r.5`.
- **SQLite:** disk-backed storage for the optional streaming slice workflow. `better-sqlite3` is declared as `^12.11.1`. This is separate from the DuckDB history store.
- **JSON, CSV, Markdown, and gzip JSONL:** configuration, machine records, reader exports, documentation, and monthly fetch history.
- **macOS launchd:** a repository example defines passive maintenance times. Installed and loaded schedule state was not checked.
- No React, web application framework, or TypeScript build is declared in the inspected package. Node built-ins supply HTTP fetch, filesystem access, child processes, hashing, and test assertions. Python helper files exist in review records; they are not the normal feed runtime.

See [C28](11-evidence-index.md#c28), [C35](11-evidence-index.md#c35). Dependency ranges describe the manifest; no installation or upgrade was attempted.

## Subsystem register

| Subsystem | Main files and symbols | Purpose and status |
| --- | --- | --- |
| Catalog intake | `src/config/catalog-sources.js`; `src/lib/catalog-refresh.js:parseCatalogText`, `fetchCatalog`; `src/scripts/refresh-catalogs.js` | Reads six catalog definitions from an external public catalog project. Checks array shape and large count drops. Keeps usable prior inputs on failure. Current. |
| Board identity and queue | `normalize-catalog.js`; `crawl-queue.js`; `board-registry.js:boardKey`, `buildBoardCatalog`; `build-crawl-queue.js` | Makes employer/board candidates and stable ATS plus slug keys. A board count is not an employer count. Current. |
| Board maintenance | `board-state.js:getIntervalHours`, `selectBoards`; `maintain-board-index.js` | Gives strong-match boards shorter intervals, slows repeated failures, and limits work by time and provider. Current. |
| Provider collection | `fetch-batch-jobs.js`; `src/lib/ats/{ashby,greenhouse,lever,workday,bamboohr,icims}.js` | Gets public JSON or HTML, depending on the provider. Six providers are in the normal batch route. Current, with best-effort providers and collection caps. |
| Additional provider probe | `src/lib/ats/talentbrew.js`; `probe-talentbrew-board.js`; `test-talentbrew-parser.js` | Implements a bounded TalentBrew parser/probe. It is not in the routine six-provider batch/merge list. Experimental/separate. |
| Curated intake | `curated-submissions.js:loadCuratedSubmissionRows`, `parseJobPosting`; `verify-curated-submissions.js` | Reads approved employer URLs, extracts structured JobPosting data, and retains a verified cached row on temporary failure. Current. Approval alone does not prove inclusion. |
| Field normalization | `jobs-normalize.js:normalize*Job`, `normalizeGenericAtsJob` | Maps differing provider fields to common fields. Keeps source URL, board, ID, and fetch time. Some descriptions can be title-only or partial. Current. |
| Classification | `title-match.js`, `title-review.js`, `work-arrangement.js`, `salary-detect.js`, `title-category.js` | Adds title, role, remote, location, and salary review signals. Rules are estimates, not employer-confirmed eligibility. Current. |
| Export quality and scoring | `export-validation.js`; `writer-fit-score.js:scoreWriterFit`; `job-export.js:buildJobExportArtifacts` | Flags poor records and applies Writer Fit v3, with reasons, penalties, and tier limits. Current. |
| Duplicate handling | `job-dedupe.js:addDedupeFields`; `dedupe-select.js:groupRows`, `selectDedupedRows` | Flags likely duplicates in the full feed, then selects a representative in convenience views. Records selection reasons. Current. |
| Current-feed merge | `merge-batches.js:updateLatestLiveFetchByBoard`, `keepFreshBoardRow` | Chooses latest successful or empty board snapshots. Errors do not erase the last usable snapshot. Current. |
| Full export and slices | `merge-batches.js:writePublicLatest`; `export-public-slices.js:isStrongMatch`, `getDedupedSliceInputs` | Writes canonical JSON/CSV and selected views. Daily mode skips some expensive full views. Current legacy exporter remains default. |
| Streaming export | `export-public-slices-entrypoint.js`; `src/adapters/exports/`; `STREAMING_EXPORT_OPERATIONS.md` | Optional SQLite staging and parity work. The opt-in invokes a non-publishing dry run. Test publication is not public-feed publication. |
| Public package | `build-gsheet-package.js:buildSimpleTopFiles`, `groupPublicSheetCountryPostings`; `simple-public-export.js` | Applies exact exclusions, reduces columns, groups exact company/title location variants, and retains other application links. Current. |
| Link validation | `job-url-health.js:checkJobUrl`, `classifyUrlIssue`; `check-gsheet-url-health.js:isPrunableFailure` | Checks HTTP, redirects, and selected page patterns. Removes configured deterministic failures in safe mode. Ambiguous failures remain. Current. |
| Daily reports | `us-remote-daily-report.js`, `international-remote-daily-report.js`, `all-remote-daily-report.js`, `jobs-snapshot.js` | Compares saved public lists and creates remote, role, country, and topic views. Current. |
| Job history | `jobs-history.js`; `job-history-runtime.js:detect`, `runHistory`; `job-history-bounded-storage.js`; `job-history-sql-compatibility.js` | Imports saved shortlist/public CSV history. Keeps raw rows, selected observations, and exceptions separately. Current saved database reports format v2. |
| Lifecycle and SQL reports | `job-history-lifecycle.js:installLifecycleViews`, `lifecycleEvents`; `jobs-history-report.js` | Finds observed presence, absence, content changes, and returns. These are feed events, not confirmed employer actions. Current local implementation. |
| Health and diagnostics | `http.js`; `failure-diagnostics.js`; `ats-error-classification.js`; `report-board-freshness.js`; `build-status-dashboard.js` | Separates response failure, stale data, crawl coverage, and package evidence. Current. Some diagnostic extensions are uncommitted. |
| Validation | `run-test-suite.js:executeTests`; `validate-refresh-output.js`; test scripts and fixtures | Checks function rules, package identity, copy consistency, source dates, and outputs. Saved results exist. No new tests ran here. |
| Backup and storage governance | `daily-history-backup.js`; `feed-refresh-lock.js`; `batch-history-ledger.js`; `batch-retention.js`; `docs/storage-lifecycle.md` | Coordinates history updates and checked backups; protects current batches and event history. Cleanup remains a separate action. Current local changes. |
| Downstream consumer export | `export-job-finder-consumer.js`; `job-finder-consumer.js` | Writes a local compatibility file. It does not modify Job Finder records. No Job Finder files were inspected or changed. |
| Substack preparation | `report-substack-full.js`; `substack-full-report.js`; `docs/substack-publication.md` | Makes writing inputs from saved selections. “Full” means the selected detailed shortlist, not the complete collected feed. Publication is manual. |

Evidence groups: [C02-C08](11-evidence-index.md#c02), [C09-C18](11-evidence-index.md#c09), [C20-C28](11-evidence-index.md#c20), [C38](11-evidence-index.md#c38), [C40](11-evidence-index.md#c40).

## Database schemas, queries, and migration

SQL schema definitions are embedded in JavaScript. No standalone SQL migration directory was found in the bounded source inventory.

The older DuckDB schema defines `snapshots`, `posting_observations`, `raw_top_match_rows`, `raw_good_job_rows`, `good_job_exceptions`, `snapshot_files`, and `source_artifacts`. The v2 store separates posting identity, content versions, shared text, raw row payloads, snapshot observations, and manifests. Compatibility views retain earlier SQL interfaces, including `posting_lifecycle` and `daily_market_metrics`. The latter name does not make its counts market-wide evidence. [C21](11-evidence-index.md#c21), [C24](11-evidence-index.md#c24)

`job-history-runtime.js` detects the existing format. A normal update does not authorize a format migration. The October 19 migration review records an accepted replacement after raw-row, SQL-interface, report, backup, and recovery checks. This is a saved operational record, not a Git release date. The database was not opened during this research. [H10](11-evidence-index.md#h10)

## Important status limits

The repository contains active code, compatibility copies, designs, probes, and dated operation records. A new directory does not prove a completed migration. The default slice dispatcher still selects the legacy exporter. `src/adapters/ingestion/index.js` lists providers but does not implement their fetch logic. The normal refresh reads provider normalizers from `src/lib/`. [C05](11-evidence-index.md#c05), [C25](11-evidence-index.md#c25)

Do not describe the feed as fully verified, complete, automatically published, or a record of hiring outcomes. Do not describe optional staging performance as current production performance. The unresolved document/code differences are listed in the [evidence index](11-evidence-index.md#documentation-and-code-conflicts).
