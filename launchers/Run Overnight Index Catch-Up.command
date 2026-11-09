#!/bin/bash

set -u

PROJECT_DIR="/Users/adampugh/GitHub/public-job-feed"
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

RUN_ID="$(node src/scripts/record-index-run.js start --launcher "$0" --pid "$$" -- "$@")" || exit 1
exit_reason="command_failure"
finish_run() {
  code=$?
  trap - EXIT
  node src/scripts/record-index-run.js finish --run-id "$RUN_ID" --reason "$exit_reason" --exit-code "$code" || code=1
  exit "$code"
}
trap finish_run EXIT
trap 'exit_reason="interrupted"; exit 130' INT
trap 'exit_reason="interrupted"; exit 143' TERM

due_boards() {
  node src/scripts/record-index-run.js queue --run-id "$RUN_ID"
}

echo
echo "[$(timestamp)] Starting overnight job-index catch-up."
echo "Log: $LOG"
echo "Run ID: $RUN_ID"

iteration=0
stalled_runs=0

while (( iteration < MAX_ITERATIONS )); do
  if ! before="$(due_boards)"; then
    exit_reason="unreadable_state"
    echo "[$(timestamp)] Could not read the due-board count; stopping."
    exit 1
  fi

  if (( before == 0 )); then
    exit_reason="queue_exhausted"
    echo "[$(timestamp)] No boards are currently due. Read the run result for fetch health and retry deferrals."
    exit 0
  fi

  iteration=$((iteration + 1))
  echo
  echo "[$(timestamp)] Cycle $iteration: $before boards currently due."

  child_run_id="$(node -e 'console.log(require("crypto").randomUUID())')" || exit 1
  node src/scripts/record-index-run.js begin-cycle --run-id "$RUN_ID" --child-run-id "$child_run_id" --cycle "$iteration" || exit 1
  maintenance_code=0
  INDEX_PARENT_RUN_ID="$RUN_ID" INDEX_CYCLE_NUMBER="$iteration" INDEX_RUN_ORIGIN="overnight_catch_up" npm run jobs:maintain-index -- \
    --record-id "$child_run_id" \
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
    --icims-limit 250 || maintenance_code=$?

  node src/scripts/record-index-run.js cycle --run-id "$RUN_ID" --child-run-id "$child_run_id" --exit-code "$maintenance_code" || exit 1
  if (( maintenance_code != 0 )); then
    exit_reason="command_failure"
    echo "[$(timestamp)] Maintenance cycle failed; stopping instead of retrying indefinitely."
    exit 1
  fi

  if ! after="$(due_boards)"; then
    exit_reason="unreadable_state"
    echo "[$(timestamp)] Maintenance finished, but its board state is unreadable; stopping."
    exit 1
  fi

  echo "[$(timestamp)] Cycle $iteration complete: due boards $before -> $after."

  if (( after == 0 )); then
    exit_reason="queue_exhausted"
    echo "[$(timestamp)] No boards are currently due. Read the run result for fetch health and retry deferrals."
    exit 0
  fi

  if (( after >= before )); then
    stalled_runs=$((stalled_runs + 1))
    echo "[$(timestamp)] No net queue reduction ($stalled_runs/$MAX_STALLED_RUNS)."
    if (( stalled_runs >= MAX_STALLED_RUNS )); then
      exit_reason="no_progress"
      echo "[$(timestamp)] Queue did not shrink for $MAX_STALLED_RUNS cycles; stopping for review."
      exit 2
    fi
  else
    stalled_runs=0
  fi
done

echo "[$(timestamp)] Reached the safety limit of $MAX_ITERATIONS cycles; stopping."
exit_reason="cycle_limit"
exit 2
