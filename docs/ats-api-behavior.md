# ATS source behavior

Last updated: 2026-08-24

This guide explains how Public Job Feed reads public employer job boards from each supported ATS. It is an implementation reference, not a vendor API contract. Employer sites can change without notice, so an unexpected response becomes a recorded signal for review rather than a failure for the entire refresh.

Each fetcher starts with a known employer board, requests its public postings, turns the results into the shared job-record format, and keeps enough detail to explain the result later.

## How a fetch works

All ATS fetchers are called by the sample and batch job scripts:

- `src/scripts/fetch-sample-jobs.js`
- `src/scripts/fetch-batch-jobs.js`

Each fetcher returns the same basic shape:

```js
{
  fetchUrl,
  httpStatus,
  jobs,
  raw
}
```

The shared HTTP client is `src/lib/http.js`. It sends a `GET` request with:

- `Accept: application/json`
- `User-Agent: public-job-feed-sample/0.1`
- A default timeout of 20 seconds

The client parses the response body as JSON. If the status is not OK, it throws an HTTP error. If the status is OK but the body is not valid JSON, it throws an invalid JSON error. The batch runner catches these errors, logs the failed board, and continues.

## Board result statuses

Every board attempt writes one fetch-log row. These statuses are intentionally small and operational:

| Status | Meaning |
| --- | --- |
| `success` | The request completed and returned one or more jobs. |
| `empty` | The request completed, but no jobs were extracted. |
| `failed` | The request had an HTTP, timeout, JSON, or other runtime error. |
| `skipped` | The system could not construct a usable fetch URL before making a request. |

The fetch log captures the ATS, company, company key, catalog slug, board URL, fetch URL, HTTP status, job count, error message, and timestamp.

Failures are expected, especially for best-effort ATS sources. A failed board should not stop a batch. It should create evidence for later fetcher improvements.

## Crawl Readiness And ATS Priority

The crawl queue chooses a preferred ATS per company using this order:

```text
Ashby > Greenhouse > Lever > Workday > BambooHR > iCIMS
```

Ashby, Greenhouse, and Lever are treated as supported because the current code uses predictable public JSON endpoints. Workday, BambooHR, and iCIMS are treated as best effort because their public surfaces are less consistent across companies.

The crawl queue marks a row as ready only when it has a usable fetch URL, a company key, and a preferred company name. Catalog-only rows are preserved because they may still be useful for manual review or future endpoint discovery.

## Normalized Output

Regardless of ATS, fetched jobs are normalized into the shared job-record fields in `src/lib/jobs-normalize.js`. Normalization tries to produce consistent values for:

- Company and company key
- Job title
- Location and raw location
- Job description
- Job URL and raw job URL
- Department
- Posted date
- Raw job ID
- Source board URL and fetch URL

After normalization, shared enrichment adds:

- Title watchlist match fields
- Title review bucket and priority
- Remote, hybrid, onsite, and US-remote heuristics
- Salary detection fields
- Writer-fit score and tier
- Duplicate and export quality fields

These fields are review aids. They should be treated as spreadsheet filters, not final truth.

## Ashby

### Support Level

`SUPPORTED`

Ashby uses a stable-looking public posting API in the current implementation. It is one of the preferred sources for scaled fetching.

### Source Module

`src/lib/ats/ashby.js`

### Slug Inputs

The fetcher uses an Ashby board slug. The batch runner resolves it from:

- `AshbySlug`
- The first path segment of `AshbyURL`
- The first path segment of `BestFetchURL` when Ashby is the selected best ATS

Example board URL:

```text
https://jobs.ashbyhq.com/example-company
```

Resolved slug:

```text
example-company
```

### Fetch URL

```text
https://api.ashbyhq.com/posting-api/job-board/{slug}
```

### Expected Response Shape

The fetcher expects jobs at:

```js
data.jobs
```

If `data.jobs` is not an array, the board is treated as empty.

