# Saved verification records

These are dated evidence records. They contain observed results, failed checks, later repairs, source hashes and recovery instructions. Use the date and package ID in each record. A later successful check does not change an earlier failed result.

- [October 24 release](employment-type-release-20261024T142452Z/README.md).
- [October 25 backup recovery and release](backup-recovery-release-20261025T114249Z/README.md).
- [Approved snapshot relocation and backup](backup-recovery-release-20261025T114249Z/approved-relocation-20261025T185336Z/README.md).
- [October 25 Sheet publication](sheet-publication-20261025-0724-20261025T221638Z/final/publication-report.md).
- [October 26 all-remote view](remote-only-view-20261026103340Z/README.md).

## Files retained outside Git

The local `.gitignore` excludes the two copied test projects, temporary restore folders, npm caches, copied baseline data, and duplicate report snapshots. Selected refresh, suite, freshness and backup reports remain in Git. The original reports, packages and test copies remain on disk. No file was moved or deleted for branch closeout.

The approved prior-input symbolic link is also excluded from Git. Its absolute external target is specific to this computer. The [relocation record](backup-recovery-release-20261025T114249Z/approved-relocation-20261025T185336Z/relocation.json) records both paths, complete size, verified SHA-256, date precision and rollback steps. Preserve the external copy.

Some machine records refer to local files that are not in Git. A clone of this repository is not a complete backup or a complete saved-data test environment. For the earlier test-input locations, use [relocated-fixed-inputs.json](backup-recovery-release-20261025T114249Z/isolated/relocated-fixed-inputs.json). Do not run a saved suite until its required inputs are available. Do not use a cleanup command to remove ignored evidence.

The live publication request and rollback files are evidence. Do not execute them without a new state check and the required approval.
