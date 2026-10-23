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

Bot checks, rate limits, and temporary outages do not establish that a job is closed. User browser observations are recorded separately from automated results. Writing-fit flags are separate from link and closure checks. Exact-role package exclusions retain an audit record; they do not delete source records.

Location, remote status, and salary are detected from public posting text. They can be incomplete or imperfect, so use them as filters rather than guarantees.

The project does not make application decisions, track applicant outcomes, or modify Job Finder records.

## For maintainers

The normal macOS workflow is:

```sh
open launchers/Refresh\ Job\ Feed.command
```

It refreshes due boards, rebuilds the current feed and Google Sheets package, checks links, and validates the result. It then updates and audits history and checks a verified backup on 1Pugh. It does not publish directly to Google Sheets or Substack.

The launcher holds a lock for the complete refresh. A second launcher stops
before it starts work. An interrupted lock requires an owner check; it does not
expire by age.

Each refresh uses this sequence:

1. Maintain catalogs and check due boards.
2. Build the current feed from indexed board results.
3. Export the local Job Finder consumer file.
4. Build the daily Google Sheets package.
5. Check links, safely prune confirmed invalid links, and build the review report.
6. Generate the separate and combined remote reports.
7. Run validation tests.
8. Update and audit history, then check the 1Pugh backup and managed retention.
9. Record the feed result, sync the final dashboard to both package copies, and check reported output paths.

Feed, history, and backup results are separate. A successful feed result does
not establish a successful history update or backup. A missing 1Pugh drive skips
backup and retention. History can still update if its source checks pass.

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
- `daily-history-backup.json` and `.md`: history, backup, retention, and last verified backup results.

A recent report-generation time does not make its source data current. A test
with sample records does not establish that a live refresh completed. Check
package IDs, source timestamps, and each report's status.
The history/backup report must have the same run ID as the refresh. An older
successful backup report does not verify a later refresh.

See [Status dashboard](docs/status-dashboard.md) for commands, status meanings,
and the difference between board freshness, URL checks, and job status.
Publication to Google Sheets or Substack remains a manual step.

### Review evidence and package exclusions

The evidence report shows source verification and final package inclusion
separately for a submitted role. Earlier browser observations retain their
dates and package IDs; they do not confirm that a posting is still open.
The freshness review separates board checks older than seven days, older
than fourteen days, and checks with no usable date.

Exact-URL writing-fit exclusions apply before public rows are grouped. Each
package includes `public-package-exclusions.csv` with the excluded URL,
review date, and reason. Raw records, scores, and diagnostic exports remain
available. Exclusion changes take effect on the next package build.

The [October 12 role review](docs/job-scope-review-2026-10-12.md) records
50 approved posting exclusions and six roles approved to remain.
The exclusion records are in
`src/config/public-package-role-exclusions.json`. They use exact posting URLs;
`specialist` alone does not exclude a role. A new posting URL requires a
separate review. Existing packages and reports remain unchanged until their
normal build commands run.

The URL-failure report stays in the timestamped package identified by the
`latest` manifest. The launcher checks reported file paths before it finishes;
a missing required file leaves the run marked `FAILED`.

To preview the review from saved data without replacing run reports:

```sh
npm run jobs:review-package-evidence -- --output-dir /tmp/public-job-feed-review-preview
```

Read baseline-change alerts and absolute failure rates together. No baseline
alert does not mean low failures. Inventory and cleanup figures describe the
saved report dates shown beside them.

### Daily job reports

The refresh generates separate U.S. and international reports and one combined
report with a daily snapshot. They compare saved packages. Added and removed
jobs describe list membership, not posting or closure dates.

Run `npm run allremotediff` to create and open the combined report. Use
`npm run jobs:report-all-remote` to generate it without opening an application.
Run `npm run allremotediff -- --substack` to create and open a separate,
Substack Markdown input file at
`data/jobs/reports/substack-remote-jobs.md`. This output uses the current saved
jobs and the existing U.S. and international remote filters. It lists jobs by
posted date, newest first. Jobs without a posted date appear after dated jobs.
The command does not publish to Substack or change the other reports.
Run `npm run jobs:report-substack-full` to create the full Substack report at
`data/jobs/reports/substack-full-report.md`. This report resolves the selected
records in the latest saved package against the canonical feed. It retains the
saved package values and compares its detailed shortlist with the previous
package's detailed shortlist. It includes remote, hybrid, onsite, and unknown
arrangements before public-list location grouping and link removal. It is not
the complete collected feed. The command does not refresh or publish.
Both Substack outputs show the source package date and daily list changes.
After generating both outputs, run `npm run jobs:validate-refresh-output -- --publication`
to check their package IDs, source dates, and statistics against saved records.
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

# Create and open the remote Substack Markdown input.
npm run allremotediff -- --substack

# Create the full Substack report without opening or publishing it.
npm run jobs:report-substack-full

