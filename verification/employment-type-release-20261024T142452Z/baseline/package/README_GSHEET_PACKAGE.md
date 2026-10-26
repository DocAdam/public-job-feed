# Google Sheets Handoff Package

Generated: 2026-10-24T12:39:25.399Z

This folder is a local handoff package for manually uploading selected CSVs to Google Sheets. It does not upload anything, publish anything, or replace the source exports.

## Current Public Google Sheet

1. `01_good_documentation_jobs`: the main public jobs table, replaced from `01_good_documentation_jobs.csv`.
2. `remote_jobs_pivot`: the existing filtered remote-jobs view derived from the main jobs table. Preserve this tab when replacing main-tab data.

## Main Public File

`01_good_documentation_jobs.csv` is the main tab for normal users. It is small, deduped, high-signal, and intentionally minimal.

`02_company_coverage.csv` is retained locally for internal transparency and debugging. It is not part of the current public Sheet.

The data is generated from ATS/company catalogs and may not be exhaustive for every employer.

Use `03_top_matches_full.csv` only for internal diagnostic columns. The public remote tab is maintained in Google Sheets as a filtered view of the main table.

`11_demoted_high_score.csv` is optional diagnostic evidence for roles that previously looked high-scoring but were demoted by Writer Fit v3.

## Full Firehose Warning

Timestamped packages intentionally omit `06_full_firehose.csv` to avoid duplicating multi-GB processing files. The firehose remains available in `data/jobs/gsheet-package/latest/`.

## Freshness Fields

- `Posted Date` = date supplied by the ATS if available.
- `Age (Days)` = days between Posted Date and the report generation date.
- `Last Checked` = when the system last saw the job in the ATS.
- `Report Run Date` = package generation time, stored in `00_start_here.csv` instead of repeated on every job row.
- A recently checked job is more likely to still be open, but users should always click through to verify.

## Links

The simple jobs CSV keeps `Apply Link` as a plain URL. Google Sheets usually auto-links URLs, or you can use Insert > Link if needed.
When exact company/title postings are consolidated across locations, `Additional Apply Links` preserves the other location-specific application URLs.

## Suggested First Filter

- `01_good_documentation_jobs.csv` is sorted by `Age (Days)` ascending, then `Writer Fit Score` descending.
- Use `Work Arrangement` as a filter, not a score.
- Preserve the existing `remote_jobs_pivot` tab when replacing the main tab's values.

## CSV Files Included

- `public-package-exclusions.csv` -> No tab
- `00_start_here.csv` -> Start Here
- `01_good_documentation_jobs.csv` -> Good Documentation Jobs
- `02_company_coverage.csv` -> No tab
- `03_top_matches_full.csv` -> Top Matches
- `07_data_dictionary.csv` -> Data Dictionary
- `09_ats_health.csv` -> ATS Health
- `10_ats_recommendations.csv` -> ATS Recommendations

## Internal Notes

`OPERATOR_NOTES.md`, `PUBLISHING_PREP.md`, `SOURCE_SUMMARY.md`, and `PROJECT_STATUS_DASHBOARD.md` are internal operator/publisher notes. They are not the final public presentation layer.
