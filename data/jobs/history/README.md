# Saved job history

This database is derived data. The dated folders in `data/jobs/gsheet-package/`
remain the source of truth. The history commands do not change those files.
They do not fetch jobs, update Sheets, or publish files.

## Commands

Use Node.js 26 and the dependencies in `package-lock.json`.

```sh
npm run jobs:history-build
npm run jobs:history-update
npm run jobs:history-audit
npm run jobs:test-history
npm run jobs:test-history-content
npm run jobs:history-report
node src/scripts/query-jobs-history.js 'SELECT * FROM snapshot_summary ORDER BY snapshot_id DESC LIMIT 5'
```

The default database is `data/jobs/history/jobs-history.duckdb`. It is ignored
by Git. The README and validation record are eligible for version control.
The three history commands accept `--root PATH --database PATH` after `--`.
The database must be outside the archive folder.

Build scans all headers, creates a temporary database, validates it, and then
replaces the old database. A failed build leaves the old database in place.
Update requires an existing database. It imports only missing snapshot IDs
in one transaction. It also checks the saved files for changes. Run build if
saved source hashes change. Repeated updates do not add duplicate rows.
Audit opens the database read-only. Structural errors return exit status 1.
Each command uses a `.history-lock` file to prevent concurrent history commands.
After a process crash, remove that lock only after you confirm no history
command is running. Close other database tools before a build.

Only real directories with valid `YYYYMMDD-HHMM` names are imported. Symlinks,
`latest`, `latest-clean`, `top-matches-only`, and other operational folders are
excluded. Invalid names that start with a digit are reported as errors.

## Data model

- `snapshots`: one row per folder; observation time, raw `03` and `01` counts,
  inclusion rate, normalized company count, catalog slug count, ATS count,
  and import time. It also stores `raw_top_match_row_count`,
  `resolved_observation_count`, `duplicate_canonical_row_count`, and
  `unmatched_good_job_count`. Duplicate row count means excess rows, not all
  rows in duplicate groups.
- `posting_observations`: the wide `03` record, with snake_case column names,
  per-snapshot membership in `01`, and the original source fields in
  `raw_values` JSON. The primary key is `(snapshot_id, canonical_url_key)`.
- `raw_top_match_rows`: every `03` data row, keyed by
  `(snapshot_id, raw_row_number)`. `raw_values` JSON preserves all source
  fields as parsed strings. Row numbers start at 1 after the header; quoted
  multiline fields count as one record. Each row records its canonical key,
  job key, selected sibling row number, group size, and selection flag.
- `raw_good_job_rows`: every `01` data row, with the same row-number key,
  raw JSON, primary application link, title, company, location, and matched
  canonical key (NULL when unmatched).
- `good_job_exceptions`: unmatched `01` rows with the same key and fields,
  plus `reason = 'no_matching_top_match_url'`. All other export fields,
  including work arrangement, score, salary, dates, source, and additional
  links, remain available in `raw_values`. No posting observation is invented.
- `snapshot_files`: source CSV hashes, row counts, and ordered header lists.
- `source_artifacts`: exact saved manifest JSON, source summary Markdown, and
  ATS health CSV content, with file hashes. Missing optional artifacts produce
  warnings.

`CanonicalURLKey` is the saved posting identity. `JobKey` is retained but is
not globally unique. The existing canonical helper drops query text; the
warehouse does not regenerate keys with that helper.

Membership uses the daily report's URL comparison: trim and normalize spaces,
convert to lowercase, and remove trailing slashes. Query parameters remain.
Only the primary `Apply Link` marks inclusion. `Additional Apply Links` do not
mark a `03` row as included. A resolved observation is included when a primary
`01` link matches any raw sibling URL for that canonical key. Duplicate `01`
links, if present, remain separate raw export rows but mark one observation.
Thus raw good-job row counts and matched observation counts can differ.

The existing `CompanyKey` is used when present. If it is absent, the existing
`normalizeCompanyKey` helper supplies it. Empty labels are not counted.
Company/source labels can include intermediaries.


## Duplicate selection and audit rules

The approved policy keeps every raw row. Within each snapshot and canonical
key, the resolved observation uses the latest valid `FetchedAt`. Valid values
are ISO timestamps with seconds and an explicit `Z` or numeric zone offset.
Values without a zone, invalid dates, and missing values rank below valid
values. Comparison uses JavaScript timestamp precision (milliseconds). Equal
times, or groups with no valid time, use the lowest raw row number. This rule
is deterministic for a saved file.