# Write a raw-batch retention plan without deleting batches.
npm run jobs:plan-batch-retention
```

The primary upload file is:

```text
data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv
```

The URL review only marks deterministic closures as safe to prune. This includes `404`/`410` responses, closed-job pages, known bad redirects, and an Ashby job URL that returns only its generic `Jobs` shell instead of a role page. Rate limits, access blocks, timeouts, and other ambiguous failures stay in the review report.

### Saved job history

The history database uses compact storage while it retains raw rows, resolved
observations, public-list membership, and exceptions as separate evidence.
Dated CSV packages remain the source of truth. History events describe saved
list changes; they do not prove employer closure or reposting.

Use `npm run jobs:history-update`, `npm run jobs:history-audit`, and
`npm run jobs:history-report`. The commands select the writer from the existing
database format. Updates use a staged copy and a shared history lock. Format
migration and recovery require a separate reviewed operation. Keep source
packages and recovery records. Do not replace newer accepted history with an
older backup that contains fewer snapshots.

### Storage and retention

The project keeps current board inputs, compact fetch history, and a short window of raw batches for recovery. New batch runs use JSON as the machine-readable format; the large batch CSV is available only when explicitly requested for investigation.

Raw-batch retirement is a separate approved maintenance task. It is never part
of the normal refresh. First create a fresh plan and run its non-deleting check:

```sh
npm run jobs:plan-batch-retention -- --output-dir /absolute/path/to/review
npm run jobs:retire-batches -- --plan-dir /absolute/path/to/review --output-dir /absolute/path/to/review
```

The second command is a dry run. Review the exact candidates and decide whether
a verified raw-payload archive is required. Only after approval, add `--apply`
to that retirement command. Plans expire after 24 hours; changed inputs require
a new plan. See [Storage lifecycle](docs/storage-lifecycle.md) for the checks,
locks, recovery limits, and full-slice workflow.

Managed daily backups have a separate guarded retention policy. It can remove
eligible daily backups and registered local recovery payloads. It does not adopt
legacy archives, backups, or migration controls. See
[Daily history and 1Pugh backup](docs/daily-history-backups.md).

### Completed review records

Use the [review-record index](docs/plans/README.md) for completed migrations,
cleanup receipts, test results, failed attempts, and recovery evidence. Current
procedures remain in the operating guides. Old counts and removal lists are
historical; do not rerun their execution helpers.

The P01 document cleanup retained the original evidence paths and removed three
log copies that exactly matched retained logs in the same operation folders.
The index records each former path, retained path, size, and hash. Keep original
manifests and recovery records. When records change, update this index and the
README, then check references and links in the same group.

## Project guides

| Guide | Use it for |
| --- | --- |
| [Refresh process diagram](docs/refresh-job-feed-process.md) | The refresh steps, data inputs, checks, and manual publication step. |
| [Status dashboard](docs/status-dashboard.md) | Run evidence, source dates, tests, and user review. |
| [Daily job reports](docs/daily-job-reports.md) | Remote comparisons, focused views, and command options. |
| [Curated submissions](docs/curated-submissions.md) | Adding and verifying a direct employer listing. |
| [Job-index maintenance](docs/job-index-maintenance.md) | Board freshness, retries, and scheduled maintenance. |
| [Saved source failure review](docs/source-failure-review-2026-09-25.md) | September 25 evidence, sample records, and limits of offline diagnosis. |
| [Bounded failure sampling](docs/failure-evidence-sampling.md) | Selected board probes, saved evidence, tests, and limits. |
| [ATS behavior](docs/ats-api-behavior.md) | Supported ATS sources and known limitations. |
| [Connect to public ATS job boards](docs/connect-public-ats-job-boards.md) | An overview and provider-specific guides for the project’s ATS connections. |
| [Understand Public Job Feed data](docs/public-job-feed-data.md) | Data provenance, field groups, outputs, and safe use of the feed. |
| [Google Sheets package cleanup](docs/gsheet-csv-cleanup-plan.md) | Checking and safely pruning deterministic broken links. |
| [Storage lifecycle](docs/storage-lifecycle.md) | Keeping current data, compact history, and safe batch retention boundaries. |
| [Daily history and backup](docs/daily-history-backups.md) | History updates, 1Pugh checks, restore tests, and managed retention. |
| [Weekly Top 5 workflow](docs/weekly-top-five-substack.md) | Preparing the editorial job-roundup draft. |

## Development notes

Node.js 26.x is the supported runtime for this checkout. Tests were run with Node.js 26.3.1. The locked SQLite dependency does not support Node.js 18. The repository intentionally keeps raw catalogs, generated packages, and operational reports separate from source code. Treat generated data as read-only unless you are running its documented workflow.

Run the focused test after each source change and fix any failures before continuing. The broad suite is available through:

```sh
npm run jobs:test-all
```

## Scope

This project prepares job-listing data. It does not guarantee that every role is open, that every employer is covered, or that a role is appropriate for a particular person. The employer's application page is the source of truth.
