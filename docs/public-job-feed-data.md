# Understand Public Job Feed data

Use this guide to understand what a job record represents, where its values
come from, and which generated files are intended for a given use.

The feed is a collection of public employer job postings. It is not an
application system, a record of applicant outcomes, or a guarantee that a role
is still open when you view it.

## Start with the current feed

The canonical current-feed files are:

```text
data/jobs/public/public-job-feed-latest.json
data/jobs/public/public-job-feed-latest.csv
```

The JSON feed is used by compatible downstream consumers. The CSV feed is the
source for the Google Sheets upload package. Both represent the same current
job-record set.

Each public release also includes a generated data dictionary:

```text
data/jobs/public/public-job-feed-data-dictionary.md
data/jobs/public/public-job-feed-data-dictionary.csv
```

Use that artifact for the complete, release-specific list of columns and field
definitions. It is generated with the release, so it is the better reference
when a column is added, renamed, or removed.

## How one record is assembled

```text
public employer board
  -> ATS-specific response
  -> normalized job record
  -> title, salary, and work-arrangement analysis
  -> duplicate and export-quality review
  -> current feed and optional slices
```

The public board and the date it was fetched remain part of the record. This
provenance matters: an enrichment value can help a reader filter jobs, but it
does not replace the employer's posting as the source of truth.

## Field groups

### Provenance and identity

These fields explain where a record came from and help the pipeline identify
it across refreshes:

- `Source`, `ATS`, `Company`, and `CompanyKey`
- `CatalogSlug`, `BoardURL`, `FetchURL`, and `FetchedAt`
- `RawJobId`, `RawJobURL`, `RawLocation`, and `RawDepartment`
- `DuplicateGroupKey`

Keep these fields when exporting or troubleshooting a record. They make it
possible to trace a listing back to the public board and diagnose a changed
connection without guessing.

### Employer-supplied job content

The shared record carries the job fields most often supplied by an employer's
ATS:

- `Title`
- `Location`
- `Description`
- `URL`
- `DatePosted`
- `Department`
- `Salary`

Availability varies by provider and posting. An empty value means the pipeline
did not obtain a usable value; it does not prove the employer did not publish
one somewhere else on the job page.

### Derived review signals

The pipeline adds review aids after normalization. Common groups include:

- Salary detection: `SalaryDetected`, minimum/maximum, currency, period, and
  the review reason.
- Work arrangement: remote status, confidence, country signal, US-remote
  eligibility, location risk, and review reason.
- Title matching: the watchlist match, score, candidate title, and token
  evidence.
- Title review: review bucket, priority, domain, seniority, leadership, and
  individual-contributor signals.

These values are not claims made by the employer. Use them for filtering and
review, then confirm important details on the public application page.

## Choose an output

| Need | Use |
| --- | --- |
| Complete current data | `public-job-feed-latest.json` or `.csv` |
| Reader-facing spreadsheet upload | `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv` |
| Shortlist or filtered investigation | A file in `data/jobs/public/slices/` |
| One representative job per duplicate group | A file in `data/jobs/public/slices/deduped/` |
| Release-specific columns | `public-job-feed-data-dictionary.md` or `.csv` |

Some full-feed paths are compatibility links rather than separate copies. Do
not treat a compatibility path as an independent snapshot.

## Work with the data safely

- Keep source URLs and fetch dates when making a derived view.
- Do not convert a score, remote classification, or salary detection into a
  verified job fact.
- Confirm that a job is still live before recommending it or applying.
- Treat generated releases and upload packages as read-only except when using
  their documented workflow.

For connection-specific field mappings, see [Connect to public ATS job boards](connect-public-ats-job-boards.md).
