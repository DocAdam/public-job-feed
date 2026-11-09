# November 2, 2026: source review and publication checks

Derived review material. Revised draft for Adam’s review. Do not publish.

[Article](substack-draft-2026-11-02.md) · [Metadata and announcements](substack-metadata-2026-11-02.md) · [Visual data](substack-visual-data-2026-11-02.json) · [Source evidence](substack-assets-2026-11-02/source-evidence.json)

## Revision checks: November 2, 2026

Only the derived article, this review, and metadata were revised. Package `20261102-0537` and baseline `20261026-0638` remain as issued. The saved evidence and validation reports still describe the initial 40 selections and 45 links. The revised article has **39 selections and 44 application links**. No replacement was added.

- **GEM Technologies:** The [saved official application URL](https://jobs.ashbyhq.com/gem-technologies/1a0b7500-9f9f-4981-b6f6-192b6d6e2de7) returned HTTP 404 at 16:23 UTC (10:23 a.m. CST). The [official Ashby board](https://jobs.ashbyhq.com/gem-technologies) returned HTTP 200. Its [public job-list API](https://api.ashbyhq.com/posting-api/job-board/gem-technologies) returned 44 postings, with no matching title or job ID. The corporate careers page returned HTTP 403 on a direct request. No valid official application page was confirmed. The selection was removed. The saved description permits remote work, which conflicts with the saved Hybrid label. Neither that label nor package membership was changed. These checks do not prove why the page is absent.
- **Sigma:** Read both official descriptions and their embedded application forms: [New York](https://job-boards.greenhouse.io/sigmacomputing/jobs/8034205003) and [San Francisco](https://job-boards.greenhouse.io/sigmacomputing/jobs/8034168003). Both descriptions require 40 hours per week in person for 12 weeks. Both forms ask about 4 days onsite. The article keeps both links, their order, and the saved Hybrid label. It states the office requirement. The pages do not confirm whether the remaining workday can be remote. This evidence does not support changing the saved label to Onsite.
- **Storyblok:** The [official Documentation Engineer II page](https://www.storyblok.com/job?gh_jid=4962120101) lists Remote and APAC, Austria, Europe. The article adds those regions and defines APAC as Asia-Pacific. It does not claim worldwide eligibility. The page does not give a complete country eligibility list.
- **Opening and dates:** Removed the repeated opening count sentence. Added a note before the listings: saved source checks are from November 1–2, while employer posting dates vary. The source note separates saved checks from this revision’s employer-page checks.
- **Images:** Read the visual JSON and both SVGs. Inspected both PNGs. They show saved package figures and no article selection total. Their displayed information remains correct. The JSON, SVGs, PNGs, captions, and alt text were preserved.

No application forms were completed or submitted. The remaining retained employer pages were not checked again. The live Sheet was not read or updated.

## Sources and decisions

- Edition date: November 2, 2026, as supplied by Adam. The package date does not set the edition date.
- Current package: `data/jobs/gsheet-package/20261102-0537/`. Its README records `2026-11-02T11:37:22.293Z`, or 5:37 a.m. CST. Its main CSV is byte-for-byte equal to the `latest` main CSV.
- Baseline: `data/jobs/gsheet-package/20261026-0638/`. Its README records `2026-10-26T11:38:42.890Z`, or 6:38 a.m. CDT. The October 26 published article reports this package’s 735 entries and 785 application links. The local October 26 review also identifies this package. It is the correct previous-edition baseline.
- Current saved refresh run: `5efc36da-5b99-4aed-9603-8809ff34fc7f`. `data/jobs/reports/refresh-run.json` records COMPLETE, exit code 0, and completion at `2026-11-02T12:02:10.694Z`. `refresh-output-validation.json` records PASS for `20261102-0537`, with no failures. The package dashboard is an earlier snapshot. It says RUNNING and explains that history and backup follow that snapshot. These are different record times.
- No refresh was needed or run for this task. No adapters, filters, matching rules, collection settings, source packages, or production settings were changed.
- Both snapshots use the same 16 public columns and public schema version 2. Their scope is the saved public list after location grouping and saved link removal. The current table range is `A1:P749`; the baseline range is `A1:P736`. These counts are not the detailed shortlist, full collected feed, or a count from the live Google Sheet.
- Assumption: preserve each completed public package as issued. Do not regroup old data with a new rule or change old records to make the comparison fit. Normal changes in source results, classification, grouping, and link removal can affect membership. This comparison does not establish a fixed employer panel or a market trend.

## Publication references and guidance

The requested published references were found through read-only access to the public [Substack RSS feed](https://docadam.substack.com/feed) and public archive API on November 2. Search returned no matching results, and the web tool could not open the article pages. Direct HTTP reads of the RSS feed and archive API succeeded.

| Reference | Verified publication record | Use |
| --- | --- | --- |
| [October 19 edition](https://docadam.substack.com/p/writing-and-documentation-jobs-7d7) | October 19, 2026, `13:00:22.534Z`; subtitle: Week of October 19, 2026 | Editorial structure, compact linked entries, section order, source note, and footer |
| [October 26 edition](https://docadam.substack.com/p/writing-and-documentation-jobs-a42) | October 26, 2026, `12:37:30.283Z`; subtitle: Week of October 26, 2026 | Previous edition, count agreement, and support footer |
| [October 29 five-job edition](https://docadam.substack.com/p/five-recent-documentation-jobs-efc) | October 29, 2026, `18:50:10.579Z` | Check for a later footer version; separate series |

The two broad published article bodies are saved as reference HTML in the asset folder. Their archive records are in `source-evidence.json`. The local October 19 draft is a full-list draft with missing date and footer fields. It is not the published format. The new article follows the published edition and Adam’s current selection request.

Read `AGENTS.md`, `docs/substack-publication.md`, the local Working Notes project instructions, and the Library mirror of the Voice Charter. The Library mirror and the writing-projects Charter have the same SHA-256: `631d272eb7fadb59246ac55ba144a8c6ce98c021b34a8113de591fff8832c157`. Both are version 2.1 draft. This does not establish approval of that revision. Their live Library sync state was not verified.

Applied `adam-substack-voice`, profile `job-roundup`. The skill’s older five-job template does not control this broad roundup. The sample selector had no close broad-list sample. Only the confirmed-human `Authenticity and Service` sample was read as a limited clarity reference. Its personal facts and opinions were not reused.

## Counts and comparison method

| Measure | November 2 value |
| --- | ---: |
| Saved entries after grouping | 748 |
| Remote | 130 |
| Hybrid | 123 |
| Onsite | 462 |
| Unknown | 33 |
| Grouped entries containing multiple postings | 26 |
| Application links, including additional links | 830 |
| October 26 entries | 735 |
| Added entry keys | 132 |
| Removed entry keys | 119 |
| Continuing entry keys | 616 |
| Net change | +13 |
| Remote share | 130 / 748 × 100 = 17.379679…%, shown as 17.4% |

All equations agree:

- 130 + 123 + 462 + 33 = 748.
- 735 + 132 − 119 = 748.
- 616 + 132 = 748.
- 616 + 119 = 735.
- 132 − 119 = 13.

Identity follows the existing `jobKey` rule in `src/lib/us-remote-daily-report.js`: clean whitespace, convert the primary `Apply Link` to lower case, and remove trailing slashes. The same function is used for both packages in the independent validation. All primary URLs are present and unique within each snapshot. No fallback identity is needed.

The existing grouping code uses normalized company, title, and employment type. It combines different locations, preserves all application links, and chooses a representative record. It gives Remote priority over Hybrid and Onsite when a group has mixed arrangements. The article retains the issued group and arrangement fields. The three selected groups have matching arrangements across their saved component records.

The baseline has 27 grouped entries and 785 application links. The current package has 26 grouped entries and 830 links. Link totals are counts of supplied application links. They do not establish unique jobs or openings. In this current package, all 830 supplied application URLs are distinct.

Three removed primary links remain as additional links in current groups:

- Monks, Senior Technical Writer: the Sydney primary link is now an additional link in the Gurugram/Sydney group.
- Veeva, Content Writer: the old Barcelona primary link is now an additional link in the Berlin/Barcelona/London group.
- Okta, Senior Technical Writer: the Bengaluru primary link is now an additional link in the Bengaluru/Toronto group.

These are valid removed entry keys under the stated method. They are not evidence that those employer postings disappeared. The article states this limit. The evidence JSON retains all added, removed, and continuing primary URLs, plus the three old records.

## Selection and source checks

The revised article retains 39 entries and all 44 associated application links:

| Section | Entries |
| --- | ---: |
| From the current feed | 6 |
| U.S. remote jobs | 12 |
| International remote jobs | 12 |
| Hybrid and onsite jobs | 9 |

Selection gives space to contracts, part-time work, internships, freelance work, writing, content design, knowledge management, developer relations, and documentation engineering. It covers U.S. and international locations. It does not use Adam’s personal search restrictions. No primary entry is repeated between sections.

Each selection is joined to its exact current CSV record. Titles, locations, arrangement labels, and application URLs are preserved. Display employer names are supported by the saved employer descriptions, joined by exact URL in `03_top_matches_full.csv`. The evidence file records each display name and its supporting phrase. For example, Sentinellabs becomes SentinelOne, Gomotive becomes Motive, and Gleanwork becomes Glean. No intermediary is presented as a verified employer.

All three selected groups retain every link: Veeva Systems curriculum developer, three links; Veeva Systems content writer, three links; Sigma internship, two links. Their additional links are labelled with the saved location of the corresponding component record. No application link is replaced with a spreadsheet link.

Geographic limits retained or made explicit include Datadog’s three states, Okta’s named locations, Airbnb’s eligible-state rule and Pacific-hours preference, India work authorization for JumpCloud, Costa Rica residence for Smartsheet, Karat’s Mexico City and Bangalore limits, and Percona’s recommended time-zone range. Veeva’s location lists remain complete. Storyblok stays in its existing general section. The revision adds APAC, Austria, and Europe from the official page; its saved location field remains unchanged. Worldwide wording is used only where the saved record and description support it.

The full list has saved board-check times from `2026-06-30 12:08 UTC` to `2026-11-02 11:23 UTC`. Selected entries range from `2026-11-01 10:43 UTC` to `2026-11-02 11:17 UTC`. No selected board-check date is missing. The workflow’s grouped `Last Checked` is the newest component time; it does not prove that every component was checked at that exact time.

The saved URL-check summary records 775 input rows, 27 safe removals, and 748 retained rows. It also records 11 retained ambiguous failures. The saved URL-review CSV separately records one retained HTTP 429 response: Helsing’s Systems Technical Writer. It is labelled Rate Limited, despite UrlCheckOk being Yes, and is not a confirmed successful check. The summary counts it among 737 GoodRows; the detailed CSV has 736 Good statuses and one Rate Limited status. The 11 ambiguous failures and the rate-limited entry are not selected. All 39 retained selected primary URLs have saved status Good and HTTP 200. These saved results are dated November 2; their exact times are retained in the evidence JSON. The workflow checks the primary URL column. It does not establish a separate check of the five selected additional links.

Selected primary URL-check times range from `2026-11-02T11:37:44.228Z` to `2026-11-02T11:38:01.255Z`. These are saved workflow checks, not checks made during drafting.

The initial drafting pass made no employer-page or application-link requests. This revision made the limited checks recorded above. The publication-reference and image-reference requests belong to the initial pass and are separate from job checks. The current live Google Sheet was not read or changed. Successful saved URL responses do not prove that applications remain open.

## Open review items and source limits

1. Sigma’s internship retains the saved Hybrid label. Both current descriptions require in-person work for 12 weeks; both forms ask about 4 days onsite. The article states both facts. Whether the remaining workday can be remote is unresolved. Applicants should confirm the weekly schedule with Sigma.
2. Airbnb’s Staff UX Writer role refers to a changing excluded-state list. The draft preserves the registered-entity requirement and points readers to the application page. This task did not verify the current exclusion list.
3. Some saved postings are old. Canonical’s broad multiple-level role has a saved posting date of May 16, 2022, with a November 1 board check. It is included for worldwide coverage, without calling it new or recently posted. Other selected roles also have old posting dates. Selection used recent saved source checks, not a recent-publication claim.
4. The full package has stale records and posting-date warnings, listed below. The article does not describe all entries as checked on November 2.
5. The live Sheet can differ from the saved package. The article links to the resource without claiming a current upload.
6. This remains a revised draft. Adam must review the selections, Sigma schedule limit, source note, graphics, and announcements. No publication action is authorized by this output.

## Support footer and writing review

The task supplies the approved October 26 footer. The published October 19 and October 26 editions use the same wording. The October 29 published five-job edition also retains that wording. No newer footer was found in the inspected records. The draft preserves both paragraphs, with the specified spreadsheet and subscription links. No paid benefits were added.

The article follows the supplied title, subtitle, section order, and compact linked-entry format. Employer names and titles were checked against saved evidence. New prose has no em dashes. No personal experience, employer publication dates, salary claims, market conclusions, or application outcomes were invented.

The voice review found no machine-checkable watchlist findings. Editorial review kept repeated fields for scanning and retained necessary location limits. The checker does not establish authorship, accuracy, or publication readiness.

## Graphics

Both PNGs are real rendered images, 1600 × 900 pixels. Both were inspected visually at full size again for this revision. No image was changed. Their editable SVG templates use the same cream and pale green spreadsheet design, with column letters, row numbers, gridlines, and green, blue, gray, and yellow accents.

The October 26 published cover was downloaded and inspected as the design reference. The statistics graphic follows the requested cream spreadsheet system. The previous edition’s dark statistics card was inspected as a data-layout reference.

The horizontal bar has a width of 1360 pixels. Each segment uses `arrangement count / 748 × 1360`. The four widths have no gaps or artificial minimum sizes and sum to 1360. Source and comparison dates appear on the statistics image. Visual values, labels, colors, dates, and rendering details are in the visual-data JSON. Captions and alt text are in the metadata file.

## Validation

- Current package validation: WARN, with 0 failures and 4 warnings. The report is saved in `substack-assets-2026-11-02/package-check/`.
- Warning 1: 6 entries have board checks older than 7 days.
- Warning 2: the same 6 entries have board checks older than 14 days. These are overlapping warnings, not 12 entries. None of the six is selected.
- Warning 3: 2 continuing entries have posting dates that moved forward by more than 1 day.
- Warning 4: the same 2 entries have lower ages than in the baseline. They are Perplexity’s Member of Technical Staff (Software Engineer, API Platform), and Apex Technology Inc’s Proposal Specialist / Technical Writer, US Government Markets (TS/SCI). Neither is selected. These two warnings overlap and concern two other entries; they do not overlap with the six stale-check entries.
- Initial preparation: `npm run jobs:test-gsheet-grouping`: PASS. Not rerun for this text-only revision.
- Initial preparation: `npm run jobs:test-us-remote-report`: PASS. Not rerun for this text-only revision.
- `review_draft.py ... --profile job-roundup`: no watchlist findings.
- The saved initial edition result is PASS, with 558 checks for 40 selections and 45 links. See `substack-assets-2026-11-02/validation-results.json`. It is historical evidence, not a validation result for the revised article. The script and saved result were preserved.
- SEO description: 131 characters, within the required 50–160 range.
- `git diff --check` passed. The separate check of all new text files also passed. Existing Git status entries and existing file contents are unchanged.

Revision validation uses the existing validator in memory, with the documented GEM exclusion, revised selection totals (39 entries and 44 links), and the two revised employer notes. It retains package, schema, comparison, source-hash, field, order, link, footer, SEO, image, local-link, and whitespace checks. It adds checks for the freshness note, limited live-check statement, warning overlap, and metadata totals. No validator, evidence, or saved result file is changed. The unmodified script still requires the initial 40-entry selection and opening sentence; do not use it as a current revision check.

Revision result: **PASS, 569 checks**, with 39 selections and 44 application links. The voice checker found no watchlist findings. The approved footer, 37 unaffected listing lines, retained link sequence, source hashes, saved results, images, and Git staging state were preserved. Only the three authorized Markdown files changed. These checks do not prove that every retained role is open now.

## Publication checklist

- [x] Use the supplied November 2 edition date.
- [x] Verify current and baseline identities and dates.
- [x] Reconcile arrangement and comparison counts.
- [x] Validate 39 selections and all 44 application links against saved records.
- [x] Retain geographic limits and flag the Sigma arrangement conflict.
- [x] Preserve the approved footer and links.
- [x] Check the SEO character count.
- [x] Generate and inspect both PNGs; retain editable SVGs and exact visual data.
- [ ] Adam reviews the revised draft and its Sigma schedule limit.
- [ ] Before publication, review any changes in role availability and location rules that require a new check.
- [ ] Set publication and email options manually after approval. This task does not publish, email, or update the Sheet.

When copying to Substack, omit the draft label and review link above the separator. Put the title and week label in their separate fields. Add the cover, statistics image, alt text, SEO description, and approved footer. A draft article URL has not been created.

## Files and preservation

Initial preparation created the article, review, metadata, visual-data file, and dated asset folder. This revision changes only the article, review, and metadata. The asset folder contains the two PNGs, two editable SVGs, two published-reference HTML files, source evidence, the edition validator and result, and the package-check reports.

Complete output paths, relative to the repository root:

| File | Purpose |
| --- | --- |
| [docs/substack-draft-2026-11-02.md](substack-draft-2026-11-02.md) | Complete article draft |
| [docs/substack-review-2026-11-02.md](substack-review-2026-11-02.md) | This review and checklist |
| [docs/substack-metadata-2026-11-02.md](substack-metadata-2026-11-02.md) | SEO, announcements, captions, and alt text |
| [docs/substack-visual-data-2026-11-02.json](substack-visual-data-2026-11-02.json) | Exact visual values and rendering specification |
| [docs/substack-assets-2026-11-02/substack-cover-2026-11-02.png](substack-assets-2026-11-02/substack-cover-2026-11-02.png) | Inspected cover, 1600 × 900 |
| [docs/substack-assets-2026-11-02/substack-statistics-2026-11-02.png](substack-assets-2026-11-02/substack-statistics-2026-11-02.png) | Inspected statistics graphic, 1600 × 900 |
| [docs/substack-assets-2026-11-02/substack-cover-2026-11-02.svg](substack-assets-2026-11-02/substack-cover-2026-11-02.svg) | Editable cover template |
| [docs/substack-assets-2026-11-02/substack-statistics-2026-11-02.svg](substack-assets-2026-11-02/substack-statistics-2026-11-02.svg) | Editable statistics template |
| [docs/substack-assets-2026-11-02/source-evidence.json](substack-assets-2026-11-02/source-evidence.json) | Selected records, changes, saved checks, and source hashes |
| [docs/substack-assets-2026-11-02/published-reference-2026-10-19.html](substack-assets-2026-11-02/published-reference-2026-10-19.html) | Published format reference from RSS |
| [docs/substack-assets-2026-11-02/published-reference-2026-10-26.html](substack-assets-2026-11-02/published-reference-2026-10-26.html) | Previous published edition from RSS |
| [docs/substack-assets-2026-11-02/validate-edition.py](substack-assets-2026-11-02/validate-edition.py) | Repeatable local checks |
| [docs/substack-assets-2026-11-02/validation-results.json](substack-assets-2026-11-02/validation-results.json) | Edition validation result |
| [docs/substack-assets-2026-11-02/package-check/test-gsheet-package-results.json](substack-assets-2026-11-02/package-check/test-gsheet-package-results.json) | Structured package validation result |
| [docs/substack-assets-2026-11-02/package-check/test-gsheet-package-results.md](substack-assets-2026-11-02/package-check/test-gsheet-package-results.md) | Package warnings and checks |

Current CSV SHA-256: `c1c3f9974d2a32a1e2c3776d07909dd818d896fc7c3555f70c2d396621e964a8`.

Baseline CSV SHA-256: `a34cca8df3e48bf1f5e53620142943228c12a8a3be22006bf3da606369ca3f01`.

The evidence file records the other source hashes and the initial files with existing changes. Revision validation checks those hashes and compares this session’s file hashes. It permits changes only to the three derived Markdown files. Existing staged and unstaged work, previous editions, packages, source reports, synced project files, and Job Finder records were preserved. No dependencies were added. No commit, push, PR, email, public Sheet update, or Substack publication was made.
