# Daily job reports


The normal refresh creates two separate daily comparison reports from the two newest
timestamped Google Sheets packages:

- The US report includes only jobs where `Work Arrangement` is `Remote` and
  the location has an explicit US marker.
- The international report includes only jobs where `Work Arrangement` is
  `Remote` and the location has an explicit non-US country, region, or
  worldwide marker.

A multi-region job, such as `US / Canada`, can be in both reports. A generic
`Remote` location is not enough for either report because the eligible
countries are not clear.

The reports contain the current, added, removed, and continuing jobs. The
combined command creates the full **All Remote Jobs — Daily Comparison** with
a **Daily Jobs Snapshot** at the top. The opening snapshot is limited to 300
lines and shows counts, up to five possible post subjects with three examples
each, weekly changes, and focused-view commands. Below it, the original remote
overview, overlap list, and full U.S. and international sections show added,
removed, and current remote jobs. The 300-line limit applies only to the
opening snapshot, not to the full remote report.

```sh
npm run allremotediff
npm run allremotediff -- --region europe
npm run allremotediff -- --country india
npm run allremotediff -- --group technical-writing
npm run allremotediff -- --region europe --work hybrid
npm run allremotediff -- --topics
npm run allremotediff -- --changes --limit 10
npm run allremotediff -- --help
```

Focused reports show 20 examples in total by default. Use `--limit 1` through
`--limit 100` to change this. Counts describe all matching jobs; the examples
are a selection. Each filter combination writes a separate `jobs-view-*.md`
file in `data/jobs/reports/`, so it does not replace the combined report.
Use the sheet for the full list and other views.

The command reads the two newest saved packages directly. The weekly baseline
is the oldest available package within the last seven days; actual package
names are shown. Posting text and complete grouped locations, where available,
come from `03_top_matches_full.csv` in the current package. The command does
not refresh jobs, recheck links, change the sheet, or publish a post. The normal
refresh still generates the separate U.S. and international remote reports.

## Substack outputs

