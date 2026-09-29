# ATS behavior analysis

**Derived research report — 27 September 2026.** This report uses saved project data. It does not establish that any example job is open today. No network requests, production changes, data cleanup, commits, or pushes were made.

## Executive summary

The strongest findings concern the difference between an employer posting and this project's representation of it. A recent export can contain old observations. A populated description can contain only a title. A date can change while the posting ID stays the same. An HTTP 200 response can contain an error page. A URL query parameter can hold the only job ID.

The full saved feed contains **837,999 rows**. The analysis also covers **130 saved top-match packages**, **436,588 distinct logged board attempts**, and **77,282 URL checks**. A separate three-day comparison holds the board set constant for four ATS families. These are selected records and repeated observations, not a count of all vacancies or an estimate of vendor quality.

The useful discovery signal is a combination of **ownership, content object, audience, and result**. For example, a role can own a knowledge base, its structure, its review process, and its use by support staff or AI tools. Eight selected examples show this work outside the three conventional title patterns tested here. Other roles with similar terms require production software engineering. Neither a title nor a mention of documentation is enough.

Evidence labels used throughout:

- **Observed:** a saved value, transition, log entry, or code behavior.
- **Supported inference:** an explanation supported by those observations, with a stated limit.
- **Hypothesis:** a question that needs a new controlled test.

## Evidence available

### Scope and units

The main input is `data/jobs/public/public-job-feed-latest.json`, generated at `2026-09-27T12:20:06.610Z`. Its rows have fetch times from 2 June through 27 September 2026. “Current feed” below means this assembled export, not one simultaneous crawl. Its saved summary reports 21,432 distinct company keys. Keys can represent aliases; this is not a verified count of legal employers.

All quantitative source paths and SHA-256 hashes are in [input-manifest.json](input-manifest.json). The separate cohort analysis includes its input manifest in [cohort-evidence.json](cohort-evidence.json). Code was inspected at Git revision `e6c22f7e8e4b0351b41650f7119e1dd3e0933808`. The initial tracked working tree was clean.

| Evidence | Available material | Limit |
| --- | --- | --- |
| Source definitions | Six downloaded catalogs; normalized catalog and crawl queue; `src/config/catalog-sources.js` | Catalog inclusion is not a successful fetch |
| Batch observations | 26,504 files, about 101.6 GB; 1,355 indexed fetch-log files read | Batch job JSON is normalized; the entire 101.6 GB was not scanned |
| Current records | All 837,999 rows, 64 fields, 3.87 GB of JSON | Rows can repeat jobs or contain old observations |
| Historical content | 130 `03_top_matches_full.csv` files, 2 June–27 September; 93,213 within-package identity observations | Selected by historical scoring and dedupe rules; not all jobs |
| Controlled saved cohort | Last three saved `refresh-known-good` batches for Ashby, Greenhouse, Lever, BambooHR; 21–23 September | Selected known-good boards; successful extraction does not prove full board completeness |
| Fetch state | `data/jobs/state/board-state.json`, board latest-fetch index, batch logs | State is at board level; error-class fields can retain old values |
| URL checks | 77,282 distinct URL/check-time pairs for 2,632 URLs; 5 June–27 September | Saved classification and final URL, not full page bodies or redirect chains |
| First/last seen | `data/jobs/trends/*/job-lifecycle.csv`, package history, board state | Job trend dates concern a filtered package; board `FirstSeenAt` concerns a board |
| Reports and logs | ATS health, crawl coverage, source-failure review, posting patterns, three maintenance logs | Reports are derived and can be older than code |
| Tests | Saved full-suite PASS, 27 September; four fixture checks rerun here | Tests establish implementation behavior, not live source completeness |
| Archives | Five ZIP files, about 0.88 GB; compressed index history | Inventoried but not expanded or included in historical counts |

Existing data paths remain read-only. Research files are grouped here because `data/` contains ignored generated material. No existing report was replaced.

### Fields and missing evidence

Available fields include title, description, department, location, `RawLocation`, URL, `RawJobURL`, `RawJobId`, board and fetch URLs, fetch time, `DatePosted`, source batch, company keys, duplicate keys, and derived remote/salary/fit fields. The full field list is in [quantitative-evidence.json](quantitative-evidence.json), `fields`.

Important absent evidence:

- No routine archive of complete original ATS JSON or HTML responses. Fetchers return `raw`, but the batch output writer saves normalized rows and logs (`src/scripts/fetch-batch-jobs.js:592`). Raw catalogs are company lists, not raw job bodies.
- No uniform employer publication date plus update date plus date-source field. No uniform requisition ID separate from posting ID.
- No reliable description completeness flag, extraction version, or content hash in the feed. This analysis hashes saved descriptions for comparison.
- No separate preserved employment-type field, workplace-type field, hiring-state list, salary components, or location array in the public projection. Ashby secondary locations are joined into text.
- No complete job-level closure/reactivation state machine. Filtered package disappearance is not closure.
- No paired ATS/career-site/LinkedIn/Indeed observations. No evidence of application outcomes, applicant ranking, screening, or whether an advertised opening was filled.

## ATS/platform coverage

