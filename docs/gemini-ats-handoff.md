# Public Job Feed: ATS ingestion handoff for Gemini

**Purpose:** Give Gemini an accurate, concise picture of how this repository discovers, fetches, normalizes, and publishes public job-board data. This is an implementation brief, not a vendor API contract. Work only with public posting surfaces; do not introduce login, scraping of application flows, or fabricated job facts.

**Snapshot date:** 2026-08-21. The health figures below come from the current checked-in reports, not from a new crawl.

## What the system does

```text
public ATS catalogs
  -> normalize + analyze catalog rows
  -> select a company/ATS board and build crawl queue
  -> controlled, resumable board fetch batches
  -> shared job normalization + enrichment + deduplication
  -> merge successful batches into the Public Job Feed
  -> build and validate the Google Sheets CSV package
```

The catalog is an inventory of company boards, not a claim that every board works. A board fetch produces a log row even when it is empty, fails, or is skipped. That evidence feeds health reports and later retry decisions.

## Core operating rules

- Fetch only public career-board surfaces. No authentication, application submission, or applicant data is involved.
- Preserve `BoardURL`, `FetchURL`, `FetchedAt`, source ATS, raw job ID, and raw job URL on every normalized record.
- Treat title matching, remote detection, salary detection, and writer-fit scoring as review aids, not verified facts.
- A failed/empty/skipped board must not terminate the batch.
- Batch runs are resumable: terminal board statuses are `success`, `empty`, `failed`, and `skipped`.
- Keep ATS-specific parsing isolated in `src/lib/ats/`; normalize every resulting job into the shared schema in `src/lib/jobs-normalize.js`.

## Current ATS connections

| ATS | Connection / request pattern | Parser | Current catalog connections | Current operating position |
| --- | --- | --- | ---: | --- |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | JSON, `data.jobs` | 3,136 | **SCALE_NOW**; 78.59% board success rate |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | JSON, `data.jobs` | 8,333 | **SCALE_NOW**; 65.65% board success rate |
| Lever | `GET https://api.lever.co/v0/postings/{slug}?mode=json` | JSON array | 4,362 | Keep controlled/best-effort; 46.03% success rate |
| Workday | `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` | JSON, commonly `jobPostings` | 3,614 | Keep controlled/best-effort; 56.15% success rate |
| BambooHR | `GET {sourceURL}` or `https://{slug}.bamboohr.com/careers/list` | JSON array / `result` / `jobs` / related containers | 11,315 | Keep controlled/best-effort; 67.07% success rate, but variable shapes |
| iCIMS | `GET https://careers-{slug}.icims.com/jobs/search?...` (or derived from source URL) | **HTML** job cards, not JSON | 10,097 | Keep controlled/best-effort; 58.18% success rate |

“Current catalog connections” is the count of catalog board rows in `data/jobs/reports/ats-catalog-health.csv`. It does not mean every board is healthy. The latest batch history includes 290,092 board attempts across these ATSs.

### Scaling guidance

| ATS | Suggested next batch | Delay | Default concurrency guidance |
| --- | ---: | ---: | ---: |
| Ashby | 500 | 250 ms | 5 |
| Greenhouse | 500 | 250 ms | 4 |
| Lever | 50 | 500 ms | 3 |
| Workday | 50 | 500 ms | 1 |
| BambooHR | 50 | 500 ms | 2 |
| iCIMS | 50 | 500 ms | 1 |

The batch runner caps concurrency at 10. Lower concurrency and/or increase delay when errors rise.

## How a board becomes a fetch request

1. Catalog sources are downloaded and normalized into common company/ATS fields.
2. Catalog analysis identifies duplicates, cross-ATS overlap, and potential canonical company records.
3. The crawl queue picks the preferred ATS per company. The configured preference is:

   ```text
   Ashby > Greenhouse > Lever > Workday > BambooHR > iCIMS
   ```

4. A fetcher resolves its slug from the ATS-specific slug field first, then from its board URL, then (when applicable) `BestFetchURL`.
5. `fetch-batch-jobs.js` calls the ATS module, writes a fetch-log row, normalizes individual jobs, enriches them, reruns deduplication, and rewrites the batch artifacts.

Example: a Greenhouse URL of `https://boards.greenhouse.io/example-company` resolves to `example-company`, then fetches:

```text
https://boards-api.greenhouse.io/v1/boards/example-company/jobs?content=true
```

The `content=true` response supplies `data.jobs`. Each job becomes a common row such as:

```js
{
  ATS: "greenhouse",
  Company: "Example Company",
  Title: job.title,
  Location: job.location?.name,
  Description: stripHtml(job.content || job.description),
  URL: job.absolute_url,
  DatePosted: job.first_published || job.published_at || job.created_at || job.updated_at,
  Department: job.departments?.[0]?.name || job.department,
  RawJobId: String(job.id),
  BoardURL: "https://boards.greenhouse.io/example-company",
  FetchURL: "https://boards-api.greenhouse.io/v1/boards/example-company/jobs?content=true"
}
```

## ATS-specific details and examples

### Ashby

