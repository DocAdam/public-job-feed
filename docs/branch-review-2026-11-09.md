# Branch review: November 9, 2026

Derived review and local commit record. Branch: `failure-evidence-sampling-v1`.
The user approved review, README updates, and local commits. Push and publication
are outside this task. The branch had five local commits before this review.

## Commit order and changes

| Order | Group | Change |
| --- | --- | --- |
| 1 | Remote report opening | Open the combined report with `code --reuse-window`. Document the shell command requirement and the generate-only command. |
| 2 | Saved history audit | Preserve the existing November 8 validation and companion README: generation `fa50b715-51a5-4346-99b6-2319a43af35b`, 173 snapshots, latest package `20261108-0743`. |
| 3 | Board identity review | Preserve the November 5 assessment, November 6 test reports, read-only reconciliation script, test wrapper, and evidence limits. |
| 4 | Maintenance run records | Record each maintenance pass and catch-up cycle. Keep fetch health separate from queue state. Save completed ATS groups, retain retry state, and report failure, interruption, overlap, and stop reasons. |
| 5 | Substack drafts | Preserve the October 26 full-list draft and review, plus the revised November 2 selections, metadata, source evidence, graphics, and historical validation records. |
| 6 | ISTC talk research | Preserve the October 27 review of all 13 research files, with dated metrics, source references, implementation details, and a proposed 35-minute talk. |
| 7 | Review record | Add this report and a README link to the review. |

Each group includes its relevant root README change. Existing staged and
unstaged versions were saved under `.git/commit-preparation/` before the index
was reorganized. Commits use the latest reviewed working files. No existing
source, draft, generated record, or image was deleted or regenerated.

## Review and checks

No blocking issue was found in the reviewed changes and focused checks.

- `jobs:test-all-remote-report`: passed, including its snapshot tests.
- `jobs:test-passive-launcher`: passed.
- `jobs:test-board-freshness`: passed.
- `jobs:test-catalog-maintenance`: passed, including board identity and resume fixtures.
- `jobs:test-index-run-records`: passed. The fixtures cover success, empty results,
  partial failure, all-failed fetches, retry delay, interruption and restart,
  command failure, initial state creation, unreadable state, lock conflicts,
  no progress, and cycle limits. External fetches are blocked in these fixtures.
- Board reconciliation wrapper, without `--live`: 48 checks passed and one
  known hash limit was confirmed. The prior saved report also includes a
  saved-data integration check; that check was not repeated.
- Changed JavaScript and CommonJS files passed syntax checks. The catch-up
  launcher passed `bash -n`. Changed JSON files parsed. The historical Python
  edition validator compiled without execution.
- The history README and validation generation match the accepted operation.
  The validation database hash agrees with the operation record. The database
  was not opened, scanned, or hashed again.
- October 26 draft: all 735 rows and 785 application-link occurrences match the
  dated CSV order. November 2 revised draft: 39 selected source records and
  44 application links match the saved evidence and order. Its dated source and
  baseline CSV hashes match the evidence. The 748-row arrangement totals agree.
- Both PNG headers specify 1600 by 900 pixels. No image was changed or rendered.
- All 563 local file references in the initially changed Markdown files resolve.
  The checker decodes URL escapes before file lookup. Internal anchors were
  not checked. Final README and review links were checked separately.
- Each exact commit tree was checked for the intended file set, matching file
  contents, and whitespace errors. Focused checks used the same source bytes.

## Limits and remaining work

The full application suite was not run. The VS Code window action was not
executed. The `code` command must be available for the open option.

The reconciliation script is a dated local review tool. It requires Node.js
26.x, macOS, the stated checkout, and this branch. It has no apply mode. Seven
replacement candidates and 11 date fields without replacement evidence are
saved review results. No production board state or legacy coverage policy was
repaired. A two-read hash cannot detect bytes that change and are restored
before the next check.

The November 2 validator and saved result describe the first draft with
40 selections and 45 links. The revised draft has 39 selections and 44 links.
The review file explains the later changes and its prior revision checks.
This branch review checks source records and links; it does not repeat a
complete edition validation or establish current job availability.

ISTC research, source assessments, job counts, and publication references retain
their original dates. They are historical evidence. No new employer-page,
Sheet, Substack, or other live service check was made. No refresh, history
update, backup, repair, schedule change, publication, dependency installation,
Job Finder change, push, or pull request was made.
