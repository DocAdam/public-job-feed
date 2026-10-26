# Good Doc Jobs publication — package 20261025-0724

Later update, October 26: the approved remote-view change replaced the fixed Location filter with Work Arrangement = Remote. All 125 expected rows and links passed read-back. A browser check inspected the initial view and found text clipping at the fixed widths. See the [later record](../../remote-only-view-20261026103340Z/README.md). The counts and visual limits below describe the October 25 publication check.

**Result: PASS — published and verified by live API read-back.** The main table matches the specified CSV. The existing native table and pivot source now use A1:P733. The native browser visual check remains NOT VERIFIED; its limits are recorded below.

Verified: 2026-10-25 17:38:09 CDT (2026-10-25T22:38:09.016Z).

Live Sheet: [good documentation jobs](https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit).

## Source and destination

- Source: `/Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv`.
- CSV SHA-256: `460338c0067c15a64196c836b83032b4309c6095f08b8e03b70b27ebbadbc963`.
- Package: `20261025-0724`; 732 data rows; 16 columns; Employment Type is P.
- Spreadsheet ID: `1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g`.
- Main tab: `01_good_documentation_jobs`, ID `55693553`.
- Existing native table: ID `810055407`, name `good documentation jobs`, range `A1:P733`.
- Remote tab: `remote_jobs_pivot`, ID `1606926353`; anchor `A1`; source `01_good_documentation_jobs!A1:P733`; current output `A1:D70`.

The immutable dated package was read only. The task did not select latest, collect jobs, rebuild a package, change scores or classifications, delete/recreate tabs, change sharing, commit or push. No other service was published.

## Pre-update recovery and concurrency check

The old live main table was A1:O715, with 714 data rows. Its native table, columns, colors, grid sizes, frozen row, values, cell formats, hyperlinks, validation/chip state and pivot definition were saved before the content write. The pivot source was also A1:O715. The main tab had no basic filter. The remote tab had an existing filter over its first column; it remains unchanged.

A header-scoped find/replace with a unique absent token exposed complete native metadata. It matched no cells. The connector rejected an empty batch request before any API change. No table ID was guessed from banding. Immediately before publication, all values in A1:P1000 and the native table/pivot definitions matched the saved baseline. The source hash matched again.

Recovery records: [saved cell and definition state](../baseline/recovery-state.json), [rollback request](../plan/rollback-request.json), [concurrency check](../plan/concurrency-preflight.json). Do not run the rollback against later edits. First inspect the affected state and stop on an unexpected concurrent change.

## Main-table verification

The publication batch wrote the exact header and value matrix, updated the existing native table and pivot source, and applied suitable text/date formats. The grid was already large enough. The old dataset was shorter than the new one, and no unrelated values existed below the new boundary; no preliminary clear was performed.

The final read-back compared all **11,728 cells** in A1:P733. Differences: zero. Row 733 equals the final CSV record. A1:P1000 has no values below row 733. The original 15 headers, value order and native column definitions are retained, with Employment Type appended after Source. No source text was evaluated as a formula.

Documented comparisons: numeric F and M values compare to the CSV decimal strings; numeric L date serials use epoch 1899-12-30 and compare to source ISO dates; absent cells compare as empty strings. Last Checked stays literal UTC text. These rules do not normalize substantive text differences.

All 732 primary URLs, 50 additional URLs and 69 pivot URL destinations were checked. Primary links use cell link metadata; combined additional links use separate rich-text link runs. Dates stay numeric and sortable, displayed as yyyy-mm-dd.

Employment coverage: 202/732 with a stated schedule, 48/732 with stated terms, 492/732 with neither, and zero conflicts. Schedule and terms overlap. All P values equal the source. Column P has native TEXT type, text number format and a 230 px width. The original 15 widths and header/band colors remain unchanged.