Counts below are distinct saved `CompanyKey` values and board slugs within each source family. A company can occur in more than one row or family. Do not add company counts to get a unique employer total. Historical “companies attempted” includes failures and empty responses.

| Source family | Current company keys | Current boards | Current rows | Historical company keys attempted | Logged attempts | Fetch-log span |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| ashby | 2,282 | 2,294 | 44,424 | 3136 | 44273 | 2026-06-02 to 2026-09-27 |
| greenhouse | 4,734 | 4,734 | 167,994 | 8333 | 108474 | 2026-06-02 to 2026-09-27 |
| lever | 1,589 | 1,590 | 59,548 | 4362 | 47671 | 2026-06-02 to 2026-09-27 |
| bamboohr | 6,449 | 6,449 | 46,735 | 11316 | 126680 | 2026-06-02 to 2026-09-27 |
| workday | 3,105 | 4,940 | 263,014 | 3614 | 54116 | 2026-07-15 to 2026-09-27 |
| icims | 3,472 | 3,476 | 256,282 | 10097 | 55374 | 2026-07-15 to 2026-09-27 |
| direct-employer | 2 | 2 | 2 | Not in routine logs | Not in routine logs |  to  |

Six families have routine batch integrations: Ashby, Greenhouse, Lever, BambooHR, Workday, and iCIMS. `direct-employer` is an ingestion route, not a seventh ATS: its two current rows are Percona on Ashby and Unity on Workday, read through job-page JSON-LD (`src/lib/curated-submissions.js:140`).

TalentBrew has a parser, a bounded probe, normalization, and fixture tests. No saved TalentBrew-named data artifact or current TalentBrew row was found. NetApp appears in curated intake/history, but its latest health record says HTTP 404 and excludes it. This does not establish a routine TalentBrew history.

SmartRecruiters, Jobvite, Workable, Rippling, Eightfold, SuccessFactors, and Oracle have no dedicated routine adapter or measured source cohort here. Their global behavior is **Unknown**. Company career sites occur as returned job URLs; that does not establish a separate search-interface adapter. Jobgether occurs as a Lever publisher. Thus, an ATS-hosted URL does not by itself establish that the publisher is the hiring employer. The catalog source is a GitHub job-board aggregator; it supplies board discovery, not a measured LinkedIn/Indeed job feed.

Missing fields in the current normalized rows (zero means populated, not verified):

| Family | Missing location | Missing description | Missing department | Description under 200 visible characters |
| --- | ---: | ---: | ---: | ---: |
| ashby | 0 | 1 | 0 | 100 |
| greenhouse | 7 | 0 | 773 | 320 |
| lever | 66 | 164 | 59 | 231 |
| bamboohr | 1,072 | 0 | 5,476 | 46,735 |
| workday | 3,417 | 31 | 263,014 | 262,905 |
| icims | 49,949 | 36,478 | 256,282 | 68,190 |
| direct-employer | 1 | 0 | 2 | 0 |

All current rows have a URL and fetch time. Only the two direct-page rows lack a raw ID. Nonblank descriptions are not necessarily full descriptions, as the title-only counts show.

### Implemented endpoints and field mapping

