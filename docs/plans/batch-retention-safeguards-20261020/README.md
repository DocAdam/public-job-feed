# Batch retention plan and safeguard review

Reviewed: 20 October 2026. Status: implemented, tested, and checked against saved production data. **No production batches were removed.** This review does not approve deletion.

## Fresh plan

The plan uses the saved index and source files. It does not update the index or the job-history database. The policy keeps raw batches for 30 days, keeps every current board source regardless of age, and keeps folders that need review.

| Decision | Batch folders |
| --- | ---: |
| Keep current source | 751 |
| Keep recent | 381 |
| Candidate for later removal | 762 |
| Keep for review | 4 |
| Total | 1,898 |

The candidate folders contain **52,741,474,676 logical bytes (49.12 GiB)**. This is an estimate of recoverable space. APFS shared blocks and filesystem snapshots can change the actual free-space gain. Space recovered in this phase: **zero**.

The complete candidate list is in `batch-retention-plan.csv` and `batch-retention-plan.json`. The Markdown summary is `batch-retention-plan.md`. The manifest binds the list to source hashes, its policy, creation time, and check results. It was generated at 2026-10-20T11:51:10.005Z. The executor refuses it after 24 hours or after any bound input changes. A later cleanup must use a fresh, reviewed plan.

## Checks against saved data

- All 1,898 indexed folders match the on-disk batch inventory.
- All **590,622 raw fetch records** match saved history events, including diagnostic fields.
- The 762 candidates account for **185,491** of those fetch records.
- Both the full input set and the retained subset reproduce all **29,551 current board records**, including job count.
- All saved monthly files passed the existing event identity, duplicate, gzip, JSON, and record-size checks.
- The planner hashed all batch files, index JSON, board state, and monthly history. It also compared file identities and metadata before and after validation.
- The actual retirement entry point repeated these checks in **dry-run mode**. Result: `Applied: false`, `Validation: PASS`, `DeletedCount: 0`.

The dry run took 64.92 seconds and reached 542,212,096 bytes of process memory (517.09 MiB), measured by macOS `time -l`. These are observed values, not fixed resource limits. The run used a 768 MiB JavaScript heap limit. Raw payload hashes are streamed; saved history is read one month at a time. Required event signatures are held in memory.

## Safeguards and review

One shared lock covers collection, the whole index operation, planning, and retirement. Indexing acquires it before reading inputs or writing outputs. Retirement holds it through validation and the last removal. Collection uses it before its first run marker. A competing command stops; it does not wait in a queue. This also prevents two separate collectors from writing to the same batch root at once. Concurrent board requests inside one collector remain supported.

The executor rejects a changed row list, changed source file, changed decision, missing manifest, expired plan, mismatched inventory, unsafe path, symbolic link, damaged history, missing event, or changed board state. It recalculates the proposed decisions and repeats the source checks; it does not trust an action label in the CSV or JSON alone. Row-only plans from the old planner cannot be applied.

The lock is kept after a killed process. Unknown or stopped owners need manual review; a timeout does not remove their lock. After interrupted indexing, retain raw batches, review both locks, recover monthly staging if needed, and complete an approved index retry before planning again. A lock file is not proof of a complete index.

Code review checked the lock boundary, owner-specific release, source binding, exact current-state comparison, event coverage, and refusal paths. Tests also check the real index entry point before it can write, and the retirement operation immediately before removal. No production indexing, collection, database update, or deletion ran in this task. Only synthetic fixture folders were removed in tests.

## Tests

All six regression commands passed:

```text
npm run jobs:test-batch-history
npm run jobs:test-catalog-maintenance
node src/scripts/test-failure-investigation.js
npm run jobs:test-board-freshness
npm run jobs:test-history
npm run jobs:test-history-content
```

The batch-history command now includes **22 retention test groups**, the **18 existing monthly recovery groups**, and the original history checks. The failure-investigation suite passed 94 checks. The final targeted rerun covers the last lock and test changes. `checks.json` and `final-checks.json` record commands, exit codes, and log files.

The retention tests cover policy decisions, deterministic output, manifest round trips, dry runs, synthetic removal followed by two real index rebuilds, saved-event preservation, changed files, unknown or missing folders, changed index/state, missing or damaged history, diagnostic conflicts, pending history locks, invalid paths, symbolic links, changed plans, unknown versions, expiry, and changes during planning.

A real child process holds the index lock while other commands try to enter. The tests kill that child and confirm that its lock still blocks work. Other tests hold the retirement lock during validation and immediately before synthetic removal, then confirm that the real index command stops without changing its output. Collector and planner lock use is also tested. Tests do not fetch jobs.

All 12 changed JavaScript files passed syntax checks. `git diff --check` passed. New JavaScript files also passed an explicit trailing-whitespace check. Earlier local work remains in place; it was not committed or reset.

## Files changed in this phase

- `src/lib/batch-maintenance.js`: shared exclusive lock, owner checks, directory checks, and pending history-lock check.
- `src/lib/batch-retention.js`: source fingerprints, policy decisions, current-state and event checks, guarded dry run and removal.
- `src/lib/batch-run.js`: collection uses the shared lock.
- `src/scripts/fetch-batch-jobs.js`: rejects nested or traversal batch names so collection cannot use a different lock root.
- `src/scripts/index-batches.js`: locks the entire operation; stops before writes if monthly history needs recovery; no longer treats arbitrary directory-read errors as an empty inventory.
- `src/scripts/plan-batch-retention.js`: guarded planning, a manifest, and a separate review output folder option.
- `src/scripts/retire-batches.js`: manifest validation and repeated checks under the shared lock; separate plan and result folder options.
- `src/lib/batch-history.js` and `src/lib/batch-history-ledger.js`: export existing event projection, month, validation, and reader helpers for reuse. No change to their metric or event definitions.
- `src/scripts/test-batch-retention.js`: new isolated retention and concurrency tests.
- `src/scripts/test-batch-history.js` and `src/scripts/test-batch-history-recovery.js`: run the new suite and include the lock module in the copied index fixture.
- `docs/storage-lifecycle.md`, the parent retention plan, and this review folder: policy, commands, results, and limits.

No dependency or package command was added. No commit, push, publication, or Sheets update ran.

## Limits before removal

1. **Decide whether to archive full raw payloads.** The monthly ledger keeps fetch events. It does not preserve every historical job description, raw export field, or batch report. The saved CSV snapshots and warehouse are separate records; this review does not claim that they reproduce every batch payload.
2. **Review the exact fresh candidate list and approve removal.** This phase stops at a checked proposal. It gives no deletion authority.
3. **Stop writers that bypass the shared lock.** Direct file edits, older processes that loaded earlier code, and low-level helper calls are outside the shared batch boundary. Metadata checks detect changes during validation but cannot control arbitrary external writes after validation.
4. **Keep a recovery method for raw files if removal is approved.** Multi-folder removal is not atomic. Interruption can remove part of a list. A subsequent check refuses the changed inventory. Do not automatically retry an old list; review the result and any external archive first.

The before-and-after check passed for **40,407 protected files and links**. Every recorded content hash, file size, modification time, inode, and link target matched. There were no added or missing files in the protected inventory. This includes 37,163 collection-batch files, 289 database/recovery/migration files, all 2,945 package files and links, and 10 index/history files. The temporary maintenance lock was removed. Directory timestamps are not part of this file-content check.

The database, recovery copies, historical CSV packages, collection batches, and current index remain in place. The new package from the prior independent refresh remains as it was at this phase's start; this task did not import it into the warehouse. Preservation evidence is in `protected-before.jsonl.gz` and `protected-after.json`. Final results and source hashes are in `validation.json`.