Live Text contains tests used temporary explicit-range basic filters while the native table remained present. Contract displayed exactly 17 rows, including four combined labels. Internship displayed exactly 15 rows, including four combined labels. Native row visibility matched the exact expected row numbers. Both test filters were removed, restoring the original main filter state. The table-ID filter shortcut returned an internal error; a live-state read confirmed that it had not applied before the explicit-range tests.

Evidence: [all-cell comparison](../readback/full-final-comparison.json), [link/type/label checks](../readback/links-types-and-coverage-final.json), [filter tests and visible row numbers](../readback/filter-checks-final.json), [native metadata and sharing](../readback/native-definitions-and-sharing-final.json).

## Remote pivot verification

The pivot retains its four grouping columns in order: Location, Title, Company, Apply Link. All four ascending sort rules, value metadata, 43 fixed visible Location values, anchor and tab ID remain intact. Only the source range changed.

The expected result was calculated from the CSV using exact whole-cell Location membership and distinct grouped tuples. Combined locations were not split or broadened. Thirteen included rows have combined-location text. The live pivot has **69 expected results**, no missing/extra/duplicate groups and no errors. All 68 retained groups preserve their prior relative order.

The native pivot groups Remote and REMOTE under one displayed Remote heading. The same behavior is present in the saved pre-update pivot for Documentation Specialist(DISA). The pivot comparison uses a case-insensitive Location group key for that display behavior; the main-table comparison retains the exact original cell text. The other tuple fields compare exactly.

**Existing policy limits:** the CSV has 125 rows marked Remote. The fixed Location list excludes 67 of them. It also includes 11 rows with a different Work Arrangement label. These counts were reported without changing the Location policy. A Remote label does not establish eligibility in every country.

Evidence: [expected policy result and excluded rows](../plan/expected-remote.json), [final pivot comparison](../readback/pivot-comparison-final.json), [final native pivot and output](../readback/final-live-3.json).

## Repairs and retained failures

The source-only pivot field update reset its grouping. The first failed read-back is retained. The complete saved pivot definition was restored with only its source changed, then all groups and rules were verified. The pivot was never replaced with a static list.

The initial literal-value batch cleared hyperlink metadata from plain URL cells. The link-only repair changed no values and restored every required URL destination. Both the failed and final checks are retained.

A last-row checker initially compared omitted blank cells incorrectly; the full cell-by-cell comparison already had zero differences. The checker was corrected to treat absent cells as empty strings. A pivot comparison initially treated the existing Remote/REMOTE heading behavior as an extra/missing group; the pre-update evidence resolved that case. No source values were changed for either comparison.

Evidence: [initial failed comparison](../readback/main-and-pivot-comparison.json), [pivot repair](../publication/pivot-repair-request.json), [link-only repair](../publication/link-repair-request.json), [initial link failure](../readback/links-types-and-coverage.json), [final comparison](../readback/full-final-comparison.json).

## Formatting and visual limits

The live API confirms the original table colors, column widths A:O, grid dimensions, frozen row, table columns, remote filter and sharing settings. P alone was widened to 230 px. Native table and banding ranges both cover A1:P733.

A native browser visual inspection was unavailable: CUA had no browser surface and could not access a Chrome window. A live XLSX export was downloaded for the skill fallback, but the installed artifact renderer failed during import with the same Mono/WASM assertion under both Node 26.3.1 and bundled Node 24.19.0. No local export was imported back into Google Sheets. Layout/clipping was therefore not visually established. Best-effort checks used actual effective formats, sizes, types and hyperlink metadata. Existing intentional fixed widths were preserved.

Evidence: [visual status](../readback/visual-status.json), [downloaded final live export](../readback/live-final.xlsx).

## Acceptance checks