| Family | Implemented request | Identity/date mapping | Main loss or limit |
| --- | --- | --- | --- |
| Ashby | GET `api.ashbyhq.com/posting-api/job-board/{slug}` | `id`; `publishedAt` | Does not preserve `isRemote`/workplace type as separate source fields; flattens secondary locations |
| Greenhouse | GET `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | `id`; first available of `first_published`, `published_at`, `created_at`, `updated_at` | First department only; dedicated salary field set blank; date origin lost |
| Lever | GET `api.lever.co/v0/postings/{slug}?mode=json` | `id`; `createdAt` converted from milliseconds | Description sections flattened; dedicated salary field set blank |
| Workday | POST `/wday/cxs/{tenant}/{site}/jobs`, empty `searchText`, 20 per page | ID/jobReqId/first bullet/path fallback; `postedOn`/start/update fallback | Stops at 2,000; title fallback; first bullet need not be a requisition ID |
| BambooHR | GET supplied URL or `{slug}.bamboohr.com/careers/list` | ID/opening-ID fallbacks; several date fallbacks | Listing response frequently supplies title only in this ingestion |
| iCIMS | GET `/jobs/search?ss=1&searchRelation=keyword_all&in_iframe=1&pr={page}` | Numeric ID from job-card URL | HTML card extraction; at most 20 pages; no routine detail-page extraction |
| Direct page route | GET approved job URL; parse `JobPosting` JSON-LD | URL-derived ID; `datePosted` | Two current rows have blank `RawJobId`; too small for platform claims |

Sources: `src/lib/ats/{ashby,greenhouse,lever,workday,bamboohr,icims}.js`; `src/lib/jobs-normalize.js`; `src/lib/curated-submissions.js`. These are implementation observations, not current vendor API contracts. The August `docs/ats-api-behavior.md` describes older Workday GET/iCIMS JSON behavior; current code uses Workday POST and iCIMS HTML.

## Posting lifecycle findings

### F01 — Saved history can detect presence changes, but not the reason

**Observed.** The three-day comparison keeps only boards with `success` or `empty` logs in all three selected batches. The identity is board plus raw posting ID, with URL fallback. Counts are distinct IDs per board, not hiring positions. Changes compare 21→22 and 22→23 September.

| Family | Common boards | IDs on 21 / 22 / 23 September | Removed, first / second interval | Added, first / second interval | Present–absent–present IDs |
| --- | ---: | --- | --- | --- | ---: |
| ashby | 60 | 4,540 / 4,532 / 4,547 | 98 / 56 | 90 / 71 | 4 |
| greenhouse | 157 | 23,635 / 23,573 / 23,578 | 559 / 541 | 497 / 546 | 8 |
| lever | 48 | 10,215 / 10,249 / 10,307 | 41 / 37 | 75 / 95 | 1 |
| bamboohr | 42 | 833 / 835 / 827 | 8 / 22 | 10 / 14 | 0 |

Thirteen IDs are present on the first and third days but absent on the middle day: four Ashby, eight Greenhouse, one Lever. Examples include Ashby Airwallex `48f55d7e-50dc-4875-ab4c-76f0286dc668`, Greenhouse Gusto `8157333`, and Lever CrossCountry Consulting `e5f20d9e-a123-4ebc-9e38-9e852d210bfc`. Exact URLs and all three batch paths are in `cohort-evidence.json → examples → {ats}:return`.

**Supported inference:** absence can be temporary in extracted boards. **Unknown:** employer reopening, temporary visibility change, API omission, or extraction issue. No detail-page status was paired with these transitions. Do not call them confirmed reposts or reopened vacancies.

### F02 — IDs can persist through content changes

**Observed.** In the same cohort, title-change events total 49 Ashby, 108 Greenhouse, 16 Lever, and three BambooHR. Visible-text description-change events total 103, 685, 28, and three respectively. These are transitions, so an ID can contribute twice. BambooHR's three description changes follow title changes; they do not establish body edits.

Examples: Mujin BambooHR ID `156` changes from “Solutions Engineer III” to “Sales Engineer.” Machinify Greenhouse `4300078009` drops the location phrase from its title. Shield AI retains Lever posting UUID `15791f6f-4d75-45a5-aa69-bee6733a41c9` while the title's requisition-like label changes from `R5312` to `R5844`. A posting UUID and a title-embedded reference are different identifiers. This is one employer example, not a Lever-wide requisition rule.

Saved top-match packages provide a longer, narrower history:

| Family | Company keys | Observed identities | Identities seen more than once | Title / description transitions | Date transitions | Gap-return events |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| ashby | 156 | 217 | 213 | 11 / 65 | 23 | 10 |
| greenhouse | 407 | 893 | 882 | 30 / 298 | 473 | 89 |
| lever | 112 | 658 | 653 | 11 / 48 | 0 | 3 |
| bamboohr | 113 | 151 | 149 | 7 / 7 | 0 | 4 |
| workday | 413 | 775 | 746 | 19 / 21 | 3009 | 104 |
| icims | 247 | 455 | 346 | 8 / 11 | 0 | 33 |
| direct-employer | 3 | 3 | 3 | 0 / 0 | 2 | 2 |

History identity uses ATS + board + raw ID, except Workday values absent from the URL use the full URL. The analysis keeps one observation per identity per package. Package gaps can result from ranking, dedupe, URL pruning, source coverage, or data changes. Longer-history description comparisons normalize whitespace but retain markup; they are saved-text mutations, not proven employer edits. The three-day cohort strips markup for its text comparison.

## Freshness/date behavior

### F03 — “Posted” does not have one meaning across this feed

**Observed.** Ashby, Greenhouse, and Lever have absolute-format dates in all current rows. All 46,735 BambooHR and 256,282 iCIMS rows lack `DatePosted`. Workday has 258,343 relative/other strings, 4,631 blanks, and 40 absolute dates. Examples include `Posted 30+ Days Ago`; this cannot give an exact original publication day.

Greenhouse's current fallback can select `updated_at` (`src/lib/jobs-normalize.js:278`). The saved projection does not retain which source property won. Thus, 100% date coverage does not mean 100% original-publication coverage. Older package changes can also reflect a normalizer change.

**Observed same-ID date movement:** in 60 Ashby cohort boards, 31 date-change events occur. Apex Technology ID `d41efde0-f404-499e-ba27-ee455077d0cc` changes from `2025-04-28T18:31:22.599+00:00` to `2026-09-21T20:18:31.909+00:00`. It exists in both batches. This is evidence against treating its later date as a newly observed ID. It does not reveal the employer's action that changed `publishedAt`.

Documentation example: Infisical's Founding Technical Writer ID `d52e9080-a575-493a-8792-dbba28c50d49` was already in the 2 June package. Between the 23 and 24 June packages, its saved date moves from 23 January to 16 June, and its title loses “(US & Canada).” Both files and values are in `evidence-examples.json → changes → ashby:DatePosted` and `ashby:Title`.

Counterexamples matter: the short Greenhouse and Lever cohorts have **zero** date changes despite 108 and 16 title changes. Editing a posting does not always change the saved date. In the longer selected history, Lever has zero `DatePosted` changes across 658 identities; Ashby has 23 and Greenhouse 473. This does not prove immutable Lever creation dates globally.

**Practical inference:** sort separately by first observed ID, stated source date, and last successful fetch. A first sighting is bounded by prior successful coverage; initial backfill is not a wave of new openings. Relative Workday dates need the row's fetch time, not today's date. Cross-source “newest” sorting is not comparable without these distinctions.

### F04 — A new export can contain old observations

**Observed.** 11,630 current rows have fetch times more than 30 days before `2026-09-27T23:59:59Z`. Merge code selects the latest successful or empty board result. A later failure does not replace that result (`src/scripts/merge-batches.js:403–437`). An empty extraction can remove older rows; a timeout can leave them in the feed.

The current board state has 1,234 failed boards with a prior success: 150 Ashby, 259 BambooHR, 349 Greenhouse, 258 iCIMS, 121 Lever, and 97 Workday. These are board-state counts, not a direct count of stale jobs. They show why last success and last attempt must stay separate. File generation time is not job verification time.

## IDs and repost detection

### F05 — Preserve the ID's scope and test the ID before use

**Observed.** Current raw IDs occur across multiple board slugs in 1,838 BambooHR ID groups, 49,373 iCIMS groups, 25,452 Workday groups, and ten Greenhouse groups. Some groups are aliases or employer sites, not unrelated employers. However, BambooHR ID `214` belongs both to White Rhino Coffee's Delivery Manager and Williscc's therapist role. ATS + ID alone merges unrelated records. The existing `JobKey` uses ATS + normalized raw ID without the board (`src/lib/job-dedupe.js:44`).

**Observed ingestion defect risk:** 7,678 Workday records have raw IDs that do not occur in their URLs. This mismatch alone is not proof of a bad ID. The inspected Aristocrat example is stronger: `RawJobId=Regular` is reused while URLs contain different `R002…` requisitions. The normalizer uses `bulletFields[0]` as an ID fallback (`src/lib/jobs-normalize.js:453`). The analysis uses URL identity for these mismatches so they do not become false edit histories.

**Recommended key:** retain ATS + board/tenant + source ID + full source URL. For Workday, retain tenant + validated requisition and separate site/URL variants. For BambooHR/iCIMS, retain the employer board or actual job host. For Ashby/Lever, board + UUID worked in the inspected comparisons. This is an evidence-based local key policy, not a uniqueness guarantee from vendors.

Same-title/new-ID pairs are **repost candidates**, not confirmed reposts. They can be separate headcount, country openings, pools, or replacements. No validated new-ID repost rate was produced. Stable IDs help distinguish a repeated posting from a new observed ID; they do not establish vacancy age or continued availability.

## URL/closure behavior

### F06 — HTTP success does not establish an active application

**Observed saved checker results:** 598 checks returned HTTP 200 plus an issue. Greenhouse accounts for 476 checks across 78 URLs and 40 company labels; Ashby has 70 across six URLs and six labels; iCIMS has 52 across two URLs and two labels. These counts describe checker findings, not independently confirmed closures. Some labels are aliases.

Examples:

- Sphinx Defense Greenhouse `5222351008` returned 200 at a final board URL ending `?error=true` on 5 June. Source: `data/jobs/gsheet-package/20260605-0620/01_good_documentation_jobs-url-review.csv`.
- Nuon Ashby `aab160fd-a9ff-47f3-96b5-6917fcd09275` returned 200 with the saved issue “empty generic Jobs page” on 29 August. Source: the same review filename under `20260829-0639`.
- re:hire iCIMS `2250` returned 200 with a closed/not-found page-text classification on 15 July. Source: the same review filename under `20260715-0556`.

All full URLs, timestamps, classifications, and source files are copied to `cohort-evidence.json → examples → {ats}:http200Issue`.

The same history has 750 HTTP 404 checks and 377 HTTP 410 checks. Lever has 279 of the 404 checks; iCIMS has 376 of the 410 checks. These are repeated checks, not counts of distinct closed jobs. There are also 180 Greenhouse checks where the detail page returns 406 but the board API still lists the job, and 129 rate-limited checks. These are important counterexamples to status-only removal.

The checker follows redirects, reads up to about 64 KB of response text, and applies known patterns (`src/lib/job-url-health.js:146, 250`). It does not retain every redirect hop or prove an application form works. Zero detected problems for BambooHR does not establish perfect availability. Workday page shells can pass a generic check. Retain ambiguous access failures for review.

**Supported practical test:** check final destination, employer/job identity, meaningful job content, and an application route. Where the saved checker supports it, compare the job ID with the employer board API. A removed-board job that remains usable on its detail page is still **Unknown** here: presence and URL checks were not joined into a controlled closure sequence.

## Duplicate behavior

### F07 — Some duplicates come from our URL normalization

**Observed.** `getCanonicalURLKey` removes the entire query string (`src/lib/job-dedupe.js:21`). Greenhouse has 52,455 URLs with query parameters. The scan finds 22,989 additional Greenhouse rows whose canonical key was already used by a different board-qualified identity. This is a collision-candidate count, not 22,989 proved errors or lost jobs.

The inspected Omgcamontreal board is a clear counterexample to this normalization rule. Two distinct roles have URLs `https://boards.greenhouse.io/omgcamontreal/?gh_jid=4665614007` and `https://boards.greenhouse.io/omgcamontreal/?gh_jid=4693623007`. Removing the query gives the same URL. They have different titles and raw IDs in the same saved batch, `greenhouse-catchup-high-5150`. Preserve identity parameters; remove only known tracking parameters.

