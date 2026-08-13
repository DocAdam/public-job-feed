# Public Job Feed

Standalone raw ingestion/export foundation for public ATS company catalogs.

This project remains operationally separate from the main `job-finder` project. Its optional Job Finder consumer export reads the sibling project's personal title policy and writes a small versioned handoff file; it never reads or modifies Application Tracker data.

The long-term goal is to ingest large public ATS company catalogs, fetch postings, normalize them, rate them with a writer/documentation-focused system, and export large CSV files that can be shared with technical writing, documentation, and content friends. The public link for the project is: [good documentation jobs](https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing). The two primary tabs are updated at least twice per week: `01_good_documentation_jobs` and `remote_jobs_pivot`.

The current project builds the source catalog inventory, analyzes it, creates a crawl queue, and supports controlled sample and batch fetching for Ashby, Greenhouse, Lever, Workday, BambooHR, and iCIMS. Ashby, Greenhouse, and Lever are supported API fetchers. Workday, BambooHR, and iCIMS are best-effort fetchers because their public surfaces are messier and less consistent. This project does not run an uncontrolled full crawl, score postings for applications, publish to Substack, or write to the existing `job-finder` app; integration is through the read-only consumer handoff file described below.

ATS API and fetcher behavior is documented in [docs/ats-api-behavior.md](docs/ats-api-behavior.md).

The analysis step exists before job fetching so the catalog inventory can be checked for duplicates, cross-ATS overlap, malformed rows, and candidate canonical company records. That helps keep later posting fetchers from wasting work on obvious duplicates or bad catalog values.

The registry review layer turns candidate company records into a crawl queue. It determines crawl readiness, establishes crawl priority, prevents wasted fetch attempts, and identifies the best ATS source to use later.

The title watchlist lives in Markdown so the target role list can stay easy to edit before job fetching and scoring exist.

## Current Operating Snapshot

Last verified: 2026-07-15 after the global board catch-up, public release and Sheet rebuild, duplicate-link repair, operational safeguard tests, title-category analysis, and trend regeneration.

- Active Google Sheets handoff folder: `data/jobs/gsheet-package/latest/`
- Primary upload file: `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`
- Current cleaned Good Documentation Jobs rows: 848
- Current internal Company Coverage rows: 40857
- Current public firehose rows before Google Sheets filtering/cleanup: 829486
- Current indexed batches: 439 OK, 2 review
- Current board catalog: 50170 fetch-eligible boards, 100% attempted, 0 currently due
- Full firehose package copy is kept only in `data/jobs/gsheet-package/latest/06_full_firehose.csv`
- Timestamped package folders are kept for comparison history, especially `01_good_documentation_jobs.csv`
- `data/jobs/public/releases/` is intentionally empty unless `jobs:public-release -- --archive-release true` is used
- Project size is currently about 50 GB; avoid reintroducing repeated multi-GB release or firehose snapshots

Storage policy: keep latest working outputs and timestamped Google Sheets comparison history. Do not keep repeated copies of large processing files unless they are needed for audit/debugging. In practice, that means `data/jobs/public/` can hold current generated public outputs, `data/jobs/merged/public-feed-release/` can hold the current merge output, and `data/jobs/gsheet-package/latest/` can hold the only package-level full firehose.

# Daily Refresh And Useful Individual Commands

Use this section as the day-to-day command map. The desktop launcher is the normal path; the individual commands are useful when you want to inspect or rerun one part of the workflow.

## Full Desktop Refresh

Runs the normal refresh workflow. It refreshes known-good boards, indexes refreshed batches, plans and runs exploratory batches, rebuilds the public release, exports the Job Finder consumer slice, rebuilds the Google Sheets package, checks and safely prunes deterministic broken links, regenerates trend reports and the confirmed US-remote daily comparison from the cleaned snapshot, syncs the cleaned package into `latest`, runs validation, refreshes status, and opens `data/jobs/gsheet-package/latest/` only if the checks pass.

```sh
open launchers/Refresh\ Job\ Feed.command
```

## Get the Top 5 Jobs of the Week Substack Post

After `Refresh Job Feed.command` finishes successfully, run:

```sh
open launchers/Prepare\ Weekly\ Top\ 5\ Substack.command
```

This regenerates the seven-day writing inputs, opens the latest trend folder and the short publishing runbook, and copies a complete drafting request to the clipboard. Paste that request into Codex. Codex then reviews the new-this-week candidates, confirms that the selected employer postings are live, researches the five job descriptions, uses the `adam-substack-voice` job-roundup profile, and saves the finished draft in:

```text
/Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-YYYY-MM-DD.md
```

The feed's score creates a candidate pool; it does not automatically decide the final five. The final selection requires reading the official postings and checking the role's actual documentation work, scope, compensation, location limits, and application constraints.

Full instructions and the copyable Codex request are in [docs/weekly-top-five-substack.md](docs/weekly-top-five-substack.md).

## Passive And Overnight Index Maintenance

Index maintenance fetches board snapshots without publishing the Google Sheet. The next `Refresh Job Feed.command` run consumes the latest successful snapshots and builds the public feed and Sheet package.

Install the passive macOS job once:

```sh
open launchers/Install\ Passive\ Job\ Index\ Refresh.command
```

It runs a larger maintenance pass at 4:00 AM and 4:00 PM. To establish or restore a current global baseline more quickly, start the catch-up launcher:

```sh
open launchers/Run\ Overnight\ Index\ Catch-Up.command
```

The overnight launcher keeps the Mac awake and runs successive 3,000-board maintenance cycles. Each cycle fetches ATS groups in parallel, while the maintenance lock prevents separate refreshes or the scheduled passive job from overlapping it. It stops when no fetch-eligible boards are currently due, when a cycle fails, after three cycles without a net reduction in the queue, or at the 100-cycle safety limit.

Start this one-shot launcher with `open` or by double-clicking it. Do not register it with `launchctl submit` or a `KeepAlive` setting: macOS can then restart the already-completed command repeatedly. Only `Install Passive Job Index Refresh.command` should install a recurring service.

Monitor it in another Terminal window:

```sh
tail -f data/jobs/logs/overnight-index-catch-up.log
```

Inspect the latest overall snapshot:

```sh
jq '.Overall' data/jobs/reports/board-freshness-report.json
```

The freshness report includes an internal consistency result plus counts for failed boards that are currently due versus retry-delayed by backoff. Each maintenance run also writes `data/jobs/reports/ats-anomaly-alert.md`. The ATS alert compares the latest outcome for the same boards in the most recent 24 hours and the preceding seven-day baseline, which prevents a large first-time catalog catch-up from looking like an ATS regression.

Use `Control-C` in the catch-up Terminal window to stop it manually. Reaching zero due boards means every fetch-eligible catalog board has been attempted under the current freshness policy; it does not mean every board fetched successfully. Failed boards retain their last result and receive a later retry time with increasing backoff, so they are not retried continuously overnight.

After the catch-up finishes, run `Refresh Job Feed.command` to rebuild and publish the latest snapshot. The catch-up itself does not update the public Sheet.

## Preview Known-Good Refresh

Shows which known-good boards would be refreshed. This does not fetch jobs. Use this when you want to inspect the planned refresh list first.

```sh
npm run jobs:refresh-known-good
```

## Run Known-Good Refresh

Refreshes boards that previously produced good documentation matches. This updates `Last Checked` for productive boards and helps prevent stale jobs from staying in the feed after a board changes.

```sh
npm run jobs:refresh-known-good -- --dry-run false
```

## Rebuild Batch Index

Scans `data/jobs/batches/` and rebuilds the batch index used by merge and release commands. Run this after new fetch batches are created.

```sh
npm run jobs:index-batches
```

## Preview Exploratory Plan

Creates the next exploratory batch plan without fetching jobs. This is for finding new boards or companies beyond the already-known-good refresh lane.

```sh
npm run jobs:plan-aggressive
```

## Dry-Run Planned Batches

Shows what exploratory planned batches would run. This does not fetch jobs.

```sh
npm run jobs:run-planned
```

## Run Planned Batches

Runs exploratory planned batches for real. This fetches new batches from the current plan and then updates the batch index/release flow.

```sh
npm run jobs:run-planned -- --dry-run false
```

## Rebuild Public Release

Merges all indexed OK batches into the current public feed. This is where refreshed and newly fetched batch data becomes part of the main feed.

```sh
npm run jobs:public-release
```

## Rebuild Google Sheets Package

Builds the Google Sheets upload package from the latest public release. This creates or updates `data/jobs/gsheet-package/latest/`.

```sh
npm run jobs:gsheet-package
```

## Validate Google Sheets Package

Checks the latest Google Sheets package for required columns, row counts, duplicate links, missing fields, and stale `Last Checked` warnings.

```sh
npm run jobs:test-gsheet-package
```

## Clean Broken Links

Runs the broken-link cleanup workflow by itself. Use this when you want to rerun cleanup after a rebuild or after reviewing URL failures. It checks `01_good_documentation_jobs.csv`, writes URL review and failure files, safely removes deterministic dead links, regenerates trends, syncs the cleaned package into `latest`, and validates the package again.

```sh
open launchers/Clean\ Broken\ Links.command
```

## Generate Trend Reports

Compares timestamped Google Sheets package snapshots over time and writes trend reports to `data/jobs/trends/`.

```sh
npm run jobs:trends
```

## Validate Trend Reports

Checks trend report quality and catches formatting or report issues before using the trend output.

```sh
npm run jobs:test-trends
```

## Refresh Status Dashboard

Updates the project status dashboard from the latest reports, tests, package state, and batch state.

```sh
npm run jobs:status
```

## Open Latest Package

Opens the current Google Sheets package folder in Finder.

```sh
open launchers/Open\ Latest\ GSheet\ Package.command
```

