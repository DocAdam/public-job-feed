# Status dashboard

The dashboard combines saved reports. Its generation time does not mean that
each source was checked at that time. Read the source dates before you act.

## Build and check

Run `npm run jobs:status` to update the report folder only. After package
validation, run `npm run jobs:status -- --sync-package` to update the report
and both copies of the current package dashboard. This command also saves a
small run summary. It does not fetch boards or rebuild job exports.

The sync checks the package ID and job CSV hashes. A mismatch stops the sync.
The refresh launcher runs validation before it syncs the final dashboard.

Run `npm run jobs:test-status-dashboard` and
`npm run jobs:test-refresh-launcher` for the focused regression tests.
`npm run jobs:test-all` records the full suite result, package ID, and each
test exit code in `data/jobs/reports/test-all-results.json`. An interrupted
suite can remain `RUNNING`; this is not a pass.

After generating reports, run `npm run jobs:validate-refresh-output`. This
checks the current package IDs, report times, and consumer source date and
row count. It writes `refresh-output-validation.json` and fails if an output
is old or missing. Missing or invalid input files replace any earlier result
with a new failure report. The launcher runs this check before dashboard sync.
The fixture test is `npm run jobs:test-refresh-reports`.

## Read the status

- Operational source reports have a 24-hour age limit. Inventory has a
  seven-day limit. A missing generation date is `DATE_UNKNOWN`.
- Coverage means that a board had an attempt. It does not confirm open jobs.
- Recent attempts include failures. Successful snapshots use `LastSuccessAt`.
  A successful empty result counts as a successful snapshot.
- Current board failures use saved board state. The report shows the state
  date and groups failures by cause. Unknown success dates remain unknown.
- ATS change alerts compare matched boards. Absolute health uses the latest
  terminal result per board in the last 24 hours, including new boards.
  With at least 20 results, failure rates of 20% and 50% cause `WARN` and
  `HIGH`. These review thresholds do not change fetch schedules.
- Historical scale recommendations do not override current failure evidence.
- Package-copy validation compares `latest` with its source package.
  Historical validation compares it with an earlier distinct package.
- Daily exports skip the large deduplicated outputs. Release archives are
  optional. Use `jobs:test-release -- --require-archive` only when an archive
  is required. Small run summaries support comparisons without large archives.

## Review retained jobs

`npm run jobs:review-package-evidence` creates a review report from saved
package data and saved URL checks. It selects uncertain URL results and jobs
whose board check is more than 14 days old or has no usable date.

Add `-- --check-urls` for a bounded live URL check. The command checks at most
50 selected rows, with four concurrent requests and a 15-second request
timeout. It does not prune rows or change board dates. HTTP 403, 429, and 500
results remain uncertain. A successful URL response does not confirm exact
job identity or a working application.

Review outputs are `data/jobs/reports/package-evidence-review.{json,csv,md}`.
The refresh launcher rebuilds the saved-evidence review after URL cleanup.

## Launcher evidence

The desktop entry should contain the script in
`launchers/Refresh Job Feed.desktop-wrapper.sh`. It starts the repository
launcher, so the desktop entry does not retain an old copy of the process.

New refresh runs save a run ID, launcher path and SHA-256, Git revision,
working-tree state, arguments, and final result in
`data/jobs/reports/refresh-runs/`. The latest record is `refresh-run.json`.
Old logs without this evidence cannot prove which launcher produced them.

The launcher tests use temporary folders and command stubs. They check the
success path and failure stop without fetching boards or changing job data.

User reviews are stored in `data/config/package-user-reviews.json`. Browser
observations apply to the named package. Confirmed closure and writing-fit
flags remain attached to the exact job URL. These records do not change
board fetch dates.
