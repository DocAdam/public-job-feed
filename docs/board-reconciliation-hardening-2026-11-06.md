# Board reconciliation changes and evidence review: 2026-11-06

**Derived read-only review. No saved data repair was applied.**

The approved work fixed the five QA failures, added a repository copy of the dry-run script, and repeated the saved-data review. The full suite passed: **49 checks passed, zero failed, and one known hash limit was confirmed**. The wrapper exited with code 0. The data-review worker exited with code 2 because evidence gaps remain.

## Files changed

| File | Change |
| --- | --- |
| `src/scripts/reconcile-board-state-dry-run.cjs` | Added the repository script from the original temporary draft. Added startup identity and uniqueness checks, exact path membership, and descriptor reads with macOS path controls. |
| `src/scripts/verify-board-reconciliation.cjs` | Added descriptor tests, file and directory link replacement tests, within-read change tests, unsupported-platform checks, exact coverage precedence, and a saved-data review extract. |
| `docs/board-reconciliation-test-plan-2026-11-06.md` | Updated commands, acceptance results, controls, tests, and limits. |
| `docs/board-reconciliation-verification-after-fixes-2026-11-06.json` | Added the complete current test report, source hashes, test audits, date proposals, and legacy date-support review. |
| `docs/board-reconciliation-hardening-2026-11-06.md` | Added this change record and evidence review. |
| `README.md` | Added links to the reconciliation plan and this review. Existing edits were preserved. |

The initial report, `docs/board-reconciliation-verification-2026-11-06.json`, and the original temporary draft were preserved. The original board-identity assessment and its companion were read without edits. The active history database was not opened. No dependencies were added. No index changes, commit, push, PR, refresh, publication, or Job Finder change was made.

## Startup and file controls

1. Check Node.js 26.x, macOS, the working directory, and the branch. Stop on unsupported platforms.
2. Read the assessment. Check 14 unique confirmed boards, 18 unique affected board-and-field pairs, and 336 distinct legacy BambooHR cases. Check each saved board key, slug, company key, date field, and legacy coverage identity before reading state, coverage, or logs.
3. Reject absolute paths, backslashes, null bytes, dot segments, and non-normalized paths. Permit only the three fixed input paths and log paths from the validated assessment manifest.
4. Open each input with read-only and nonblocking flags plus Darwin `O_NOFOLLOW_ANY = 0x20000000`. This is one kernel operation. It rejects symbolic links in the final file and every parent path component. Read through the opened descriptor. Do not reopen the pathname to get contents.
5. Require a regular file. Compare descriptor device, inode, size, modification time, and change time before and after each read. Check the byte count. Close the descriptor in `finally`, including error paths.
6. Preserve the second-read SHA-256 comparison. A changed digest stops the run with exit code 1 and no report. Recheck missing inputs through the same protected read operation.

The macOS flag is defined in the [Apple kernel header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h). It was tested on this local system with Node.js 26.3.1 and Darwin 25.6.0. There is no fallback that accepts parent-directory links. This change adds no runtime package.

## Verification evidence

- The original five failed checks now pass.
- Incorrect counts, duplicate fields, and invalid legacy identities stop after the assessment read. They do not reach state, coverage, logs, or SQLite.
- File links, parent-directory links, and replacements immediately before open are rejected before linked contents are read. A replacement after open cannot redirect the existing descriptor. The final verification rejects that changed path.
- A separate parent process changes only temporary fixture files. Acknowledgement barriers fix the test order. No timing sleeps are used.
- A persistent log change fails the second hash comparison. A change during the descriptor read fails the metadata check. Both cases exit with code 1 and produce no report.
- Read descriptors are closed after success and failure. The saved-data run used descriptor reads for all target input bytes.
- The worker grants no filesystem-write permission. Write, delete, rename, metadata, promise API, file-backed SQLite, attachment, backup, and extension tests are denied. SQLite reports one in-memory database.
- The protected board state and local consumer file have the same content, size, mode, inode, and modification time before and after the suite.

Current target SHA-256: `5120af58b5c6c88349091ad8ad4427f0ec953399d50416607121dd2ce4f772ae`.

