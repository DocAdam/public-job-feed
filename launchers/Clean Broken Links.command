#!/bin/bash
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
PACKAGE_ROOT="$PROJECT_DIR/data/jobs/gsheet-package"
LATEST_DIR="$PACKAGE_ROOT/latest"
LATEST_TIMESTAMPED_DIR="$(find "$PACKAGE_ROOT" -maxdepth 1 -type d -name '20??????-????' | sort | tail -n 1)"
REPORTS_DIR="$PROJECT_DIR/data/jobs/reports"
STATUS_FILE="$REPORTS_DIR/clean-broken-links-status.md"
PACKAGE_TEST_MD="$REPORTS_DIR/test-gsheet-package-results.md"
TREND_DIR="$PROJECT_DIR/data/jobs/trends/latest"

cd "$PROJECT_DIR"

if [ -z "$LATEST_TIMESTAMPED_DIR" ]; then
  echo "No timestamped Google Sheets package folder found under:"
  echo "$PACKAGE_ROOT"
  exit 1
fi

clean_package_links() {
  local label="$1"
  local package_dir="$2"
  local failures_csv="$package_dir/01_good_documentation_jobs-url-failures.csv"
  local summary_md="$package_dir/01_good_documentation_jobs-url-check-summary.md"

  echo
  echo "----------------------------------------"
  echo "$label"
  echo "----------------------------------------"
  echo "$package_dir"
  echo

  step_start "$label: validating package before URL checks"
  npm run jobs:test-gsheet-package -- --package-dir "$package_dir"
  step_complete "$label validation before URL checks"

  step_start "$label: checking URL health and safe-pruning deterministic broken links"
  npm run jobs:gsheet-check-urls -- --package-dir "$package_dir" --apply-safe
  step_complete "$label URL health and safe prune"
  echo "  - URL failures: $failures_csv" >> "$STATUS_FILE"
  echo "  - URL summary: $summary_md" >> "$STATUS_FILE"

  step_start "$label: validating package after safe prune"
  npm run jobs:test-gsheet-package -- --package-dir "$package_dir"
  step_complete "$label validation after safe prune"
}

sync_latest_package() {
  echo
  echo "----------------------------------------"
  echo "Syncing latest package"
  echo "----------------------------------------"
  echo "$LATEST_DIR"
  echo

  step_start "Syncing latest upload files from the cleaned timestamped package"
  cp "$LATEST_TIMESTAMPED_DIR/00_start_here.csv" "$LATEST_DIR/00_start_here.csv"
  cp "$LATEST_TIMESTAMPED_DIR/01_good_documentation_jobs.csv" "$LATEST_DIR/01_good_documentation_jobs.csv"
  rm -f "$LATEST_DIR/01_good_documentation_jobs-url-review.csv"
  rm -f "$LATEST_DIR/01_good_documentation_jobs-url-failures.csv"
  rm -f "$LATEST_DIR/01_good_documentation_jobs-url-check-summary.json"
  rm -f "$LATEST_DIR/01_good_documentation_jobs-url-check-summary.md"
  rm -f "$LATEST_DIR/01_good_documentation_jobs-before-url-prune.csv"
  step_complete "Latest package sync"

  step_start "Latest package: validating synced package"
  npm run jobs:test-gsheet-package -- --package-dir "$LATEST_DIR"
  step_complete "Latest package validation"
}

echo "========================================"
echo "Clean Broken Links"
echo "========================================"
echo
echo "Newest timestamped package:"
echo "$LATEST_TIMESTAMPED_DIR"
echo
echo "Latest package:"
echo "$LATEST_DIR"
echo
echo "This launcher checks and safely prunes deterministic broken links in the timestamped package."
echo "Timeouts and fetch errors are kept for review."
echo "The latest package is then synced from that same cleaned snapshot."
echo

mkdir -p "$REPORTS_DIR"

STEP_STARTED_AT=0

step_start() {
  local label="$1"
  STEP_STARTED_AT="$(date +%s)"
  echo "- $label: started $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$STATUS_FILE"
}

step_complete() {
  local label="$1"
  local finished_at
  local elapsed_seconds

  finished_at="$(date +%s)"
  elapsed_seconds=$((finished_at - STEP_STARTED_AT))
  echo "- $label complete (${elapsed_seconds}s)" >> "$STATUS_FILE"
}

{
  echo "# Clean Broken Links Status"
  echo
  echo "Started: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo
  echo "- Newest timestamped package: $LATEST_TIMESTAMPED_DIR"
  echo "- Latest package: $LATEST_DIR"
} > "$STATUS_FILE"

clean_package_links "Timestamped package" "$LATEST_TIMESTAMPED_DIR"

echo
echo "Regenerating trend reports from timestamped packages..."
echo

step_start "Regenerating trends after timestamped package safe prune"
npm run jobs:trends
step_complete "Trends"

sync_latest_package

step_start "Analyzing unknown title categories"
npm run jobs:unknown-categories
step_complete "Unknown title-category analysis"

echo "Completed: $(date -u '+%Y-%m-%d %H:%M UTC')" >> "$STATUS_FILE"

echo
echo "Broken-link cleanup complete."
echo
echo "Timestamped package:"
echo "$LATEST_TIMESTAMPED_DIR"
echo
echo "Latest package:"
echo "$LATEST_DIR"
echo
echo "Timestamped URL failures review:"
echo "$LATEST_TIMESTAMPED_DIR/01_good_documentation_jobs-url-failures.csv"
echo
echo "Latest trend folder:"
echo "$TREND_DIR"
echo
echo "Package validation:"
echo "$PACKAGE_TEST_MD"
echo
echo "Status file:"
echo "$STATUS_FILE"
echo

if [ "${CLEAN_BROKEN_LINKS_OPEN:-true}" != "false" ]; then
  open "$LATEST_DIR" || true
fi

echo
if [ "${CLEAN_BROKEN_LINKS_PAUSE:-true}" != "false" ] && [ -t 0 ]; then
  read -n 1 -s -r -p "Press any key to close..."
  echo
else
  echo "Done."
fi