**Observed legitimate variants:** Condé Nast Workday requisition `R-24424` appears on `pubworx_external_career_site` and `condecareers`, with different path suffixes. This supports grouping URL variants for review. It does not prove that every repeated Workday ID across tenants is the same job.

Huge's Director, AI Content Strategy has Greenhouse IDs `8128682` for the US and `8128683` for Canada, with different pay/currency text. These should remain distinct eligibility records even if a display groups their shared title. The evidence cannot establish whether they represent one or two hiring positions.

iCIMS has 228,829 rows flagged `PossibleDuplicate` out of 256,282. The same Tech CU Knowledge Base Program Manager URL appears under `Careers Techcu` and `Techcu`. Board aliases and normalization contribute to this figure. The global 313,745 duplicate flags cannot be read as redundant openings. Localization, compensation-zone duplication, and aggregator mirroring need separate evidence; no general rate is established.

## Remote/location behavior

### F08 — Remote eligibility needs the actual role statement

**Observed.** The remote fields are derived from title, location, raw location, and the entire description. They are not preserved ATS workplace flags (`src/lib/work-arrangement.js:66,106`). “Hybrid” takes precedence over “Remote”; a US/North America/Americas mention can set US eligibility. The code does not establish a state-by-state hiring permission model.

Ashby has 7,337 rows where combined `Location` differs from primary `RawLocation`. Ashby, Greenhouse, and Lever have 9,257, 22,814, and 12,085 rows with the word “remote” in description text but not location text. These are lexical signals, not verified remote jobs. BambooHR/Workday title fallbacks make their equivalent counts especially weak.

