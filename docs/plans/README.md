# Completed reviews and historical evidence

This index groups the retained Public Job Feed review records. It was added on
22 October 2026 during the approved P01 document cleanup. It is a derived guide
to the original evidence. Original reports and measured results remain in place.

Earlier reports describe the state at their review date. A statement that a
migration had not started does not override a later accepted migration. A saved
PASS does not establish current runtime health or authorize another operation.

## Current operating guides

| Need | Current guide |
| --- | --- |
| Start a normal refresh and inspect its result | [Project README](../../README.md) and [status dashboard](../status-dashboard.md). |
| Data roles, batch retention, locks, and recovery limits | [Storage lifecycle](../storage-lifecycle.md). |
| Daily history, managed backups, restore, and retention | [Daily history and backup](../daily-history-backups.md). |
| Package and report scope | [Daily reports](../daily-job-reports.md) and [data guide](../public-job-feed-data.md). |

## History storage and migration

The accepted migration record follows the earlier design, prototype, and test
records. Keep the earlier failures and limits when reading the later results.
The snapshot counts below belong to those records, not to the current database.

| Stage | Original records | How to use them |
| --- | --- | --- |
| Design | [Lifecycle plan](job-history-lifecycle-plan.md), [plan review](job-history-lifecycle-review.md), and [source evidence](job-history-lifecycle-evidence-2026-10-19.json). | Historical proposal and requirements. Later implementation records control delivered behavior. |
| Initial prototype | [Storage review](job-history-storage-prototype-review.md) and [results](job-history-storage-prototype-results.json). | Sample preservation results and the initial memory problem. |
| Bounded processing | [Lifecycle review](job-history-bounded-lifecycle-review.md) and [results](job-history-bounded-lifecycle-results.json). | Sample limits and remaining full-history gates at that stage. |
| SQL and recovery | [Review](job-history-compaction-sql-recovery-review.md) and [results](job-history-compaction-sql-recovery-results.json). | SQL and failure checks; the memory finding was still open. |
| Compaction memory | [Review](job-history-compaction-memory-review.md) and [results](job-history-compaction-memory-results.json). | Later measured memory results. |
| Old-format control memory | [Review](job-history-validation-memory-review.md) and [results](job-history-validation-memory-results.json). | Control-build and comparison limits. |
| Full temporary candidate | [Review](job-history-full-candidate-review.md) and [results](job-history-full-candidate-results.json). | Initial full-history failures. This was not migration approval. |
| Full-history memory follow-up | [Review](job-history-full-memory-review.md) and [results](job-history-full-memory-results.json). | Later successful tests and retained failures. |
| Writer integration | [Review](job-history-integration-review.md) and [results](job-history-integration-results.json). | Command effects, replacement and recovery contracts, and isolated qualification limits. |
| Migration proposal | [Plan](job-history-migration-plan.md) and [evidence](job-history-migration-plan-evidence.json). | Original approval conditions. A proposed record is not an execution approval. |
| Accepted migration | [Production review](job-history-production-migration-review.md) and [results](job-history-production-migration-results.json). | Accepted on 19 October 2026, with 152 snapshots at that time. Retain the exact approval, backup, journal, and source bindings. |

## Retention and completed cleanup

| Operation | Original record | Reading limit |
| --- | --- | --- |
| Initial retention review | [Plan](job-history-retention-plan.md), [inventory](job-history-retention-inventory.json), [results](job-history-retention-results.json), [batches](job-history-retention-batches.json), and [extra records](job-history-retention-extra.json). | Old quantities are not a current removal list. |
| Old history test-folder cleanup | [Final receipt](job-history-test-cleanup-20261020/README.md). | Two old temporary folders were removed. Keep the saved test records and their manifest. |
| Monthly history writer | [Review](monthly-history-writer-20261020/README.md). | Records the writer fix and an independent concurrent refresh. Its output exceptions remain part of the evidence. |
| Batch-retention safeguards | [Review](batch-retention-safeguards-20261020/README.md). | Tested guards and the old plan. A new plan must pass the current checks. |
| Complete batch archive | [Archive review](batch-archive-20261020/README.md). | Archive creation and synthetic tests. Later records cover the independent copy and approved removal. |
| Failed cloud copy | [Failure record](batch-cloud-review-20261020T185759Z/README.md). | Keep the failed zero-byte-copy evidence. It is not a usable recovery copy. |
| Verified 1Pugh batch copy | [Verification record](batch-1pugh-backup-20261020T190242Z/README.md). | Verification at that date. External media were not rechecked by P01. |
| Approved batch cleanup | [Final receipt](batch-cleanup-20261020T192135Z/README.md). | Exactly 762 folders were removed then. Do not reuse its removal list. |
| History update and backup | [Final receipt](history-backup-20261021T120102Z/README.md). | History and backup results at that date. Preserve source bindings and restore checks. |
| Approved restore-test cleanup | [Final receipt](restore-test-cleanup-20261021T123910Z/README.md). | Three old restore-test folders were removed then. Original manifests remain evidence of their former paths. |

