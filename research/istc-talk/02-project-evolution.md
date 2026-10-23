# Project history and evolution

This is a derived timeline. Dates in the Git table are **author dates**, in the recorded `-05:00` offset. They are not feature launch or public release dates. The local working tree also contains later uncommitted implementation.

## The boundary of the evidence

Adam supplied the origin: repeated job searches produced irrelevant results, duplicates, old links, and repeated work. He first used Excel and Power Query, then developed a larger application. That is the intended opening, but it is personal history that the repository does not independently establish. [P01](11-evidence-index.md#p01)

The earliest reachable project commit inspected is `4b257ee8`, dated 2026-08-13. It already includes a large JavaScript and shell application: catalog intake, six provider adapters, title scoring, deduplication, Google Sheets packaging, URL checks, board maintenance, and tests. The initial commit is not evidence that these features were invented on that day. [H01](11-evidence-index.md#h01)

A path search of reachable Git history found no Excel workbook or Power Query `.m`/`.pq` file. This does not prove that none existed outside Git. Saved history validation records package IDs from June, before the initial commit. Those records show retained package history; they do not date the start of the project or the Excel transition. [C34](11-evidence-index.md#c34)

## Chronological Git milestones

| Author date | Commit | Supported milestone | What the evidence does not establish |
| --- | --- | --- | --- |
| 2026-08-13 | `4b257ee8` | Initial imported Public Job Feed implementation. Includes collection, normalization, maintenance, export, package, link, and test scripts. | Start date, original Excel files, or the order in which imported subsystems were built. |
| 2026-08-14 | `7306e44b` | Adds architecture foundation and extracted core modules. | Complete replacement of operational `src/lib/` routes. They remain active today. |
| 2026-08-14 | `b5cfb06b` | Adds SQLite-backed streaming export staging and a worker-based run store. | Production cutover or a measured production speedup. |
| 2026-08-14 | `596d2fe4` | Adds parity comparison, test-only publishing, and a streaming command dispatcher. | Permission to publish streaming output to the public root. |
| 2026-08-24 | `b60ba443` | Adds approved direct-employer submissions. | A general web crawler or acceptance of any submitted URL without review. |
| 2026-08-24 | `a38d658b` | Adds TalentBrew probing. | Routine TalentBrew inclusion in batch collection and merge. |
| 2026-08-25 | `5796d5a8` | Adds managed generated-data retention. | Deletion of every old artifact, or the later storage safeguards already being present. |
| 2026-08-29 | `ff97e87c` | Adds public ATS connection guides. | Provider contracts or permanent validity of the sample mappings. |
| 2026-09-01 | `5bedf13b`, `b06d4eb4` | Adds and then adjusts the shortcut for a U.S.-remote comparison report. | A broad labor-market trend measure. |
| 2026-09-01 | `91d0ab6b` | Uses reviewed public-link overrides for particular jobs. | A universal repair rule for all jobs at those employers. |
| 2026-09-01 | `f6ab1a92` | Adds removal of confirmed empty Ashby job shells. | That every HTTP 200 job page is valid, or every generic page on another host is invalid. |
| 2026-09-05 | `3a73da8d` | Adds the international remote daily report. | Worldwide eligibility verification for each job. |
| 2026-09-08 | `ce1cdbc9` | Adds a daily snapshot and focused remote-report views. | That every view uses the same population as the full internal feed. |
| 2026-09-23 | `efba3249`, `03546311` | Adds or improves run evidence, package identity, stable coverage, tests, and output validation; documents the checks. | Removal of all stale data or all possible report errors. |
| 2026-09-25 | `e6c22f7e` | Improves package-review evidence and output-path checks. | Human review of every live job. |
| 2026-09-29 | `765df58b` | Adds content metrics to the daily snapshot. | That topic mentions are required skills. |
| 2026-09-29 | `2faf9c2c` | Adds a local DuckDB job-history database and reports. | Storage of every historical record from the broad internal feed. Inputs are saved package files. |
| 2026-09-29 | `47e29988` | Preserves the September 27 ATS behavior study. | That the study date and commit date are the same. |
| 2026-09-29 | `3d85e440` | Adds structured ATS failure diagnostics and saved-data investigation. | A confirmed cause for every provider failure. |
| 2026-10-12 | `16e43cfb` | Adds reviewed exact-URL exclusions for document-related roles outside the intended writing scope. | A ban on titles containing “specialist” or deletion from the source feed. |
| 2026-10-22 | `73ec53dd` | Indexes completed review records and records a narrow documentation cleanup. | A commit of all current runtime work. Many local changes remain uncommitted. |

Evidence: [H01-H09](11-evidence-index.md#h01), [H11](11-evidence-index.md#h11), [H12](11-evidence-index.md#h12). Commit subjects were checked with source paths and the current implementation where relevant.

## Later local work with dated records

These records are useful, but they are not Git milestones for the current uncommitted code.

- **September 29 diagnostic probes:** a saved review records different results from suspicious Workday catalog keys and same-site controls. It also records BambooHR redirects to vendor marketing pages. The review keeps the cause of many failures unresolved. New sampling code remains uncommitted. [C38](11-evidence-index.md#c38)
- **October 19 full-history storage work:** the first full-candidate review retains memory failures. A later review records narrower queries, separate workers, exact SQL comparisons, and successful full-history qualification. A separate migration receipt records production acceptance on October 19 at 20:50 CDT. [C39](11-evidence-index.md#c39), [H10](11-evidence-index.md#h10)
- **October 20 to 21 storage safeguards:** local guides and code add stronger monthly ledger writes, batch locks, guarded retirement plans, daily history backup, and refresh locking. The repository has saved operation receipts. Do not present all files in `docs/plans/` as pending plans. Conversely, an old acceptance receipt does not establish the state of every later run. [C27](11-evidence-index.md#c27)
- **October 22 saved refresh:** the saved run records completion, package `20261022-0622`, link review, test results, and a history backup. The saved job-history validation contains 155 snapshots. These are observed saved results, not a refresh performed for this task. [C19](11-evidence-index.md#c19), [C26](11-evidence-index.md#c26), [C34](11-evidence-index.md#c34)

## Five possible turning points

### 1. A spreadsheet became a repeatable information process

**Known:** Adam reports the Excel and Power Query beginning. The initial Git tree already has a substantial automated application.

**Proposed story:** one repeated search task led to collection rules, shared fields, and a reader view. Use an old workbook or image to show the first form. Do not invent the reason for moving from Excel, the migration date, or the amount of time saved.

**Needs confirmation:** the first problem solved, the first workbook, and the specific limit that led to Node.js.

### 2. “The page loaded” stopped being a sufficient check

**Known:** `f6ab1a92` adds handling for an Ashby job page that returns HTTP 200 with only a generic Jobs title. The current fixture distinguishes this from a real role title. Ambiguous failures stay for review.

**Proposed story:** quality rules must test the meaning of an output, not only transport success. This is a strong, short demonstration. [C18](11-evidence-index.md#c18)

### 3. Reports needed their own provenance

**Known:** September commits add recorded launcher identity, package IDs, copy checks, stable board coverage, and output validation.

**Proposed story:** as outputs multiplied, the system needed to show which inputs each report described. This is an interpretation of the change set, not a confirmed account of Adam's motivation. Ask Adam for the incident, if one exists. [H07](11-evidence-index.md#h07)

### 4. A current list became a history of observations

**Known:** `2faf9c2c` adds SQL history. Later local work separates raw rows, selected observations, public membership, shared text, and content versions. Source anomalies remain visible.

**Proposed story:** useful history requires a definition of “the same item” and “a change.” Losing a row from a list is not proof that a job was filled. [C21-C24](11-evidence-index.md#c21)

### 5. The hard part became preserving meaning during change

**Known:** streaming export remains optional staging; architecture copies remain transitional; full-history reviews retain failed memory attempts before later qualification and migration.

**Proposed story:** an improved implementation must preserve data and report meaning. Use this as a brief lesson or a discussion answer. The storage details are too dense for the main demonstration. [C25](11-evidence-index.md#c25), [C39](11-evidence-index.md#c39)

## Source selection and discontinuation

The current routine still names six ATS providers. The inspected timeline does not prove a decision to discontinue one of those providers. TalentBrew is a separate probe. Approved direct-employer intake adds a route; it does not replace the normal catalogs. Exact-role public exclusions change the reader package while retaining source records. Storage retirement concerns saved files, not a decision to drop employer coverage. Keep those decisions separate. [C02](11-evidence-index.md#c02), [C03](11-evidence-index.md#c03), [C17](11-evidence-index.md#c17)

## Material Adam must supply

- Excel/Power Query dates, files, and a safe image.
- The actual reason for each technology change.
- A personal example of irrelevant or repeated search results.
- Which reported failure or redesign felt most important.
- Any public launch date and its evidence.
- A Working Notes article he wants to use to support the talk.

The repository supports the engineering timeline. It cannot supply Adam's reactions, intent, reader feedback, or career outcomes.