- Input: `AshbySlug`, else the first path component of `AshbyURL`.
- Example board: `https://jobs.ashbyhq.com/example-company` → slug `example-company`.
- Expected payload: `{ jobs: [...] }`.
- Key fields: `title`, `descriptionHtml`/`description`, `location` plus `secondaryLocations`, `jobUrl`/`applyUrl`, `publishedAt`, `department`/`team`, `id`.

### Greenhouse

- Input: `GreenhouseSlug`, else a board URL path. It recognizes both `/boards/{slug}` and `/{slug}` forms.
- Examples: `https://boards.greenhouse.io/example-company`, `https://job-boards.greenhouse.io/example-company`, and `https://boards.greenhouse.io/boards/example-company` all resolve to `example-company`.
- Expected payload: `{ jobs: [...] }`.
- Key fields: `title`, `content`, `location.name`, `absolute_url`, `first_published`/`updated_at`, `departments[0].name`, `id`.

### Lever

- Input: `LeverSlug`, else the first path component of `LeverURL`.
- Example board: `https://jobs.lever.co/example-company` → slug `example-company`.
- Expected payload: an array, `[{...}, {...}]`.
- Key fields: `text`, `descriptionPlain`/`description`/`lists`/`additionalPlain`, `categories.location`, `hostedUrl`, `createdAt` (milliseconds, converted to ISO), `categories.team`, `id`.

### Workday

- Input: a compound slug: `{tenant}|{hostSegment}|{site}`.
- Example board: `https://example.wd1.myworkdayjobs.com/External` → `example|wd1|External`.
- Request body is JSON: `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`. The fetcher paginates until it reaches the vendor total, sees a short/empty page, or hits 2,000 jobs.
- Accepted payload containers: `data`, `data.jobPostings`, `data.jobs`, and `data.data.jobPostings`.
- Key fields: `title`/`jobTitle`, `jobDescription`/`description`, `locationsText`/`locations`, `externalPath`/`externalUrl`, `postedOn`, `jobFamily`/`department`, `payRate`/`salary`, `id`/`jobReqId`.

### BambooHR

- Input: `BambooHRSlug`, else subdomain of `BambooHRURL`.
- Example board: `https://example-company.bamboohr.com/careers/list` → slug `example-company`.
- The source URL is preferred; otherwise the fetcher uses `/careers/list`.
- Accepted payload containers: an array, `result`, `jobs`, `jobOpenings`, or `openings`.
- Key fields: `jobOpeningName`/`title`/`jobTitle`, `description`/`jobDescription`, `location`/`atsLocation`, `applicationUrl`/`jobOpeningUrl`, `postedDate`, `departmentLabel`, `compensation`, `id`.

### iCIMS

- Input: `ICIMSSlug`, else first hostname segment. `careers-example.icims.com` resolves to `example`.
- Example fetch target: `https://careers-example.icims.com/jobs/search?ss=1&searchRelation=keyword_all&in_iframe=1`.
- This integration uses an HTML fetch (`Accept: text/html`), extracts `iCIMS_JobCardItem` list cards, then parses job link/ID, heading, location, and optional description. It paginates with `pr=0` through `pr=19`, deduplicating by job ID or URL.
- Do not “simplify” this to the generic JSON client without first proving a stable iCIMS JSON endpoint. The current code deliberately parses public HTML.

## Shared fetch and normalization contract

JSON fetchers use a 20-second timeout and send:

```text
Accept: application/json
User-Agent: public-job-feed-sample/0.1
```

Every successful fetcher returns:

```js
{ fetchUrl, httpStatus, jobs, raw }
```

Normalized job fields include company, company key, ATS, title, location, description, URL, posted date, salary, department, catalog slug, board URL, fetch URL, fetch time, raw job fields, title-review fields, work-arrangement fields, and salary-detection fields. The shared post-processing then adds duplicate/export-quality and writer-fit fields.

Fetch status meanings:

| Status | Meaning |
| --- | --- |
| `success` | Request completed and extracted at least one job. |
| `empty` | Request completed but extracted no jobs. |
| `failed` | HTTP, timeout, invalid JSON, HTML parse issue, or runtime error. |
| `skipped` | No usable URL could be constructed before requesting. |

## Primary repository locations

- Fetch orchestration: `src/scripts/fetch-batch-jobs.js`
- ATS modules: `src/lib/ats/{ashby,greenhouse,lever,workday,bamboohr,icims}.js`
- Shared HTTP client: `src/lib/http.js`
- Common normalization and enrichment entry: `src/lib/jobs-normalize.js`
- Board registry and preferred-ATS rules: `src/lib/board-registry.js`
- Current health/scale evidence: `data/jobs/reports/ats-health-report.md`, `ats-fetch-health.csv`, `ats-catalog-health.csv`, and `ats-scale-recommendations.csv`

## Guardrails for Gemini

1. First inspect a board’s current URL and fetch log before changing parsing or endpoint construction.
2. Add an ATS-specific fixture and test when supporting a new payload shape.
3. Keep endpoint construction conservative. A `skipped` status is better than a speculative request to an invented URL.
4. Preserve raw provenance fields and do not silently discard failed/empty board evidence.
5. Do not treat a source’s historical success rate as a guarantee of current availability.
6. The older `docs/ats-api-behavior.md` says iCIMS is catalog-only. That is stale relative to the current `src/lib/ats/icims.js` and 2026-08-21 health report; use this handoff and the code as the current source of truth.
