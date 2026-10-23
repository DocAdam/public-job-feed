# Cloud backup and batch retention review

Status: Do not delete the batches. The independent backup failed verification.

## Results

- PASS: The original archive outside OneDrive has 5,285,897,960 bytes and SHA-256 `95c22f553d48dc5a05b33554acbaf90742f5fdfb294f16d73105c1b884079fb1`.
- PASS at the first check: All six files in the trusted checksum list matched in both local locations. See `backup-check.json`.
- FAIL: A download from the OneDrive website saved an empty archive. Chrome reported `0 B — Done`. The online folder showed the archive name with a blank size field.
- FAIL at the later check: The archive in the local OneDrive folder had also become zero bytes. The original archive outside OneDrive still passed its checksum. See `backup-recheck.json`.
- NOT VERIFIED: A restore from the cloud copy. The empty download cannot be restored. No second full archive or restore test was run on it.
- PASS: The fresh retention plan and non-deleting dry run identify the same 762 archived batches. No extra candidates or excluded archived candidates were found.
- PASS: Source input fingerprints match the archived plan. Current board state and the retained subset match for 29,551 boards. All 590,622 saved fetch events match; 185,491 belong to the candidate batches.
- PASS: The shared maintenance lock was released after both checks. The dry run deleted zero folders.

## Space and recovery

The 762 candidate folders contain 52,741,474,676 logical bytes (49.12 GiB). This is potential file-size reduction, not a promise of immediate free disk space. No space was recovered in this review.

The original archive, source batches, and earlier restored samples remain available. The empty cloud download is kept at `data/jobs/archives/cloud-download-20261020T185759Z/batches.tar.gz` as evidence. Existing archive records were not rewritten.

The cause of the empty cloud copy is not established. This review did not reset OneDrive, replace or delete cloud files, or change source data. The observed change in the OneDrive folder must not be treated as source-preservation success.

## Next step

Create a new independent backup from the verified original. Use a new cloud folder or a separate physical drive. Preserve the failed copy until the issue is reviewed. Verify a fresh download or drive readback against the trusted checksum, then verify archive contents and a bounded restore with the existing helper. Use a new empty restore directory and preserve repository-relative paths. Do not extract over production files.

The automatic follow-up is paused because this review is complete and the backup failed. Obtain user approval before any batch deletion. Before approved deletion, regenerate the retention plan and repeat the dry run under the shared lock; plans expire after 24 hours or an input change.
