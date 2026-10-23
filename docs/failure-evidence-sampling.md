# Failure evidence sampling v1

Branch: `failure-evidence-sampling-v1`.

The prior investigation was reviewed and saved as commit `3d85e44` on `failure-investigation-v1`. Its full 32-suite test run passed before the commit. This branch starts at that commit. New sampling changes remain uncommitted. No branch was pushed.

## Result

The investigation made **59 live HTTP requests**. This includes redirect hops. All 59 requests received HTTP responses. There were **47 probes of 41 distinct boards**, with no automatic retries or page traversal.

| Selected group | Probes | HTTP requests | Observed result |
| --- | ---: | ---: | --- |
| Workday 422, shard-shaped tenant | 5 | 5 | Five 422 responses |
| Workday 422, normal tenant, no prior success | 5 | 5 | Five 422 responses |
| Workday 422, prior success | 5 | 5 | Five 422 responses |
| Workday current success controls | 5 | 5 | Five valid JSON responses, HTTP 200 |
| Workday same-site catalog controls | 5 | 5 | Five valid JSON responses, HTTP 200 |
| BambooHR HTML failures, `/careers/list` | 6 | 12 | Six 302 redirects, then product homepage HTML with HTTP 200 |
| Same BambooHR boards, `/careers` | 6 | 12 | Same redirect and HTML result |
| HTTP 404, no recorded success | 3 | 3 | Three 404 responses |
| HTTP 404, prior success | 3 | 3 | Three 404 responses |
| iCIMS current success controls | 2 | 2 | HTTP 200; parsed job cards |
| iCIMS failed controls | 2 | 2 | One 404 and one 403 |

The sample was selected by fixed SHA-256 order within groups, with diversity by tenant, shard, or ATS where relevant. It is a diagnostic sample, not an estimate of failure rates. All keys are saved in the report. The current saved failures contain no HTTP 410 board. The Workday, BambooHR, and iCIMS catalog rows have no independent source URLs. These gaps are explicit in the evidence.

## Answers to the investigation questions

### 1. Are wd1, wd3, or wd5 incorrectly parsed as Workday tenants?

**CONFIRMED:** The current URL parser keeps the tenant and shard separate for the canonical URLs tested. For example, `https://indivior.wd3.myworkdayjobs.com/indivior` produces tenant `indivior`, shard `wd3`, and site `indivior`. Its constructed endpoint returned valid JSON. The tests also cover `wd1` and `wd5` controls.

All 6,054 suspicious board keys already occur verbatim in the raw string catalog. The adapter accepts `tenant|shard|site`; it does not obtain these values by parsing a saved source URL. No current tenant-versus-shard parser defect was demonstrated. No parser correction was made.

### 2. What URL structure causes the issue?

**UNRESOLVED:** There are no source URLs in those raw entries. The upstream extraction step cannot be reconstructed from the local strings alone. The current code turns a string such as `wd3|wd1|chanelcareers` into `https://wd3.wd1.myworkdayjobs.com/wday/cxs/wd3/chanelcareers/jobs`.

The fixtures distinguish canonical URL tests from URLs reconstructed from live API endpoints. A reconstructed URL is not an independent upstream source.

### 3. Does this explain a substantial part of the 6,054 records?

**CONFIRMED from the full local catalog:** All 6,054 raw entries have the suspicious structure. For 5,929, the same catalog contains one normal-tenant entry with the same site and a shard equal to the suspicious tenant. The other 125 have multiple such entries. None lacks a same-site/shard match.

**CONFIRMED from the sample:** These pairs had different live results:

| Suspicious catalog key (422) | Same-site catalog control (200 JSON) |
| --- | --- |
| `workday\|wd1\|wd1\|tdecu` | `workday\|tdecu\|wd1\|tdecu` |
| `workday\|wd3\|wd1\|chanelcareers` | `workday\|cc\|wd3\|chanelcareers` |
| `workday\|wd5\|wd1\|usf_full-time_faculty` | `workday\|usfca\|wd5\|usf_full-time_faculty` |
| `workday\|wd1\|wd1\|kraftheinz_careers_bc` | `workday\|heinz\|wd1\|kraftheinz_careers_bc` |
| `workday\|wd1\|wd1\|wsc` | `workday\|wsc\|wd1\|wsc` |

**INFERRED:** Upstream catalog metadata is the strongest explanation for this group. The local parser copied the supplied tenant value. The exact upstream defect and the intended identity of each entry remain unknown. The five live comparisons do not prove a cause for all 6,054 endpoints and do not authorize replacement mappings.