### Job Mapping

Ashby normalization reads common fields such as:

| Job record field | Ashby source |
| --- | --- |
| `Title` | `title` |
| `Description` | `descriptionHtml` or `description` |
| `Location` | `location` plus `secondaryLocations` |
| `URL` | `jobUrl` or `applyUrl` |
| `DatePosted` | `publishedAt` |
| `Department` | `department` or `team` |
| `RawJobId` | `id` |
| `RawJobURL` | `jobUrl` |

Ashby may expose compensation in a structured or text field. The normalizer keeps a raw `Salary` value when available, then runs shared salary detection against the resulting job record.

### Operational Notes

Ashby is a good scale candidate when the crawl queue has clean slugs. Empty boards are normal and usually mean the company has no open public roles, the slug is stale, or the public board shape changed.

## Greenhouse

### Support Level

`SUPPORTED`

Greenhouse uses a public board API and is one of the strongest current sources for scaled fetching.

### Source Module

`src/lib/ats/greenhouse.js`

### Slug Inputs

The fetcher uses a Greenhouse board slug. The batch runner resolves it from:

- `GreenhouseSlug`
- A Greenhouse URL path containing `/boards/{slug}`
- The first path segment of a Greenhouse board URL
- `BestFetchURL` when Greenhouse is the selected best ATS

Example board URLs:

```text
https://boards.greenhouse.io/example-company
https://job-boards.greenhouse.io/example-company
https://boards.greenhouse.io/boards/example-company
```

Resolved slug:

```text
example-company
```

### Fetch URL

```text
https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
```

The `content=true` query parameter asks Greenhouse to include job description content.

### Expected Response Shape

The fetcher expects jobs at:

```js
data.jobs
```

If `data.jobs` is not an array, the board is treated as empty.

### Job Mapping

Greenhouse normalization reads common fields such as:

| Job record field | Greenhouse source |
| --- | --- |
| `Title` | `title` |
| `Description` | `content` or `description` |
| `Location` | `location.name` or `location` |
| `URL` | `absolute_url` |
| `DatePosted` | `updated_at` or `first_published` |
| `Department` | First `departments[].name` or `department` |
| `RawJobId` | `id` |
| `RawJobURL` | `absolute_url` |

Greenhouse normalization does not currently map a dedicated salary field. Salary detection still runs against the normalized record, so salary text may be detected when it appears in the description.

### Operational Notes

Some Greenhouse catalog values fail because the slug has changed, a company has moved boards, or the public board exists but the API path does not return jobs. The system logs those outcomes and continues.

## Lever

### Support Level

`SUPPORTED`, with current health review recommended

Lever has a public postings API, but project health reporting has shown higher failure rates than Ashby and Greenhouse in the current crawl data. Treat Lever as supported technically, but review fetch health before scaling aggressively.

### Source Module

`src/lib/ats/lever.js`

### Slug Inputs

The fetcher uses a Lever company slug. The batch runner resolves it from:

- `LeverSlug`
- The first path segment of `LeverURL`
- The first path segment of `BestFetchURL` when Lever is the selected best ATS

Example board URL:

```text
https://jobs.lever.co/example-company
```

Resolved slug:

```text
example-company
```

### Fetch URL

```text
https://api.lever.co/v0/postings/{slug}?mode=json
```

### Expected Response Shape

The fetcher expects the full response body to be an array of jobs:

```js
[
  { ...job },
  { ...job }
]
```

If the response body is not an array, the board is treated as empty.

### Job Mapping

Lever normalization reads common fields such as:

| Job record field | Lever source |
| --- | --- |
| `Title` | `text` |
| `Description` | `descriptionPlain`, `description`, `lists`, and `additionalPlain` |
| `Location` | `categories.location` |
| `URL` | `hostedUrl` |
| `DatePosted` | `createdAt`, converted from milliseconds to ISO when possible |
| `Department` | `categories.team` |
| `RawJobId` | `id` |
| `RawJobURL` | `hostedUrl` |

