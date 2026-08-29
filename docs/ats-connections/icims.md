# Connect to iCIMS job boards

iCIMS is an HTML connection, not a generic JSON one. The project reads public
job-card markup from a verified search page and deliberately avoids guessing at
an undocumented JSON endpoint.

## Start with a known public host

Given a verified iCIMS board, request its public search page:

```text
https://careers-example-company.icims.com/jobs/search?ss=1&searchRelation=keyword_all&in_iframe=1
```

Use `Accept: text/html` and a timeout. The project checks pages with `pr=0`,
`pr=1`, and so on, up to a bounded maximum.

## Extract job cards

The current parser looks for `iCIMS_JobCardItem` list items and extracts:

- Job ID and job URL from the job link
- Title from the card heading
- Location from the card's location block
- Optional description from the card description block

Deduplicate by job ID, falling back to URL. Stop when a page is empty or does
not add a new job.

## Troubleshoot iCIMS

- **Only a slug is available:** Mark the board `skipped` until you have a
  verified public career URL.
- **The page loads but cards do not match:** Save a fixture and inspect the
  markup. This is a parser-maintenance issue, not a reason to guess at JSON.
- **Repeated pages:** De-duplicate and stop when unique-job count stops rising.
- **Access block or timeout:** Keep failure evidence, reduce concurrency, and
  do not retry in a tight loop.

Return to the [connection overview](../connect-public-ats-job-boards.md).