For the five shard-tenant probes: malformed URL parsing confirmed **0**; valid live configuration **0**; exact cause unresolved **5**; shard-shaped values confirmed in raw metadata **5**.

### 4. Are other Workday 422s caused by a different issue?

**CONFIRMED:** All ten normal-tenant examples also returned 422. Five had prior successful snapshots. Their response bodies contained `errorCode: HTTP_422`, with an empty message. The five original success controls and five paired controls worked with the same POST payload shape.

**UNRESOLVED:** The bodies do not establish why those ten endpoints rejected the request. Their causes cannot be assigned to moved sites, retired boards, request parameters, or access policy. They do not share the shard-tenant condition.

### 5. What do the BambooHR HTML responses contain?

**CONFIRMED:** All six boards redirected from `/careers/list` to `https://www.bamboohr.com/`. The final response was HTTP 200 HTML, titled “BambooHR: The Complete HR Software for People, Payroll &#x26; Benefits”. The visible preview contains product marketing content. `/careers` had the same result for all six.

Three boards had no recorded success and three had prior success. The new diagnostic classification is `redirected_to_vendor_homepage`. It requires a redirect, the exact vendor host and root path, HTML evidence, and the observed product-title pattern.

**UNRESOLVED:** These responses do not prove that a BambooHR account is inactive or that an employer has closed or moved its board. No normal careers HTML, challenge page, or inactive-account message was established in this sample.

### 6. Do previously successful 404s behave differently?

**CONFIRMED:** No difference was observed. The three boards in each group still returned 404, across Ashby, Greenhouse, and Lever. There were no redirects in these six probes. HTTP 404 establishes only the response from that endpoint at that time. No replacement search or retirement action was performed.

### 7. Do live iCIMS examples support the URL assumptions?

**CONFIRMED:** The constructed hosts `careers-ketteringhealth.icims.com` and `careers-newmillennium.icims.com` returned HTTP 200 at `/jobs/search`, with 20 and 48 parsed job cards in the requested page. This supports the current construction for those examples.

The two failed controls returned 404 and 403. The 404 page title begins with `gone:` and names the requested host. The 403 page title is `iCIMS Portal`. These observations do not establish a replacement host or a universal rule.

**UNRESOLVED:** The current catalog has zero independent iCIMS source URLs. A source-URL-derived cohort was therefore unavailable. Tests pass observed URL structures through the normalizer, but those tests are not independent live proof of source-URL handling. No iCIMS adapter rewrite was made.

### 8. Why does the count differ by three?

**CONFIRMED:** Both reports use state timestamp `2026-09-29T21:00:02.803Z`. The freshness report counts missing `LastSuccessAt` fields. The new analysis also reads retained fetch history.

| Board | Last success found in history | Distinct saved successful observations |
| --- | --- | ---: |
| `greenhouse\|la2028` | 2026-06-25T14:59:20.188Z | 2 |
| `greenhouse\|maintainx` | 2026-06-29T14:24:07.604Z | 3 |
| `greenhouse\|unity3d` | 2026-06-30T12:08:10.040Z | 4 |

Their state records have no last-success date. The June compressed fetch-event ledger records HTTP 200 successes. The new history join changes the count from 20,616 to 20,613. It does not require updated live data, a timing difference, or a changed definition of success. The report includes the nine success events and their source batches.

## Tools and controls

```sh
npm run jobs:probe-board -- 'workday|indivior|wd3|indivior'
npm run jobs:probe-board -- --keys-file data/jobs/reports/failure-probe-selection.json --dry-run
```

A live invocation requires explicit board keys, either as arguments or in a JSON file. Missing, repeated, unknown, and ineligible keys fail before requests. There is no `all` mode. A run is limited to 40 boards. `--limit` can reduce that limit. URLs must use public HTTPS without embedded credentials or a custom port. The complete plan is checked before the first request.

Requests run sequentially, with a pause between boards, a 20-second timeout per HTTP attempt, at most two redirect hops, and no automatic retry. The probe reads one page, with a 512 KiB body-read limit. Saved response previews are at most 2,048 bytes. Response lengths describe decoded bytes; a truncated body has an unknown full length.

The request ledger is saved before each attempt. Each run has a unique folder, so a later run does not remove earlier evidence. A stopped process can leave a `running` report; inspect the ledger before any repeat. Cookies and authorization headers are not stored or forwarded. URLs and previews are redacted. HTML input/meta tags and script bodies are omitted. Workday's fixed, non-sensitive search payload is retained for comparison.

The new large-body test exposed a slow regular expression on a long string with no separators. The diagnostic redactor now bounds its field-name match. Tests also verify nested secret removal and meta-tag removal. This changes diagnostic handling, not request construction.

## Evidence files

