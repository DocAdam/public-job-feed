# Employment type

Implementation work started on 2026-10-24. This document defines the contract before code changes.

Employment Type gives the stated work schedule and employment terms. Role Type gives the job category. Work Arrangement gives Remote, Hybrid, Onsite, or Unknown. These fields have separate meanings.

## Contract

- `EmploymentSchedule`: `Full-time`, `Part-time`, `Full-time or Part-time`, `Variable`, or `Not stated`. The alternative label means that the source permits either schedule. Variable requires an explicit variable schedule.
- `EmploymentTerms`: an array in this order: `Contract`, `Temporary`, `Freelance`, `Internship`, `Permanent`, `Regular`, `Fixed-term`, `Apprenticeship`, `Seasonal`.
- `EmploymentTypeStatus`: `stated`, `not_stated`, or `conflict`.
- `EmploymentTypeEvidence`: an array of objects. Each object has `Dimension`, `Value`, `RawValue`, `SourceField`, `SourceKind`, `SourceURL`, and `ObservedAt`. Dimension is schedule, terms, or unknown. Unknown source labels and rejected earlier text matches have an empty Value. Optional RejectedValue and ReviewReason fields retain a rejected normalized value and its reason. They do not record a new source observation. SourceKind is structured_field, title, or description. RawValue retains the source field or exact passage in the text used for extraction.

Full-time does not establish Permanent. Regular does not establish Permanent. Internship does not establish a schedule. Contract and Freelance can occur together. Separate Full-time and Part-time statements are a conflict; an explicit alternative is not. Explicit variable hours or shifts can coexist with a Full-time or Part-time category. Display the known hours category and retain the variability in evidence. Bare Variable in occupational text does not establish a schedule. Permanent with Contract, Temporary, Fixed-term, or Seasonal is a conflict. Other combinations are retained without an assumed conflict.

JSON retains arrays. CSV stores EmploymentTerms and EmploymentTypeEvidence as compact JSON strings. Older records can omit all four fields. Empty evidence dates remain empty; export time must not replace an observation date.

The simple public column is `Employment Type`. Append it after Source. Put schedule first, then terms in the order above. Examples: `Full-time`, `Contract`, `Part-time; Contract`, `Full-time; Internship`. Use `Not stated` when both dimensions are unknown. Use `Needs review` for conflicts. Internal evidence stays out of simple CSV files.

## Baseline and scope

Node is v26.3.1; package.json requires Node 26.x. Code uses CommonJS. The prior public contract has 15 columns, from Title through Source. Location grouping uses exact company/title and requires at least two distinct locations. It retains application links and uses the existing remote preference, date, and age rules.

The active batch collector calls ATS functions in src/lib/jobs-normalize.js. buildJobExportArtifacts in src/lib/job-export.js adds export fields. merge-batches.js projects publicFeedHeaders. export-public-slices-entrypoint.js normally runs export-public-slices.js; streaming export is an opt-in staging path. Slices use dedupe-select.js. build-gsheet-package.js calls buildSimpleTopFiles for the daily package. The separate core engine has compatibility entry points and must also retain the new fields.

Tests: jobs:test-employment-type (new), jobs:test-greenhouse-normalize, jobs:test-dedupe-select, jobs:test-core-pipeline, jobs:test-gsheet-grouping, and history tests. test-gsheet-package.js writes reports under data/jobs/reports by default. The full test runner also writes there. Use isolated report paths for this work. History tests must use temporary databases.

The 18-case review is retained under src/scripts/fixtures/employment-type. provenance.json gives checksums and the original temporary directory. The selected-source files are excerpts from the prior review, not original full board responses. Search .body files are original saved responses. selected.json contains previously normalized records. The iCIMS JSON-LD excerpts came from detail pages. Their values do not prove that the board collector fetched detail pages. Test cases derived from these files must state that limit.

Existing local changes in data/jobs/history/README.md and validation.json are outside this task. No production output, saved batch, history database, archive, schedule, or live Sheet is in scope for a write.

## Source coverage

