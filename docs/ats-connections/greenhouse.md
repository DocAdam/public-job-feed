# Connect to Greenhouse job boards

Greenhouse is a strong first connection because its public board endpoint can
include the job-description content needed for search and classification.

## Get the board slug

These public board URLs all identify `example-company`:

```text
https://boards.greenhouse.io/example-company
https://job-boards.greenhouse.io/example-company
https://boards.greenhouse.io/boards/example-company
```

When the path contains `boards`, use the next segment. Otherwise, use the first
path segment.

## Request jobs with descriptions

```js
const slug = "example-company";
const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
const { data } = await fetchJson(url);
const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
```

`content=true` requests the description content. Keep it in the request when
you need to search, score, or otherwise work with descriptions.

## Response and field mapping

The response is an object with `jobs`:

```js
function normalizeGreenhouse(job, context) {
  return {
    company: context.company,
    title: job.title || "",
    description: job.content || job.description || "",
    location: job.location?.name || job.location || "",
    jobUrl: job.absolute_url || "",
    postedAt: job.first_published || job.updated_at || "",
    department: job.departments?.[0]?.name || job.department || "",
    rawJobId: String(job.id || ""),
    sourceAts: "greenhouse",
    ...context,
  };
}
```

## Troubleshoot Greenhouse

- **HTTP 404 or no jobs:** The slug may have changed or the employer may have
  moved boards. Verify the current employer career link before changing code.
- **Description is missing:** Confirm `content=true` is present. An omitted
  description is not evidence that the job has no description.
- **A detail page returns HTTP 406:** Preserve the job from the board response
  for review. A blocked detail page does not prove that the job is closed.

Return to the [connection overview](../connect-public-ats-job-boards.md).
