# Board reconciliation QA plan: 2026-11-06

**Derived QA report and test plan. Repairs remain staged in memory.**

This plan applies to `/Users/adampugh/GitHub/public-job-feed` on branch
`failure-evidence-sampling-v1`. The current CommonJS target is
`src/scripts/reconcile-board-state-dry-run.cjs`. It requires Node.js 26.x on macOS.
The wrapper records the target hash, its own hash, and the assessment hash in each
report. Results apply to those exact source bytes.

## Acceptance decision

The revised script passes the current suite: **49 checks passed, zero failed,
and one known hash limit was confirmed**. The wrapper exited with code 0.
See the [current results](board-reconciliation-verification-after-fixes-2026-11-06.json)
and the [change and evidence review](board-reconciliation-hardening-2026-11-06.md).
The data-review worker exited with code 2 because 11 affected fields still lack
replacement evidence. That is a data-review result, not a failed QA check.

The [initial results](board-reconciliation-verification-2026-11-06.json) are
preserved. They recorded 36 passed checks, five failed checks, and one hash limit
for the original temporary draft. Its SHA-256 was
`8569ed03504a62fecfd45b8cf86b1ad228b03881d89cda67b9d960c6a4683103`.
The five failures below are now resolved:

| Initial finding | Initial result | Implemented correction |
| --- | --- | --- |
| A duplicate date field keeps the total at 18 | Rejection came after event reads | Check unique board-and-field pairs before state, coverage, logs, or SQLite |
| One legacy case has `SavedState.ATS = ashby` | Rejection came after event reads | Check ATS, slug, board key, company key, and coverage identity at startup |
| The batch directory name is `..` | `allowed(p)` returned true | Reject dot segments and require membership in the exact input list |
| The batch directory name is `.` | `allowed(p)` returned true | Reject dot segments and non-normalized paths |
| A checked log is replaced with a symbolic link | A read followed the link | Open with macOS `O_NOFOLLOW_ANY` and read the resulting descriptor |

The persistent log-change test passed again. A separate process changed a temporary
raw log after the worker's first read. The second read reached the hash comparison,
the target produced no report, and the actual worker process exited with code 1.

The saved-data integration test passed the population and memory-only checks.
It read the actual source files through an exact file list. It produced 18
date-proposal rows and 336 legacy rows. The active history database was not opened.
The protected state and consumer files had the same content and checked metadata
before and after the suite. All read descriptors were closed. No target input was
read through a pathname after it was opened.

## Scope and assumptions

- Treat the target script and installed dependencies as trusted, reviewed code.
- Use Node.js 26.x on macOS and the existing `better-sqlite3` installation. Add no packages.
- Read the assessment at
  `docs/board-identity-state-assessment-2026-11-05.json`.
- Keep the 17 possible exposure cases and the unknown `lever|apex` case outside
  the repair population.
- Use temporary fixtures for every deliberate change, symbolic link, and fault.
- Do not change the original assessment, logs, state, active history, consumer
  export, or the separate Job Finder repository.
- A source that changes during the integration run can cause a valid failure.
  Record that result. Do not stop another process or restore its files.

## Execution controls

The parent process checks the branch and the real assessment before it starts
workers. It checks 14 exact board keys, 18 unique board-and-field pairs, 336
distinct BambooHR cases, and 350 distinct scoped boards. This check is independent
of the target's reported summary.

Each worker runs with Node's permission model, no file-write grant, and no
child-process grant. It loads the native SQLite addon because the target requires
`better-sqlite3`. A restricted filesystem interface permits reads of the exact
input files. Unknown filesystem methods and external module requests fail.
The branch command is a checked test stub; the parent checks the actual branch.

The database interface permits only `:memory:`, the three staging tables, and the
target's known staging statements. It rejects file-backed databases, attachments,
backup SQL, and extension loading. The wrapper checks `PRAGMA database_list`
before closing the staging database.

The parent alone creates and changes fixture files. It uses an acknowledgement
barrier for change tests. There are no timing sleeps. It removes only its own
temporary directory. Test reports go to standard output.

The target validates all scoped cases before reading state, coverage, or logs.
`schemaAllowed(p)` checks path syntax and supported file layouts. `allowed(p)`
also checks the exact input list. Only manifest log paths can extend that list.
The kernel rejects links in all path components during `openSync`. The target
then checks that the descriptor is a regular file, checks metadata before and
after the read, and closes the descriptor in `finally`.

## Test matrix