| Source | Input retained from the current response | Limit |
| --- | --- | --- |
| Ashby | employmentType; explicit title and description text | Old normalized batches can lack the structured field. |
| Lever | categories.commitment; explicit title and description text | Temporary, Contract, and Full time have separate meanings. |
| BambooHR | employmentStatusLabel and employmentType; explicit text | A null employmentType does not block employmentStatusLabel. |
| Workday | timeType, workerType, and employmentType on the individual search record; explicit text | Do not use facets, similarJobs, or jobPostingInfo. The current collector does not fetch detail responses. |
| Greenhouse | Employment Type, Employment Status, Job Type, Position Type, Contract Type, Schedule, Time Type, and Commitment metadata; explicit text | Empty or department-only metadata does not block text extraction. |
| iCIMS | employmentType, employmentStatus, positionType, Position Type, type, and Type when the parsed record has them; explicit title and description text | The current card parser does not fetch details or parse detail JSON-LD. Union and OTHER are unknown labels. |

Unknown structured labels stay in evidence. They do not become a public label. The parser uses a controlled vocabulary. It can miss valid statements outside its patterns. It does not classify a job from pay, remote status, location, general benefits, past experience, future conversion, applicant questions, or unrelated contract language.

A source observation date is the normalizer's fetchedAt. A saved normalized record keeps its FetchedAt when text supplies new evidence. A missing observation date stays empty. Normal collection will add structured values to newly fetched records. No old batch is rewritten.

## Reviewed cases

These are board-path tests from retained evidence. They do not claim new collection or detail-request coverage.

| Sample | Source / employer | Expected board-path display | Detail evidence limit |
| ---: | --- | --- | --- |
| 1 | Ashby / Back Market | Full-time; Internship | Both dimensions are in retained source data. |
| 2 | Ashby / Modal | Full-time | Structured value. |
| 3 | Ashby / FloSports | Full-time | Structured value. |
| 4 | Greenhouse / Fueled | Contract | Future conversion and applicant preferences are excluded. |
| 5 | Greenhouse / Sendbird | Contract | Title supplies the term. |
| 6 | Greenhouse / Amperesand | Full-time | Labeled description supplies the schedule. |
| 7 | Lever / Penumbra | Temporary | Temporary is separate from Contract. |
| 8 | Lever / Motif | Contract | Structured value and title. |
| 9 | Lever / Hevo | Full-time | Past internship experience is excluded. |
| 10 | Workday / Kaplan | Contract | Part time is detail-only in this sample. |
| 11 | Workday / Harris | Not stated | Full time is detail-only. Search facets are excluded. |
| 12 | Workday / ITW | Full-time; Internship | Full time is on the individual search row. Temporary in a facet is excluded. |
| 13 | BambooHR / Christian Post | Part-time; Contract; Freelance | employmentStatusLabel supplies Contract. |
| 14 | BambooHR / ANGA | Contract | employmentStatusLabel works when employmentType is null. |
| 15 | BambooHR / GeoSpectrum | Full-time; Permanent | Both values are in employmentStatusLabel. |
| 16 | iCIMS / Audacy | Part-time | Derived from the saved title/description. Detail Union and OTHER are not substituted. |
| 17 | iCIMS / DecisionPoint | Not stated | Regular Full-Time is detail-only. |
| 18 | iCIMS / East Penn | Not stated | Regular Full-Time is detail-only. |

## Duplicate selection and location grouping

JobKey, CompanyTitleLocationKey, and CanonicalURLKey generation stay unchanged. Duplicate selection adds an employment signature to heuristic selection keys. A known value and Not stated stay separate for distinct postings. Different known schedules or terms also stay separate.

The same canonical URL or the same source posting ID can establish posting identity. Such records retain their combined evidence. Contradictory evidence produces Needs review. An identity group with different employment signatures cannot join other postings through a company/title key. The streaming path uses the same rules.

Public location grouping now requires exact company, title, and employment display. Needs review rows stay separate. Valid groups keep the existing location summary, primary and additional links, remote preference, posted date, age, and last-check rules. All source evidence stays in the detailed records. The simple CSV has no evidence fields.

The saved-shortlist preview has no grouping count change: 744 rows under both rules. The final preview then replays saved URL results. They remove 30 rows, leaving 714 public rows. No URL check is repeated. This result starts after earlier duplicate selection. It cannot recover rows discarded by the old selection. Synthetic tests show that separate employment variants survive the new earlier step. A future full-feed row-count change has not been measured.

## Output and compatibility

