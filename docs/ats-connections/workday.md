# Connect to Workday job boards

Workday is a best-effort connection. It needs a tenant, a `wdN` host segment,
and a site name; a company name alone is not enough to construct a safe URL.

## Derive the connection details

Start with a known public board URL:

```text
https://example.wd1.myworkdayjobs.com/External
```

This supplies:

```text
tenant: example
host: wd1
site: External
```

## Request the first page

```js
const url = "https://example.wd1.myworkdayjobs.com/wday/cxs/example/External/jobs";
const { data } = await fetchJson(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" }),
});
const jobs = data?.jobPostings || data?.jobs || [];
```

Request later pages with an increasing `offset`. Stop on an empty or short page,
when you reach the reported total, or when you reach a firm maximum.

## Response and field mapping

The project accepts a jobs array at `jobPostings`, `jobs`, `data`, or
`data.jobPostings`. Common fields include `title` or `jobTitle`, `locationsText`,
`externalPath`, `postedOn`, `jobFamily`, `payRate`, and `id`.

If a job provides a relative `externalPath`, join it to the verified board URL
before exporting it.

## Troubleshoot Workday

- **Tenant, `wdN`, or site is unknown:** Mark the board `skipped`. Do not invent
  an endpoint from a company name.
- **HTTP 404 or no results:** Recheck the employer's current career URL;
  tenant and site paths vary.
- **Only one page appears:** Check the request offset, the reported total, and
  the accepted jobs wrappers before changing the parser.

Return to the [connection overview](../connect-public-ats-job-boards.md).
