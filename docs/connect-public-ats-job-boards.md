# Connect to public ATS job boards

Build a small, reliable job-feed connection with public employer job boards.

This guide explains the shared connection model used by Public Job Feed. It
fetches job listings for the [Good Documentation Jobs](https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?gid=55693553#gid=55693553) board.

> This is implementation guidance based on the public surfaces used by this
> project as of 2026-08-29. It is not vendor API documentation or a guarantee
> that an endpoint will remain available. Only collect public job-posting data.
> Do not use these patterns for application submission, authenticated data, or
> applicant information.

## What you will build

Start with a public career-board URL, make a bounded request, extract open jobs,
and turn them into a common record. If the board changes or fails, keep a useful
log instead of quietly losing the evidence.

```text
public board URL
  -> provider-specific request
  -> provider response
  -> shared job record
  -> success, empty, failed, or skipped
```

Ashby and Greenhouse are the best first connections. Lever returns usable JSON
but needs closer monitoring. Workday, BambooHR, iCIMS, and TalentBrew use less
consistent public surfaces, so add them after the basic path works.

## Choose a connection

| ATS | Request shape | Response shape | Start here? |
| --- | --- | --- | --- |
| [Ashby](ats-connections/ashby.md) | `GET` with a board slug | JSON object; `jobs` array | Yes |
| [Greenhouse](ats-connections/greenhouse.md) | `GET` with a board slug and `content=true` | JSON object; `jobs` array | Yes |
| [Lever](ats-connections/lever.md) | `GET` with a company slug | JSON array | With monitoring |
| [Workday](ats-connections/workday.md) | Paginated `POST` with tenant and site | JSON; usually `jobPostings` | Best effort |
| [BambooHR](ats-connections/bamboohr.md) | `GET` to a verified career URL | JSON shape varies | Best effort |
| [iCIMS](ats-connections/icims.md) | Paginated `GET` to a search page | HTML job cards | Best effort |
| [TalentBrew](ats-connections/talentbrew.md) | List pages, then job detail pages | HTML and `JobPosting` JSON-LD | Best effort |

Each connection topic includes a working request pattern, source-field mapping,
and troubleshooting guidance. Do not use a pattern from one ATS for another;
similar-looking career sites often behave very differently.

## Use a shared request contract

Use a descriptive user agent, an expected `Accept` header, and a timeout. The
project uses 20 seconds for JSON and 30 seconds for HTML. A compact JSON helper
looks like this:

```js
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "example-job-feed/1.0 (contact@example.com)",
        ...options.headers,
      },
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { data, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}
```

In production, catch JSON parsing and network errors separately. An HTML error
page returned with HTTP 200 is a different problem from a timeout.

## Normalize every provider response

Provider field names belong at the edge of your system. Convert them to one
record shape before scoring, exporting, or displaying jobs:

```js
{
  company: "Example Company",
  title: "Technical Writer",
  location: "Remote — United States",
  description: "...",
  jobUrl: "https://careers.example.com/jobs/123",
  postedAt: "2026-08-20T00:00:00.000Z",
  department: "Documentation",
  rawJobId: "123",
  sourceAts: "greenhouse",
  boardUrl: "https://boards.greenhouse.io/example-company",
  fetchUrl: "https://boards-api.greenhouse.io/v1/boards/example-company/jobs?content=true",
  fetchedAt: "2026-08-29T15:00:00.000Z"
}
```

Keep source values and derived values separate. A salary parsed from text or a
"remote" classification can be useful metadata, but is not necessarily a fact
supplied by the ATS.

## Record the outcome for every board

| Status | Meaning | What to do |
| --- | --- | --- |
| `success` | The request returned one or more jobs | Normalize jobs and retain provenance. |
| `empty` | The request completed but no jobs were extracted | Check the board and response shape. |
| `failed` | HTTP, timeout, parse, or runtime error | Keep the error evidence; retry later with limits. |
| `skipped` | No trustworthy request URL could be constructed | Wait for a verified source URL. |

Log the provider, company, source board URL, attempted request URL, status,
HTTP status, job count, error message, and timestamp. That is how you tell a
one-off outage from a connection that needs work.

## Next steps

Choose an ATS topic and connect one known board. Add a saved response fixture
before supporting any new response shape. For operational details and batch
controls, see [ATS source behavior](ats-api-behavior.md); current modules in
`src/lib/ats/` take precedence if an older note differs.