## Requirements

- Node.js 18 or newer
- No build step
- No TypeScript

## Download Catalogs

```sh
npm run catalogs:download
```

Downloads the configured source catalogs into:

```text
data/catalogs/raw/
```

## Normalize Catalogs

```sh
npm run catalogs:normalize
```

Reads every raw catalog from:

```text
data/catalogs/raw/
```

Writes normalized outputs to:

```text
data/catalogs/normalized/ats-catalog-normalized.csv
data/catalogs/normalized/ats-catalog-normalized.json
```

## Analyze Catalogs

```sh
npm run catalogs:analyze
```

Reads:

```text
data/catalogs/normalized/ats-catalog-normalized.json
```

Writes analysis outputs to:

```text
data/catalogs/analysis/
```

Analysis outputs:

- `catalog-summary.json` and `catalog-summary.csv`: overall totals, unique counts, URL coverage, malformed row count, duplicate catalog value groups, and company key overlap groups.
- `ats-breakdown.csv`: per-ATS row counts, unique catalog values, unique company keys, URL coverage, and malformed rows.
- `duplicate-catalog-values.csv`: repeated normalized catalog values, sorted by largest groups first.
- `company-key-overlap.csv`: conservative likely company overlaps by compact company key.
- `malformed-rows.csv`: rows missing ATS, catalog value, or catalog slug, plus rows with suspicious board URLs.
- `company-registry-candidates.csv` and `company-registry-candidates.json`: one candidate canonical company record per company key, including ATS-specific slug and URL fields.

Company key matching is conservative. It lowercases, removes punctuation and common company suffix terms, and compacts the result, but it is not true fuzzy matching yet.

## Job Title Watchlist

Edit the title watchlist here:

```text
data/config/job-titles.md
```

The file is organized with Markdown headings as categories and bullet items as titles. Current categories are:

- `Leadership`
- `IC Roles`

Analyze the title watchlist with:

```sh
npm run titles:analyze
```

Writes:

```text
data/config/analysis/job-titles-normalized.csv
data/config/analysis/job-titles-normalized.json
data/config/analysis/job-titles-summary.csv
data/config/analysis/job-titles-summary.json
```

The normalized title files include category, original title, normalized title, and token list. The sample and batch fetchers use this watchlist for conservative title matching and Excel review buckets, but it is not final scoring.

## Registry Review Layer

```sh
npm run catalogs:crawl-queue
```

Reads:

```text
data/catalogs/analysis/company-registry-candidates.json
```

Writes crawl-control outputs to:

```text
data/catalogs/crawl/
```

This step does not fetch jobs. It decides what can be crawled, what should be crawled first, and which ATS source should be preferred when a future fetcher is added.

Crawl queue outputs:

- `crawl-queue.csv` and `crawl-queue.json`: one queue record per company registry candidate, including ATS availability, original ATS list, available ATS list, unavailable ATS list, best ATS, best fetch URL, estimated fetch URL, fetch support status, crawl readiness, crawl status, priority, skip reason, and catalog-only export flags.
- `crawl-summary.json` and `crawl-summary.csv`: total registry companies, crawl-ready count, skip count, priority counts, best-ATS counts, ready counts, catalog-only counts, and messy-but-exportable count.
- `crawl-priority-breakdown.csv`: counts for `HIGH`, `MEDIUM`, `LOW`, and `SKIP`.
- `crawl-sample-high-priority.csv`: first 100 high-priority queue rows.
- `crawl-sample-medium-priority.csv`: first 100 medium-priority queue rows.
- `crawl-sample-low-priority.csv`: first 100 low-priority queue rows.

Best ATS selection is intentionally simple and conservative:

```text
Ashby > Greenhouse > Lever > Workday > BambooHR > ICIMS
```

Rows are crawl-ready only when a best fetch URL, company key, and preferred company name are all present. Rows without a usable URL are still preserved with fetch support context so best-effort sample and batch commands can attempt them when a slug or likely URL exists.

Messy catalog records are intentionally preserved for Excel filtering instead of being discarded. Workday, BambooHR, and iCIMS records remain visible even when they are catalog-only, skipped, or failed. These rows can be useful for later manual review, source research, and future fetcher design even when they do not return jobs today.

Fetch support levels:

- `SUPPORTED`: Ashby, Greenhouse, and Lever use known public JSON APIs.
- `BEST_EFFORT`: Workday, BambooHR, and iCIMS use conservative URL or slug-based attempts and may frequently fail or skip.
- `CATALOG_ONLY`: useful catalog data exists, but no usable fetch URL has been found yet.
- `UNSUPPORTED`: no fetch strategy is available for the row.

## Sample Job Fetching

```sh
npm run jobs:fetch-sample
```

This is a small proof of concept for public ATS job fetching. It reads the crawl queue, takes a small sample of eligible boards for the selected ATS, calls the available public endpoint or best-effort URL, normalizes returned jobs, and writes export-first files for review.

Optional flags:

```sh
npm run jobs:fetch-sample -- --ats ashby --limit 25 --offset 0
npm run jobs:fetch-sample -- --ats greenhouse --limit 25 --offset 0
npm run jobs:fetch-sample -- --ats lever --limit 25 --offset 0
npm run jobs:fetch-sample -- --ats workday --limit 10 --offset 0
npm run jobs:fetch-sample -- --ats bamboohr --limit 10 --offset 0
npm run jobs:fetch-sample -- --ats icims --limit 10 --offset 0
```

- `--ats`: `ashby`, `greenhouse`, `lever`, `workday`, `bamboohr`, and `icims` are available.
- `--limit`: number of eligible boards to try. Default is `25`.
- `--offset`: number of eligible boards to skip before selecting the sample. Default is `0`.

Reads:

```text
data/catalogs/crawl/crawl-queue.json
data/config/job-titles.md
```

Writes:

```text
data/jobs/sample/jobs-sample-ashby.csv
data/jobs/sample/jobs-sample-ashby.json
data/jobs/sample/jobs-sample-greenhouse.csv
data/jobs/sample/jobs-sample-greenhouse.json
data/jobs/sample/jobs-sample-lever.csv
data/jobs/sample/jobs-sample-lever.json
data/jobs/sample/jobs-sample-workday.csv
data/jobs/sample/jobs-sample-workday.json
data/jobs/sample/jobs-sample-bamboohr.csv
data/jobs/sample/jobs-sample-bamboohr.json
data/jobs/sample/jobs-sample-icims.csv
data/jobs/sample/jobs-sample-icims.json
data/jobs/sample/jobs-sample-summary.csv
data/jobs/sample/jobs-sample-summary.json
data/jobs/sample/jobs-sample-fetch-log.csv
data/jobs/sample/jobs-sample-fetch-log.json
data/jobs/sample/jobs-sample-title-diagnostics.csv
data/jobs/sample/jobs-sample-title-diagnostics.json
data/jobs/sample/jobs-sample-unmatched-titles.csv
data/jobs/sample/jobs-sample-title-bucket-summary.csv
data/jobs/sample/jobs-sample-title-bucket-summary.json
data/jobs/sample/public-job-feed-sample.csv
data/jobs/sample/public-job-feed-sample.json
data/jobs/sample/jobs-sample-remote-summary.csv
data/jobs/sample/jobs-sample-remote-summary.json
data/jobs/sample/jobs-sample-salary-summary.csv
data/jobs/sample/jobs-sample-salary-summary.json
data/jobs/sample/jobs-sample-quality-summary.csv
data/jobs/sample/jobs-sample-quality-summary.json
data/jobs/sample/jobs-sample-writer-fit-summary.csv
data/jobs/sample/jobs-sample-writer-fit-summary.json
data/jobs/sample/jobs-sample-duplicate-summary.csv
data/jobs/sample/jobs-sample-duplicate-summary.json
data/jobs/sample/jobs-sample-duplicates.csv
data/jobs/sample/jobs-sample-bad-rows.csv
```

The fetcher is intentionally small and fail-soft. Failed boards are logged and do not stop the run. The default board limit is 25; this command does not crawl every crawl-ready company.

Greenhouse uses the public Greenhouse board API endpoint:

```text
https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
```

Some Greenhouse slugs may fail, return empty results, or differ from the catalog URL. This pass is API-only; it does not scrape Greenhouse HTML pages. Failures are kept in the fetch log for review.

Lever uses the public Lever postings API endpoint:

```text
https://api.lever.co/v0/postings/{slug}?mode=json
```

Some Lever slugs may fail, return empty results, or differ from the catalog URL. This pass is API-only; it does not scrape Lever HTML pages. Failures are kept in the fetch log for review.

Workday, BambooHR, and iCIMS are best-effort:

- Workday tries a conservative public Workday jobs API pattern only when the catalog value contains enough tenant/site information. Many attempts may fail with HTTP errors until richer endpoint discovery exists.
- BambooHR tries `https://{slug}.bamboohr.com/careers/list` or a catalog URL when available. Some boards return JSON jobs; others return empty results or HTTP failures.
- iCIMS only tries a URL when one exists in the catalog data. If only a plain slug is available, the run logs `No usable iCIMS fetch URL` instead of inventing aggressive endpoints.

These failures and skips are normal for this stage. They are logged, not fatal, and they help identify which catalog sources are worth deeper fetcher work later.

Title matching is conservative and uses the Markdown watchlist. It checks exact normalized title matches, contains-phrase matches, and token-overlap matches. It does not use fuzzy edit-distance matching.

The title diagnostics files explain why each fetched job title did or did not match the watchlist. They include the best watchlist candidate, candidate score, job tokens, shared strong and weak tokens, missing strong tokens, final match type, and reason. The unmatched title summary groups unmatched normalized titles so repeated misses are easy to review.

