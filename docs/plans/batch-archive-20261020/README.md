# Complete archive of 762 batch folders

Status: **PASS**. The complete archive is created and verified. All source data remains unchanged. No source deletion is approved by this review.

## Completed result

| Check | Result |
| --- | --- |
| Exact candidate folders | 762 archived |
| Source files | 14,875 verified |
| Source directories | 762 verified |
| Original file bytes | 52,741,474,676 bytes (49.12 GiB) |
| Complete archive | 5,285,897,960 bytes (4.92 GiB) |
| Restored sample batches | 6 complete batches, all six job systems |
| Restored files | 117 verified again from disk |
| Kept restore-test data | 906,049,729 bytes (0.84 GiB) |
| Protected original files and links | 40,412 unchanged |
| Source deletions | 0 |
| Independent backup copy | Not created; archive is on the source disk |

Every archived source file passed its SHA-256, size, path, permission, and modification-time checks. The embedded manifest matched the external manifest. The complete gzip stream passed its trailer check. Each restored sample file passed an independent disk read and hash comparison, plus path and metadata checks.

The six restored batches include the largest candidate, `maintain-due-greenhouse-20260816t210002`. All test copies remain in `restore-test/` for review. Nothing was deleted to make space. Archive and restore copies add about 5.77 GiB, including sidecar files; source space reclaimed in this phase is zero.

The protected-data comparison found no changed, missing, or added files among the original batches, CSV packages, database, recovery and migration files, index/history files, and five older archives. Original directory timestamps and access times are outside this file-content check. The temporary maintenance lock was released after success.

Archive SHA-256:

```text
95c22f553d48dc5a05b33554acbaf90742f5fdfb294f16d73105c1b884079fb1
```

The completed archive is `data/jobs/archives/20261020-762-batches/batches.tar.gz`. Its manifest, reviewed plan, verification record, checksum list, portable helper, and recovery instructions are beside it.


## Scope

Create one compressed archive of the exact 762 candidates in the reviewed retention plan. Preserve the source files and relative paths. Verify every archive member against SHA-256 source hashes. Restore six complete sample batches into a new folder and verify their bytes, paths, permissions, and modification times. Keep those restore copies for review. No source deletion is part of this task.

The destination is `data/jobs/archives/20261020-762-batches/`. This is on the same local disk as the source data. It is not an independent backup.

## Format and safety checks

The archive is standard gzip-compressed PAX tar. Every source file retains its repository-relative path, starting with `data/jobs/batches/`. An embedded `__archive__/manifest.json` lists every file and directory, source checksums, sizes, modes, modification times, the source root, the exact batch names, and the reviewed plan binding. A separate copy of the manifest permits checks without extracting the archive.

The source folders are read only. The existing batch-maintenance lock is held across source fingerprint checks, archive creation, verification, restore testing, and the final protected-data comparison. The archive writer refuses existing output files. It uses a `.partial` name until all checks pass.

Archive checks reject missing or extra paths, duplicate entries, path traversal, links, changed content, wrong sizes or modes, changed timestamps, a mismatched manifest, truncation, and gzip checksum errors. Every source file is checked while it enters the archive. Every archived file is read and hashed again during verification. Restored sample files are then read from disk and checked separately.

The initial and final protection scans cover the batch files, CSV packages, database, recovery and migration files, index and monthly history, and all five older archives. The new archive folder and the transient maintenance lock are excluded from those scans. The new output is checked through its own manifest and verification record.

## Restore samples

The sample selection includes the largest candidate batch, plus a nonempty batch from each other job system. Each sample is a whole batch, including its reports and fetch logs. The samples cover Ashby, BambooHR, Greenhouse, iCIMS, Lever, and Workday. Original paths are retained below `restore-test/`. These are test copies, not production input folders.

## Tests and evidence

The archive helper passed 17 isolated checks before production use. They include nested paths, Unicode, empty files, binary data, modification times, overwrite refusal, invalid paths, unknown restore selections, damaged contents, duplicate members, truncation, and a bad gzip checksum. All four Python scripts and the JavaScript lock wrapper passed syntax checks. The six top-level archive files also passed the independent `shasum -a 256 -c SHA256SUMS` check. `git diff --check` and explicit whitespace checks passed. Small synthetic fixtures are kept in this review folder. `unit-tests.json` records the final test results.

- `run.log`: production progress and results.
- `protected-before.jsonl.gz`: original protected-file hashes and metadata.
- `protected-after.json`: final protection result, when complete.
- `verification.json`: archive and restore results, when complete.
- `archive_batches.py`: standard-library archive and verification helper.
- `run_archive.py` and `run_locked.cjs`: bounded one-time run, source checks, and lock boundary.
- `test_archive.py`: isolated tests; synthetic records only.

## Recovery limits

File contents, relative paths, ordinary permissions, and modification times are checked. Original ownership IDs are recorded in the archive, but the test restore uses the current user's ownership. No claim is made for macOS extended attributes, ACLs, Finder metadata, or creation times. The archived data consists of the saved batch records, not original unmodified ATS API responses that the collection process did not save.

A standard tar tool can read the archive. Restore only into a new empty folder; do not extract over current production files. Use the manifest and the verification helper to check restored contents. Keep the archive, manifest, checksum file, and verification record together.

Before any source cleanup, review the completed evidence, arrange a checked copy on separate storage, refresh the retention plan, and obtain approval for the exact source list. No source cleanup follows automatically from archive creation.
