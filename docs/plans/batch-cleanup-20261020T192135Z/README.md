# Approved batch cleanup result

Status: PASS. Exactly 762 approved batch folders were deleted after fresh validation.

## Scope and preservation

The deletion list matched the 762 names in the verified archive manifest. It contained 14,875 files, totaling 52,741,474,676 logical bytes (49.12 GiB). No extra batches were added. The backup package on 1Pugh and the local package passed current checksum checks before deletion. Earlier full archive and restore results remain in the separate backup review.

All 25,848 protected files and links matched their before records after cleanup, including hashes and recorded metadata. The protected set includes the 1Pugh package, all local archives and recovery test copies, historical CSV snapshot packages, the production historical database, database recovery copies, retained batches, monthly fetch history, and public feed files. No snapshots or other source data were deleted. Existing project work was preserved.

The existing index workflow refreshed only these derived files: batch-index.json, batch-index.csv, and board-latest-fetch.json. There are now 1,136 batch folders (1,132 usable and four review folders). All 29,551 board records are unchanged. All 590,622 saved history events remain; 405,131 match retained raw fetch rows. The post-cleanup retention plan passed with zero additional candidates. Shared and monthly maintenance locks were released.

## Space result

- Logical files removed: 49.12 GiB.
- Former allocated blocks for the removed paths: 52,787,216,384 bytes. Shared blocks and snapshots mean this is not a guarantee of freed capacity.
- Available disk bytes immediately before deletion: 103,248,539,648.
- Available disk bytes at the protected-file check after deletion: 103,246,655,488.
- Observed net change: -1,884,160 bytes. There is no measurable increase in free disk space yet. Small net changes can include other system activity and the new review records.

Read-only checks found two purgeable Time Machine snapshots, dated October 7 and October 14. Snapshot retention is a likely explanation for the missing free-space increase. The exact share of these batches retained by the snapshots was not measured. No snapshot was mounted, changed, or deleted. Apple explains that macOS removes local snapshots as they age or when space is needed: https://support.apple.com/en-ca/102154

## Validation and evidence

- Existing batch history suite, monthly recovery suite, and retention safeguards: PASS. See tests.log.
- One-time helper syntax checks: PASS (Python and JavaScript).
- Fresh plan, non-deleting dry run, locked validation and approved deletion: PASS.
- Exact deletion-set comparison, protected-file hash/metadata checks, remaining inventory, board-state comparison, and full saved-history checks: PASS.
- git diff --check: PASS.
- No job fetching, Sheets changes, publishing, commits, or dependency changes.

See retirement-result.json for every deleted name; protected-before.jsonl.gz and protected-after.json for preservation evidence; validation.json for summary and measured space; and post-cleanup/ for the new retention check. The copied before-index files are review and recovery evidence and were retained.

## Recovery

Keep the full package at `/Volumes/1Pugh/Public Job Feed Archives/20261020-762-batches` and the local archive at `data/jobs/archives/20261020-762-batches`. Use their README and verification helper to check the archive and restore to a new empty folder. Do not extract over production files. Any later restoration to the collection folder must use the shared maintenance lock and refresh the derived index after validation. The ExFAT drive stores the archive; use APFS when testing exact Mac permission and modification-time restoration.
