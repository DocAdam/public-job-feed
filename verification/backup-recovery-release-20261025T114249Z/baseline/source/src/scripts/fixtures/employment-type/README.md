# Saved employment review evidence

The review date is 2026-10-23. These files were copied without changes from the review directory in provenance.json. SHA-256 checksums are in that manifest. The focused test checks each checksum.

- employment-type-sample-review.csv and .json are the prior review's expectation index. They contain 18 cases and source URLs and dates.
- selected-source.json files are selected source records from the prior review. They are excerpts, not full original response captures. Workday selected-source files are detail responses. The collector does not request them.
- workday-search.body files are original saved search responses. Tests use only their individual jobPostings records. They do not use board facets.
- icims-detail-jsonld files are extracted detail-page evidence. They document the coverage gap. No detail-page parsing test is claimed for the board collector.
- 17-icims-selected-card.html is a selected search card excerpt.
- selected.json contains saved normalized records. Tests derive iCIMS input records from each sample's saved title and description. This does not reconstruct an original card payload.
- requests.json, followup-requests.json, and workday-search-requests.json document the prior review requests. Tests do not repeat these requests.

The small extra cases in test-employment-type.js are synthetic. They test contracts and error cases. They are not additional employer observations.

Board-path results differ from the review's detail evidence for samples 10, 11, 17, and 18. Sample 10 gives Contract from its title but no schedule. Samples 11, 17, and 18 give Not stated. Sample 12 has Full time on its individual search record. Sample 16 has explicit Part Time text. See the feature document for the full case table.

## Release verification case from 2026-10-24

variable-compensation-normalized-20261024.json is an observed normalized batch excerpt from the one approved production refresh. It is not an original raw API capture. It retains the source URLs and observation date. The earlier parser treated Variable Compensation in a title as a variable work schedule. Tests require Full-time from the structured source field and preserve the rejected title evidence when reading the older normalized record.

variable-hours-normalized-20261024.json is an observed canonical excerpt from the same release. Its source observation was older. Employment fields were derived during the October 24 build. The test preserves explicit Variable Hour evidence and resolves it with the stated Part-time hours. It is not a raw API capture.
