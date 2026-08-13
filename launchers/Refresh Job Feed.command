#!/bin/bash
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
GSHEET_DIR="$PROJECT_DIR/data/jobs/gsheet-package/latest"
STATUS_DASHBOARD="$PROJECT_DIR/data/jobs/reports/project-status-dashboard.md"
FRESHNESS_REPORT="$PROJECT_DIR/data/jobs/reports/board-freshness-report.md"
ATS_ALERT_REPORT="$PROJECT_DIR/data/jobs/reports/ats-anomaly-alert.md"
UNKNOWN_CATEGORY_REPORT="$PROJECT_DIR/data/jobs/reports/unknown-title-category-analysis.md"
US_REMOTE_REPORT="$PROJECT_DIR/data/jobs/reports/us-remote-daily-report.md"
URL_FAILURES="$GSHEET_DIR/01_good_documentation_jobs-url-failures.csv"
REFRESH_STATUS="$PROJECT_DIR/data/jobs/reports/refresh-job-feed-status.md"
JOB_FINDER_SLICE="$PROJECT_DIR/data/jobs/consumers/job-finder/latest.json"

cd "$PROJECT_DIR"

echo "========================================"
echo "Public Job Feed Refresh"
echo "========================================"
echo
echo "Project:"
echo "$PROJECT_DIR"
echo
echo "This launcher refreshes catalogs and due boards in parallel, then builds a current snapshot."
echo

mkdir -p "$PROJECT_DIR/data/jobs/reports"

STEP_STARTED_AT=0

step_start() {
  local label="$1"
  STEP_STARTED_AT="$(date +%s)"
  echo "- $label: started $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$REFRESH_STATUS"
}

step_complete() {
  local label="$1"
  local finished_at
  local elapsed_seconds

  finished_at="$(date +%s)"
  elapsed_seconds=$((finished_at - STEP_STARTED_AT))
  echo "- $label complete (${elapsed_seconds}s)" >> "$REFRESH_STATUS"
}

{
  echo "# Refresh Job Feed Status"
  echo
  echo "Started: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo
  echo "- Project: $PROJECT_DIR"
  echo "- Google Sheets package: $GSHEET_DIR"
  echo
} > "$REFRESH_STATUS"

step_start "Step 1: maintaining catalogs and board snapshots"
npm run jobs:maintain-index -- --dry-run false --budget-minutes 45 --catalog-max-age-hours 24 --due-limit 300 --catalog-delta-limit 250 --include-known-good true
step_complete "Step 1"

step_start "Step 2: rebuilding daily public release"
npm run jobs:public-release -- --profile daily
step_complete "Step 2"

step_start "Step 3: exporting Job Finder consumer slice"
npm run jobs:export-job-finder
step_complete "Step 3"

step_start "Step 4: rebuilding daily Google Sheets package"
npm run jobs:gsheet-package -- --profile daily
step_complete "Step 4"

echo
echo "Cleaning broken links in the newest Google Sheets package..."
echo

step_start "Step 5: checking and safe-pruning broken links"
if ! CLEAN_BROKEN_LINKS_OPEN=false CLEAN_BROKEN_LINKS_PAUSE=false "$PROJECT_DIR/launchers/Clean Broken Links.command"; then
  echo "- Step 5 failed" >> "$REFRESH_STATUS"
  echo
  echo "========================================"
  echo "BROKEN-LINK CLEANUP FAILED"
  echo "========================================"
  echo
  echo "The Google Sheets package was rebuilt, but it was not opened automatically because broken-link cleanup failed."
  echo
  echo "Status file:"
  echo "$REFRESH_STATUS"
  echo
  echo "Cleanup status file:"
  echo "$PROJECT_DIR/data/jobs/reports/clean-broken-links-status.md"
  echo
  echo "Status dashboard:"
  echo "$STATUS_DASHBOARD"
  echo

  npm run jobs:status || true

  echo
  if [ -t 0 ]; then
    read -n 1 -s -r -p "Press any key to close..."
    echo
  else
    echo "Done."
  fi
  exit 1
fi
step_complete "Step 5"
LATEST_TIMESTAMPED_DIR="$(find "$PROJECT_DIR/data/jobs/gsheet-package" -maxdepth 1 -type d -name '20??????-????' | sort | tail -n 1)"
URL_FAILURES="$LATEST_TIMESTAMPED_DIR/01_good_documentation_jobs-url-failures.csv"
echo "  - Cleaned timestamped package: $LATEST_TIMESTAMPED_DIR" >> "$REFRESH_STATUS"
echo "  - URL failures: $URL_FAILURES" >> "$REFRESH_STATUS"

echo
echo "Running validation tests before opening the Google Sheets package..."
echo

step_start "Step 6: generating confirmed US-remote daily report"
npm run jobs:report-us-remote
step_complete "Step 6"
echo "  - Confirmed US-remote daily report: $US_REMOTE_REPORT" >> "$REFRESH_STATUS"

step_start "Step 7: running validation tests"
if ! npm run jobs:test-all; then
  echo "- Step 7 failed" >> "$REFRESH_STATUS"
  echo
  echo "========================================"
  echo "VALIDATION FAILED"
  echo "========================================"
  echo
  echo "The Google Sheets package was rebuilt, but it was not opened automatically because validation failed."
  echo
  echo "Inspect test reports:"
  echo "$PROJECT_DIR/data/jobs/reports/test-release-results.md"
  echo "$PROJECT_DIR/data/jobs/reports/test-scoring-results.md"
  echo "$PROJECT_DIR/data/jobs/reports/release-comparison.md"
  echo "$PROJECT_DIR/data/jobs/reports/test-trends-results.md"
  echo
  echo "URL failures review:"
  echo "$URL_FAILURES"
  echo
  echo "Status file:"
  echo "$REFRESH_STATUS"
  echo
  echo "Status dashboard:"
  echo "$STATUS_DASHBOARD"
  echo

  npm run jobs:status || true

  echo
  if [ -t 0 ]; then
    read -n 1 -s -r -p "Press any key to close..."
    echo
  else
    echo "Done."
  fi
  exit 1
fi
step_complete "Step 7"

step_start "Step 8: refreshing status dashboard"
npm run jobs:status
step_complete "Step 8"
echo "Completed: $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$REFRESH_STATUS"

echo
echo "Refresh complete."
echo
echo "Google Sheets package:"
echo "$GSHEET_DIR"
echo
echo "Job Finder consumer slice:"
echo "$JOB_FINDER_SLICE"
echo
echo "URL failures review:"
echo "$URL_FAILURES"
echo
echo "Refresh status file:"
echo "$REFRESH_STATUS"
echo
echo "Status dashboard:"
echo "$STATUS_DASHBOARD"
echo
echo "Board freshness report:"
echo "$FRESHNESS_REPORT"
echo
echo "ATS anomaly report:"
echo "$ATS_ALERT_REPORT"
echo
echo "Unknown title-category report:"
echo "$UNKNOWN_CATEGORY_REPORT"
echo
echo "Confirmed US-remote daily report:"
echo "$US_REMOTE_REPORT"
echo

open "$GSHEET_DIR" || true

echo
if [ -t 0 ]; then
  read -n 1 -s -r -p "Press any key to close..."
  echo
else
  echo "Done."
fi