`posting_observations` records `selected_raw_row_number`,
`canonical_group_row_count`, `duplicate_canonical_row_count`, `selection_rule`,
and `source_anomaly`. A resolved duplicate uses the anomaly label
`resolved_duplicate_canonical_rows`. All sibling rows remain in
`raw_top_match_rows` with links to the selected row.

Resolved duplicates and preserved unmatched `01` rows are source warnings.
They do not make a complete build or audit fail. Audit compares every raw row,
resolved field, selection marker, membership flag, and exception against a
fresh read of the saved files. It also checks source hashes and snapshot
counts. Missing identity, conflicting URL identities, schema collisions,
lost or changed rows, duplicate observations, orphan rows, and failed database
queries remain structural errors. Updates fail and roll back if these checks
fail. A source change requires a rebuild; update does not silently replace an
already imported snapshot.

`top_match_count` and `raw_top_match_row_count` both count raw `03` rows.
`good_job_count` counts all raw `01` rows, including exceptions.
`inclusion_rate` retains the requested raw `01` / raw `03` ratio; it is not the
resolved membership rate. `daily_market_metrics.total_postings` counts resolved
observations, and `good_postings` counts their true membership flags. Snapshot
company, catalog, and ATS coverage counts use the raw `03` population.

```sql
-- Reconcile raw supply, resolved postings, and exceptions
SELECT snapshot_id, raw_top_match_row_count, resolved_observation_count,
       duplicate_canonical_row_count, good_job_count, unmatched_good_job_count
FROM snapshots ORDER BY snapshot_id;

-- Inspect all raw siblings and the selected row
SELECT raw_row_number, canonical_url_key, selected_for_observation,
       selected_raw_row_number, raw_values
FROM raw_top_match_rows WHERE snapshot_id = '20260715-0556'
  AND canonical_group_row_count > 1
ORDER BY canonical_url_key, raw_row_number;

-- Read an exception's original export fields
SELECT snapshot_id, apply_link, title, company, location,
       raw_values ->> 'Work Arrangement' AS work_arrangement,
       raw_values ->> 'Writer Fit Score' AS writer_fit_score, reason
FROM good_job_exceptions ORDER BY snapshot_id, raw_row_number;
```

## Types and schema changes

Boolean fields use BOOLEAN. Unknown boolean values become NULL. Salary values
and numeric scores use DOUBLE; group sizes and source ATS counts use INTEGER.
Empty fields become NULL. Other source fields, including posted and fetched
dates, remain VARCHAR because saved representations can differ. Failed casts
become NULL; original values remain in `raw_values`.

`observed_at` is a TIMESTAMP parsed from the folder name, without a timezone.
No timezone is inferred. `imported_at` records the database import time.
An empty snapshot has a NULL inclusion rate.

Headers are combined by name. New source columns become database columns;
missing historical columns are NULL. Name collisions are errors. In the
September 28 archive, all 131 `03` files have the same 67 columns. The `01`
files have four header variants: 2, 46, 32, and 51 snapshots. Their main changes
are report date, age, role type, and additional application links. Exact
headers and hashes are stored per snapshot.

## Views and queries

`posting_lifecycle` gives first and last observations, snapshot counts, and
first/latest titles, company labels, and locations. `first_seen` and
`last_seen` are crawler observation dates. They are not authoritative posting
or closure dates. A gap can result from crawler or filter changes.

`snapshot_summary` exposes snapshot metrics. `daily_market_metrics` uses the
stored `RemoteStatus` values Remote, Hybrid, and Onsite, and the stored
`USRemoteEligible` boolean. It does not apply new classification rules.
Despite the view name, it has one row per snapshot; a day can have several.

Run each query with the read-only query script shown above, or with a separate
DuckDB SQL client.

```sql
-- Corpus size over time
SELECT observed_at, top_match_count, good_job_count
FROM snapshots ORDER BY observed_at;

-- Longest-observed postings
SELECT * FROM posting_lifecycle
ORDER BY snapshots_seen DESC, canonical_url_key LIMIT 25;

-- Remote share, using stored classifications; unknowns stay in the denominator
SELECT snapshot_id, observed_at, remote_postings, total_postings,
       remote_postings::DOUBLE / nullif(total_postings, 0) AS remote_share
FROM daily_market_metrics ORDER BY observed_at;

-- Inclusion-rate trend
SELECT observed_at, inclusion_rate FROM snapshots ORDER BY observed_at;

-- New canonical URLs by snapshot, including snapshots with zero new URLs
SELECT s.snapshot_id, s.observed_at, count(l.canonical_url_key) AS new_urls
FROM snapshots s LEFT JOIN posting_lifecycle l ON l.first_seen = s.observed_at
GROUP BY s.snapshot_id, s.observed_at ORDER BY s.observed_at;
```