Current wrapper SHA-256: `1f1392d948a9e0502685e98163f1396778a7b866102c16af737c89303d9f2e66`.

Assessment SHA-256: `b3f939163a325670f912d6d79dec8b484a19bacd7dba6b780487b502712d56ae`.

Full results: [verification after fixes](board-reconciliation-verification-after-fixes-2026-11-06.json). The saved-data result includes 1516 input-file hashes and their current paths. All were read again before the report was emitted.

## Seven retained date candidates

The cutoff is `2026-11-05T11:53:44.365Z`. Current board state is generated at `2026-11-06T11:22:54.459Z`. All 18 affected fields passed the existing state guard. That guard compares the fetch dates, statuses, errors, counters, retry date, job counts, and coverage status. It does not assert that every current record field is identical to the older snapshot.

Each candidate below has exact-board raw-log and monthly-history evidence at or before the cutoff. Each mismatched saved date also has the required different-board evidence. These are latest dates within the retained source set. They do not prove a complete historical sequence.

| Board | Field | Saved value | Retained candidate | Exact event status | Saved fetch status |
| --- | --- | --- | --- | --- | --- |
| `ashby\|axiom-co` | `LastAttemptAt` | `2026-11-01T10:00:16.732Z` | `2026-10-27T10:40:49.146Z` | `success` | `empty` |
| `ashby\|axiom-co` | `LastSuccessAt` | `2026-11-01T10:00:16.732Z` | `2026-10-27T10:40:49.146Z` | `success` | `empty` |
| `ashby\|bland-ai` | `LastAttemptAt` | `2026-11-01T22:00:14.906Z` | `2026-10-31T09:01:03.186Z` | `failed` | `success` |
| `ashby\|cside` | `LastAttemptAt` | `2026-10-31T21:00:22.091Z` | `2026-10-28T21:01:04.641Z` | `failed` | `failed` |
| `ashby\|duckduckgo` | `LastAttemptAt` | `2026-11-02T22:00:26.890Z` | `2026-11-01T10:00:15.525Z` | `failed` | `success` |
| `ashby\|finnihealth` | `LastAttemptAt` | `2026-11-02T22:00:36.204Z` | `2026-11-01T10:00:15.667Z` | `failed` | `success` |
| `ashby\|meridian-ai` | `LastAttemptAt` | `2026-11-02T10:00:30.856Z` | `2026-11-01T22:00:17.322Z` | `failed` | `failed` |

Four boards have a saved fetch status that differs from the candidate event status: `ashby|axiom-co`, `ashby|bland-ai`, `ashby|duckduckgo`, and `ashby|finnihealth`. Date-only changes could leave those records inconsistent. This review does not infer replacement statuses, counters, counts, or retry dates.

Candidate evidence locations:

| Board | Source batch | Raw reference | Monthly-history reference |
| --- | --- | --- | --- |
| `ashby\|axiom-co` | `maintain-due-ashby-20261027t104040` | `data/jobs/batches/maintain-due-ashby-20261027t104040/jobs-batch-fetch-log.json`, JSON array item 67 | `data/jobs/index/history/fetch-events/2026-10.jsonl.gz`, JSONL line 15121 |
| `ashby\|bland-ai` | `maintain-due-ashby-20261031t090004` | `data/jobs/batches/maintain-due-ashby-20261031t090004/jobs-batch-fetch-log.json`, JSON array item 408 | `data/jobs/index/history/fetch-events/2026-10.jsonl.gz`, JSONL line 17262 |
| `ashby\|cside` | `maintain-due-ashby-20261028t210003` | `data/jobs/batches/maintain-due-ashby-20261028t210003/jobs-batch-fetch-log.json`, JSON array item 451 | `data/jobs/index/history/fetch-events/2026-10.jsonl.gz`, JSONL line 15490 |
| `ashby\|duckduckgo` | `maintain-due-ashby-20261101t100005` | `data/jobs/batches/maintain-due-ashby-20261101t100005/jobs-batch-fetch-log.json`, JSON array item 59 | `data/jobs/index/history/fetch-events/2026-11.jsonl.gz`, JSONL line 17 |
| `ashby\|finnihealth` | `maintain-due-ashby-20261101t100005` | `data/jobs/batches/maintain-due-ashby-20261101t100005/jobs-batch-fetch-log.json`, JSON array item 60 | `data/jobs/index/history/fetch-events/2026-11.jsonl.gz`, JSONL line 21 |
| `ashby\|meridian-ai` | `maintain-due-ashby-20261101t220005` | `data/jobs/batches/maintain-due-ashby-20261101t220005/jobs-batch-fetch-log.json`, JSON array item 73 | `data/jobs/index/history/fetch-events/2026-11.jsonl.gz`, JSONL line 231 |