Selected contradictions and limits:

- Firecrawl's saved 24 June title record has `San Francisco, CA (Hybrid) OR Remote (Americas, UTC-3 to UTC-10)`. The derived result is Hybrid and US eligibility false. This loses the alternative arrangement. The full historical row is under `evidence-examples.json → changes → ashby:Title`.
- TechnologyAdvice Content Editor, Tech (`6128026004`) says `Philippines - Remote`, yet has derived US eligibility true. This is a demonstrated conflict, not verified US access.
- Simpplr Technical Writer (`6163360004`) contains a company policy that defines Hub, Hybrid, and Remote for different roles. The whole policy does not identify this role's arrangement.
- Payscale Senior Revenue Enablement Manager excludes Hawaii, Quebec, and Northern Ireland in its description. Its Remote/US-eligible flags do not expose those exclusions.

Positive examples: Resident's role (`6098816004`) explicitly requires residence and work authorization within the US. Healthie's Senior Content Engineer (`4411944009`) says full-time remote and requires US work authorization. Work authorization is not the same as permission to work from every US state. Huge has separate country-specific job records. Do not transfer eligibility between them.

**Safest local procedure:** use the role-specific location/arrangement passage, explicit country/state restrictions, and authorization requirement together. Retain location alternatives and arrays. If the description is a card snippet or title, mark eligibility **Unknown** until the full role text is obtained. A score or boolean cannot resolve conflicting source passages.

## Compensation behavior

### F09 — Detected salary is a text extraction, not validated compensation

Current detected-range counts are 7,146 Ashby, 67,002 Greenhouse, 5,741 Lever, 62 BambooHR, 64 Workday, and 3,073 iCIMS. These are not structured-salary coverage rates. The public projection omits `Salary`; Greenhouse/Lever normalization leaves it blank, and the detector can find ranges in descriptions. BambooHR title-only records can contain pay in the title.

The detector uses the first matching dollar range, assigns `$` to USD, rounds amounts, and labels large numbers annual (`src/lib/salary-detect.js:36–86`). It does not preserve base, bonus, commission, equity, OTE, or all geographic ranges.

Two confirmed saved examples:

- Huge's Canada role `8128683` states `$135,000 — $180,000 CAD`; the normalized currency is USD. The US companion `8128682` states USD. This is our normalization error, not a Greenhouse currency limitation.
- Camunda Technical Writer `9ce12e95-88cd-4da4-8f61-f9cb198b1cc8` has blank detected salary. Its text contains US `$102,300.00 to $164,900.00`, plus UK, Singapore, and Canada ranges. The text labels these **Annual Total Target Cash**, including variable target where applicable. Decimal ranges do not fit the current detector. Do not present these amounts as base salary.

In the three-day cohort, minimum/maximum fields change 3/7 times for Ashby, 75/79 for Greenhouse, and 3/3 for Lever. These are extracted-value changes. They do not by themselves prove pay changes: descriptions, formatting, range order, and parser behavior can change. Keep the source passage and all relevant geographic ranges. Hourly/annual ambiguity, currency, components, and missing values require explicit unknowns.

## Documentation-role discovery

### F10 — Search for responsibility patterns, then check qualification gates

