# Publishing Prep

Generated: 2026-10-24T12:24:04.783Z

These are internal publishing prep notes. They are not public-facing documentation.

## Recommended Sharing Path

1. Generate a release with `npm run jobs:public-release`.
2. Inspect the deduped CSVs in `data/jobs/public/` and the release folder.
3. Upload the selected CSV to Google Sheets.
4. Apply filters, freeze the header row, and add conditional formatting.
5. Share the Google Sheet link in Substack.

## Recommended Google Sheets Source Files

- `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv` as the main tab after running `npm run jobs:gsheet-package`
- `data/jobs/gsheet-package/latest/02_company_coverage.csv` for internal coverage diagnostics only
- `data/jobs/gsheet-package/latest/03_top_matches_full.csv` only if diagnostic columns are needed
- `public-job-feed-deduped-remote-writer-focus.csv`
- `public-job-feed-deduped-writer-focus.csv`
- `public-job-feed-deduped-top.csv`
- `public-job-feed-latest.csv` only if sharing the full firehose

## Suggested Sheet Tabs

- `01_good_documentation_jobs`
- `remote_jobs_pivot` (preserve this derived remote view when replacing the main data)

## Suggested Sheet Setup

- Freeze the first row.
- Turn on filters.
- Hide or collapse `Description` if the sheet feels too heavy.
- Consider conditional formatting for `WriterFitTier`, `RemoteStatus`, `USRemoteEligible`, `ExportQualityFlag`, and `PossibleDuplicate`.
- Keep the repo Markdown docs internal; write any public-facing explanatory text separately in Substack or in a curated Sheet `Start Here` tab.