Detailed jobHeaders and publicFeedHeaders append all four internal fields. JSON uses arrays. All active CSV writers use compact JSON for the two arrays. The batch, merge, normal daily slice, optional streaming stage, and package paths retain them. Employment fields do not enter Writer Fit scoring.

New packages include public-schema.json with schemaVersion 2, the exact public headers, row count, and table range. This is the package display contract; it does not change other feeds' schemaVersion values. The package validator checks new headers, values, and ranges when this marker is present. Packages without the marker keep the older required-header contract. If an older package has an Employment Type column, its values are checked.

The shared daily/full builder also writes employment-type-coverage.json and EMPLOYMENT_TYPE_IMPORT.md. Safe URL pruning updates the public schema, public coverage, optional formula rows, import range, and affected manifest sizes. The Clean Broken Links launcher updates the same metadata after it copies cleaned rows to latest. Historical packages without the new schema marker keep the old behavior. The data-dictionary sources in build-public-release.js and build-gsheet-package.js include the new fields. Generated package instructions link to the import instructions.

Legacy and v2 history tests import old and new package schemas into temporary databases. Old observations have null new fields. New observations retain JSON evidence strings. No history migration is required for this additive field.

## Tests and isolated preview

Run the focused tests:

```sh
npm run jobs:test-employment-type
npm run jobs:test-employment-integration
npm run jobs:test-dedupe-select
npm run jobs:test-gsheet-grouping
npm run jobs:test-core-pipeline
npm run jobs:test-streaming-export-phase-1
```

The integration test copies source code to a temporary project. It runs actual merge and daily slice scripts, a public/formula preview, package validation, legacy and v2 history, and the existing scoring test. It disables collection. It does not run the production package command.

Create a preview in a new directory. The parent must exist. The final directory name must use YYYYMMDD-HHMM for the existing package validators. Choose a new name for each run.

```sh
mkdir -p previews/employment-type-review
npm run jobs:employment-preview -- \
  --input data/jobs/public/public-job-feed-deduped-top.json \
  --output previews/employment-type-review/20261024-0900
npm run jobs:test-gsheet-package -- \
  --package-dir previews/employment-type-review/20261024-0900 \
  --report-dir previews/employment-type-review/validation
npm run jobs:test-greenhouse-normalize -- \
  --report-dir previews/employment-type-review/greenhouse-validation
node src/scripts/benchmark-employment-type.js \
  --input data/jobs/public/public-job-feed-deduped-top.json \
  --output previews/employment-type-review/benchmark.json
```

An optional `--saved-url-review PATH` replays saved URL check results with the existing safe-prune rules. It requires a saved result for every public row. Check dates and outcomes stay unchanged. This does not verify current live job status. The final preview uses this option.

The preview command refuses existing output directories and paths under production data, source, or test directories. The benchmark refuses existing report files and paths under production data. Neither command requests job details. The preview starts from a saved shortlist; it does not repeat full-feed duplicate selection.

## Future approved refresh and Sheet import

This change does not publish to Google Sheets. Live operation is not verified by an offline preview.

1. After separate approval, use the existing Refresh Job Feed launcher. Its normal collection will preserve new fields from current board responses. The existing launcher also rebuilds reports, checks URLs, updates history, and checks backups.
2. Inspect the new package's public-schema.json, coverage report, package validation, and conflicts. Review Needs review records in the detailed export.
3. After separate publication approval, import the new simple CSV into the main Sheet tab. Preserve remote_jobs_pivot. Read the actual tableRange and rowCount from that package. Extend the main table, filter, and pivot source range through the new final column. The final preview range is A1:P715, including its header. A future package can have a different row count.
4. Use Filter by condition > Text contains > Contract or Internship. This includes combined labels. An exact-value filter selects only the complete cell value.
5. Check the imported header, last row, remote view, and combined-label filters in the live Sheet. Those checks remain separate from local implementation tests.

See [verification results](employment-type-verification.md) for measured results and the remaining limits.

## Observed release verification

The one approved October 24 refresh produced package 20261024-0954 with 715 public rows. Its proposed Sheet range is A1:P716. Feed and history checks passed. The current backup failed the strict extra-file check. A parser correction was then tested and applied to working code, without changing the imported package. That corrected code still needs a new approved production release. See the [release report](employment-type-release-verification-20261024.md). The live Sheet is unchanged.
