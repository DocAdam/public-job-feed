# Connect to TalentBrew job boards

TalentBrew uses a list-then-detail connection. The search page finds jobs; each
job page can expose a stronger structured `JobPosting` record in JSON-LD.

## Find the list pages

Start with a verified career URL and request its `/search-jobs` path. The list
page provides job links and commonly includes a page count. Request later list
pages with `?p=2`, `?p=3`, and so on, with a firm page cap.

## Read the job detail pages

For each unique job link, make a bounded HTML request and inspect
`script[type="application/ld+json"]` blocks for a `JobPosting` item. This
structured data can provide the title, description, location, posted date,
salary, and canonical job URL. The page may also contain an application URL in
the `search-job-apply-url` meta tag.

## Troubleshoot TalentBrew

- **Listing works but detail has no `JobPosting` JSON-LD:** Record a
  detail-page parse failure. Do not invent a description from a page layout.
- **Large board:** Cap list pages and detail jobs, then mark the result partial.
  An unlimited detail crawl becomes impolite very quickly.
- **Duplicate listing results:** De-duplicate by job ID from the link, or by
  URL, before visiting detail pages.

Return to the [connection overview](../connect-public-ats-job-boards.md).