- `data/jobs/reports/failure-probe-report.json`: combined evidence, conclusions, request ledger, all 6,054 catalog relations, input hashes, and count reconciliation.
- `data/jobs/reports/failure-probe-report.md`: derived summary and conclusions.
- `data/jobs/reports/failure-probe-selection.json`: initial 36 explicit keys and selection method.
- `data/jobs/reports/failure-probe-workday-pairs.json`: five catalog control keys and pairing criteria.
- `data/jobs/reports/failure-probe-bamboohr-careers.json`: six explicit path-comparison keys.
- `data/jobs/reports/failure-probes/2026-09-29T21-33-02-579Z-7ac66cb0/`: initial run, 42 requests.
- `data/jobs/reports/failure-probes/2026-09-29T21-34-39-161Z-e4bd342d/`: Workday controls, five requests.
- `data/jobs/reports/failure-probes/2026-09-29T21-34-47-321Z-a822c72f/`: BambooHR path comparison, 12 requests.

The original run reports retain the classification recorded at probe time. The combined report adds a derived vendor-homepage classification from saved redirect and title evidence. It retains the original class in `recorded_specific_class`. This step makes no requests.

Generated reports remain local under the existing ignore rules. Small, derived regression fixtures are in `src/scripts/fixtures/failure-probes-2026-09-29.json` with run IDs and source limits.

## Commands and validation

Preservation:

```sh
git status --short --branch
git diff --check
npm run jobs:test-all
git add <the 18 reviewed investigation files>
git commit -m 'Add structured ATS failure diagnostics and saved-data investigation'
git switch -c failure-evidence-sampling-v1
```

Sampling and tests:

```sh
npm run jobs:test-board-probe
npm run jobs:test-failure-investigation
npm run jobs:select-failure-probes
npm run jobs:probe-board -- --keys-file data/jobs/reports/failure-probe-selection.json --dry-run
npm run jobs:probe-board -- --keys-file data/jobs/reports/failure-probe-selection.json
npm run jobs:probe-board -- --keys-file data/jobs/reports/failure-probe-workday-pairs.json
npm run jobs:probe-board -- --keys-file data/jobs/reports/failure-probe-bamboohr-careers.json --view careers
npm run jobs:test-all
npm run jobs:analyze-failures
node src/scripts/report-failure-probes.js \
  data/jobs/reports/failure-probes/2026-09-29T21-33-02-579Z-7ac66cb0/report.json \
  data/jobs/reports/failure-probes/2026-09-29T21-34-39-161Z-e4bd342d/report.json \
  data/jobs/reports/failure-probes/2026-09-29T21-34-47-321Z-a822c72f/report.json
git diff --check
```

Results:

- Previous work: all 32 test suites passed before commit.
- Final sampling code: all 33 test suites passed.
- Probe tests: 93 checks passed, including observed Workday and iCIMS URL fixtures, selection limits, redirects, bounded bodies, redaction, classification, and report accounting.
- Earlier investigation tests: 94 checks passed.
- Saved analysis: 21,747 failures; 20,613 without recorded success; 1,134 with prior success.
- All 47 saved response previews meet the 2,048-byte limit.
- Catalog, raw catalog, and board-state hashes match the values captured before the initial live run.
- No live requests were made by tests, the selection command, or the report command.

## Files changed on this branch

- `package.json`: probe, selection, report, and test commands.
- `src/lib/board-probe.js`: explicit selection, single-page requests, bounded reads, redirects, and classification.
- `src/lib/failure-diagnostics.js`: observed vendor-homepage classification and redaction fixes.
- `src/lib/http.js`, `src/lib/ats-error-classification.js`: retain the new HTML classification in the shared diagnostic path.
- `src/scripts/probe-board.js`: CLI, source hashes, history fields, and per-run request ledger.
- `src/scripts/select-failure-probe-cohorts.js`: repeatable saved-data selection.
- `src/scripts/report-failure-probes.js`: combine explicit saved runs and local evidence.
- `src/scripts/test-board-probe.js`: focused regression tests.
- `src/scripts/fixtures/failure-probes-2026-09-29.json`: small fixtures derived from observed evidence.
- `docs/failure-evidence-sampling.md`: this implementation and investigation record.

No ATS adapter file or parser was changed on this branch. Shared diagnostic code was changed. No catalog records, board state, retry schedule, or public feed were changed. No full catch-up, bulk probe, cleanup, retirement, or public-feed rebuild was run.

Next step: review the upstream Workday catalog extraction process using the saved structural pairs. Keep the normal-tenant 422 group separate. Use the confirmed BambooHR redirect label in future failure review; do not treat it as a retirement rule.