Lever normalization does not currently map a dedicated salary field. Salary detection still runs against the normalized record, so salary text may be detected when it appears in the description.

### Operational Notes

Lever slugs are often straightforward, but catalog drift can create failures or empty responses. Use the fetch log and ATS health reports to separate slug quality issues from broader fetcher problems.

## Workday

### Support Level

`BEST_EFFORT` or `CATALOG_ONLY`

Workday is more variable than the supported sources. The current implementation tries a conservative public CXS jobs pattern only when it can identify enough tenant, host, and site information.

### Source Module

`src/lib/ats/workday.js`

### Slug Inputs

The Workday fetcher uses a compound slug:

```text
{tenant}|{hostSegment}|{site}
```

Example:

```text
example|wd1|External
```

The code can derive that compound slug from URLs like:

```text
https://example.wd1.myworkdayjobs.com/External
https://example.wd1.myworkdayjobs.com/wday/cxs/example/External/jobs
```

### Fetch URL

When the source URL already points at a Workday CXS endpoint, the fetcher uses it directly and adds pagination defaults if no query string exists:

```text
?limit=100&offset=0
```

Otherwise, it builds:

```text
https://{tenant}.{hostSegment}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs?limit=100&offset=0
```

### Expected Response Shape

The Workday extractor accepts several possible job containers:

```js
data
data.jobPostings
data.jobs
data.data.jobPostings
```

If none of these are arrays, the board is treated as empty.

### Job Mapping

Workday normalization reads common fields such as:

| Job record field | Workday source |
| --- | --- |
| `Title` | `title` or `jobTitle` |
| `Description` | `jobDescription`, `description`, or title fallback |
| `Location` | `locationsText`, `locations`, or `location` |
| `URL` | `externalPath`, `externalUrl`, `url`, or board URL fallback |
| `DatePosted` | `postedOn`, `startDate`, or `updated` |
| `Department` | `jobFamily`, `department`, or `jobFamilyGroup` |
| `Salary` | `payRate`, `salary`, or `compensation` |
| `RawJobId` | `id`, `jobReqId`, first `bulletFields` item, or external path |

When Workday returns a relative `externalPath`, the normalizer combines it with the board URL.

### Operational Notes

Many Workday records should be expected to fail, skip, or return empty until endpoint discovery is improved. The fetcher deliberately avoids inventing aggressive URLs when the tenant, host segment, and site are not clear.

## BambooHR

### Support Level

`BEST_EFFORT`

BambooHR can return usable jobs, but response shapes and public board behavior vary across companies. The current implementation tries a conservative careers endpoint or a source URL when one is available.

### Source Module

`src/lib/ats/bamboohr.js`

### Slug Inputs

The BambooHR fetcher uses the subdomain slug from BambooHR-hosted URLs.

Example board URL:

```text
https://example-company.bamboohr.com/careers/list
```

Resolved slug:

```text
example-company
```

### Fetch URL

If the catalog row has a BambooHR source URL, the fetcher uses that URL directly.

Otherwise, it builds:

```text
https://{slug}.bamboohr.com/careers/list
```

### Expected Response Shape

The BambooHR extractor accepts several possible job containers:

```js
data
data.result
data.jobs
data.jobOpenings
data.openings
```

If none of these are arrays, the board is treated as empty.

### Job Mapping

BambooHR normalization reads common fields such as:

| Job record field | BambooHR source |
| --- | --- |
| `Title` | `jobOpeningName`, `title`, `jobTitle`, or `name` |
| `Description` | `description`, `jobDescription`, `summary`, or title fallback |
| `Location` | `location`, `atsLocation`, `locationName`, or `locationLabel` |
| `URL` | `applicationUrl`, `jobOpeningUrl`, `url`, or `{boardUrl}/{id}` |
| `DatePosted` | `postedDate`, `datePosted`, or `createdDate` |
| `Department` | `departmentLabel`, `department`, or `departmentName` |
| `Salary` | `compensation`, `salary`, or `pay` |
| `RawJobId` | `id`, `jobOpeningId`, or `openingId` |

