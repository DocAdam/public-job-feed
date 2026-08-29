# Connect to Ashby job boards

Use Ashby when an employer's public board looks like this:

```text
https://jobs.ashbyhq.com/example-company
```

Ashby is a good first connection because the project uses a predictable public
JSON response. This guide documents observed behavior, not an Ashby contract.

## Get the board slug

The first path segment is the slug: `example-company`. Parse the URL; do not
send the complete board URL where an endpoint expects a slug.

## Request jobs

```js
const slug = "example-company";
const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
const { data } = await fetchJson(url);
const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
```

## Response and field mapping

The response is an object with a `jobs` array. Normalize its common fields at
the connection boundary:

```js
function normalizeAshby(job, context) {
  return {
    company: context.company,
    title: job.title || "",
    description: job.descriptionHtml || job.description || "",
    location: [job.location, ...(job.secondaryLocations || [])].filter(Boolean).join(" | "),
    jobUrl: job.jobUrl || job.applyUrl || "",
    postedAt: job.publishedAt || "",
    department: job.department || job.team || "",
    rawJobId: String(job.id || ""),
    sourceAts: "ashby",
    ...context,
  };
}
```

## Troubleshoot Ashby

- **`jobs` is missing or is not an array:** Log the unexpected body shape. Do
  not guess at a replacement field.
- **No jobs returned:** The company may have no public openings, the slug may
  be stale, or the board may have changed. Confirm the public board first.
- **Bad request URL:** Extract only the first path segment and encode it with
  `encodeURIComponent()`.

Return to the [connection overview](../connect-public-ats-job-boards.md).
