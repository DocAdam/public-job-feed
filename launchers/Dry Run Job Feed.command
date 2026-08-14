#!/bin/bash
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
RUN_LOG="$PROJECT_DIR/data/jobs/runs/run-planned-batches-latest.md"

cd "$PROJECT_DIR"

echo "========================================"
echo "Public Job Feed Dry Run"
echo "========================================"
echo
echo "Project:"
echo "$PROJECT_DIR"
echo
echo "This launcher does not fetch jobs. It only plans and shows what would run."
echo

npm run jobs:plan-aggressive
npm run jobs:run-planned

echo
echo "Dry run complete."
echo
if [ -f "$RUN_LOG" ]; then
  echo "Latest dry-run log:"
  echo "$RUN_LOG"
  open "$RUN_LOG" || true
else
  echo "Run log not found yet:"
  echo "$RUN_LOG"
fi

echo
if [ -t 0 ]; then
  read -n 1 -s -r -p "Press any key to close..."
  echo
else
  echo "Done."
fi
