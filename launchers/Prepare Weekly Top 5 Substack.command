#!/bin/bash
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
TREND_DIR="$PROJECT_DIR/data/jobs/trends/latest"
GUIDE="$PROJECT_DIR/docs/weekly-top-five-substack.md"
WEEKLY_JOBS="$TREND_DIR/weekly-new-jobs.csv"
WEEKLY_REPORT="$TREND_DIR/weekly-substack-report.md"

cd "$PROJECT_DIR"

echo "========================================"
echo "Prepare Five Recent Documentation Jobs"
echo "========================================"
echo
echo "Regenerating the seven-day writing inputs from current timestamped packages..."
echo

npm run jobs:trends

if [ ! -s "$WEEKLY_JOBS" ] || [ ! -s "$WEEKLY_REPORT" ]; then
  echo
  echo "The required weekly writing inputs were not created."
  echo "Inspect:"
  echo "$TREND_DIR"
  exit 1
fi

# Keep the guide as the single source for the copied drafting request.
DRAFT_REQUEST="$(awk '
  /^## Request to Give Codex$/ { section = 1; next }
  section && /^```text$/ { copying = 1; next }
  copying && /^```$/ { exit }
  copying { print }
' "$GUIDE")"

if [ -z "$DRAFT_REQUEST" ]; then
  echo "The guide has no drafting request. Inspect: $GUIDE"
  exit 1
fi

printf '%s\n' "$DRAFT_REQUEST" | pbcopy

echo
echo "Ready."
echo
echo "The drafting request is copied to your clipboard."
echo "Paste it into Codex to research, select, draft, and save this week's post."
echo
echo "Weekly candidate pool:"
echo "$WEEKLY_JOBS"
echo
echo "Weekly context:"
echo "$WEEKLY_REPORT"
echo
echo "Full instructions:"
echo "$GUIDE"
echo
echo "The launcher prepares inputs; it does not publish anything to Substack."
echo

open "$GUIDE" || true
open "$TREND_DIR" || true

if [ -t 0 ]; then
  read -n 1 -s -r -p "Press any key to close..."
  echo
else
  echo "Done."
fi
