# Failure investigation v1

This workflow reads saved data. It does not fetch boards or change retry dates.

```sh
npm run jobs:analyze-failures
```

Outputs:

- `data/jobs/reports/failure-analysis.json`: per-board evidence, groups, samples, and input hashes.
- `data/jobs/reports/failure-analysis.md`: a derived summary.

Use `--output-dir PATH` for a separate report folder. Use `--data-root PATH` for an isolated data fixture. The command reads board state, the current board catalog, monthly compressed fetch-event history, batch fetch logs, and the sample fetch log. It does not read ZIP archives. Invalid input files stop the command. Missing history and missing batch logs appear as report gaps.

The report selects active, fetch-eligible boards with `FETCH_FAILED` in saved state. The state generation time is the report cutoff. A successful empty fetch counts as a success. Copies of the same successful observation count once per board key and fetch time. `never succeeded` means no recorded success in the available history. It does not prove that a board never worked. Counts can be lower bounds if history is missing. `FirstSeenAt` is a local catalog observation date.

## Diagnostic fields

New JSON fetch logs have a `Diagnostic` object. Board state retains the latest failure diagnostic. Compressed fetch-event history also retains this object when the normal index workflow next runs. CSV logs keep the existing columns.

The request helper records the method, safe URL, HTTP status, content type, final URL, response byte length, and a response preview of at most 2,048 bytes. It records the payload shape, not payload values. It removes URL credentials, query values, sensitive named fields, bearer/basic credentials, script bodies, and input tags. It does not save request headers, cookies, or full response bodies.

Fetch does not expose intermediate redirect hops. `redirect_chain` is empty and `redirect_chain_complete` is false when a redirect occurred. This is an explicit evidence gap. Legacy failures have no response preview; the analysis does not reconstruct one.

Failure types are `transport_failure`, `http_failure`, `unexpected_content_type`, `parse_failure`, `schema_validation_failure`, and `application_rejection`. Old failures can remain `unknown_failure`. Specific existing classes, such as `ENDPOINT_REJECTED`, remain available.

BambooHR HTML evidence can identify an unexpected HTML response, a redirect to a `/careers` page, an HTTP 404/410 endpoint, or an access-challenge marker. These labels describe the response. They do not prove that a company closed a board. Workday and BambooHR responses without a supported jobs array now fail schema validation; a valid empty array remains successful.

The report distinguishes saved request URLs from endpoints made with the current adapter. Workday details include tenant, host, site, payload shape, and source URL. A missing catalog source URL stays empty. Payload shapes from the current adapter are marked as such.

## Retry advice

The report prepares four actions. It does not change the scheduler.

| Evidence | Advice |
| --- | --- |
| Timeout, network failure, HTTP 429, or server error | `transient_retry` |
| HTTP 404 | `slow_revalidation` |
| HTTP 410 or no usable URL | `catalog_review` |
| Workday 422 after two or more failures | `adapter_review` |
| Parse, schema, application, or HTML failure | `adapter_review` |

A valid `Retry-After` value is retained for a later scheduling change. Existing retry intervals remain one to seven days. No board is retired or suppressed.

## Batch output

Each maintenance or direct batch attempt has a unique `batch-run-*.json` marker. It records start time, phase, and completion or failure. A process killed before error handling can leave a `running` marker. That marker does not mean the process is still active. A disk failure can also prevent the failure marker update.

Fetch logs are written before feed output. Feed JSON uses the existing per-record temporary-file writer, followed by rename. This avoids one JSON string for the whole feed. Other files retain their existing output formats. The marker is evidence of the attempt; it does not change batch selection or publication rules.

## Findings from the saved September 29 state

Confirmed from code and data:

- The report found 21,747 current failures: 20,613 with no recorded success and 1,134 with prior success.
- History recovered success for `greenhouse|la2028`, `greenhouse|maintainx`, and `greenhouse|unity3d`. Their state records had no last-success date. This explains the difference from the original 20,616 count.
- All 21,747 current failures have a saved request URL. None has a structured response preview. The new diagnostics apply to future requests.
- There are 6,800 Workday HTTP 422 failures. Of these, 6,054 used a host-shaped tenant such as `wd1` or `wd5`; none of those 6,054 has a recorded success. The raw Workday catalog contains these values. Example: `wd1|wd1|_penn-careers` produced `https://wd1.wd1.myworkdayjobs.com/wday/cxs/wd1/_penn-careers/jobs`.
- The Workday URL parser uses the first path segment as the site. A local fixture with `/en-US/External` therefore constructs a site named `en-US`. This assumption is now tested. No locale-shaped site was found among the current failed-board endpoint constructions.
- iCIMS replaces source paths with `/jobs/search`. Without a source URL, it constructs a `careers-*` host. Tests cover source hosts, custom hosts, prefixed slugs, invalid source text, and the search query. The adapter URL rules are unchanged.
- All four named batch folders are empty. They remain unchanged.
- `passive-maintenance-error.log` has two `RangeError: Invalid string length` traces at `JSON.stringify`, called by the batch feed writer. That writer ran before summary and fetch-log output. The code could therefore leave an empty batch folder after fetch work. The feed writer no longer builds that one large string.
- Unknown Workday and BambooHR JSON shapes previously fell through to an empty jobs list. They now produce a schema failure. This avoids recording an unknown response as a successful empty snapshot.

Inferred from evidence:

- Host-shaped Workday tenants are a strong catalog-review lead. Their presence does not prove the cause of each HTTP 422 response.
- The serialization traces are consistent with the September 27 and 28 empty Greenhouse folders. The error log has no per-batch path or timestamp to prove each association.

Not yet verified:

- The cause of the two empty July 14 iCIMS/Workday folders.
- The response bodies behind the saved Workday 422 and BambooHR parse failures.
- Whether a specific failed board is retired, redirected, blocked, or incorrectly configured.
- Live behavior of the new diagnostic fields. Validation used fixtures and saved local data only.

Next step: select a small review set from the Workday configuration groups, with standard tenants as controls. Add BambooHR HTML failures and iCIMS failed/successful URL forms. Use a separately approved, bounded fetch run to collect response evidence before adapter or catalog remediation.

## Validation and changed files

New test: `src/scripts/test-failure-investigation.js` (94 checks). It covers Workday request construction, BambooHR HTML and schema handling, iCIMS URL assumptions, redaction, history grouping, saved-log precedence, batch failure markers, per-record feed output, and the analysis command against isolated input files. `src/scripts/test-batch-history.js` also checks diagnostic retention.

Commands run:

- `git status --short --branch`, `git fetch origin`, and remote/history checks.
- `git switch -c failure-investigation-v1`.
- `git merge --ff-only origin/main` failed without changes because the histories differ. The task branch keeps `47e29988`, which matched `origin/agent/readme-public-documentation`. No merge or rebase was made.
- `npm run jobs:test-ats-errors`, `jobs:test-catalog-maintenance`, `jobs:test-board-freshness`, `jobs:test-batch-history`, and `jobs:test-core-pipeline`: passed.
- `npm run jobs:test-all`: all 32 suites passed. After the final report and history changes, the 94-check investigation test and batch-history test passed again.
- `npm run jobs:analyze-failures`: completed against local data; 1,483 input files recorded.
- JavaScript syntax checks and `git diff --check`: passed.

Changed files:

- `package.json`: analysis and regression commands; test-suite registration.
- `src/lib/failure-diagnostics.js`, `src/lib/http.js`, `src/lib/ats-error-classification.js`: response evidence and classification.
- `src/lib/ats/workday.js`, `src/lib/ats/bamboohr.js`, `src/lib/ats/icims.js`: schema checks or shared request evidence.
- `src/lib/board-state.js`, `src/lib/batch-history.js`: diagnostic retention.
- `src/lib/batch-run.js`: per-attempt status markers.
- `src/lib/failure-analysis.js`, `src/scripts/analyze-board-failures.js`: saved-data report.
- `src/scripts/fetch-batch-jobs.js`, `src/scripts/fetch-sample-jobs.js`, `src/scripts/maintain-board-index.js`: diagnostic capture and batch output.
- `src/scripts/test-failure-investigation.js`, `src/scripts/test-batch-history.js`: regression tests.
- `docs/failure-investigation.md`: this workflow and evidence record.

Generated reports remain local under the existing ignore rules. No commit, push, catch-up, or public-feed rebuild was run.
