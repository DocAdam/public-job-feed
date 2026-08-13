# Google Sheets CSV Cleanup Plan

This plan covers cleanup after URL pruning for Google Sheets handoff packages.

## Goal

Keep the final pruned Google Sheets upload CSV and remove temporary URL-check artifacts from the package folder after review and pruning are complete.

Primary file:

- `01_good_documentation_jobs.csv`

Temporary pruning/review files:

- `01_good_documentation_jobs-before-url-prune.csv`
- `01_good_documentation_jobs-url-check-summary.json`
- `01_good_documentation_jobs-url-check-summary.md`
- `01_good_documentation_jobs-url-failures.csv`
- `01_good_documentation_jobs-url-review.csv`

## Scope

Apply this cleanup to a completed package folder, such as:

- `data/jobs/gsheet-package/latest/`
- `data/jobs/gsheet-package/latest/`
- `data/jobs/gsheet-package/YYYYMMDD-HHMM/`

Do not clean the source public exports, merged exports, full firehose, company coverage, data dictionary, or manifest files as part of this plan.

## Workflow

1. Build or select the Google Sheets package.

   ```sh
   npm run jobs:gsheet-package
   ```

2. Run the URL review step.

   ```sh
   npm run jobs:gsheet-check-urls
   ```

   For a timestamped package:

   ```sh
   npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM
   ```

3. Review the failure report.

   ```text
   01_good_documentation_jobs-url-failures.csv
   ```

   Confirm that failures are genuinely unavailable jobs before pruning.

4. Apply pruning.

   ```sh
   npm run jobs:gsheet-check-urls -- --apply
   ```

   For a timestamped package:

   ```sh
   npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM --apply
   ```

5. Verify the final CSV.

   Keep:

   ```text
   01_good_documentation_jobs.csv
   ```

   Before deleting artifacts, run row-count checks.

   For `latest`:

   ```sh
   wc -l data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv
   wc -l data/jobs/gsheet-package/latest/01_good_documentation_jobs-before-url-prune.csv
   ```

   For a timestamped package:

   ```sh
   PACKAGE_DIR=data/jobs/gsheet-package/YYYYMMDD-HHMM
   wc -l "$PACKAGE_DIR/01_good_documentation_jobs.csv"
   wc -l "$PACKAGE_DIR/01_good_documentation_jobs-before-url-prune.csv"
   ```

   Expected example size change:

   ```text
   Before pruning: 01_good_documentation_jobs.csv around 40 KB
   After pruning:  01_good_documentation_jobs.csv around 37 KB
   ```

   The pruned file should usually be smaller than the backup. It should not be suspiciously tiny. If the final CSV has fewer than 10 data rows, stop and do not clean artifacts.

6. Run release validation.

   ```sh
   npm run jobs:test-release
   ```

7. Open and review the final pruned CSV once.

   Confirm:

   - `npm run jobs:test-release` passed.
   - The final `01_good_documentation_jobs.csv` has been opened/reviewed once.
   - The final row count looks reasonable.

8. Clean temporary URL-check files from the package folder.

   Delete:

   ```text
   01_good_documentation_jobs-before-url-prune.csv
   01_good_documentation_jobs-url-check-summary.json
   01_good_documentation_jobs-url-check-summary.md
   01_good_documentation_jobs-url-failures.csv
   01_good_documentation_jobs-url-review.csv
   ```

9. Keep the final package files ready for upload.

   Required upload file:

   ```text
   01_good_documentation_jobs.csv
   ```

   Optional supporting tabs:

   ```text
   02_company_coverage.csv
   04_data_dictionary.csv
   ```

## Cleanup Command

Use the cleanup script only after review, pruning, validation, and row-count checks pass. Dry run is the default.

Dry run `latest`:

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

The script only removes URL-check artifacts. It never deletes:

- `01_good_documentation_jobs.csv`
- `02_company_coverage.csv`
- data dictionary files
- manifests
- source public exports
- merged exports
- firehose files

The script writes:

```text
data/jobs/reports/gsheet-url-artifact-cleanup.json
data/jobs/reports/gsheet-url-artifact-cleanup.md
```

## Safety Rules

- Do not delete URL-check artifacts before reviewing `01_good_documentation_jobs-url-failures.csv`.
- Do not delete `01_good_documentation_jobs-before-url-prune.csv` until:
  - `npm run jobs:test-release` passes.
  - The final `01_good_documentation_jobs.csv` has been opened/reviewed once.
  - The row count looks reasonable.
- Do not delete the backup before confirming the pruned `01_good_documentation_jobs.csv` has the expected row count.
- Before deleting artifacts, run the `wc -l` row-count checks in this plan.
- The pruned file should usually be smaller than the backup.
- The pruned file should not be suspiciously tiny.
- If the final CSV has fewer than 10 data rows, stop and do not clean artifacts.
- Do not use cleanup to resolve uncertain URL checks. Rate-limited rows and manually uncertain rows should be kept until reviewed.
- After cleanup, rerun `npm run jobs:test-release` if any package files were manually edited.

## Script Safety Checks

`npm run jobs:gsheet-clean-url-artifacts` refuses to delete when:

- The package directory does not exist.
- `01_good_documentation_jobs.csv` is missing.
- The final CSV has fewer than 10 data rows.
- The backup file exists and the final CSV row count is greater than the backup row count.
- The backup file exists and row-count comparison cannot be performed.
- The URL-check summary exists and indicates pruning was not applied.
- The URL-check summary indicates safe pruning kept ambiguous failed rows for review.
- The URL-check summary exists but has an uncertain or unparseable format.

If the summary format is uncertain, the script fails safe: it warns, refuses `--apply`, and tells the user to review manually.
