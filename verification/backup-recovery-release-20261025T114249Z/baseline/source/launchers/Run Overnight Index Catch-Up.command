#!/bin/bash

set -u

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
REPORT="$PROJECT_DIR/data/jobs/reports/board-freshness-report.json"
LOG="$PROJECT_DIR/data/jobs/logs/overnight-index-catch-up.log"
MAX_ITERATIONS="${MAX_ITERATIONS:-100}"
MAX_STALLED_RUNS="${MAX_STALLED_RUNS:-3}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

if [[ "${OVERNIGHT_CAFFEINATED:-}" != "1" ]]; then
  exec env OVERNIGHT_CAFFEINATED=1 /usr/bin/caffeinate -i "$0" "$@"
fi

mkdir -p "$PROJECT_DIR/data/jobs/logs"
cd "$PROJECT_DIR" || exit 1

exec > >(tee -a "$LOG") 2>&1

timestamp() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

due_boards() {
  node -e '
    const fs = require("fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const due = Number(report?.Overall?.DueBoards);
    if (!Number.isFinite(due) || due < 0) process.exit(1);
    process.stdout.write(String(due));
  ' "$REPORT"
}

echo
echo "[$(timestamp)] Starting overnight job-index catch-up."
echo "Log: $LOG"

iteration=0
stalled_runs=0

while (( iteration < MAX_ITERATIONS )); do
  if ! before="$(due_boards)"; then
    echo "[$(timestamp)] Could not read the due-board count; stopping."
    exit 1
  fi

  if (( before == 0 )); then
    echo "[$(timestamp)] Catch-up complete: no boards are currently due."
    exit 0
  fi

  iteration=$((iteration + 1))
  echo
  echo "[$(timestamp)] Cycle $iteration: $before boards currently due."

  if ! npm run jobs:maintain-index -- \
    --dry-run false \
    --budget-minutes 90 \
    --catalog-max-age-hours 24 \
    --due-limit 3000 \
    --catalog-delta-limit 500 \
    --include-known-good false \
    --ashby-limit 500 \
    --greenhouse-limit 1000 \
    --lever-limit 500 \
    --bamboohr-limit 1000 \
    --workday-limit 250 \
    --icims-limit 250; then
    echo "[$(timestamp)] Maintenance cycle failed; stopping instead of retrying indefinitely."
    exit 1
  fi

  if ! after="$(due_boards)"; then
    echo "[$(timestamp)] Maintenance finished, but its freshness report is unreadable; stopping."
    exit 1
  fi

  echo "[$(timestamp)] Cycle $iteration complete: due boards $before -> $after."

  if (( after == 0 )); then
    echo "[$(timestamp)] Catch-up complete: no boards are currently due."
    exit 0
  fi

  if (( after >= before )); then
    stalled_runs=$((stalled_runs + 1))
    echo "[$(timestamp)] No net queue reduction ($stalled_runs/$MAX_STALLED_RUNS)."
    if (( stalled_runs >= MAX_STALLED_RUNS )); then
      echo "[$(timestamp)] Queue did not shrink for $MAX_STALLED_RUNS cycles; stopping for review."
      exit 2
    fi
  else
    stalled_runs=0
  fi
done

echo "[$(timestamp)] Reached the safety limit of $MAX_ITERATIONS cycles; stopping."
exit 2
