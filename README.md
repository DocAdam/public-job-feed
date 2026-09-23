# Public Job Feed

Public Job Feed is a regularly refreshed collection of direct employer job postings for technical writing, documentation, content design, developer education, and related work.

[Browse Good Documentation Jobs](https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing)

The Google Sheet is the reader-facing view. This repository is the pipeline that finds postings, checks them, and prepares the CSV files behind it.

### Names used in this guide

- **Good Documentation Jobs** is the shared Google Sheet for readers.
- **Public Job Feed** is the project and the generated job data behind that Sheet.
- **Google Sheets package** is the local set of CSV files prepared for manual upload.
- **First-party employer posting** is a job page on the employer's own career site.

## What you can expect

- Links point to employer career sites whenever possible.
- Each listing includes a title, company, location, application link, fit score, and last-checked time.
- The feed is broad by design. A score helps you filter; it is not a judgment about whether a role is worth applying for.
- A listing can change or close between refreshes. Always confirm the employer page before applying.

The feed is useful, not exhaustive. Some employers use career systems that are difficult to index reliably, and a successful fetch does not guarantee every open role is present.

## How listings get into the feed

Most roles come from public employer career boards. The pipeline collects board records, fetches available postings, normalizes the data, detects common fields such as location and salary, and applies a transparent writer-fit score.

The main view favors strong documentation-related matches. The full internal feed keeps lower-signal, duplicate, and review-needed records available for auditing instead of silently discarding them.

### Writer-fit scores

Scores are a practical sorting aid:

- **A** — strong documentation, technical writing, content design, developer education, or closely related signal.
- **B** — a promising match that merits review.
- **C** — relevant or adjacent work worth browsing in a broader search.
- **D/F** — retained internally for coverage and scoring review; normally not the best place to start.

Titles, descriptions, and export quality all affect the score. Read the posting itself before deciding whether it fits.

## Suggest a job

If you know about a role that belongs in the list, send Codex the employer name and a first-party job URL. Direct employer listings are preferred over aggregators or reposts.

Approval adds a URL to intake. The next refresh checks its source data and applies scoring and duplicate checks. A temporary source failure can retain the last verified record. Check the submission health report and the final export to confirm inclusion. Approval does not guarantee that a role is open or included.

For the contributor workflow and verification rules, see [curated direct employer submissions](docs/curated-submissions.md).

## Freshness and accuracy

The project checks boards on a recurring schedule. A board attempt can fail; a successful snapshot records the latest usable board result. A URL check has its own date and does not update the board fetch date. A temporary employer-site failure does not immediately remove a previously verified curated listing; confirmed `404` and `410` closures do.

Bot checks, rate limits, and temporary outages do not establish that a job is closed. User browser observations are recorded separately from automated results. Writing-fit flags are separate from link and closure checks.

Location, remote status, and salary are detected from public posting text. They can be incomplete or imperfect, so use them as filters rather than guarantees.

The project does not make application decisions, track applicant outcomes, or modify Job Finder records.

## For maintainers

The normal macOS workflow is:

```sh
open launchers/Refresh\ Job\ Feed.command
```

It refreshes due boards, rebuilds the current feed and Google Sheets package, checks links, validates the result, and updates operational reports. It does not publish directly to Google Sheets or Substack.

Each refresh uses this sequence:

1. Maintain catalogs and check due boards.
2. Build the current feed from indexed board results.
3. Export the local Job Finder consumer file.
4. Build the daily Google Sheets package.
5. Check links, safely prune confirmed invalid links, and build the review report.
6. Generate the separate and combined remote reports.
7. Run validation tests.
8. Record the refresh result and sync the final dashboard to both package copies.

The desktop entry uses `launchers/Refresh Job Feed.desktop-wrapper.sh` to start
the repository launcher. Keep one process definition in the repository.
The consumer export is a local file; it does not modify Job Finder records.

### Check the refresh result

Before manual publication, check these files in `data/jobs/reports/`:

- `refresh-run.json`: launcher path, hash, revision, run ID, and result.
- `test-all-results.json`: full test result and the package ID tested.
- `project-status-dashboard.md`: source dates, current failures, and warnings.
- `package-evidence-review.md`: automated evidence and attributed user reviews.
- `refresh-output-validation.json`: whether required outputs use the current inputs.

A recent report-generation time does not make its source data current. A test
with sample records does not establish that a live refresh completed. Check
package IDs, source timestamps, and each report's status.

See [Status dashboard](docs/status-dashboard.md) for commands, status meanings,
and the difference between board freshness, URL checks, and job status.
Publication to Google Sheets or Substack remains a manual step.

### Daily job reports