### Operational Notes

BambooHR is worth sampling, but not all boards respond with JSON in a shape this project can use. Empty and failed results are expected. Treat successful boards as evidence that a company-specific public surface is usable, not proof that all BambooHR boards behave the same way.

## iCIMS

### Support Level

`BEST_EFFORT` or `CATALOG_ONLY`

iCIMS is currently the most conservative fetcher. The system only attempts a request when the catalog row already contains a source URL. It does not build a speculative iCIMS API URL from a slug alone.

### Source Module

`src/lib/ats/icims.js`

### Slug Inputs

The iCIMS slug is derived from the first hostname segment when a URL is available.

Example URL:

```text
https://example-company.icims.com/jobs/search
```

Resolved slug:

```text
example-company
```

### Fetch URL

If the catalog row has an iCIMS source URL, the fetcher uses that URL directly.

If only a slug is available, the fetcher returns no URL and the batch runner logs the board as skipped:

```text
No usable icims fetch URL
```

### Expected Response Shape

The iCIMS extractor accepts several possible job containers:

```js
data
data.jobs
data.searchResults
data.results
data.requisitions
```

If none of these are arrays, the board is treated as empty.

### Job Mapping

iCIMS normalization reads common fields such as:

| Job record field | iCIMS source |
| --- | --- |
| `Title` | `title`, `jobTitle`, or `name` |
| `Description` | `description`, `jobDescription`, or `overview` |
| `Location` | `location`, `locationName`, `city`, or `jobLocation` |
| `URL` | `url`, `applyUrl`, `externalUrl`, `portalUrl`, `jobUrl`, or board URL fallback |
| `DatePosted` | `datePosted`, `postedDate`, or `createdDate` |
| `Department` | `department`, `departmentName`, or `category` |
| `Salary` | `compensation`, `salary`, or `pay` |
| `RawJobId` | `id`, `jobId`, `requisitionId`, or `reqId` |

### Operational Notes

iCIMS should remain catalog-only until the project has stronger endpoint discovery and response-shape evidence. A skipped iCIMS row is usually the correct current behavior when the catalog has only a slug.

## Rate Limiting And Concurrency

The batch runner supports bounded concurrency and delay:

```sh
npm run jobs:fetch-batch -- --ats greenhouse --priority HIGH --limit 50 --offset 0 --delay-ms 250 --concurrency 4
```

The runner caps concurrency at 10. Recommended starting points in the README are:

| ATS | Suggested Concurrency |
| --- | ---: |
| Ashby | 5 |
| Greenhouse | 4 |
| Lever | 3 |
| BambooHR | 2 |
| Workday | 1 |
| iCIMS | 1 |

If errors spike, reduce concurrency first, then increase delay.

## Resume Behavior

Batch fetching is resumable by default. When `--resume true`, the runner reads the existing batch fetch log and skips slugs that already have a terminal status:

- `success`
- `empty`
- `failed`
- `skipped`

The runner then merges old and new job rows, reruns shared enrichment, reruns duplicate detection, and rewrites the batch outputs. This keeps reruns from duplicating rows while still letting the export logic improve over time.

## Documentation Trail Gaps

The next useful documentation improvements are:

- Add real examples of one successful raw response per ATS.
- Add a small fixture for each response shape currently supported by the extractors.
- Record common failure messages by ATS from recent fetch logs.
- Document when a vendor response changed and what code change adapted to it.
- Add per-ATS health thresholds for `SCALE_NOW`, `SAMPLE_MORE`, `REVIEW_FETCHER`, and `CATALOG_ONLY_FOR_NOW`.
