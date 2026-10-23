# Proposed daily history backup

Status: design for review only. The daily launcher and schedules are unchanged.

## Recommended order

After the feed package passes its existing validation:

1. Update history from completed dated packages with the existing writer.
2. Audit the accepted database and verify that all dated packages are imported.
3. Check the external drive by volume UUID, mount path, and device identity.
4. Create a new backup folder. Never overwrite the last verified backup.
5. Copy the closed database while holding the existing history lease. Include
   source packages, file hashes, accepted generation, runtime sources, dependency
   versions, report, and recovery instructions. Do not put a live DuckDB file in
   a cloud sync folder.
6. Verify all copied bytes. Restore into an isolated folder and audit the restored
   database against the restored sources. Mark the backup verified only after
   these checks pass. Skip a new full backup if the accepted generation and all
   source and runtime hashes already match a verified backup.
7. Record feed, history, and backup results separately in the final dashboard.

Use the final cleaned dated package. Do not make another collection request.
Serialize the complete refresh and backup sequence against other refreshes.
The existing board-maintenance lock alone does not cover later package writes.
Recheck the source manifest before and after the backup. The source files must
not change while the backup runs.

## Missing drive or failed backup

The required drive is 1Pugh, UUID
`A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1`.

If it is absent, show `Feed: complete; History: passed; Backup: skipped - drive
not connected`. Do not create a normal local folder at `/Volumes/1Pugh`.
If copying or validation fails, show a backup failure and keep the previous
verified backup. Keep the incomplete attempt for review. A later run may retry
in a new folder. Do not change a successful feed result to imply its data failed.
Show the date of the last verified backup and the latest backed-up snapshot.
If the history update or audit fails, do not back up that result as accepted.

## Storage and retention gate

The current history writer keeps a prior database and runtime records for every
accepted replacement. It has no tested backup-expiry command. Its disk guard
limits operation storage to 16 GiB and requires at least 32 GiB free. These limits
are stop conditions; they are not a retention policy.

Before enabling daily unattended updates, add and test safe expiry of accepted
old operations. Preserve the active generation, pending operations, required
rollback records, and verified external recovery copies. Never delete a backup
that the recovery journal still requires. Do not edit journals by hand.

Agree a retention period for verified external generations. Do not add automatic
deletion under this plan. Exact duplicate source packages could later be stored
once by content hash, but this needs a complete restore manifest and tests. Start
with the simpler complete recovery package used in this review.

## Required integration tests

- Missing drive, wrong UUID, and same-name local directory.
- Insufficient space, disconnect, short copy, corrupt archive, and hash mismatch.
- An active history writer, a second refresh, and source changes during copying.
- Interrupted backup and retry; previous verified backups stay intact.
- No new history: no duplicate backup for unchanged bytes.
- Restored database audit, all source-file hashes, and restored report output.
- Separate status results for feed, history, and backup.
- Recovery after accepted-operation expiry, before any retention feature is enabled.

The one-time backup helpers in this folder are evidence for this run. They are
not installed daily commands and must not be appended to the launcher as-is.