The refresh generates separate U.S. and international reports and one combined
report with a daily snapshot. They compare saved packages. Added and removed
jobs describe list membership, not posting or closure dates.

Run `npm run allremotediff` to create and open the combined report. Use
`npm run jobs:report-all-remote` to generate it without opening an application.
See [Daily job reports](docs/daily-job-reports.md) for filters, focused views,
location rules, output paths, and examples.

The canonical current-feed files are:

```text
data/jobs/public/public-job-feed-latest.json
data/jobs/public/public-job-feed-latest.csv
```

Job Finder-compatible exports read the JSON feed. The main Google Sheets jobs table is generated from deduplicated top-match JSON; detailed CSV files are included for review. Other full-feed paths are compatibility links rather than additional copies.

Useful commands:

```sh
# Bring overdue board checks up to date before a large refresh.
open launchers/Run\ Overnight\ Index\ Catch-Up.command

# Rebuild the current feed from indexed batches.
npm run jobs:public-release -- --profile daily

# Build the local Google Sheets upload package.
npm run jobs:gsheet-package -- --profile daily

# Validate the upload package.
npm run jobs:test-gsheet-package

# Review application links without changing the package.
npm run jobs:gsheet-check-urls

# Test curated-submission logic with local fixtures.
npm run jobs:test-curated-submissions

# Fetch approved submissions and update their cache and health report.
npm run jobs:verify-curated-submissions

# Create the US remote daily comparison report.
npm run jobs:report-us-remote

# Create the international remote daily comparison report.
npm run jobs:report-international-remote

# Create and open one remote report.
npm run remotediff
npm run internationaldiff

# Open the remote comparison with the short daily snapshot at the top.
npm run allremotediff

# Write a raw-batch retention plan without deleting batches.
npm run jobs:plan-batch-retention
```

The primary upload file is:

```text
data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv
```

The URL review only marks deterministic closures as safe to prune. This includes `404`/`410` responses, closed-job pages, known bad redirects, and an Ashby job URL that returns only its generic `Jobs` shell instead of a role page. Rate limits, access blocks, timeouts, and other ambiguous failures stay in the review report.

### Storage and retention

The project keeps current board inputs, compact fetch history, and a short window of raw batches for recovery. New batch runs use JSON as the machine-readable format; the large batch CSV is available only when explicitly requested for investigation.

Batch retirement is a separate maintenance task, never part of the normal refresh. Review the plan first, then use the guarded command only when you intend to retire validated, superseded batches:

```sh
npm run jobs:retire-batches -- --apply
```

For the retention rules, recovery behavior, and full-slice workflow, see [Storage lifecycle](docs/storage-lifecycle.md).

## Project guides

| Guide | Use it for |
| --- | --- |
| [Refresh process diagram](docs/refresh-job-feed-process.md) | The refresh steps, data inputs, checks, and manual publication step. |
| [Status dashboard](docs/status-dashboard.md) | Run evidence, source dates, tests, and user review. |
| [Daily job reports](docs/daily-job-reports.md) | Remote comparisons, focused views, and command options. |
| [Curated submissions](docs/curated-submissions.md) | Adding and verifying a direct employer listing. |
| [Job-index maintenance](docs/job-index-maintenance.md) | Board freshness, retries, and scheduled maintenance. |
| [ATS behavior](docs/ats-api-behavior.md) | Supported ATS sources and known limitations. |
| [Connect to public ATS job boards](docs/connect-public-ats-job-boards.md) | An overview and provider-specific guides for the project’s ATS connections. |
| [Understand Public Job Feed data](docs/public-job-feed-data.md) | Data provenance, field groups, outputs, and safe use of the feed. |
| [Google Sheets package cleanup](docs/gsheet-csv-cleanup-plan.md) | Checking and safely pruning deterministic broken links. |
| [Storage lifecycle](docs/storage-lifecycle.md) | Keeping current data, compact history, and safe batch retention boundaries. |
| [Weekly Top 5 workflow](docs/weekly-top-five-substack.md) | Preparing the editorial job-roundup draft. |

## Development notes

Node.js 26.x is the supported runtime for this checkout. Tests were run with Node.js 26.3.1. The locked SQLite dependency does not support Node.js 18. The repository intentionally keeps raw catalogs, generated packages, and operational reports separate from source code. Treat generated data as read-only unless you are running its documented workflow.

Run the focused test after each source change and fix any failures before continuing. The broad suite is available through:

```sh
npm run jobs:test-all
```

## Scope

This project prepares job-listing data. It does not guarantee that every role is open, that every employer is covered, or that a role is appropriate for a particular person. The employer's application page is the source of truth.