The analysis uses two broad text probes: an ownership verb near a content object, and a domain phrase such as API documentation, knowledge management, information architecture, or content governance. It also checks adjacent titles. This yields 1,519 candidate rows for review. Across the full feed, 977 rows match both probes without “Technical Writ…”, “Documentation Engineer”, or “Documentation Manager” in the title. These are **candidate signals**, not 977 confirmed suitable roles. The literal conventional-title test is intentionally narrow and does not represent every ordinary job search.

The following eight selected roles have substantive documentation/content-system work outside those conventional title patterns. They come from eight publisher/company labels, seven Greenhouse and one Ashby. This is a selected review sample, not a precision/recall benchmark. All eight are in `cohort-evidence.json → reviewed`, with full saved description, source URL, raw ID, fetch date, and line number in the full feed.

| Saved title and employer | Organization | Responsibility signal |
| --- | --- | --- |
| Senior Content Engineer — Healthie, `4411944009` | Marketing | API/SDK documentation, integration guides, architecture references, code samples |
| CX Knowledge Architect — Notion, `4c7683fa-fe37-44d9-aa3f-2f57a37c11f8` | Customer Experience | End-to-end internal knowledge base; information architecture, governance, maintenance |
| Director, AI Content Strategy — Huge, `8128682` | Strategy | Content models, taxonomy, metadata, audits, lifecycle and conversational guidance |
| Knowledge & Enablement Lead — Mercury, `6174117004` | Banking and Risk Operations | Canonical risk-operations library; policy/procedure standards; audit readiness |
| Customer Enablement Associate — Medrio, `8728346002` | Customer Support | User guides, knowledge articles, release notes, curriculum and live training |
| Enablement Operations Manager, Technical Solutions — Datadog, `8134425` | GTM Enablement | Knowledge operating model, taxonomy, publishing standards, lifecycle and discoverability |
| CX Knowledge Base & Conversational AI Manager — Resident, `6098816004` | 552 Customer Success | Knowledge quality, conversation design, evaluation and cross-team review |
| Technical Content Engineer, Cloud Native — Commvault, `5371666008` | Solutions & Product Marketing | Run examples and explain workflows; developer-facing content ownership |

These are discovery examples, not personal matches. Medrio asks for 2–4 years and includes training delivery. Notion lists New York and is not established as a US-remote role. Commvault requires hands-on coding; its accepted backgrounds include technical writing, developer relations, solutions/support engineering, or software engineering with writing experience.

Useful skill combinations are writing + information architecture + governance; API understanding + runnable examples; support operations + search/knowledge quality; and content models + AI evaluation. Departments help recover roles hidden by titles, but are not exclusion rules. They are missing in all routine Workday and iCIMS rows.

False-positive controls from actual records:

- LlamaIndex **AI Content Engineer** requires software engineering and production Python. Content is central, but the engineering gate remains.
- GHX **Software Engineer III – Developer Platform & AI Enablement**, Greenhouse `4729404005`, requires 3–5 years of software development, internal tooling, infrastructure as code, and other engineering work. Documentation is part of that engineering role.
- Anthropic **Research Engineer, Knowledge Team**, `4017331008`, concerns architectures, model behavior, and evaluation. “Knowledge” is not evidence of a knowledge-management writing role.

Do not exclude every title containing “engineer,” or every description mentioning code. Assess the work product and required experience. Do not accept every mention of “documentation,” “AI,” “enablement,” or “knowledge.” The snapshot shows current terminology; it does **not** establish that these terms are increasing over time.

## Required-vs-preferred qualification behavior

Within the 1,519 discovery candidates, 762 contain one of the required-section markers tested, 249 a preferred-section marker, and 528 a bonus/nice-to-have marker. Counts overlap; markers can occur in prose. These figures show extraction opportunities, not a validated classifier.

Three contrasting saved passages:

1. Camunda Technical Writer: **“Nice-to-haves: Software engineering experience”**. This phrase does not make professional software engineering a required gate.
2. LlamaIndex AI Content Engineer: **“Required Qualifications Experience in software engineering”**, followed by production Python. The parenthetical ML/research bonus does not make the whole engineering requirement optional.
3. Commvault Technical Content Engineer accepts **“technical writing, developer relations, solutions engineering, support engineering, or software engineering”** within its experience statement. These are alternatives, not five cumulative requirements.

Lever's original `lists` headings are joined into text; HTML list boundaries are removed by normalization, though headings can remain. Greenhouse retains residual tag-shaped text in 167,981 of 167,994 current descriptions because HTML entities can decode after tag removal. This is transformed text, not preserved source HTML (`src/lib/jobs-normalize.js:14`).

**Proposed extraction:** retain heading, exact requirement span, requirement level, years, skill object, alternatives, and source offsets. End each section at the next heading. Keep “required,” “preferred,” “bonus,” and “unclear” separate. A nearby “preferred” must not change an unrelated required clause. Where section boundaries were lost, retain the ambiguity. No qualification classifier was added or validated in this task.

## Search/indexing behavior