These files are saved writing inputs. Use [Substack publication](substack-publication.md)
and the current Working Notes instructions for the final article. The normal
weekly edition keeps the supplied list and uses **Writing and documentation
jobs** with **Week of [Adam's edition date]** in the subtitle field. A report's
`Snapshot` date is a source date, not the edition date. **Five recent
documentation jobs** is a separate series with verified recent employer dates
and one short explanation per role. Do not turn a daily comparison into a
weekly claim.

`npm run jobs:report-all-remote -- --substack` writes the remote publication
list from `01_good_documentation_jobs.csv`. This saved public list combines
exact company/title location variants and removes confirmed invalid links.
It uses the same geographic filters as the daily remote reports.

`npm run jobs:report-substack-full` writes the full publication list. It uses
the selected records in `03_top_matches_full.csv` from the package identified
by the `latest` manifest, checks their identity against the canonical feed,
and retains the saved package values. It applies the existing exact-record
exclusion. It does not combine public-list location variants or apply the
public list's link-removal results. Its counts describe source records, not
the complete collected feed or the checked public list.

Both outputs use **Snapshot** for the package date in America/Chicago and
**Added since previous package** for daily membership changes. Added records
are absent from the previous list. Removed records are absent from the
current list. Continuing records are in both. These are not posting or
closure dates. Neither output calls daily additions weekly additions.

The full report groups locations with the existing country and city/state
mappings. The remote publication list uses the remote comparison markers.
Some markers are city names. Neither method confirms eligibility for all
locations of a grouped listing. Geographic sections can overlap. Presentation
grouping reduces the bullet count; it does not reduce the reported job count.
Full-report grouped bullets retain all source application links. Remote
grouped bullets link to the public Sheet. Employer names use the existing
preferred-name field and description-based cleanup; unresolved source labels
remain visible.

Generate both reports before manual publication, then run:

```sh
npm run jobs:validate-refresh-output -- --publication
```

This optional check uses the existing validator and output path. It compares
publication package IDs, snapshot dates, arrangement totals, daily changes,
remote totals, and overlap with the saved source records. The normal refresh
check does not require these optional publication outputs. This check does
not fetch jobs, check live links, or publish.

Patterns describe this feed. Title groups are automated suggestions; text
matches are topics to review, not confirmed requirements. Company counts use
normalized source labels, and country mappings do not establish eligibility.
Use `npm run jobs:report-all-remote -- [options]` to generate without opening
an application.

```text
data/jobs/reports/us-remote-daily-report.json
data/jobs/reports/us-remote-daily-report.md
data/jobs/reports/international-remote-daily-report.json
data/jobs/reports/international-remote-daily-report.md
data/jobs/reports/all-remote-daily-report.md
```


The combined report is also generated during the normal refresh. These commands write local reports. They do not fetch new jobs or publish the Sheet.

## Content metrics

The opening snapshot includes **Content metrics** after Overview. It describes
all jobs and all work arrangements in the saved package. Use these counts as
evidence for draft Substack and LinkedIn posts. They describe this feed, not
the whole job market. Focused views keep their existing output.

`src/lib/content-metrics.js` calculates a structured metric object and renders
the tables. `jobs-snapshot.js` supplies the existing enriched, unique job rows.
It shares one membership comparison and one role-change table with the new
metrics. `all-remote-daily-report.js` passes the same remote counts and overlap
rows to both the snapshot and the remote comparison. The remote filters,
country parser, role classifier, and package-selection code are unchanged.

### Definitions and denominators

- **Job count:** unique jobs from `01_good_documentation_jobs.csv`, using the
  existing `jobKey` function. The key is the application URL in lowercase,
  without trailing slashes. If no URL is present, it uses company, title, and
  location. The opening snapshot already removes duplicate identities.
- **Work arrangements:** use the package values Remote, Hybrid, Onsite, and
  Unknown. An empty value is Unknown, as in the existing snapshot. Counts are
  not new classifications. Each share divides its count by all current jobs.
- **Remote availability:** use the same U.S. and international filtered lists
  as the full comparison. A job can be in both. The unique count is the union
  of their job identities. U.S. and unique qualifying remote shares divide by
  all current jobs. Generic Remote listings can be outside both lists.
- **Weekly baseline:** the oldest available package within seven days of the
  current package's recorded UTC timestamp. The report names the packages.
  It does not assume that the baseline is exactly seven days old.
- **Weekly movement:** added jobs are current identities absent from the
  baseline. Removed jobs are baseline identities absent now. These are list
  changes, not posting or closure dates. Net inventory change is current jobs
  minus baseline jobs. Churn is added plus removed. Churn rate is
  `100 * churn / baseline jobs`; it can exceed 100%.
- **Role movement:** reuse the existing Weekly changes by role group data.
  The largest increase must have a positive delta; the largest decrease must
  have a negative delta. Both exclude Unknown. Ties use ascending group name.
  If no group qualifies, show None. Growing, declining, and unchanged counts
  include Unknown and only groups present in the current or baseline package.
- **Titles:** use the existing `normalizeTitle` helper from `job-titles.js`.
  It converts case, whitespace, and punctuation, including `&` to `and`.
  There is no fuzzy or semantic grouping. Missing titles have a separate label.
  This count does not change the existing role classification.
- **Company/source labels:** use the snapshot's company key, including its
  job-identity fallback when normalization produces an empty label. These keys
  remove existing suffix terms and spaces. The table shows the keys directly.
  They can include intermediaries and are not verified employer names.
- **Geography:** reuse the enriched `places` from the existing location parser.
  A job counts once per unique resolved country. It can count in more than one
  country. City/state-derived countries are included. Country presence does
  not establish hiring eligibility. The unresolved/incomplete count reuses
  the existing `Needs location review` flag. Region-only and worldwide labels
  can have no country without that flag, so the two coverage counts need not
  sum to all jobs. No second country parser is used.
- **Searchable text:** count nonempty descriptions after the existing HTML
  cleanup. The join matches the main application URL to `URL` in
  `03_top_matches_full.csv`, using the same URL identity normalization. Extra
  application links can supply full grouped locations, but their descriptions
  are not combined. Coverage divides searchable jobs by all current jobs.
  A missing details file or empty/unmatched description counts as missing text.
- **Topic shares:** each matching job counts once per topic. The denominator
  is searchable jobs, not all jobs. Jobs without text are not negative matches.
  Topics can overlap. These are mentions, not confirmed requirements; text can
  include company background. Unlike possible post subjects, these counts have
  no minimum number of company labels.

Percentages have one decimal place. A zero denominator produces **N/A**.
Titles, company/source labels, and countries each show up to ten rows. Sort
by descending count, then ascending normalized display value for ties, using
fixed string order. The 300-line opening-summary limit remains in force; the
build fails rather than truncating existing sections.

### Topic definitions

Content metrics reuse the existing posting-text matcher in `daily-jobs-review.js`.
Matching is case-insensitive and uses word boundaries:

- **AI:** AI, artificial intelligence, generative AI, gen AI, genAI, large
  language model/models, LLM/LLMs, conversational AI, or machine learning.
  A substring such as `ai` in `maintain` does not match.
- **API:** API/APIs or application programming interface/interfaces. This
  includes REST API and GraphQL API. A substring in `rapid` does not match.
- **Docs-as-code:** reuse the existing Docs as code expression for docs as
  code, docs-as-code, documentation as code, or documentation-as-code.
  Git and GitHub alone do not match.

### Build and test

Run from the project root:

```sh
npm run jobs:test-content-metrics
npm run jobs:test-all-remote-report
npm run jobs:report-all-remote
```

The first command checks the calculations and the saved Markdown fixture at
`src/scripts/fixtures/content-metrics.md`. The second checks the existing remote
reports and snapshot behavior. The third rebuilds the combined report from
saved data only. `npm run allremotediff` runs the same build and opens the file.
Neither build command fetches jobs, checks links, updates Sheets, or publishes.
