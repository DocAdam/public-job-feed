# Connect to Lever job boards

Lever exposes a public JSON postings feed. It is useful, but monitor it more
closely than Ashby or Greenhouse because board health varies in this project.

## Get the company slug

For `https://jobs.lever.co/example-company`, use the first path segment:
`example-company`.

## Request jobs

```js
const slug = "example-company";
const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
const { data } = await fetchJson(url);
const jobs = Array.isArray(data) ? data : [];
```

Unlike Ashby and Greenhouse, the full response body is the jobs array.

## Response and field mapping

```js
function normalizeLever(job, context) {
  const postedAt = job.createdAt ? new Date(job.createdAt) : null;
  return {
    company: context.company,
    title: job.text || "",
    description: job.descriptionPlain || job.description || job.additionalPlain || "",
    location: job.categories?.location || "",
    jobUrl: job.hostedUrl || "",
    postedAt: postedAt && !Number.isNaN(postedAt.valueOf()) ? postedAt.toISOString() : "",
    department: job.categories?.team || "",
    rawJobId: String(job.id || ""),
    sourceAts: "lever",
    ...context,
  };
}
```

## Troubleshoot Lever

- **The response is an object, not an array:** Record an unexpected response
  shape rather than calling it a successful empty board.
- **The board is stale or fails:** Check that the public board still uses Lever
  before retrying. Keep the failed URL and HTTP result in your fetch log.
- **Invalid date:** `createdAt` is normally milliseconds. Validate the `Date`
  before calling `toISOString()`.

Return to the [connection overview](../connect-public-ats-job-boards.md).