## Source coverage and limits

Coverage changed substantially. The task supplied these checkpoints:
June 2: 116 rows, 93 companies, 3 ATS types; June 23: 575/379/4;
July 15: 919/578/6; August 24: 964/576/7. Some days have several packages,
and their totals can differ. Use the stored per-snapshot values for analysis.
Raw totals are not a clean market index. Crawler growth, filters, dedupe,
export grouping, and URL pruning can change them.

The saved manifests describe package files and paths. They do not establish
a source configuration version. No inferred pipeline-era labels are added.
The saved `SOURCE_SUMMARY.md` files contain whole-feed totals and ATS lists;
`09_ats_health.csv` contains richer ATS diagnostics. Both are retained for
later comparison. They describe package-time diagnostics, which can refer
to collection times different from the snapshot folder time.

`02_company_coverage.csv` has board status, job counts, fetch times, and notes.
It is a useful follow-up source for a separate board-coverage model. It is not
imported in this first version. The observed catalog/ATS counts describe the
shortlist, not every configured or attempted source.

## Validation status: September 28, 2026

Full rebuild and audit results are recorded in `validation.json`. The approved
exception policy is implemented. Raw source anomalies are reported separately
from structural audit errors. The validation record also includes repeated
update checks, full-archive query results, and source-file hash checks.

The full archive contains:

| Measure | Count |
| --- | ---: |
| Snapshots | 131 |
| Raw `03` rows | 94,079 |
| Resolved posting observations | 94,069 |
| Historical canonical keys | 2,973 |
| Historical job keys | 2,923 |
| Raw `01` export rows | 83,474 |
| Matched `01` export rows | 83,434 |
| Resolved observations included in `01` | 83,424 |
| Unmatched `01` exceptions | 40 |

The ten-row difference between matched export rows and included observations
comes from repeated links in the duplicate snapshot. No rows are discarded.
Raw company labels and keys each have 1,453 distinct values. The selected
observations have 1,451 distinct company keys; duplicate resolution selects
one of the differing labels for each posting.

`20260715-0556` has 929 raw rows and 919 resolved observations. All 20 raw rows
in its ten duplicate pairs are retained. Its ten excess rows produce one
source-warning entry. The 40 exceptions span 30 snapshots and produce 30
warning entries. One further warning records the four `01` header variants.
The full audit has zero structural errors.

For `20260928-0552`, both raw and resolved counts are 853. There are 767 matched
inclusions and 86 excluded observations, with no duplicates or exceptions.
All eight SQL examples above passed against the full database.


## Historical content metrics

`historical_content_metrics` stores one derived row per snapshot.
`historical_role_metrics` stores one row per snapshot and existing daily-report
role group, including zero counts and Unknown. Build recreates both tables.
Update calculates missing rows and rows whose weekly baseline changes. A
hash of the JS definitions detects code changes; the next update recalculates
metrics with the new definitions. The report refuses stale definition hashes.
The report command does not calculate all historical metrics again.

The metric layer calls the existing `enrich`, `buildContentMetrics`,
`compareMembership`, `roleChanges`, title classification, topic matcher, and
explicit U.S. remote filter. The daily-report code and behavior are unchanged.

The population starts with saved `01` export rows. Matched rows must have a
stored observation with `included_in_good_jobs = true`. Unmatched exception
rows remain in the population with their original export fields. They have
no primary-URL description when no matching `03` row exists. They contribute
to total, arrangement, and role counts, but do not create topic evidence.

The daily report's enrichment counts each normalized primary application URL
once and retains the last export row for a repeated URL. Historical metrics
use this same rule. `raw_good_jobs = good_jobs + duplicate_export_rows`.
`unmatched_good_job_rows` counts raw exceptions; `unmatched_good_jobs` counts
their unique primary URLs. Thus all 40 exceptions remain accounted for, and
the ten repeated export URLs remain explicit in the raw reconciliation.

For exact text parity, enrichment reads preserved raw `03` rows in CSV order.
The existing helper selects the last primary-URL match. It does not substitute
the warehouse's latest-fetched duplicate selection for the daily text rule.
This affects text provenance only; posting observation selection is unchanged.

