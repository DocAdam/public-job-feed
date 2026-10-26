# Employment Type previews and verification

The final preview is [20261024-0840](20261024-0840/README_GSHEET_PACKAGE.md). It uses saved data only. Its generatedAt field gives the actual creation time. Directory names identify separate test runs.

The earlier 20261024-1200 directory is a preliminary preview. The 20261024-0830 directory is the tested package before URL pruning. It was kept as phase evidence. A later parser correction added Contract where an hours phrase separated it from Full-time. Use only the final preview for review. It replays the 2026-10-24 saved URL results and retains their check dates. No URL was checked again.

- [Final coverage](20261024-0840/employment-type-coverage.json)
- [Final runtime and source hash](20261024-0840/preview-report.json)
- [Sheet import instructions](20261024-0840/EMPLOYMENT_TYPE_IMPORT.md)
- [Final package validation](pruned-validation/test-gsheet-package-results.json)
- [Regression commands and results](verification/test-results.json)
- [Initial regression results, including the corrected failure](verification/test-results-initial.json)
- [Final fixed-dataset benchmark](verification/benchmark-final.json)
- [Repeated benchmark](verification/benchmark-reproduced.json)
- [Protected-file check](verification/protected-state.json)

No production package or live Sheet was changed. The first Greenhouse regression run replaced two existing test report files under data/jobs/reports. The corrected command uses an isolated report directory. The verification report records this exception.
