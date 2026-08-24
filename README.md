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

Approved submissions are verified during the next refresh, passed through the same scoring and duplicate checks as catalog-sourced roles, and added only when the posting is live and eligible. A submission is not a paid placement or a guarantee of inclusion.

For the contributor workflow and verification rules, see [curated direct employer submissions](docs/curated-submissions.md).

## Freshness and accuracy

The project checks boards on a recurring schedule and records when a listing was last seen. A temporary employer-site failure does not immediately remove a previously verified curated listing; confirmed `404` and `410` closures do.

Location, remote status, and salary are detected from public posting text. They can be incomplete or imperfect, so use them as filters rather than guarantees.

The project does not make application decisions, track applicant outcomes, or modify Job Finder records.

## For maintainers

The normal macOS workflow is:

```sh
open launchers/Refresh\ Job\ Feed.command
```

It refreshes job data, rebuilds the current Public Job Feed release and Google Sheets package, checks links, validates the package, and updates operational reports. It does not publish directly to Google Sheets or Substack.

Useful commands:

```sh
# Rebuild the current feed from indexed batches.
npm run jobs:public-release

# Build the local Google Sheets upload package.
npm run jobs:gsheet-package

# Validate the upload package.
npm run jobs:test-gsheet-package

# Verify approved direct-employer submissions.
npm run jobs:test-curated-submissions
```

The primary upload file is:

```text
data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv
```

## Project guides

| Guide | Use it for |
| --- | --- |
| [Curated submissions](docs/curated-submissions.md) | Adding and verifying a direct employer listing. |
| [Job-index maintenance](docs/job-index-maintenance.md) | Board freshness, retries, and scheduled maintenance. |
| [ATS behavior](docs/ats-api-behavior.md) | Supported ATS sources and known limitations. |
| [Google Sheets package cleanup](docs/gsheet-csv-cleanup-plan.md) | Checking and safely pruning deterministic broken links. |
| [Weekly Top 5 workflow](docs/weekly-top-five-substack.md) | Preparing the editorial job-roundup draft. |

## Development notes

Node.js 18 or later is required. The repository intentionally keeps raw catalogs, generated packages, and operational reports separate from source code. Treat generated data as read-only unless you are running its documented workflow.

Before changing source logic, run the focused test for the area you changed. The broad suite is available through:

```sh
npm run jobs:test-all
```

## Scope

This project prepares job-listing data. It does not guarantee that every role is open, that every employer is covered, or that a role is appropriate for a particular person. The employer's application page is the source of truth.
