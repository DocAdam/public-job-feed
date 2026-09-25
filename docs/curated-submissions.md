# Curated submissions

Use a curated submission when you have a **first-party employer posting** that is not yet coming through the normal ATS catalogs. The submission becomes part of the Public Job Feed only after it passes the same checks as every other job.

The intake file is `data/config/curated-submissions.json`.

## Add a submission

Give Codex the employer name and the first-party job URL. Do not use aggregator links, and do not fill in missing job facts by hand.

Each entry needs:

- `Id` — a stable, unique identifier.
- `Company` — the employer's display name.
- `URL` — the employer's public job page.
- `SubmittedAt` — when the entry was added.
- `Status` — `PENDING`, `APPROVED`, `PAUSED`, or `CLOSED`.

Only `APPROVED` entries are checked during `npm run jobs:public-release`.

## What happens during a refresh

1. The Public Job Feed fetches the employer page again.
2. The page must expose a public `JobPosting` record.
3. The job is normalized, scored, checked for export quality, and deduplicated against the full feed.
4. If it qualifies, it appears in the next Google Sheets package.

The original employer page remains the deduplication key. If the page provides a more direct application URL, the Good Documentation Jobs CSV uses that link for `Apply Link`.

## If a page cannot be checked

Every check is recorded in `data/jobs/reports/curated-submissions-health.json`.

- A temporary or ambiguous failure keeps the last verified record in the feed.
- A confirmed `404` or `410` response leaves the record out of that release and removes its cached fallback.
- `PENDING`, `PAUSED`, and `CLOSED` entries stay in the intake file but are not included.

## Test and verify

`npm run jobs:test-curated-submissions` runs local fixtures. It does not make
network requests or change the intake, cache, or production health report.

`npm run jobs:verify-curated-submissions` makes live requests for approved
entries and updates the cache and health report. It does not build the feed.
A source-check result does not prove final export inclusion; inspect the
release and package after their documented build steps.

The package evidence report shows source verification and exact-URL package
inclusion separately. A passing source check can still produce no public
package row after eligibility, scoring, duplicate, and URL checks.