All source paths above are relative to the repository. History line numbers refer to uncompressed JSONL. The complete current source hashes, original row values, URLs where recorded, and sibling-event references are in the machine-readable verification report. Missing source URLs remain null.

## Eleven fields without replacement evidence

All 11 fields are `LastSuccessAt`:

- `ashby|bland-ai`: saved `2026-11-01T22:00:14.906Z`.
- `ashby|duckduckgo`: saved `2026-11-02T22:00:26.890Z`.
- `ashby|finnihealth`: saved `2026-11-02T22:00:36.204Z`.
- `ashby|focus-ai`: saved `2026-10-30T09:00:17.957Z`.
- `ashby|himsandhers`: saved `2026-10-28T21:00:52.823Z`.
- `ashby|paradigm-ai`: saved `2026-10-25T21:00:16.686Z`.
- `ashby|plaud-ai`: saved `2026-10-25T21:00:54.168Z`.
- `ashby|scrunch-ai`: saved `2026-10-25T09:00:12.830Z`.
- `ashby|workos-inc`: saved `2026-10-31T09:00:36.993Z`.
- `lever|beetalents`: saved `2026-10-30T09:22:03.128Z`.
- `lever|vevo-ai`: saved `2026-10-29T09:24:33.407Z`.

The inspected source set has no qualifying exact-board success or empty event that supplies a replacement date for these fields before the cutoff. This does not prove that the boards never succeeded. Each staged candidate is null with `NO_SUPPORTED_PROPOSAL; DO_NOT_CLEAR`. The saved dates remain unchanged.

## Legacy BambooHR review

All 336 current cases still depend on company-only coverage. All have `LEGACY_UNRESOLVED` in the in-memory quarantine table. The 672 date slots contain 573 populated dates: 336 attempt dates and 237 success dates. All 573 populated dates have retained exact-board support. The other 99 success-date slots are blank and remain blank. No populated saved date lost its exact-board support.

The quarantine applies to the coverage relationship. Exact-board events remain usable. No board is disabled, and no job row or saved date is changed. An added exact-board fixture takes precedence and removes the current quarantine flag for that fixture. This confirms that future exact evidence can resolve the relationship without discarding the historical snapshot flag.

The November monthly history file has a different hash from the assessment manifest: `data/jobs/index/history/fetch-events/2026-11.jsonl.gz`. The run records the current bytes, applies the original cutoff, and confirms that those bytes remain stable during verification. A different full-file hash does not itself establish a problem in a retained event. The other inspected event-file hashes match the assessment.

## Remaining limits and next decision

The two-read hash does not detect changed bytes that are restored before the second read. Metadata checks cover changes during an individual read; they do not replace a complete record of external writes between reads. Before/after file fingerprints also cannot prove that another process never wrote a file.

The VM is a test interface. The script and native SQLite addon are trusted dependencies. Node permissions do not provide a guarantee against hostile native code. See the [Node permission model](https://nodejs.org/api/permissions.html). The same-input repeat test removes only `generatedAt`; it does not establish invariance under reordered inputs.

The script has no apply mode. The next possible task is a separate, coherent record-repair design for the seven candidates and the related status fields. The 11 success-date gaps still require evidence or an explicit policy. The production legacy coverage policy also remains unchanged. This work does not approve those later repairs.
