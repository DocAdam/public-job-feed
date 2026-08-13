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
echo "Prepare Weekly Top 5 Substack Post"
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

cat <<'PROMPT' | pbcopy
Build this week's Top 5 documentation jobs Substack post.

Use:
- data/jobs/trends/latest/weekly-new-jobs.csv as the initial candidate pool.
- data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv to confirm each candidate is still in the current cleaned feed.
- data/jobs/trends/latest/weekly-substack-report.md for the weekly feed count and factual market context.
- /Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-2026-07-20.md only as a previous-format reference. Do not carry its job facts into the new post.
- The adam-substack-voice skill with the job-roundup profile.

Research the official application pages. Choose exactly five live roles with meaningful documentation, developer education, content design, knowledge management, or closely related ownership. Prefer direct employer postings and exclude obvious scoring false positives, duplicate/location variants, stale listings, and aggregator copies when a direct employer posting is unavailable.

For every selected job, verify the exact title, company, location or remote restrictions, published salary, posted date, application URL, concrete work, and the qualification or constraint that most changes whether someone should apply. Do not infer missing salary or location details.

Draft a clear title, a two-sentence Substack subheading, five parallel job sections, one short comparison paragraph, and a source note. Give each job one compact prose paragraph after its metadata. Do not invent my experience, reaction, application history, interview history, or judgment. Mark any place where one sentence from me would materially improve the post with [ADAM NOTE].

Save the finished draft as /Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-YYYY-MM-DD.md using today's date. Run the job-roundup voice review and make the smallest useful revisions before handing it back to me.
PROMPT

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