| Group | Inputs or fault | Required result |
| --- | --- | --- |
| Real assessment | Original companion JSON | Exactly 14 known cases, 18 unique affected fields, 336 BambooHR cases, and 350 distinct boards |
| Baseline fixture | Derived fixture from the assessment | 18 proposal rows, 336 quarantine rows, one memory database, no denied operation |
| Repeatability | Two runs with the same bytes and fixture order | Same complete report hash after removing only `generatedAt` |
| Counts | 13/15 confirmed cases, 17/19 fields, 335/337 legacy cases | Exit 1, no report, no event reads, no SQLite connection |
| Identity and uniqueness | Duplicate board, duplicate affected field, wrong legacy ATS, slug, company, or coverage ATS | Reject before state, coverage, event reads, or SQLite |
| Unsupported platform | A non-macOS platform | Exit 1 before any source read |
| Positive path checks | State, assessment, coverage, and listed logs | `allowed(p)` returns true |
| Unlisted supported format | A valid log layout outside the manifest | `schemaAllowed(p)` returns true; `allowed(p)` returns false |
| Negative path checks | External file, `.env`, package configuration, consumer export, Job Finder path, active history path, and dot segments | `allowed(p)` returns false |
| Negative read checks | External files and configurations | The target's `read(p)` rejects before the wrapper filesystem is called |
| Manifest traversal | Non-normalized path in the source manifest | Exit 1 before an event read |
| Existing file link | A raw-log path is a symbolic link | Exit 1 before link contents are read |
| Existing directory link | A raw-log parent directory is a symbolic link | Exit 1 before link contents are read |
| Link replacement before open | Replace the file or a parent directory with a link immediately before the kernel open | Exit 1, no linked-file read, no report |
| Link replacement after open | Replace the path after the descriptor opens | The first read uses the original descriptor; verification rejects the changed path; no linked-file read |
| Change during a read | Append bytes between the descriptor read and the final descriptor stat | Exit 1, no report, no leaked descriptor |
| Persistent log change | Append bytes after the first raw-log read | Second read detects the new digest, exit 1, no report |
| Change then restore | Change the log and restore the original bytes before verification | Record the hash check's limit; current target does not detect this change |
| Write controls | Write, append, truncate, rename, delete, link, copy, metadata, open, and stream calls | Deny every call; canaries use logical protected paths only |
| Other write routes | Promise filesystem API, file-backed SQLite, attachment, backup, and extension load | Deny every call |
| Coverage precedence | Add exact-board coverage to a fixture | The affected row keeps its snapshot flag but has no current quarantine flag; exact coverage takes precedence |
| Process permission | Real filesystem write to a temporary canary | `ERR_ACCESS_DENIED`; no real protected path is used for this canary |
| Saved-data integration | Actual assessment, state, coverage, and manifest logs | Correct row counts, only staging database, no forbidden operation |
| Protected files | State and consumer before/after fingerprints | Same hash, size, mode, inode, and modification time; preserve absence if missing |

The write-call tests cover these operations against the state path, consumer path,
and a logical path in the separate Job Finder repository: `writeFileSync`,
`appendFileSync`, `truncateSync`, `renameSync`, `unlinkSync`, `rmSync`, `mkdirSync`,
`rmdirSync`, `symlinkSync`, `linkSync`, `copyFileSync`, `cpSync`, `chmodSync`,
`chownSync`, `utimesSync`, `openSync`, and `createWriteStream`. The test interface
rejects other filesystem methods by default. These canaries never reach the real
protected files.

## Run the wrapper

Run from the Public Job Feed repository. Supply the path of the script to review:

```sh
node src/scripts/verify-board-reconciliation.cjs \
  --script "$PWD/src/scripts/reconcile-board-state-dry-run.cjs"
```

Add `--live` to read the actual saved source files. This option does not fetch
jobs, run maintenance, open the active database, or write repair data:

```sh
node src/scripts/verify-board-reconciliation.cjs \
  --script "$PWD/src/scripts/reconcile-board-state-dry-run.cjs" \
  --live > /tmp/board-reconciliation-qa.json
```

The wrapper needs no target exports and does not edit the target source. It runs
the complete source, then calls the existing helpers for path tests. A target with
a different interface can need a wrapper update. Treat such an error as a failed
qualification, not as a passing test.

## Exit codes

| Process | Code | Meaning |
| --- | --- | --- |
| Target worker | 0 | The target completed without its own review flag |
| Target worker | 1 | The target stopped; negative tests require this code |
| Target worker | 2 | The target completed and requires data review |
| Wrapper | 0 | All acceptance checks passed; declared boundaries remain |
| Wrapper | 1 | An acceptance check, prerequisite, or harness operation failed |

The wrapper checks the actual child-process exit code against the target's exit
code. It requires a test result message as well. A crash without a result cannot
pass a negative test. A boundary result never cancels a failed acceptance check.

## Limits and next repair scope

These tests cannot establish an absolute guarantee under all conditions. Node
states that its permission model does not protect against malicious code. The
native-addon grant is a further trust boundary. The VM is a test interface and is
not a security sandbox. See the official
[Node permission documentation](https://nodejs.org/api/permissions.html) and
[VM documentation](https://nodejs.org/api/vm.html).

A two-read content hash cannot detect a change that is restored before the second
read. Before/after fingerprints also cannot prove that another process never
wrote a file. The repeatability test covers the same bytes and the same input
order. It does not prove that reordered, equivalent input produces the same report.

The macOS design uses `O_NOFOLLOW_ANY = 0x20000000`, which Apple defines as
disallowing symbolic links in every path component. See the
[Apple kernel header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/fcntl.h).
The suite tests both file and parent-directory replacement. There is no weaker
fallback for other platforms. `O_NOFOLLOW` alone is not used as a substitute.

After any target change, run the full suite again. Keep the change-and-restore
boundary explicit. The seven date candidates and 11 evidence gaps remain subject
to record-level review. All 336 current BambooHR coverage links remain quarantined
in staging. Actual repairs, counter changes, retry changes, and production
coverage-policy changes require a separate task.
