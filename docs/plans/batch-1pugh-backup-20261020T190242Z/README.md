# Verified backup on 1Pugh

Status: PASS. The archive and recovery test passed on 2026-10-20.

This folder contains a checked copy of the complete 762-batch archive. The seven original package files use 5,294,226,425 bytes (4.93 GiB). Each file was read back from 1Pugh and matched the trusted local checksum. All 14,875 archived files and 762 batch directories passed the complete content, path, and metadata check. The embedded manifest and gzip trailer passed.

Six complete sample batches were restored from this external archive to a new local APFS test folder. All 117 restored files passed content, path, permission, and modification-time checks. The test copies use 906,049,729 bytes (0.84 GiB) and remain at:

`/Users/adampugh/GitHub/public-job-feed/data/jobs/archives/1pugh-restore-test-20261020T190242Z`

See `EXTERNAL-BACKUP-VERIFICATION.json` for the current external backup results. The original `verification.json`, `README.md`, and `SHA256SUMS` are preserved historical records. Their statements about the lack of an independent backup describe the initial archive build, before this copy was made. The earlier restore-test folder described in README.md was not copied to this drive.

## Recovery

Use the checksum and restore instructions in README.md. Keep this package together. Restore to a new empty folder; do not extract over production files. The archive preserves file contents and ordinary metadata inside the tar file. For an exact Mac metadata restore, use an APFS destination. Direct extraction onto ExFAT does not preserve all POSIX file metadata.

The OneDrive copy failed verification and is not part of this successful backup. The 1Pugh copy is on a separate physical USB drive. Its volume UUID is A56D5D1E-1F58-30E1-9A46-A83B1E5ABDD1. Eject the drive through Finder before disconnecting it.

## Cleanup boundary

No source batches, historical CSV files, databases, recovery copies, or existing files on 1Pugh were changed or deleted by this copy. No disk-format or volume changes were made. Existing uncommitted project work was preserved.

The earlier fresh retention plan and dry run passed for exactly these 762 batches, totaling 49.12 GiB of logical source file sizes. This external backup satisfies the missing independent-backup check. Batch deletion still needs user approval and fresh locked validation immediately before removal. No cleanup is authorized by this record.
