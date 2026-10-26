# All-remote view update

Result: PASS. Derived verification record for the authorized live pivot filter change.

The existing remote_jobs_pivot tab now includes every source row whose Work Arrangement is exactly Remote, without a Location or country filter. The existing four grouping columns and ascending sort rules remain unchanged. The source remains 01_good_documentation_jobs!A1:P733.

Read-back matched all 125 expected results, with zero missing, extra, or duplicate groups. All 125 primary application link destinations matched. The old view had 69 results; this change adds 67 previously excluded Remote rows and removes 11 results with other work-arrangement labels.

All main-table values and native table definitions remain unchanged. No source CSV, package, score, employment classification, collection process, schedule, sharing setting, commit, or push was changed. The existing empty remote-tab basic filter remains unchanged.

The Google-rendered initial view was inspected in the browser. Existing fixed widths clip long text; no layout changes were made. Country and other restrictions in each posting still apply.

Evidence: before.json, plan.json, write-result.json, readback.json, and verification.json. plan.json retains the exact former pivot definition for reviewed rollback. Check for later live edits before any rollback.