| Requirement | Status | Evidence or limit |
| --- | --- | --- |
| Exact dated source CSV, hash, schema and labels | PASS | 732 data rows, 16 unique headers, Employment Type in P, source hash equals the requested and retained hash. |
| Inspect and save live values, native table, pivot and formatting before writing | PASS | Complete bounded affected values and metadata retained. Main tab ID 55693553; pivot tab ID 1606926353; native table ID 810055407. |
| Resolve native controls before publication | PASS | Raw batch API returned actual native tables and their columns. No native table was replaced by banding or a plain filter. |
| Reject unexpected concurrent data changes before writing | PASS | No value differences across A1:P1000; table and pivot definitions unchanged; source hash checked again. |
| Write source values and related ranges together | PASS | One batch wrote exact typed source values, updated the existing native table, changed pivot source, and applied column P text formatting. |
| Read back every source cell | PASS | 11728 cells compared, zero differences. Only documented numeric/date/blank normalization. Final source row is in row 733. |
| No trailing job values | PASS | A1:P1000 ends at row 733. No old job values remain below the dataset. |
| Native table range and original column definitions | PASS | Existing table ID 810055407 is A1:P733. Original 15 column definitions remain unchanged; P is Employment Type, TEXT. |
| Employment Type values and coverage | PASS | All 732 labels match. Schedule 202, terms 48, neither 492, conflicts 0. Schedule and terms overlap. |
| Contract text filter includes combined labels | PASS | Native hiddenByFilter metadata confirmed exactly 17 matching data rows, including four combined labels. The native table stayed present. |
| Internship text filter includes combined labels | PASS | Native hiddenByFilter metadata confirmed exactly 15 matching data rows, including four combined labels. |
| Restore original main filter state | PASS | Both temporary explicit-range basic filters were removed. The main tab again has no basic filter, matching its original state. Native table controls remain. |
| Actual pivot source range | PASS | remote_jobs_pivot!A1 holds the existing pivot with source main tab A1:P733. |
| Preserve pivot filters, grouping and sorting | PASS | Full saved definition restored with only source changed. All 43 location values, grouping offsets and ascending sort rules match. All 68 retained groups preserve their order. |
| Compare all pivot results with the existing policy | PASS | 69 expected/live groups; no missing, extra, duplicate or error results. Location case grouping matches the pre-update pivot. Thirteen included combined-location rows remain whole. |
| Report existing remote policy limits without changing them | PASS | The fixed location list excludes 67 of 125 source rows marked Remote. It includes 11 rows with other work-arrangement labels. This is the existing policy, not a country-eligibility rule. |
| Primary, additional and pivot application links remain usable | PASS | 732 primary links, 50 additional URLs and 69 pivot links have exact destinations. Date and number types match their source roles. |
| Required formatting retained | PASS | Original 15 widths, table colors, tab/grid properties and frozen row preserved. Only P was sized to 230 px and typed as text. Date display remains yyyy-mm-dd. |
| Native visual inspection | NOT VERIFIED | CUA could not access a Chrome window. The installed artifact renderer failed under Node 26 and bundled Node 24. Best-effort live API formatting checks passed; native clipping was not visually inspected. |
| Sheet identities, unrelated structures and sharing preserved | PASS | Same two tab IDs/titles and grid sizes. Remote basic filter and sharing permissions unchanged. No tabs deleted or recreated. |
| Publication repairs verified without changing source facts | PASS | Source-only pivot update reset grouping; full saved pivot definition repaired it. Literal-cell update cleared URL link metadata; link-only repair restored exact destinations. Failed read-backs remain recorded. |
| No refresh, rebuild, source changes, commit, push or other-service publication | PASS | Only authorized live Sheet content/structure edits and local verification records. Source CSV hash unchanged; feed run unchanged. |

[Machine-readable acceptance ledger](acceptance.json) · [Publication result](../publication/result.json) · [Source and local-scope check](source-and-scope-check.json)

## Remaining issues

No unresolved value, native-table range, pivot source, pivot policy, link, filter or sharing mismatch remains. Native visual inspection remains NOT VERIFIED. The existing Location-policy exclusions and non-Remote inclusions remain unchanged and are listed above.
