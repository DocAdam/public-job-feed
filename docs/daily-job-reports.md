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