The title review buckets are an Excel review layer, not final scoring. They are intentionally permissive enough to surface possible docs, writer, content, education, knowledge, UX writing, and technical publications roles for human review:

- `STRONG_MATCH`: exact, contains, or strong token matches from the watchlist.
- `POSSIBLE_MATCH`: useful domain and role signals, even if the strict watchlist match did not fire.
- `ADJACENT`: nearby content/docs/knowledge/education/UX/technical signals.
- `LOW_SIGNAL`: weak generic seniority or role words only.
- `IGNORE_FOR_NOW`: no meaningful title signal.

Weak and adjacent rows remain in the export instead of being deleted. The point is to make messy samples filterable in Excel before any real scoring system exists.

Remote/location detection is heuristic. It looks for clear remote, hybrid, onsite, US eligibility, country, and city-specific signals in the title, location, raw location, and description. The resulting `RemoteStatus`, `USRemoteEligible`, and `LocationRisk` fields are review aids, not final eligibility decisions.

Salary detection is also heuristic. It looks for simple USD ranges such as `$120,000 - $160,000` and `$120k-$160k`, preserves the detected text, and leaves fields blank when no range is found.

`public-job-feed-sample.csv` and `public-job-feed-sample.json` are the current Excel review exports. They preserve all fetched jobs, including messy, low-signal, location-unclear, and salary-missing rows, so filtering decisions can happen in the spreadsheet instead of being hidden in code.

The sample export also includes duplicate and quality review fields:

- `JobKey`: prefers `ATS + RawJobId`; otherwise falls back to `ATS + CompanyKey + normalized title + normalized location`.
- `CompanyTitleLocationKey`: compact company/title/location key for likely same-role duplicates.
- `CanonicalURLKey`: normalized job URL without query parameters or fragments.
- `PossibleDuplicate`: true when another row shares the company/title/location key or canonical URL key.
- `ExportQualityFlag`: `OK`, `REVIEW`, or `BAD_ROW`.
- `ExportQualityIssues`: pipe-separated reasons such as short description, unknown remote status, possible duplicate, or invalid URL.

Duplicates and bad rows are not deleted. They stay in the export because this project is still building review controls, not making final publication decisions.

In Excel, start with `public-job-feed-sample.csv` and filter roughly like this:

- `ExportQualityFlag != BAD_ROW`
- `PossibleDuplicate = FALSE` for a cleaner first pass, or `TRUE` when auditing duplicate groups.
- `WriterFitTier = A` or `B` for the strongest first pass, then add `C` when you want a broader review set.
- `TitleReviewPriority <= 3` to inspect strong, possible, and adjacent roles.
- `LocationRisk = LOW` or `USRemoteEligible = TRUE` for US-friendly remote candidates.
- `SalaryDetected = TRUE` when looking for compensation-transparent roles.

Zero title matches can still be useful. It can mean the sample slice did not contain writer/docs/content roles, the watchlist is too narrow, or the matcher is correctly avoiding weak developer/content false positives. Use `--offset` to rotate through different boards before loosening matching.

This is still messy and export-first for Excel review. The only scoring added here is title-match diagnostics needed to inspect whether the watchlist and matching rules are useful.

## Controlled Batch Fetching

```sh
npm run jobs:fetch-batch -- --ats ashby --priority HIGH --limit 500 --offset 0
```

This is a bounded batch fetcher for supported and best-effort ATS sources. It reads the crawl queue, filters eligible rows for the selected ATS and priority, applies `--offset` and `--limit`, waits between board requests, and writes one isolated batch folder. It is designed to fetch larger chunks safely without starting an uncontrolled full crawl.

Common options:

```sh
npm run jobs:fetch-batch -- --ats ashby --priority HIGH --limit 50 --offset 25 --batch-name test-ashby-50 --delay-ms 100
npm run jobs:fetch-batch -- --ats greenhouse --priority HIGH --limit 50 --offset 0 --batch-name test-greenhouse-50 --delay-ms 250
npm run jobs:fetch-batch -- --ats lever --priority HIGH --limit 50 --offset 0 --batch-name test-lever-50 --delay-ms 250
npm run jobs:fetch-batch -- --ats workday --priority HIGH --limit 10 --offset 0 --batch-name test-workday-10 --delay-ms 250
npm run jobs:fetch-batch -- --ats bamboohr --priority HIGH --limit 10 --offset 0 --batch-name test-bamboohr-10 --delay-ms 250
npm run jobs:fetch-batch -- --ats icims --priority HIGH --limit 10 --offset 0 --batch-name test-icims-10 --delay-ms 250
```

- `--ats`: `ashby`, `greenhouse`, `lever`, `workday`, `bamboohr`, and `icims` are available.
- `--priority`: crawl queue priority to fetch. Default is `HIGH`.
- `--limit`: maximum boards selected for this batch. Default is `500`.
- `--offset`: crawl queue offset before selecting the batch. Default is `0`.
- `--batch-name`: output folder name. Default is generated from ATS, priority, offset, and limit.
- `--resume`: skips boards already logged in the batch fetch log. Default is `true`.
- `--delay-ms`: delay between board requests. Default is `250`.
- `--concurrency`: number of parallel board-fetch workers. Default is `3`; values above `10` are capped to `10`.

Recommended starting concurrency:

- Ashby: `5`
- Greenhouse: `4`
- Lever: `3`
- BambooHR: `2`
- Workday/iCIMS: `1`, or leave them catalog-only until fetch health improves.

`--delay-ms` applies per worker between requests. If API errors spike, lower `--concurrency` first, then increase `--delay-ms`. Batch output schemas stay the same; worker results are collected in memory and written once at the end so resume and deterministic row ordering remain intact.

Batch outputs are written to:

```text
data/jobs/batches/{batch-name}/
```

Each batch writes:

```text
public-job-feed-batch.csv
public-job-feed-batch.json
jobs-batch-summary.csv
jobs-batch-summary.json
jobs-batch-fetch-log.csv
jobs-batch-fetch-log.json
jobs-batch-title-bucket-summary.csv
jobs-batch-title-bucket-summary.json
jobs-batch-remote-summary.csv
jobs-batch-remote-summary.json
jobs-batch-salary-summary.csv
jobs-batch-salary-summary.json
jobs-batch-quality-summary.csv
jobs-batch-quality-summary.json
jobs-batch-writer-fit-summary.csv
jobs-batch-writer-fit-summary.json
jobs-batch-duplicate-summary.csv
jobs-batch-duplicate-summary.json
jobs-batch-duplicates.csv
jobs-batch-bad-rows.csv
```

Resume behavior is intentionally simple. If `--resume true`, the batch loads any existing fetch log and public-feed JSON, skips already attempted `CatalogSlug` values, merges existing jobs with newly fetched jobs, then reruns duplicate detection and export validation across the merged batch before writing final outputs. This avoids duplicated rows when the same batch command is rerun.

All ATS batches use the same shared enrichment pipeline: title matching, title review buckets, remote/location detection, salary detection, dedupe, export validation, and Writer Fit Scoring. For Workday, BambooHR, and iCIMS, expect more failed/skipped attempts and messier normalized fields.

## Batch Indexing

```sh
npm run jobs:index-batches
```

Indexes every folder under:

```text
data/jobs/batches/
```

For each batch folder, it reads:

```text
jobs-batch-summary.json
jobs-batch-fetch-log.json
public-job-feed-batch.json
```

Writes:

```text
data/jobs/index/batch-index.csv
data/jobs/index/batch-index.json
```

The index records batch name, folder, ATS, priority, offset, limit, board counts, fetched job counts, public-feed row counts, quality counts, duplicate counts, and timestamps. If a batch is missing expected files or contains invalid JSON, it remains in the index with `IndexStatus = REVIEW` and an `IndexIssue` such as `missing summary`, `missing feed`, or `invalid JSON`.

## Batch Merging

```sh
npm run jobs:merge-batches -- --ats ashby --output-name test-ashby-merged
npm run jobs:merge-batches -- --ats greenhouse --output-name test-greenhouse-merged
npm run jobs:merge-batches -- --ats lever --output-name test-lever-merged
npm run jobs:merge-batches -- --ats workday --output-name test-workday-merged
npm run jobs:merge-batches -- --ats bamboohr --output-name test-bamboohr-merged
npm run jobs:merge-batches -- --ats icims --output-name test-icims-merged
npm run jobs:merge-batches -- --ats all --output-name public-feed-merged-test
```

Merges all `OK` indexed batches for the selected ATS into:

```text
data/jobs/merged/{output-name}/
```

Use `--ats all` to combine all supported public fetchers into one feed:

```text
ashby | greenhouse | lever | workday | bamboohr | icims
```

Merged outputs:

```text
public-job-feed-merged.csv
public-job-feed-merged.json
public-job-feed-merged-summary.csv
public-job-feed-merged-summary.json
public-job-feed-merged-duplicates.csv
public-job-feed-merged-quality-summary.csv
public-job-feed-merged-quality-summary.json
public-job-feed-merged-title-bucket-summary.csv
public-job-feed-merged-title-bucket-summary.json
public-job-feed-merged-remote-summary.csv
public-job-feed-merged-remote-summary.json
public-job-feed-merged-salary-summary.csv
public-job-feed-merged-salary-summary.json
public-job-feed-merged-writer-fit-summary.csv
public-job-feed-merged-writer-fit-summary.json
public-job-feed-merged-duplicate-summary.csv
public-job-feed-merged-duplicate-summary.json
public-job-feed-merged-ats-summary.csv
public-job-feed-merged-ats-summary.json
```

Options:

```sh
npm run jobs:merge-batches -- --ats ashby --output-name ashby-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats greenhouse --output-name greenhouse-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats lever --output-name lever-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats workday --output-name workday-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats bamboohr --output-name bamboohr-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats icims --output-name icims-public-feed-merged --include-review true
npm run jobs:merge-batches -- --ats all --output-name public-feed-merged-test --include-review true
npm run jobs:merge-batches -- --ats all --output-name public-feed-csv-only --skip-json true
npm run jobs:merge-batches -- --ats all --output-name public-feed-json-only-emergency --skip-csv true
```

- `--ats`: `ashby`, `greenhouse`, `lever`, `workday`, `bamboohr`, `icims`, and `all` are supported.
- `--output-name`: output folder name. If omitted, one is generated from ATS and timestamp.
- `--include-review`: when `true`, keeps review-flagged rows in the merged export. Default is `true`.
- `--skip-json`: when `true`, writes CSV and summary JSON but skips large merged row JSON files. Default is `false`.
- `--skip-csv`: when `true`, skips large full-row CSV exports but still writes small summary CSVs and JSON unless `--skip-json true` is also set. Default is `false`.

Merging reruns duplicate detection and export validation across the full merged dataset. This matters because two separate batches, or two ATS sources, can contain the same job even when each individual batch looked clean. Duplicates are still flagged, not deleted.

Large merged row CSV and JSON files are written with streaming writers so the export does not build one huge string in memory. CSV is the primary Google Sheets handoff format, so `--skip-csv true` is only an emergency fallback for completing JSON and summary outputs when a local machine cannot write the large CSV. If a machine is memory-constrained on JSON, use `--skip-json true` as a CSV-first fallback; summaries still write normally.

Every merged row includes `SourceBatch`, so each job can be traced back to the batch folder that produced it.

Cross-ATS merge rows also include:

- `SourceATSCount`: number of distinct ATS sources sharing the row's company/title/location key or canonical URL key.
- `CrossATSDuplicate`: true when a duplicate group includes more than one ATS source.
- `CrossATSDuplicateATSList`: pipe-separated ATS list for the cross-ATS duplicate group.

When `--ats all` is used, the merge also writes the latest public review copy here:

```text
data/jobs/public/public-job-feed-latest.csv
data/jobs/public/public-job-feed-latest.json
data/jobs/public/public-job-feed-latest-summary.csv
data/jobs/public/public-job-feed-latest-summary.json
```

This public latest export is intended for Excel/public review. It does not filter rows out, delete duplicates, or remove low-score rows.

## ATS Health Reporting

```sh
npm run jobs:ats-health
```

Builds a health report across the current batch index, batch fetch logs, latest public feed, and crawl queue. This report helps decide which ATS sources are worth scaling and which should stay best-effort or catalog-only for now.

Reads:

```text
data/jobs/index/batch-index.json
data/jobs/batches/*/jobs-batch-fetch-log.json
data/jobs/public/public-job-feed-latest.json
data/catalogs/crawl/crawl-queue.json
```

Writes:

```text
data/jobs/reports/ats-health-summary.csv
data/jobs/reports/ats-health-summary.json
data/jobs/reports/ats-fetch-health.csv
data/jobs/reports/ats-fetch-health.json
data/jobs/reports/ats-public-feed-health.csv
data/jobs/reports/ats-public-feed-health.json
data/jobs/reports/ats-catalog-health.csv
data/jobs/reports/ats-catalog-health.json
data/jobs/reports/ats-scale-recommendations.csv
data/jobs/reports/ats-scale-recommendations.json
data/jobs/reports/ats-health-report.md
```

The report has three practical views:

- `ats-fetch-health`: board attempts, success/failure/empty/skipped rates, fetched job counts, and average jobs per successful board.
- `ats-public-feed-health`: rows that actually made it into the latest public feed, including Writer Fit tiers, remote/salary signals, and export quality.
- `ats-catalog-health`: crawl queue coverage, crawl-ready/catalog-only counts, fetch support status counts, and messy-but-exportable counts.

`ats-scale-recommendations` turns those signals into simple next-step buckets:

- `SCALE_NOW`: solid success rate and meaningful job volume.
- `SAMPLE_MORE`: some jobs fetched, but the sample is still too small.
- `KEEP_BEST_EFFORT`: useful but inconsistent source; keep batches small.
- `CATALOG_ONLY_FOR_NOW`: no usable fetches yet.
- `REVIEW_FETCHER`: expected-supported fetcher has enough failure signal to inspect before scaling.

Use this to choose the next controlled batch. A typical path is to scale `SCALE_NOW` sources, run modest batches for `SAMPLE_MORE`, and leave `CATALOG_ONLY_FOR_NOW` sources visible in the catalog while better fetch logic is researched. The report never deletes rows and does not make publication decisions.

## Crawl Coverage Reporting

```sh
npm run jobs:crawl-coverage
```

Builds a read-only coverage report showing how much of the crawl queue has been processed. It does not fetch jobs, delete rows, or change batch outputs.

A company/source is counted as covered if it was:

- fetched successfully with jobs
- fetched successfully with zero jobs
- attempted and failed
- skipped by a fetcher
- explicitly represented as catalog-only because the ATS is not fetch-supported yet

Reads:

```text
data/catalogs/crawl/crawl-queue.json
data/jobs/index/batch-index.json
data/jobs/batches/*/jobs-batch-fetch-log.json
```

Writes:

```text
data/jobs/reports/crawl-coverage-summary.csv
data/jobs/reports/crawl-coverage-summary.json
data/jobs/reports/crawl-coverage-by-ats.csv
data/jobs/reports/crawl-coverage-by-ats.json
data/jobs/reports/crawl-remaining.csv
data/jobs/reports/crawl-remaining.json
data/jobs/reports/crawl-attempted.csv
data/jobs/reports/crawl-attempted.json
data/jobs/reports/crawl-coverage-report.md
```

Completion statuses:

- `COMPLETE`: fetch-supported crawl-ready rows for that ATS have all been attempted.
- `IN_PROGRESS`: some fetch-supported rows have been attempted and some remain.
- `NOT_STARTED`: fetch-supported rows exist, but none have been attempted yet.
- `CATALOG_ONLY`: rows are represented in the crawl queue, but remain catalog-only for now.

For fetch-supported ATS, completion means `RemainingRows = 0`. For catalog-only ATS, completion means the catalog rows are represented and marked catalog-only. Workday and iCIMS may remain catalog-only or best-effort until their fetchers are worth scaling.

## Next Batch Planning

```sh
npm run jobs:plan-next-batches
```

Reads ATS health recommendations, the current batch index, and the crawl queue, then writes suggested commands for the next manual scaling pass. The planner does not run fetch batches automatically.

Reads:

```text
data/jobs/reports/ats-scale-recommendations.json
data/jobs/index/batch-index.json
data/catalogs/crawl/crawl-queue.json
```

Writes:

```text
data/jobs/plans/next-batch-plan.csv
data/jobs/plans/next-batch-plan.json
data/jobs/plans/next-batch-commands.sh
data/jobs/plans/next-batch-plan.md
```

The plan uses existing batch offsets so the next commands continue after prior controlled batches:

- Ashby `SCALE_NOW`: two 500-board batches.
- Greenhouse `SAMPLE_MORE`: one 250-board batch.
- Lever `SAMPLE_MORE`: one 100-board batch.
- BambooHR `SAMPLE_MORE`: one 100-board batch.
- Workday/iCIMS `CATALOG_ONLY_FOR_NOW`: skipped with notes.

Existing `BatchName` values in `data/jobs/index/batch-index.json` are treated as completed. The planner will not generate a READY row for a batch name that is already indexed, and offsets continue from the highest completed offset plus its limit.

Review `next-batch-plan.md` or `next-batch-commands.sh` before running anything. You can run commands one at a time if preferred. After planned batches complete, run:

```sh
npm run jobs:public-release
```

## Run Planned Batches

```sh
npm run jobs:run-planned
```

Runs the READY commands from `data/jobs/plans/next-batch-plan.json` in order, then rebuilds the public release and status dashboard when the batch commands succeed. Dry run is the default, so the first command only prints what would run and writes a run log.

On a real non-dry run, successful planned batches are followed by:

```text
npm run jobs:index-batches
npm run jobs:plan-next-batches
npm run jobs:public-release
npm run jobs:status
```

That refreshes the batch index and regenerates the next plan before the release and dashboard are rebuilt.

Writes:

```text
data/jobs/runs/run-planned-batches-latest.json
data/jobs/runs/run-planned-batches-latest.md
data/jobs/runs/run-planned-batches-YYYYMMDD-HHMMSS.json
data/jobs/runs/run-planned-batches-YYYYMMDD-HHMMSS.md
```

Examples:

```sh
npm run jobs:run-planned
npm run jobs:run-planned -- --dry-run false
npm run jobs:run-planned -- --dry-run false --continue-on-error true
```

Options:

```text
--dry-run true|false
--continue-on-error true|false
--run-release true|false
--run-status true|false
```

Use this when you want to automate the current manual workflow without changing fetch logic: run planned batches, rebuild the release, then refresh the dashboard. It does not run cleanup or archive, and it does not delete files.

## Project Status Dashboard

```sh
npm run jobs:status
```

Builds a single internal Markdown dashboard from the latest generated reports. It does not fetch jobs, delete files, archive folders, or run cleanup.

Writes:

```text
data/jobs/reports/project-status-dashboard.md
data/jobs/reports/project-status-dashboard.json
```

The dashboard summarizes public feed counts, deduped export counts, ATS health recommendations, crawl coverage, next batch plan status, inventory/storage totals, cleanup/archive status, suggested next action, and key command reminders.

The dashboard cross-checks `next-batch-plan.json` against `batch-index.json`. If an old plan still contains a READY row for a batch name that is already indexed, the dashboard ignores that row in the ready count and shows a stale-plan warning. If you see that warning, run:

```sh
npm run jobs:plan-next-batches
```

Missing inputs do not fail the command. Sections with missing source reports show `Not available yet`.

## Project Inventory

```sh
npm run jobs:inventory
```

Scans `data/` and writes read-only inventory reports. It does not delete files, clean folders, fetch jobs, or modify releases.

Writes:

```text
data/jobs/reports/project-inventory.csv
data/jobs/reports/project-inventory.json
data/jobs/reports/project-inventory-summary.json
data/jobs/reports/project-inventory-summary.md
data/jobs/reports/release-history.csv
data/jobs/reports/release-history.json
data/jobs/reports/stale-files.csv
data/jobs/reports/stale-files.json
data/jobs/reports/large-files.csv
data/jobs/reports/large-files.json
```

Reports:

- `project-inventory`: one row per file under `data/`, with category, file type, size, and modified time.
- `project-inventory-summary`: total file count, total size, files/size by category, largest files, largest folders, and release/batch/merged folder counts.
- `release-history`: one row per release folder, including total files and total size.
- `stale-files`: generated files older than 30, 60, or 90 days. This is informational only.
- `large-files`: files at or above 10 MB.

Use inventory before cleanup when deciding what is growing fastest. `jobs:inventory` gives the evidence; `jobs:cleanup` creates a deletion plan. Neither command deletes anything unless `jobs:cleanup -- --dry-run false` is explicitly used.

## Generated File Archiving

```sh
npm run jobs:archive
```

Builds an archive plan for old generated release and merged-output folders. Dry run is the default, so the command does not compress or delete anything unless explicitly told to.

Defaults:

```text
--dry-run true
--keep-releases 3
--keep-merged 3
--max-candidates no limit
--only all
--min-size-mb 0
--verbose true
--archive-dir data/jobs/archives
--delete-after-archive false
```

Writes:

```text
data/jobs/reports/archive-plan.csv
data/jobs/reports/archive-plan.json
data/jobs/reports/archive-summary.md
```

Examples:

```sh
# Dry run. Creates reports only.
npm run jobs:archive

# Archive one candidate, keep the source folder.
npm run jobs:archive -- --dry-run false --max-candidates 1

# Archive only old releases, two at a time.
npm run jobs:archive -- --dry-run false --only releases --max-candidates 2

# Archive only merged folders, two at a time.
npm run jobs:archive -- --dry-run false --only merged --max-candidates 2
```

Progress logging is on by default. Non-dry runs print each candidate number, source path, source size, destination zip path, success/failure, archive size, and elapsed seconds.

Archive candidates:

- old release folders beyond `--keep-releases`
- old merged output folders beyond `--keep-merged`

Never archived by this command:

- newest kept release folders
- newest kept merged folders
- `data/jobs/public/public-job-feed-latest.*`
- `data/jobs/public/public-job-feed-top.*`
- `data/jobs/public/public-job-feed-deduped-*.*`
- `data/jobs/batches/`
- `data/catalogs/`
- `data/config/`
- `src/`
- `README.md`

Recommended workflow:

1. Run `npm run jobs:inventory`.
2. Run `npm run jobs:archive`.
3. Inspect `data/jobs/reports/archive-plan.csv`.
4. Run `npm run jobs:archive -- --dry-run false --max-candidates 1` to create one zip archive while keeping the source folder.
5. Only later consider `npm run jobs:archive -- --dry-run false --delete-after-archive true`.

`--delete-after-archive true` is intentionally dangerous. It deletes source folders only after a zip archive is created and verified, but it should still be used only after manual inspection. Archiving differs from cleanup: archive creates compressed history first; cleanup plans deletion of generated outputs directly.

## Generated File Cleanup

```sh
npm run jobs:cleanup
```

Builds a cleanup plan for old generated files. Cleanup is manual only and is not wired into `jobs:public-release`.

Dry run is the default:

```sh
npm run jobs:cleanup
npm run jobs:cleanup -- --dry-run true --keep-releases 5 --keep-merged 5 --keep-samples 3 --keep-plans 5
```

The command writes:

```text
data/jobs/reports/cleanup-plan.csv
data/jobs/reports/cleanup-plan.json
data/jobs/reports/cleanup-summary.md
```

Run dry-run first, inspect `cleanup-plan.csv`, and only then run:

```sh
npm run jobs:cleanup -- --dry-run false
```

Cleanup candidates:

- old release folders beyond `--keep-releases`
- old merged output folders beyond `--keep-merged`
- stale sample files if they become safely groupable into old sets
- stale plan outputs beyond `--keep-plans`

Protected from cleanup:

- `data/catalogs/raw/`
- `data/catalogs/normalized/`
- `data/catalogs/analysis/`
- `data/catalogs/crawl/`
- `data/config/`
- `data/jobs/batches/`
- `data/jobs/index/`
- `data/jobs/reports/`
- `data/jobs/public/public-job-feed-latest.*`
- `data/jobs/public/public-job-feed-top.*`
- `data/jobs/public/public-job-feed-deduped-*.*`
- `data/jobs/public/OPERATOR_NOTES.md`
- `data/jobs/public/PUBLISHING_PREP.md`
- `data/jobs/public/public-job-feed-data-dictionary.csv`
- `data/jobs/public/public-job-feed-data-dictionary.md`
- `README.md`
- `package.json`
- `src/`

The current sample and plan outputs are not timestamped into multiple old sets yet, so the cleanup command keeps them and records that choice in the plan. Release and merged folders are the main cleanup targets.

## Public Slices

```sh
npm run jobs:export-slices
```

Reads:

```text
data/jobs/public/public-job-feed-latest.json
```

Writes convenience exports to:

```text
data/jobs/public/slices/
```

Slice outputs:

- `public-job-feed-firehose.csv/json`: full copy of the latest feed with every row preserved.
- `public-job-feed-writer-focus.csv/json`: Writer Fit `A`, `B`, or `C`, plus strong/possible/adjacent title review rows.
- `public-job-feed-strong-matches.csv/json`: Writer Fit `A` or `B`, plus strict strong title matches.
- `public-job-feed-remote-us-likely.csv/json`: rows marked remote and US remote eligible.
- `public-job-feed-remote-writer-focus.csv/json`: remote US likely rows that also meet writer-focus criteria.
- `public-job-feed-salary-detected.csv/json`: rows where salary detection found a compensation range.
- `public-job-feed-review-needed.csv/json`: review-flagged rows, possible duplicates, and cross-ATS duplicates.
- `public-job-feed-demoted-high-score.csv/json`: rows whose Writer Fit base score was high but were demoted by penalties or A/B guardrails.
- `public-job-feed-slice-summary.csv/json`: row counts and quick metrics for each slice.

Slice row CSV and JSON files are written with streaming writers. The CSV outputs are the preferred files for Excel and Google Sheets review.

The top public review export is written to:

```text
data/jobs/public/public-job-feed-top.csv
data/jobs/public/public-job-feed-top.json
```

`public-job-feed-top` uses the same rows as strong matches, sorted by Writer Fit score, title priority, US remote eligibility, salary detection, company, and title.

Slices are convenience exports only. They do not replace the main latest feed, delete duplicates, remove low-score rows, or make publication decisions. Use the firehose when you want everything, writer focus for a broad editorial review set, and strong matches for a smaller Substack/Excel shortlist.

### Deduped Convenience Slices

`jobs:export-slices` also writes deduped convenience views to:

```text
data/jobs/public/slices/deduped/
```

Deduped outputs:

- `public-job-feed-deduped-firehose.csv/json`: one selected representative per duplicate group from the full firehose.
- `public-job-feed-deduped-writer-focus.csv/json`: deduped writer-focus slice.
- `public-job-feed-deduped-strong-matches.csv/json`: deduped strong-match slice.
- `public-job-feed-deduped-remote-writer-focus.csv/json`: deduped remote writer-focus slice.
- `public-job-feed-deduped-top.csv/json`: deduped top shortlist.
- `public-job-feed-dedupe-summary.csv/json`: input rows, output rows, removed duplicate rows, and resolved duplicate groups by slice.
- `public-job-feed-dedupe-decisions.csv/json`: selected row and rejected-row summary for each resolved duplicate group.

Latest deduped convenience copies are also written to:

```text
data/jobs/public/public-job-feed-deduped-top.csv
data/jobs/public/public-job-feed-deduped-top.json
data/jobs/public/public-job-feed-deduped-writer-focus.csv
data/jobs/public/public-job-feed-deduped-writer-focus.json
data/jobs/public/public-job-feed-deduped-remote-writer-focus.csv
data/jobs/public/public-job-feed-deduped-remote-writer-focus.json
```

Selection priority is transparent:

1. Highest `WriterFitScore`
2. Best `WriterFitTier` (`A` before `B` before `C` before `D` before `F`)
3. `ExportQualityFlag` `OK` before `REVIEW` before `BAD_ROW`
4. `USRemoteEligible` true before unknown before false
5. `RemoteStatus` `Remote` before `Hybrid` before `Onsite` before `Unknown`
6. `SalaryDetected` true before false
7. ATS priority: `ashby`, `greenhouse`, `lever`, `bamboohr`, `workday`, `icims`
8. Newer `DatePosted` when parseable
9. Company ascending
10. Title ascending

Use the full firehose when you need auditability, every source row, or duplicate review. Use deduped views when sharing a cleaner CSV for review, spreadsheet filtering, or a shorter human-facing shortlist. Deduped views never delete rows from `data/jobs/public/public-job-feed-latest.csv/json`.

## Public Release

```sh
npm run jobs:public-release
```

Runs the repeatable public export sequence:

```text
npm run jobs:index-batches
npm run jobs:merge-batches -- --ats all --output-name public-feed-release
npm run jobs:export-slices
npm run jobs:ats-health
```