**Observed collection limits:** Workday stops at 2,000 extracted jobs per board; 203 logged attempts return exactly 2,000. This supports a truncation risk, not proof that all 203 lost jobs. The original upstream total is not preserved in the normalized feed; the fetcher's returned `raw.total` is the collected length. iCIMS stops after 20 pages or a page that adds no IDs. TalentBrew has separate bounded pagination controls but no measured routine cohort here.

The project also limits selected boards, uses priorities, favors one ATS in its crawl queue, and retries on a schedule. Saved posting-pattern reports explicitly warn that first-seen weekday/hour patterns reflect refresh cadence and filtering. A report saying “Monday at 05:00” does not establish when employers publish roles.

The direct adapters issue unfiltered board requests except for their endpoint constraints. There is no paired measurement of career-site UI keyword results versus API results, source ordering stability, LinkedIn/Indeed lag, or hidden results. Those questions remain **Unknown**. A recent successful call is not proof of complete pagination.

## ATS comparison matrix

| ATS/platform or route | Companies / current rows | Historical data quality | Stable IDs | Useful dates | Remote metadata | Salary metadata | Closure detection | Duplicate behavior / quirks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ashby | 2,282 / 44,424 | Same-ID edits and returns; 217 selected historical identities | Board + UUID supported locally | All absolute; observed same-ID date movement | Primary + flattened secondary text; derived flags | 7,146 detected; structured source compensation can be read by normalizer, but not separately retained publicly | 70 HTTP-200 shell findings; full lifecycle unknown | 1,995 duplicate flags; location text can contain alternatives |
| greenhouse | 4,734 / 167,994 | Same-ID edits and returns; 893 selected identities | Board + numeric posting ID; query ID can matter | All absolute; date source ambiguous | Text heuristics; source field and boilerplate can conflict | 67,002 detected from text; direct Salary mapping blank | 476 HTTP-200 issue checks; 406/API counterexamples | 30,920 duplicate flags; query-removal collisions |
| lever | 1,589 / 59,548 | Same-ID edits and return; 658 selected identities | Board + UUID supported locally | All absolute; zero observed date transitions in selected history | Location plus flattened full description; derived flags | 5,741 detected from text; direct Salary mapping blank | 279 HTTP-404 checks; no measured full closure sequence | 4,349 duplicate flags; publisher can be a third-party board |
| bamboohr | 6,449 / 46,735 | Same-ID title edits; 151 selected identities | Board + numeric ID needed; cross-employer collisions | All blank | All descriptions equal title; limited eligibility evidence | 62 detected, despite title-only descriptions | 5,304 checks with no issue; active application status unproved | 955 flags; ID alone unsafe |
| workday | 3,105 / 263,014 | 775 selected historical identities; URL fallback for suspect IDs | Validate requisition; keep tenant/site; 7,678 raw IDs absent from URL | 258,343 relative/other; 4,631 blank; 40 absolute | 262,843 title-only descriptions; no department in all rows | 64 detected; no general structured-pay conclusion | No paired closure study; 98 check issues are access/server/timeout | 46,696 flags; multi-site variants; local 2,000 cap |
| icims | 3,472 / 256,282 | 455 selected identities; no controlled three-day cohort | Board/job host + numeric ID; aliases need review | All blank | 36,478 blank descriptions; card snippets; all departments blank | 3,073 detected; snippet limit | 52 HTTP-200 content issues; 376 HTTP-410 checks | 228,829 flags; aliases; local 20-page cap |
| direct-employer | 2 / 2 | Three selected historical identities; too small | Both current raw IDs blank; full URL needed | Two absolute dates | JSON-LD location and text; two rows only | Neither row has a detected range | Two current included pages; no global conclusion | One duplicate flag; route overlaps ATS families |
| TalentBrew | No current cohort | Insufficient evidence | Unknown | Unknown | Unknown | Unknown | Parser fixture only | Probe exists; routine coverage not established |

No numerical ranking is assigned. Differences can result from employer setup, catalog quality, extraction, normalization, and selected populations. Blank salary/department fields do not establish an ATS capability limit.

## Findings useful to job seekers

1. Keep first observed ID, stated date, and last successful check separate. Dates can move on an existing posting (F03–F04).
2. Save the full employer URL and board-qualified ID. The title can change (F02, F05).
3. Treat a return to a feed as a reason to check the role, not proof of a new vacancy (F01).
4. Check the final job page and application route. HTTP 200 is insufficient (F06).
5. Preserve location/country variants until eligibility is clear (F07–F08).
6. Read role-specific location restrictions and alternatives. A US-remote flag can be wrong or incomplete (F08).
7. Read the original compensation passage for currency, period, region, and components (F09).
8. Search for ownership of content systems and their use, across departments (F10).
9. Check the required section before excluding a role for engineering terms (qualification section).
10. Use the full detail page when the feed has only a title or snippet (evidence limits and matrix).

The shorter [search playbook](doc-job-search-playbook.md) applies these findings.

## Findings useful to job-search tooling

These are recommendations, not implemented changes:

