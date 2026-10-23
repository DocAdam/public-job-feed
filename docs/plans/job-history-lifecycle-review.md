# Review of the posting-history plan

Status: design review complete. Implementation and production cutover are not approved by this document.
Date: October 19, 2026.

This is a second review of the [proposed plan](job-history-lifecycle-plan.md), based on current source code, saved CSV files, and read-only database queries. It is not an independent reviewer sign-off or a test of an implemented migration. The [evidence file](job-history-lifecycle-evidence-2026-10-19.json) contains the inventory and source hashes.

## Decision

Proceed with the proposed design only after implementation is authorized. Keep DuckDB and extend the current importer. Store one canonical posting identity, shared content values, and a small observation for each saved run. Derive changes and presence periods from that evidence.

Do not replace the system with a collection of merged spreadsheets. Do not remove the per-run evidence merely because the description repeats. A job that appears in 60 snapshots should have one identity and, if its content did not change, one content version referenced by 60 small observations.

The proposed work solves historical organization. It does not solve the much larger crawler archive storage issue. Keep archive cleanup as a separate decision.

## Findings and required controls

| Priority | Finding from actual files | Required control in the revised plan |
| --- | --- | --- |
| High | The warehouse ends on September 28. Saved packages continue through October 19. It has 131 of 152 snapshots. | Build the candidate from all dated saved packages. Compare the existing 131-snapshot prefix separately, then validate the 21 additional packages. Do not use the old database as the only source. |
| High | Raw row JSON and wide resolved observations repeat description content. Exact full-row hashes still yield 74,696 distinct payloads because collection and other fields change. | Deduplicate exact description text separately from row payloads and posting content versions. Measure closed database size; do not infer disk savings from string counts. |
| High | `daily-jobs-review.enrich` uses the last matching raw URL in file order. The warehouse resolves canonical duplicates using FetchedAt. These are different rules. | Preserve the raw order and both rules. Existing metrics must use their existing population reader semantics. Test report and metric parity over the old prefix. |
| High | Public package creation can group location variants and select a representative primary link. The prune tool can then rewrite 01. | Keep public-export membership separate from canonical 03 observations. Place a future daily import after final prune, validation, and status sync. |
| High | Forty unmatched 01 rows remain in the saved history. Ten excess canonical 03 rows are in the July 15 snapshot. | Retain all raw rows, selected-row references, duplicate counts, and exception reasons. Resolved source anomalies remain warnings; loss or unresolved ambiguity remains an audit failure. |
| High | JobKey is not a unique posting identity: 77 JobKeys in the saved archive map to more than one canonical key. URL helpers can also remove query text. | Keep the exact saved CanonicalURLKey. Do not merge by JobKey, title, employer, or a new URL normalization rule. |
| High | Absence from a saved export can follow a filter, source, or crawler change. Files do not establish employer closure. | Use first observed, absent from snapshot, and reappeared labels. Keep two presence streams and retain coverage warnings. Never label the duration as confirmed days open. |
| High | Current write code expects physical v1 tables. Replacing those tables with views alone would break updates. | Add schema dispatch and v2 write paths before cutover. Reject incompatible writers. Test database replacement and code rollback together. |
| Medium | The archive has four 01 header variants. A missing column is not the same evidence as an empty cell. | Preserve ordered headers and field-presence markers. Show schema changes separately from source content changes. Test exact parsed-row reconstruction before full migration. |
| Medium | A changed old snapshot or late-arriving snapshot can change later comparisons and presence boundaries. | Reject changed source hashes pending an explicit rebuild. Derive chronological neighbors again for late insertions; refresh affected baseline metrics. |
| Medium | The default refresh launcher does not invoke history import. Feed COMPLETE does not mean the warehouse is current. | Add an explicit, separate history result only in the final integration phase. A history failure must show stale history without triggering another job fetch. |

These controls are included in the plan. They remain implementation acceptance conditions, not claims that the current code already supplies them.

## Checks made during review

The following checks were completed without changing the warehouse or historical sources:

- Read the current importer, metrics reader, report dependencies, duplicate/URL helpers, package builder, prune logic, timestamp reader, refresh launcher, and existing tests.
- Opened DuckDB with read-only access. Confirmed nine physical tables and three views, 131 snapshots, 2,973 canonical keys, 2,923 JobKeys, and 83,474 raw 01 rows.
- Ran the existing `auditMetrics` function against the read-only database; it returned no errors. This is not the full warehouse audit.
- Parsed the two required CSV files in each of 152 saved dated folders. Counted 111,624 raw 03 rows, 111,614 resolved observations, 98,896 raw 01 rows, 3,419 canonical keys, and 40 unmatched 01 rows.
- Compared all 262 required CSV hashes already recorded in the warehouse with saved files; all matched.
- Compared exact text and proposed content fields to identify repetition. These measurements are exploratory design evidence, not a new metric definition.

A final protection check compares the 304 reviewed source CSV hashes and 183 protected project/database file hashes with their start-of-review values. All 304 source CSV files and all 183 protected files were unchanged. The evidence file records the result. `git diff --check` passed. Separate whitespace and local-link checks passed for the new Markdown documents. Only three planning documents were added.

The production build, update, report-generation commands, and full test suites were not run. They could write outputs and are not needed to claim a design review. The future implementation must run the plan's validation matrix against isolated candidate paths before any production replacement.

## Real examples to use in implementation tests

**Stable content:** Deepnote Technical Writer appears in all 152 reviewed snapshots with one value under the proposed content projection. The expected design result is one posting identity, one content value, and 152 observations. This does not establish 152 days of hiring or 152 fresh employer fetches.

**Return after absence:** Horizon Industries' Documentation Specialist(DISA), canonical URL ending `5012458008`, appears in `20260619-0755`, is absent in `20260621-0717`, and appears again in `20260622-0914`. Expected labels are absence from the saved shortlist and reappearance. The evidence does not prove a closure or a repost.

**Duplicate source rows:** `20260715-0556` must retain every raw sibling and the selected-row link. A unique observation constraint must not cause raw-row loss.

**Export-only evidence:** The NetApp and PostHog primary links recorded in the exception set must retain all 40 historical exception rows. A later matching link must not rewrite those earlier facts.

## Remaining design gates

| Gate | Current result | Evidence required before acceptance |
| --- | --- | --- |
| Current inventory and repetition | Checked | Re-inventory if the source set changes. |
| Identity and two-stream semantics | Defined | Fixtures for collisions, grouping, and unmatched-to-matched transitions. |
| Lossless normalized storage | Proposed, not verified | All header variants and values reconstruct; no raw sibling or exception is lost. |
| Compatibility with existing metrics/reports | Risk identified | Equal metric values and fixed-time report output over the same source population. |
| Event and period correctness | Defined, not verified | Gap, failed-run, zero-row, late insertion, A→B→A, and multiple-runs-per-day tests. |
| Disk reduction and performance | Not measured | Equivalent-population v1/v2 size, peak temporary disk/memory, import/update/query timings. |
| Crash recovery and replacement | Proposed, not verified | Injected failures, source mutation detection, lock handling, promotion failure, and rollback test. |
| Daily integration | Proposed, not implemented | Finalized-package hook with a separate history result and no network retry side effects. |

## Recommended implementation order

Start with a small storage/reconstruction prototype and representative fixtures. This resolves the main unknown: whether the system can reduce repeated physical content while retaining the current audit and report contracts. Then add lifecycle logic and validate a full candidate database. Review those measured results before production cutover. Integrate daily updates last.

A new server, cloud service, fuzzy identity service, and web interface are not required for this first release. A compact history list and posting detail report are enough to test whether the data answers the intended questions.