By default, this updates only the latest generated files under:

```text
data/jobs/public/
```

This keeps the current working outputs available without duplicating multi-GB release snapshots on every run.

If you intentionally need a full timestamped public snapshot, run:

```sh
npm run jobs:public-release -- --archive-release true
```

That optional archive mode writes:

```text
data/jobs/public/releases/YYYYMMDD-HHMM/
```

Each archived release folder includes:

- `public-job-feed-latest.csv/json`
- `public-job-feed-latest-summary.csv/json`
- `public-job-feed-top.csv/json`
- latest deduped convenience CSV/JSON files
- `OPERATOR_NOTES.md`
- `PUBLISHING_PREP.md`
- `public-job-feed-data-dictionary.csv/md`
- all files from `data/jobs/public/slices/`
- `public-job-feed-summary.md` internal release summary

The newest internal Markdown summary is also copied to:

```text
data/jobs/public/public-job-feed-summary.md
```

The latest files under `data/jobs/public/` are the current working exports. Timestamped release folders are optional archived snapshots and should be created only when they are truly needed. Large release CSVs stream to disk during merge and slice export so the Google Sheets handoff remains CSV-first at larger dataset sizes.

Manual sharing workflow:

1. Run `npm run jobs:public-release`.
2. Inspect `OPERATOR_NOTES.md` and `PUBLISHING_PREP.md` under `data/jobs/public/` for internal guidance.
3. Run `npm run jobs:gsheet-package`.
4. Upload a selected CSV to Google Sheets, then share the Sheet link if publishing externally.

This command does not publish to Substack automatically, delete rows, or hide review/duplicate flags. The generated Markdown files in this repo are internal operator/publisher notes, not the final public presentation layer.

ATS health reporting runs at the end of the public release command. If health reporting fails, the release logs a warning and continues so a valid public export is not blocked by a reporting problem.

## Google Sheets Handoff Package

```sh
npm run jobs:gsheet-package
```

Builds a local package of the best CSVs for manual Google Sheets upload. Generated package CSVs stream to disk, and large existing CSVs are copied from the public export folder rather than rebuilt in memory. This command does not upload files, publish to Substack, fetch jobs, delete rows, or replace the source exports.

Writes:

```text
data/jobs/gsheet-package/YYYYMMDD-HHMM/
data/jobs/gsheet-package/latest/
data/jobs/gsheet-package/latest-clean/
data/jobs/gsheet-package/top-matches-only/
```

The full package uses simplified filenames and keeps detailed/internal backups:

- `00_start_here.csv`
- `01_good_documentation_jobs.csv`
- `02_company_coverage.csv`
- `03_top_matches_full.csv`
- `04_remote_writer_focus.csv`
- `05_writer_focus.csv`
- `07_data_dictionary.csv`
- `08_slice_summary.csv`
- `09_ats_health.csv`
- `10_ats_recommendations.csv`
- `11_demoted_high_score.csv`

`06_full_firehose.csv` is intentionally kept only in `data/jobs/gsheet-package/latest/`. Timestamped packages omit it to avoid duplicating multi-GB processing files. If the firehose is needed for debugging or audit work, use:

```text
data/jobs/gsheet-package/latest/06_full_firehose.csv
```

## Daily Confirmed US-Remote Report

The full `Refresh Job Feed.command` workflow generates this report after URL cleanup and before validation. To rerun the read-only comparison independently:

```sh
npm run jobs:report-us-remote
```

It compares the newest timestamped Google Sheets package with its immediate predecessor and writes the current linked job list, additions, removals, and counts to:

```text
data/jobs/reports/us-remote-daily-report.md
data/jobs/reports/us-remote-daily-report.json
```

It includes only rows marked `Remote` whose `Location` explicitly identifies `US`, `U.S.`, `USA`, or `United States`. It excludes unknown, hybrid, onsite, generic remote, and city/state-only locations. For a specific comparison, pass `--current` and `--previous` package paths to the underlying Node script.

The current two-tab public Google Sheets model is:

1. `Good Documentation Jobs`: the main tab for normal users.
2. `Remote Jobs`: the existing filtered/pivot view derived from the main jobs tab.

`02_company_coverage.csv` remains in the local handoff package for internal diagnostics and transparency, but it is not part of the current public Sheet. When updating Google Sheets, replace only the main jobs tab's values and preserve the remote-jobs tab.

The data is generated from ATS/company catalogs and may not be exhaustive for every employer.

`01_good_documentation_jobs.csv` uses this public-facing shape:

- `Title`
- `Company`
- `Location`
- `Apply Link`
- `Additional Apply Links`
- `Writer Fit Score`
- `Fit Tier`
- `Why It Matched`
- `Work Arrangement`
- `Salary`
- `Posted Date`
- `Age (Days)`
- `Last Checked`
- `Source`

`02_company_coverage.csv` uses this simple transparency shape:

- `Company`
- `ATS`
- `Coverage Status`
- `Jobs Found`
- `Good Matches Found`
- `Last Checked`
- `Last Fetch Status`
- `Fetch Notes`
- `Career Site / ATS URL`

The plain jobs CSV keeps `Apply Link` as a normal URL, which Google Sheets usually auto-links. When the same company has the exact same title across multiple locations, the package groups those rows for display: `Location` lists the combined locations, `Apply Link` is one representative posting, and `Additional Apply Links` retains the other location-specific application URLs. This is a display-only transformation; the detailed Top Matches file preserves the original rows. Same-location postings and differently titled roles are not grouped. If one grouped variant is remote, the display row remains `Remote` so it is still included in the remote-jobs view.

Freshness fields mean:

- `Posted Date` = date supplied by the ATS if available, formatted `YYYY-MM-DD`.
- `Age (Days)` = integer days between Posted Date and the report generation date.
- `Last Checked` = when the system last saw the job in the ATS, formatted `YYYY-MM-DD HH:MM UTC`.
- `Report Run Date` = when the package was generated. It lives in `00_start_here.csv` rather than being repeated on every job row.
- A recently checked job is more likely to still be open, but users should always click through to verify.

The detailed Top Matches file keeps diagnostic columns for internal review. The latest full firehose and health/planning files remain available for debugging, auditing, and operator context.

It also includes:

- `README_GSHEET_PACKAGE.md`
- `SOURCE_SUMMARY.md`
- `OPERATOR_NOTES.md`
- `PUBLISHING_PREP.md`
- `PROJECT_STATUS_DASHBOARD.md`
- `gsheet-package-manifest.csv/json`

`latest/` is the standard current package from the most recent refresh. It starts from the newest timestamped package, then keeps the only package-level `06_full_firehose.csv` copy. It is the default folder for validation, launcher handoff, and the current Google Sheets upload workflow.

`latest-clean/` is a smaller legacy upload-oriented package that omits the full firehose. It is still generated for compatibility, but the active handoff flow uses `latest/`:

- `00_start_here.csv`
- `01_good_documentation_jobs.csv`
- `02_company_coverage.csv`
- `03_top_matches_full.csv`
- `04_data_dictionary.csv`
- `05_ats_health.csv`
- `06_ats_recommendations.csv`
- `09_demoted_high_score.csv`

`top-matches-only/` is the smallest publish-ready package:

- `top_matches_simple.csv`
- `top_matches_simple_with_formula.csv`
- `top_matches.csv`
- `data_dictionary.csv`
- `README_TOP_MATCHES.md`

Recommended manual workflow:

1. Run `npm run jobs:public-release`.
2. Run `npm run jobs:gsheet-package`.
3. Run the latest package check: `npm run jobs:test-gsheet-package`.
4. Run `open launchers/Clean\ Broken\ Links.command` to safe-prune the newest timestamped package, regenerate trends, and sync `latest`.
5. Review the timestamped package's `01_good_documentation_jobs-url-failures.csv`.
6. Run `npm run jobs:test-gsheet-package` again after pruning.
7. Confirm `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv` is the file you upload.
8. Run `npm run jobs:trends`.
9. Run `npm run jobs:test-all`.
10. Open `data/jobs/gsheet-package/latest/README_GSHEET_PACKAGE.md` for the upload-oriented package.
11. Upload `01_good_documentation_jobs.csv` as the main tab.
12. Preserve `remote_jobs_pivot`; it is the user-facing filtered remote view derived from the main jobs tab.
13. Add `04_data_dictionary.csv` if you want a reference tab.
14. Use `03_top_matches_full.csv` only if you want diagnostic/internal columns.
15. Avoid the full firehose unless debugging or auditing.

Google Sheets URL checks can also target a timestamped package:

```sh
npm run jobs:gsheet-check-urls -- --input data/jobs/gsheet-package/20260605-0620/01_good_documentation_jobs.csv
npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/20260605-0620
```

Use the `latest` default when you are preparing the folder from the most recent refresh. Use `--package-dir` when you want to review or prune a specific timestamped package, such as a run folder kept for audit/history.

The check writes `01_good_documentation_jobs-url-review.csv`, `01_good_documentation_jobs-url-failures.csv`, and summary files beside the input CSV. The default run only flags rows. `--apply-safe` backs up the original CSV as `01_good_documentation_jobs-before-url-prune.csv`, removes deterministic failed rows from `01_good_documentation_jobs.csv`, and updates `00_start_here.csv` when it is present.

URL health rules are intentionally conservative:

- Greenhouse `?error=true`, HTTP failures such as Lever `404`, and reviewed confirmed-dead Ashby URLs are written to the failures CSV.
- HTTP `429` rate-limit responses are kept in the jobs CSV and marked `Rate Limited` in the full review CSV. They are not pruned automatically because a blocked checker response does not prove the job is closed.
- `--apply-safe` uses safe pruning. It removes deterministic failures such as missing URLs, invalid URLs, HTTP `404`/`410`, known expired/error pages, reviewed confirmed-dead URLs, and known closed-page text. It keeps `HTTP 403`, `Timeout`, `Fetch Error`, and other ambiguous rows for review.
- Ashby job pages can return a generic `200` shell even when the rendered page says the job is unavailable. Only reviewed confirmed-dead Ashby URLs are pruned by this workflow; do not broaden this rule without testing against known live Ashby links.
- If the failures CSV includes any uncertain rows, leave the default review output in place and do not run broad pruning until the rows have been checked manually. Prefer `--apply-safe`.

Current reviewed pruning flow for a package is:

```sh
npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/20260619-0755
open data/jobs/gsheet-package/20260619-0755/01_good_documentation_jobs-url-failures.csv
npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/20260619-0755 --apply-safe
npm run jobs:test-gsheet-package
npm run jobs:trends
npm run jobs:test-all
```

For a specific timestamped package, use the same flow with `--package-dir`:

```sh
PACKAGE_DIR=data/jobs/gsheet-package/YYYYMMDD-HHMM
npm run jobs:gsheet-check-urls -- --package-dir "$PACKAGE_DIR"
open "$PACKAGE_DIR/01_good_documentation_jobs-url-failures.csv"
npm run jobs:gsheet-check-urls -- --package-dir "$PACKAGE_DIR" --apply-safe
npm run jobs:trends
npm run jobs:test-trends
```

The recommended launcher prunes the newest timestamped package first, regenerates trends from that cleaned timestamped snapshot, and then syncs the cleaned upload CSV into `latest`. After that, `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv` is the upload file. The backup CSV remains beside the timestamped package for audit/recovery.

After review, pruning, and validation are complete, use `docs/gsheet-csv-cleanup-plan.md` and `npm run jobs:gsheet-clean-url-artifacts` to remove temporary URL-check artifacts from the package folder before upload.

URL artifact cleanup is dry run by default:

```sh
npm run jobs:gsheet-clean-url-artifacts
```

Apply cleanup to `latest`:

```sh
npm run jobs:gsheet-clean-url-artifacts -- --apply
```

Dry run a timestamped package:

```sh
npm run jobs:gsheet-clean-url-artifacts -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM
```

Apply cleanup to a timestamped package:

```sh
npm run jobs:gsheet-clean-url-artifacts -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM --apply
```

The cleanup script only removes URL-check artifacts. It never removes the final jobs CSV, company coverage, data dictionary files, manifests, source public exports, merged exports, or firehose files. It refuses unsafe cleanup, including missing package files, suspiciously tiny final CSVs, final row counts greater than the backup, or URL-check summaries that indicate pruning was not applied. Use it after URL review, pruning, and `npm run jobs:test-release`.

Suggested first filter in Google Sheets:

- Upload the Good Documentation Jobs file first. It is already sorted by `Age (Days)` ascending, then `Writer Fit Score` descending.
- Use the existing Remote Jobs pivot/filter tab for the user-facing remote-only view.
- Use the local Company Coverage CSV only for internal crawl diagnostics.
- In the full/diagnostic file, use `ExportQualityFlag = OK` and `PossibleDuplicate = FALSE` if you want a stricter first pass.
- Use `Work Arrangement`, `RemoteStatus`, and `USRemoteEligible` as filters, not score.

## Job Trend Reports

```sh
npm run jobs:trends
```

Builds a trend movement report from existing Google Sheets package snapshots. This is a content-support layer for Substack-style updates, not a crawler. It answers: what changed in the documentation job market across the selected reporting window?

The command reads timestamped package folders only:

```text
data/jobs/gsheet-package/YYYYMMDD-HHMM/01_good_documentation_jobs.csv
```

It may also reference `02_company_coverage.csv` as supporting context when present. It does not fetch jobs, delete rows, or edit the Google Sheets package.

The permanent public Google Sheet link and tab metadata are configured in:

```text
data/config/public-sheet.json
```

This config is used by trend reports and Substack notes. The public Sheet keeps the same URL across updates and has two primary tabs: `01_good_documentation_jobs` and `remote_jobs_pivot`. Company Coverage remains an internal diagnostic CSV and is not a public tab.

Reader-friendly company display names are configured in:

```text
data/config/company-normalization.json
```

Trend reports use these names in company trend CSVs and Substack-ready Markdown while preserving the original company values in the source package snapshots.

The default report is a 7-day weekly report. The script uses all available timestamped package folders, so it works if the feed is run once per week, twice per week, or many times per week. Reports use all snapshots inside the selected range. If available history is shorter than the requested window, it uses all available snapshots and adds a note to the report.

Current-vs-previous snapshot outputs still exist for operational checks, and `--range current-previous` can make that the selected report window. Reader-facing Markdown emphasizes range movement: jobs first seen in the selected range, jobs dropped from the current output, net change, company movement, and title-category movement. In these reports, `dropped` means a job is not present in the current Good Documentation Jobs output; it does not confirm that the job has closed.

Markdown and CSV trend reports use friendly UTC date formatting. Dates display as `YYYY-MM-DD`; date/time values display as `YYYY-MM-DD HH:MM UTC`. Snapshot folder IDs such as `20260606-0636` are displayed in reports as `2026-06-06 06:36 UTC`. JSON manifests keep raw ISO timestamps and raw snapshot IDs for machine-readable use, with display companion fields such as `GeneratedAtDisplay`, `TrendRangeStartDisplay`, and `CurrentSnapshotDisplay`.

Range examples:

```sh
npm run jobs:trends
npm run jobs:trends -- --range days --days 14
npm run jobs:trends -- --range all
npm run jobs:trends -- --range current-previous
npm run jobs:trends -- --start 2026-06-02 --end 2026-06-06
```

Supported options:

- `--range weekly`: default 7-day weekly report.
- `--range days --days N`: use the last N days ending at the current snapshot timestamp.
- `--range all`: use all timestamped package snapshots.
- `--range current-previous`: use only the latest snapshot and the previous snapshot.
- `--start YYYY-MM-DD --end YYYY-MM-DD`: use snapshots inside the inclusive date range; explicit dates override `--range` and `--days`.

Writes:

```text
data/jobs/trends/YYYYMMDD-HHMM/
data/jobs/trends/latest/
```

Core outputs:

- `weekly-trend-summary.md`
- `weekly-trend-summary.csv`
- `new-jobs.csv`
- `removed-jobs.csv`
- `continuing-jobs.csv`
- `weekly-new-jobs.csv`
- `weekly-dropped-jobs.csv`
- `weekly-persistent-jobs.csv`
- `weekly-new-companies.csv`
- `weekly-company-movement.csv`
- `weekly-title-category-movement.csv`
- `company-trends.csv`
- `company-movers.csv`
- `new-companies.csv`
- `repeat-hiring-companies.csv`
- `title-trends.csv`
- `title-category-summary.csv`
- `freshness-trends.csv`
- `outliers.csv`
- `editor-insights.md`
- `substack-notes.md`
- `weekly-substack-report.md`
- `trend-manifest.json`

Use `substack-notes.md` or `weekly-substack-report.md` as the starting point for reader-facing copy. They include range metadata, first-seen jobs, dropped jobs, net change, job-category movement, new companies, biggest company movers, freshness notes, notable outliers, factual editor insights, and the permanent public Sheet link.

## Longitudinal Posting Patterns

```sh
npm run jobs:posting-patterns
```

This is a separate, read-only analysis layer for larger historical patterns. It reads every timestamped `01_good_documentation_jobs.csv` snapshot and writes:

```text
data/jobs/posting-patterns/YYYYMMDD-HHMM/
data/jobs/posting-patterns/latest/
```

Use `01_good_documentation_jobs.csv` as the primary source: it is compact, deduped, consistently present, and contains company, source/ATS, apply URL, and ATS-supplied posted date. The report records first/last observed snapshot, persistence, added/removed counts per snapshot, first-seen cadence by company and source, and weekday distributions for available ATS posted dates.

`02_company_coverage.csv` is valuable context when explaining changes in coverage or fetch failures, but should not be mixed into posting counts. `09_ats_health.csv` is an operational crawler-health snapshot, not a per-company posting dataset. `03_top_matches_full.csv` is best reserved for a later, explicit deep dive: it can contain raw `DatePosted` timestamps, but it is a diagnostic export with a much larger and less stable schema. The simple CSV has date-only `Posted Date`, so this report does not infer employer posting *time of day*.

Interpret `First Seen` carefully: it means the job first appeared in a saved feed snapshot, not that the employer posted it at that moment. Refresh frequency, coverage, score thresholds, deduplication, and URL cleanup all influence it. `jobs:trends` remains the better report for reader-facing week-to-week movement; `jobs:posting-patterns` is for evidence-backed research into repeated source/company patterns.

## Read-Only Listing Consolidation Preview

```sh
npm run jobs:test-listing-consolidation
```

This test does not edit the Google Sheets package or change the live dedupe process. It applies the broad D-style title-noise filter to `gsheet-package/latest/01_good_documentation_jobs.csv`, then produces a preview that consolidates only exact normalized company/title matches with different locations. The preview retains all locations and application URLs on each grouped display record.

Outputs are written to `data/jobs/reports/listing-consolidation/`. Review `exact-title-multi-location-groups.csv` before deciding whether this display-only consolidation should be added to package generation. `title-family-review.csv` surfaces patterns such as language-qualified title families for human review only; it must never auto-merge roles whose qualifiers may be material.

Trend reporting can be run manually:

```sh
npm run jobs:trends
```

The full refresh launcher also runs this after rebuilding the Google Sheets package and before validation.

## macOS Launchers

Double-clickable operator launchers live in:

```text
launchers/
```

Files:

