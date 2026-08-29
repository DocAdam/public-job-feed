# Connect to BambooHR job boards

BambooHR can return usable public JSON, but its board and response shapes vary.
Treat a verified source URL as stronger evidence than a slug-derived guess.

## Start with a known board URL

For this board:

```text
https://example-company.bamboohr.com/careers/list
```

the subdomain is `example-company`. Use the source URL directly when it is
available; otherwise the project constructs the same `/careers/list` URL.

## Request jobs

```js
const url = "https://example-company.bamboohr.com/careers/list";
const { data } = await fetchJson(url);
const jobs = Array.isArray(data)
  ? data
  : data?.result || data?.jobs || data?.jobOpenings || data?.openings || [];
```

## Response and field mapping

Common source fields are `jobOpeningName` or `title`, `description`, `location`,
`applicationUrl`, `postedDate`, `departmentLabel`, `compensation`, and `id`.
Normalize only fields present in the verified response shape.

## Troubleshoot BambooHR

- **HTML appears instead of JSON:** Treat this as unsupported for the JSON
  connection. Keep the URL for review; do not parse a new HTML layout casually.
- **No familiar jobs array:** Save a safe fixture and confirm the shape across
  more than one board before adding a parser branch.
- **A constructed URL fails but the source URL works:** Store and use the
  source URL. The public board is the evidence; the slug is convenience.

Return to the [connection overview](../connect-public-ats-job-boards.md).