## Refresh lock and daily backup records

- The [refresh-lock checks](refresh-lock-fix-20261021T110028Z/focused-checks.json)
  record successful isolated tests. The
  [stop record](refresh-lock-fix-20261021T110028Z/stop-validation.json) says that
  the October 21 refresh stopped at the user's request. It was not a completed
  refresh or a full-suite result. Keep the duplicate-run and lock records beside it.
- The [daily-backup integration review](daily-history-backup-20261021T130514Z/README.md)
  records implementation and isolated tests. Its first-production-run limit
  describes that phase. Use the current operating guide and saved runtime
  reports to assess a later run.
- During P01 review, saved `data/jobs/reports/refresh-run.json` and
  `daily-history-backup.json` used the same run ID
  `07b4e7ee-68de-44eb-846e-4ba6a37350f2`. They recorded refresh `COMPLETE`,
  history `PASS`, and backup `PASS` on 22 October 2026, for snapshot
  `20261022-0622`. The backup report time was `2026-10-22T11:35:41.477Z`.
  P01 did not run a refresh or independently restore that external backup.

## October 23 accepted-history checkpoint

The [dated checkpoint](history-checkpoint-2026-10-23.md) records the last accepted
155-snapshot generation and the later source hash failure. The October 23 feed
completed, but history failed and backup did not run. The unchanged generated
history companions remain evidence of the accepted generation, not a current
source audit. No repair or new data removal is part of the commit cleanup.

The retained operation records, synthetic fixtures, and 40 original logs are
included in Git with their original paths. The logs are explicit historical
exceptions to the general log ignore rule. Future run logs remain ignored.

## Duplicate logs removed by P01

The three removed files below matched retained logs in the same operation
folder, by full byte comparison and SHA-256. No current command, guide, or test
used the extra path in the checked source tree. No log content was discarded.

| Former path below this folder | Retained path below this folder | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `daily-history-backup-20261021T130514Z/full-suite.log` | `daily-history-backup-20261021T130514Z/full-suite-final.log` | 9,897 | `97fe2ee481f2269aa859c5fe8533e93c1da2e7c2b3915b2bee2a218c4f0dcf40` |
| `batch-retention-safeguards-20261020/jobs-test-batch-history-final.log` | `batch-retention-safeguards-20261020/batch-history-final.log` | 2,815 | `d28e8f6d8ceb23ac424ae783bba4383f28e90f3ebab86c075c619aaa4f284051` |
| `batch-retention-safeguards-20261020/test-failure-investigation-final.log` | `batch-retention-safeguards-20261020/failure-investigation-final.log` | 41 | `e61ba6c3c7f9942db7a883978f5a13ab36f8e68260e0da816769c5fa745694c7` |

Old protection inventories remain unchanged. They describe the files present
when those checks ran. Use the table above to locate equal retained log bytes;
do not rewrite those original inventories to describe a later cleanup.

Other equal files remain. Separate plan bindings, operation baselines,
production/restored audits, empty error streams, and synthetic fixtures have
distinct evidence roles. Equality alone does not make them redundant.

## Rules for future record maintenance

1. Keep current instructions in the operating guides. Update this index and the
   root README in the same change when a document moves.
2. Preserve original results, approval records, hashes, manifests, failures,
   source references, and recovery bindings. Keep unresolved limits visible.
3. Keep historical paths stable where manifests or recovery records use them.
   Record a verified replacement path before removing an extra copy.
4. Do not run old execution helpers such as `checks.py`, `execute.cjs`, or
   `run.cjs` as maintenance commands. They record a completed operation and can
   contain old target paths or write production state. Use the current guide
   and obtain approval for a new exact operation.
5. Keep working tests and synthetic fixtures. Do not remove files because their
   names contain `test`, `audit`, `migration`, or `generated`.
6. Back up the approved scope, verify recovery, check references and links, and
   record checks and limits. A historical success does not approve new removal.