- `Refresh Job Feed.command`: refreshes known-good boards, indexes those refreshed batches, plans exploratory batches, runs planned batches with `--dry-run false`, rebuilds the public release, rebuilds the Google Sheets package, checks and safe-prunes deterministic broken links in the newest timestamped package, regenerates trend/Substack reports from the cleaned snapshot, syncs the cleaned package into `data/jobs/gsheet-package/latest/`, runs `jobs:test-all`, refreshes status, then opens `data/jobs/gsheet-package/latest/` only if cleanup, trend generation, and validation pass. Trend outputs live in `data/jobs/trends/latest/`.
- `Install Passive Job Index Refresh.command`: installs the twice-daily 4:00 AM and 4:00 PM snapshot-maintenance job. It refreshes the index without publishing the Sheet.
- `Run Overnight Index Catch-Up.command`: keeps the Mac awake and runs serialized maintenance cycles until no boards are currently due or a safety stop is reached. It refreshes the index without publishing the Sheet.
- `Prepare Weekly Top 5 Substack.command`: regenerates the seven-day trend inputs, opens the latest writing files and weekly publishing runbook, and copies the complete Top 5 drafting request for Codex to the clipboard. It does not publish to Substack.
- `Clean Broken Links.command`: validates the newest timestamped package, checks job URLs, safe-prunes deterministic broken links in that timestamped snapshot, regenerates trend reports from the pruned timestamped packages, syncs the cleaned upload CSV into `data/jobs/gsheet-package/latest/`, analyzes remaining Unknown title categories, validates again, and opens the latest package folder. It keeps `HTTP 403`, timeouts, fetch errors, and other ambiguous rows for review.
- `Dry Run Job Feed.command`: runs the aggressive plan and `jobs:run-planned` in dry-run mode only, then opens or prints `data/jobs/runs/run-planned-batches-latest.md`.
- `Open Latest GSheet Package.command`: opens `data/jobs/gsheet-package/latest/` in Finder.

If macOS blocks a launcher, right-click it and choose **Open**.

Important: `Refresh Job Feed.command` performs real fetching through the known-good refresh lane and the planned batch workflow. It now runs broken-link cleanup, generates trend/Substack reports, and runs validation before opening the Google Sheets package; if cleanup, trend generation, or tests fail, it prints the relevant report paths, refreshes status best-effort, and keeps Terminal open. `Dry Run Job Feed.command` does not fetch jobs; it only shows what would run.

## Automated Validation

```sh
npm run jobs:test-gsheet-package
npm run jobs:test-release
npm run jobs:test-scoring
npm run jobs:test-board-freshness
npm run jobs:test-ats-errors
npm run jobs:test-passive-launcher
npm run jobs:test-ats-alert
npm run jobs:test-title-category
npm run jobs:compare-last-release
npm run jobs:test-trends
npm run jobs:test-all
```

These commands are read-only validation checks. They do not fetch jobs, delete rows, publish, archive, or clean generated outputs.

The operational safeguard tests verify board-count and retry-backoff accounting, Workday/iCIMS error classifications, the passive LaunchAgent repository and PATH configuration, ATS anomaly thresholds, and representative title-category fixtures. `jobs:test-all` runs all of them before the refresh launcher opens the package.

Generate the current operational reports directly with:

```sh
npm run jobs:board-freshness
npm run jobs:ats-alert
npm run jobs:unknown-categories
```

The Unknown-category report is written to `data/jobs/reports/unknown-title-category-analysis.md` with CSV and JSON companions. It separates remaining classification gaps from broader adjacent-technical roles so the taxonomy can evolve without narrowing the job feed.

`jobs:test-gsheet-package` validates the latest Google Sheets package, defaulting to:

```text
data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv
```

It checks required upload columns, row count, duplicate or missing Apply Link values, blank Title or Company values, optional internal Company Coverage shape, package manifest presence, and row-count change against the newest timestamped package. Duplicate Apply Links are a blocking failure so catalog aliases cannot publish the same job twice. It writes:

```text
data/jobs/reports/test-gsheet-package-results.json
data/jobs/reports/test-gsheet-package-results.md
```

Critical upload-file problems exit non-zero. Company Coverage issues and moderate row-count changes are warnings.

`jobs:test-release` validates that the current completed release is usable. It checks required public/package/report files, verifies that the latest feed, Good Documentation Jobs, and Company Coverage have rows, and writes:

```text
data/jobs/reports/test-release-results.json
data/jobs/reports/test-release-results.md
```

Critical failures exit non-zero. Smaller issues, such as a very small Good Documentation Jobs file or low crawl coverage, are warnings.

`jobs:test-scoring` runs known title examples through the actual Writer Fit scoring pipeline and checks minimum/maximum tier expectations from:

```text
test/writer-fit-regression.json
```

It writes:

```text
data/jobs/reports/test-scoring-results.json
data/jobs/reports/test-scoring-results.md
```

This protects against silent regressions in title matching, title review buckets, and Writer Fit tier behavior.

`jobs:compare-last-release` compares archived public release folders when they exist. Public release archives are now opt-in with `npm run jobs:public-release -- --archive-release true`, so this check may write a warning report when `data/jobs/public/releases/` is empty. For the normal Google Sheets workflow, use `jobs:trends` to compare timestamped `data/jobs/gsheet-package/YYYYMMDD-HHMM/01_good_documentation_jobs.csv` snapshots. It writes:

```text
data/jobs/reports/release-comparison.json
data/jobs/reports/release-comparison.md
```

If there are fewer than two release folders, it writes a warning report and does not fail.

`jobs:test-trends` validates trend report quality before Substack use. It checks required trend files, catches raw ISO timestamp regressions in Markdown, warns about raw snapshot IDs, verifies the permanent public Google Sheet link, and checks trend manifest sanity. It writes:

```text
data/jobs/reports/test-trends-results.json
data/jobs/reports/test-trends-results.md
```

Failures exit non-zero. Warnings are reported but exit 0.

`jobs:test-all` runs operational safeguards, release validation, scoring and category regressions, release comparison, and trend report validation in sequence. The status dashboard includes these test results when the reports exist.

## Writer Fit Scoring v3

Writer Fit Scoring v3 is a transparent Excel filtering score for technical writing, documentation, content, knowledge, product education, UX writing, developer education, DevRel/content, and related roles. It is not final application scoring and it should not be treated as a hiring or eligibility decision.

Every fetched job row keeps these fields:

```text
WriterFitVersion
WriterFitBaseScore
WriterFitScore
WriterFitTier
WriterFitReasons
WriterFitPositiveSignals
WriterFitNegativeSignals
WriterFitPenaltySignals
WriterFitDemotionReason
WriterFitGuardrailApplied
```

The score combines visible signals already present in the export:

- title review bucket
- salary detection
- leadership and IC title signals
- documentation/content/knowledge/domain signals
- export quality
- possible duplicate status

Remote/location and US eligibility fields remain in the export for filtering, but they do not contribute to `WriterFitScore`.

V3 keeps the stricter penalty and guardrail layer for generic non-writer roles. Software engineer, backend/frontend/full-stack engineer, generic developer, support engineer, architect, therapist/clinical, video editor, product designer, UX designer, and similar titles are demoted unless there is explicit documentation, writing, content, knowledge base, education, enablement, or DevRel evidence.

Strong watchlist title matches, such as `Technical Writer`, `Staff Technical Writer`, `Product Documentation Engineer`, `Documentation Engineer`, `Technical Documentation Specialist`, `Technical Content Engineer`, and `UX Writer`, receive an A-tier floor when they have strong writer/docs evidence and no severe non-writer penalty applies. Narrow explicit writer title phrases such as `Content Writer` also receive that floor even when the current watchlist match is not exact enough.

A/B tiers require a strong writer/docs signal such as `technical writer`, `technical writing`, `documentation`, `docs`, `documentation engineer`, `developer documentation`, `api documentation`, `technical content`, `content designer`, `ux writer`, `knowledge base`, `technical publications`, `product education`, `developer advocate`, `developer relations`, or `devrel`. If a row would otherwise score A/B without that evidence, it is capped at `59` and marked with `WriterFitGuardrailApplied = TRUE`.

Scores are clamped from `0` to `100` and assigned tiers:

```text
A: 80-100
B: 60-79
C: 40-59
D: 20-39
F: 0-19
```

Rows are never deleted based on Writer Fit score. The reasons columns are pipe-separated so a reviewer can see why a role landed in a tier, then filter or override in Excel. A practical first pass is `WriterFitTier = A` or `B`, then add `C` for broader review. Keep `D` and `F` available when auditing misses or improving the watchlist.

The firehose still preserves generic SWE/architect/developer/designer/support rows. V3 only changes score, tier, and diagnostics. `data/jobs/public/slices/public-job-feed-demoted-high-score.csv/json` shows rows whose base score was at least `75` but were demoted by penalties or A/B guardrails.

## Run Everything

```sh
npm run catalogs:all
```

This downloads the catalogs, creates the normalized CSV and JSON exports, writes the analysis reports, and then builds the crawl queue.

## Current Catalog Sources

- Ashby
- BambooHR
- Greenhouse
- iCIMS
- Lever
- Workday

The catalog source list lives in:

```text
src/config/catalog-sources.js
```
# Job Finder Consumer Export

The private Job Finder integration uses a small, versioned consumer slice
instead of loading the multi-gigabyte public firehose on each review session.

```bash
npm run jobs:export-job-finder
```

By default this reads the sibling `../job-finder/job-titles.md` personal policy
and writes:

`data/jobs/consumers/job-finder/latest.json`

Use `JOB_FINDER_TITLES_PATH` or `--titles` to override the title policy path.
Run `npm run jobs:test-job-finder-consumer` for the focused contract tests.
