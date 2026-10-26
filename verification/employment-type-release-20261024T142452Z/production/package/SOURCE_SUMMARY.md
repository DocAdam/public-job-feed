# Public Job Feed Internal Release Summary

Generated: 2026-10-24T14:38:14.032Z

## Counts

- Total rows: 836867
- ATS included: direct-employer|ashby|greenhouse|lever|workday|bamboohr|icims
- Writer focus: 51870
- Strong matches / top: 998
- Remote US likely: 28128
- Remote writer focus: 2565
- Salary detected: 84431
- Review needed: 585531
- Demoted high-score: 4
- Deduped firehose: 0
- Deduped writer focus: 0
- Deduped strong/top: 831
- Deduped remote writer focus: 0

## Recommended Google Sheets Source

`data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`

Use Good Documentation Jobs as the primary upload and preserve the existing `remote_jobs_pivot` derived view. `02_company_coverage.csv` and `03_top_matches_full.csv` remain available for internal diagnostics. The full firehose remains available internally for debugging and audit work.

## Files

- `public-job-feed-latest.csv/json`: Complete latest feed. Nothing is filtered out.
- `public-job-feed-top.csv/json`: Sorted shortlist using the strong-match rows.
- `slices/public-job-feed-firehose.csv/json`: Full firehose copy of the latest feed.
- `slices/public-job-feed-writer-focus.csv/json`: Broad writer/docs/content review slice.
- `slices/public-job-feed-strong-matches.csv/json`: Smaller high-signal writer match slice.
- `slices/public-job-feed-remote-us-likely.csv/json`: Rows marked Remote and US remote eligible.
- `slices/public-job-feed-remote-writer-focus.csv/json`: Remote US likely rows with writer-focus signals.
- `slices/public-job-feed-salary-detected.csv/json`: Rows where salary detection found a range.
- `slices/public-job-feed-review-needed.csv/json`: Rows needing review because of quality or duplicate flags.
- `slices/public-job-feed-demoted-high-score.csv/json`: Rows demoted by Writer Fit v3 penalties or A/B guardrails.
- `slices/public-job-feed-slice-summary.csv/json`: Counts and quick metrics for each slice.
- `slices/deduped/public-job-feed-deduped-firehose.csv/json`: Firehose convenience view with one selected representative per duplicate group.
- `slices/deduped/public-job-feed-deduped-writer-focus.csv/json`: Deduped writer-focus review set.
- `slices/deduped/public-job-feed-deduped-strong-matches.csv/json`: Deduped strong-match shortlist.
- `slices/deduped/public-job-feed-deduped-remote-writer-focus.csv/json`: Deduped remote writer-focus set.
- `slices/deduped/public-job-feed-deduped-top.csv/json`: Deduped top shortlist.
- `slices/deduped/public-job-feed-dedupe-summary.csv/json`: Counts showing rows removed from each deduped convenience view.
- `slices/deduped/public-job-feed-dedupe-decisions.csv/json`: Duplicate group selection diagnostics.
- `OPERATOR_NOTES.md`: Internal operator notes for inspecting outputs and sanity-checking counts.
- `PUBLISHING_PREP.md`: Internal publishing prep notes for moving selected CSVs into Google Sheets.
- `public-job-feed-data-dictionary.csv/md`: Column definitions for internal review and future Sheet tabs.

## Internal Docs

- `OPERATOR_NOTES.md`: internal operator notes for file selection and sanity checks.
- `PUBLISHING_PREP.md`: internal prep notes for moving selected CSVs into Google Sheets and sharing the Sheet link.
- `public-job-feed-data-dictionary.csv/md`: internal column reference for review and future Sheet tabs.

## Notes

Rows are preserved in the main latest feed and firehose export. Quality issues, possible duplicates, and cross-ATS duplicates are flagged for review instead of being deleted.

Deduped exports are convenience views for sharing and review. They select one representative row per duplicate group, but the complete firehose remains available unchanged.

This release does not publish to Substack automatically. The repo Markdown docs are internal operator/publisher notes, not the final public presentation layer.