Arrangement counts use `01` Work Arrangement values, with a missing value
counted as Unknown, exactly as the existing metric helper does. U.S. remote
uses `filterConfirmedUsRemote` on the original export rows, as the current
combined daily report does. This can count repeated export links separately;
that behavior is retained for parity. It does not use `03` USRemoteEligible.

All stored shares are percentages from 0 to 100. Empty denominators are NULL
and render as N/A. Topic shares divide by `searchable_jobs`, not all good jobs.
Text coverage divides searchable jobs by good jobs. Only primary-URL posting
text supplies topic evidence. Missing text is not a negative match. Company
background can contain a matched phrase; a mention is not a requirement.
Company, catalog slug, and ATS counts retain the raw-shortlist coverage
population from `snapshots`; they are not unique employers in the `01` subset.

### Comparison selection

Weekly selection uses the same recorded UTC package time reader rules as the
daily command: `README_GSHEET_PACKAGE.md` Generated time, then `00_start_here.csv`
Report Run Date. These small source artifacts are now stored in the warehouse.
The oldest strictly earlier package within the preceding seven days wins;
equal candidate times use ascending snapshot ID. Multiple snapshots per day
remain separate. With no earlier candidate, baseline and churn fields are NULL.
The daily command can select itself when no earlier candidate exists; history
uses NULL for that case, as required for a meaningful earlier comparison.

If neither recorded time exists, fixture/legacy records use folder time as a
naive comparison clock and set `time_source = folder_time_no_zone`. No real
UTC claim is made for that fallback. Real archive validation checks this flag.
`observed_at` remains the original folder timestamp. `report_observed_at`
stores the separate comparison clock. Churn uses the same normalized primary
application URL identity as the daily report: added + removed; rate divides
by baseline good jobs. It does not use JobKey or count confirmed closures.

Monthly comparison targets latest `observed_at` minus 30 days, then selects
the closest snapshot at or before that target. Equal times use descending
snapshot ID. No candidate means no monthly comparison. The report shows exact
IDs and times; the selected interval can exceed 30 days.

### Markdown report

```sh
npm run jobs:history-report
# Optional isolated database and report path:
npm run jobs:history-report -- --database /path/history.duckdb --output /path/report.md
```

Default output: `data/jobs/reports/jobs-history-report.md`. The database is opened
read-only. Output includes current metrics, weekly and monthly comparisons,
arrangements, searchable text coverage, topic shares, role deltas, and source
coverage. The command also prints structured publishing candidates as JSON.
Each candidate includes comparison IDs and its coverage-warning flag. A short,
fixed selection appears in Markdown; candidates have no subjective rank.

A comparison warns when the absolute company or catalog count change divided
by the baseline count is at least 10%, or when ATS type count changes. A zero
baseline changing to a nonzero count also warns. No source-growth correction
is applied. A comparison below these thresholds does not prove constant
coverage. Publishing candidates describe this feed only.

```sql
SELECT snapshot_id, good_jobs, remote_share, explicit_us_remote_jobs,
       searchable_jobs, ai_mentions, ai_share, weekly_churn_rate
FROM historical_content_metrics ORDER BY snapshot_id;

SELECT snapshot_id, role_group, job_count
FROM historical_role_metrics ORDER BY snapshot_id, role_group;
```

### Publishing report sections

The report adds three sections without changing stored metrics or the existing
report sections:

- **Largest changes** uses a fixed order: remote share, explicit U.S. remote,
  AI share, largest role increase, largest role decrease, and weekly churn.
  The first three use the monthly comparison when available, then the weekly
  comparison. Role changes use weekly changes when present, then monthly
  changes. Role extremes use numerical deltas; alphabetical role names break
  ties. There is no score across different units.
- **Short historical trends** selects the latest observation in each
  Monday–Sunday calendar week, using the stored observation date. Equal times
  use the greatest snapshot ID. It shows the last eight weeks with data in
  chronological order. Empty weeks are omitted, and the current week can be
  partial. Stored weekly churn is not a calendar-week total.
- **Publishing-ready facts** renders concise statements from the selected
  changes. Topic statements use searchable postings as their denominator.
  Statements with a coverage warning retain that warning.

The trend section includes company, catalog, and ATS counts for every sample.
It reuses the existing coverage threshold for sampled endpoints, intervening
snapshots, and each sample's churn baseline. A temporary coverage change that
reverses before the next sample still produces a warning. Missing metrics or
role counts render as N/A. One sampled week does not establish a trend.