- Preserve identity query parameters and board/tenant scope. Test `gh_jid` and Workday bullet-label collisions before using current keys to suppress records.
- Store original source fields, field origins, fetch status, completeness, parser version, and content hashes. Retain source workplace and location arrays separately from derived judgments.
- Compare only boards successfully covered in both observations. Emit `absent_from_successful_extract`, not `closed`, until corroborated.
- Separate ID age, publication date, update date, date type, and observed time. Preserve relative-date text and its fetch time.
- Store role-specific eligibility clauses and salary components with source spans. Use explicit unknowns when full descriptions are absent.
- Build discovery from content ownership, audience, artifacts, processes, and outcomes. Use title/department as supporting evidence; review engineering gates separately.
- Keep URL health outcomes for closed content, generic redirects, API-listed/detail-blocked, rate-limited, timeout, and unknown separate.

## Unknowns and limitations

The principal cause of each finding is bounded as follows:

| Finding | Best-supported source of behavior | Still unknown |
| --- | --- | --- |
| F01 presence/return | Saved board extraction | Reopening versus temporary omission |
| F02 same-ID edits | Employer/source content in saved normalized rows | Exact editor action; parser contribution to older history |
| F03 date changes | Source date values plus local fallback selection | True creation date, update trigger, employer intent |
| F04 old rows | Local merge and failed refresh behavior | Current open status |
| F05 ID collisions | Board scope and local fallback choice | Vendor-wide uniqueness contracts |
| F06 200/error outcomes | Saved HTTP/content classification | Full closure sequence or working application submission |
| F07 URL collisions | Local query removal; employer URL structure | Total erroneous downstream removals |
| F08 eligibility conflicts | Local whole-text heuristics and employer wording | Every allowed state/country |
| F09 salary errors | Local range/currency parser | Pay omitted from saved text or actual offers |
| F10 discovery | Employer duties in selected descriptions | Corpus-wide recall/precision or personal suitability |

No global ATS behavior, causal edit rule, confirmed migration, publication-to-index lag, or one-record/one-opening relationship is established. Selected packages favor existing fit rules and can miss relevant adjacent roles. Snapshot filenames measure package time, not an independent fresh crawl. Repeated URL checks are not independent employers. Company keys and aliases inflate some employer counts. No external verification was needed to describe the saved evidence; live validity remains unverified.

## Recommended future experiments

These are proposed experiments. They were not run.

| Experiment | Reproducible design | Acceptance evidence |
| --- | --- | --- |
| **Highest value: paired lifecycle panel** | Select five currently reachable boards per each of the six routine ATSs. Poll once daily for 30 days. Save raw response, timestamp, pagination/total, parser version, IDs, description/title/location/pay hashes. Request detail pages for changed or missing IDs only; retain status, final URL, redirect hops and JobPosting/application evidence. | Presence changes only on complete successful scans; classify error versus absence; same-ID edits and returns have paired page evidence. Report per-board denominators and failures. |
| Identity correction trial, offline first | Replay current rows with query-aware URL keys and board-scoped IDs. Retain all conflicting rows for manual review. Sample each collision mechanism. | Report wrongly merged/distinct cases and legitimate duplicates; no production suppression changes until reviewed. |
| Qualification/discovery evaluation | Label 100 varied descriptions across conventional, adjacent, and engineering titles, including incomplete records. Annotate work ownership and required/preferred spans before applying scores. | Separate recall, precision, unknown rate, and engineering-gate errors; hold out examples used to design rules. |
| Remote clause evaluation | Label 60 roles across explicit US, states, multi-country, hybrid-or-remote, boilerplate and conflicts. Compare location-only, whole-text, and clause extraction. | Country/state decisions cite exact passages; ambiguity is retained; no authorization inference from geography alone. |
| Salary preservation | Compare 30 raw/detail examples with decimal, hourly, CAD/AUD, OTE, and multiple location ranges. | Exact amounts, currency, periods and components preserved; no guessed salary. |
| Cap and UI completeness | On a small permitted board sample, retain upstream totals and page IDs; compare documented API output to the employer search UI at the same time. | Bound missing IDs and distinguish API cap, local cap, filter, and timing. |
| Indexing lag | Track ten newly observed employer postings against a specified external board at fixed intervals, only if access is permitted. | Paired first/last absent/present intervals; avoid a point estimate when polling intervals overlap. |

The paired panel has the highest value because it addresses the largest missing link: whether a saved presence change is a real posting lifecycle change. The offline identity trial should protect its keys before collection begins.

## Reproduction and validation

Run from the project root with existing Node dependencies:

```sh
node --max-old-space-size=6144 reports/research/ats-behavior-2026-09-27/analyze-ats-behavior.js
node --max-old-space-size=6144 reports/research/ats-behavior-2026-09-27/analyze-saved-cohorts.js
node reports/research/ats-behavior-2026-09-27/validate-analysis.js
```

The scripts make no network requests and write only their research outputs beside the scripts. Reruns use the then-present data; compare input hashes to reproduce this exact result. They do not run production collection, release, prune, archive, or test-suite workflows.

The full scan checks file stability and row-total reconciliation. The cohort checks are independently reconciled with `previous − removed + added = current` in the validation record. Examples were inspected against saved source records. Four existing read-only fixtures passed: URL health, dedupe selection, ATS error classification, and TalentBrew parsing. The existing full-suite PASS is reported as saved evidence, not a new full-suite run. See [validation.json](validation.json) for exact checks and commands.
