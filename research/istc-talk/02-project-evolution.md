# Project history and evolution

This is a derived timeline. Dates in the Git table are **author dates**, in the recorded `-05:00` offset. They are not feature launch or public release dates. Review date: October 27, 2026. Later operation dates are separate from commit dates. The current staged report-script edit is also separate from committed history.

## The boundary of the evidence

Adam supplied the origin: repeated job searches produced irrelevant results, duplicates, old links, and repeated work. He first used Excel and Power Query, then developed a larger application. That is the intended opening, but it is personal history that the repository does not independently establish. [P01](11-evidence-index.md#p01)

The earliest reachable project commit inspected is `4b257ee8`, dated 2026-08-13. It already includes a large JavaScript and shell application: catalog intake, six provider adapters, title scoring, deduplication, Google Sheets packaging, URL checks, board maintenance, and tests. The initial commit is not evidence that these features were invented on that day. [H01](11-evidence-index.md#h01)

A reachable-history path search found no origin workbook or Power Query `.m`/`.pq` file. Two `.xlsx` files now exist under the October 25 publication checks. They are later Sheet exports, not evidence of the original Excel implementation. This does not establish what exists outside Git. Saved history validation records package IDs from June, before the initial commit. Those records show retained package history; they do not date the start of the project or the Excel transition. [C34](11-evidence-index.md#c34)

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
| 2026-10-22 | `73ec53dd` | Indexes completed review records and a narrow documentation cleanup. | At that date, it did not include all local runtime work. |
| 2026-10-23 | `bf15378`, `1f4f305`, `e3988e0` | Commits compact history, checked recovery, fetch-event preservation, and daily backup controls. | First implementation date or continuous operational health. |
| 2026-10-23 | `9606709` | Finalizes packages before history import and preserves the manifest repair evidence. | A new job collection during the repair. |
| 2026-10-26 | `d5cf771` | Commits schedule, terms, source evidence, schema changes, and regression fixtures. | Implementation began October 24; the commit date is not the first release date. |
| 2026-10-26 | `d419fa1` | Adds a narrow metadata policy and backup-only recovery. | A confirmed cause for the metadata files or a successful future backup. |
| 2026-10-26 | `f4af4c2` | Preserves release, Sheet publication, remote-view, and recovery records. | Publication on the commit date. The saved publication occurred October 25. |

Evidence: [H13-H16](11-evidence-index.md#h13), [H01-H09](11-evidence-index.md#h01), [H11](11-evidence-index.md#h11), [H12](11-evidence-index.md#h12). Commit subjects were checked with source paths and the current implementation where relevant.

## Later local work with dated records

These are operation and research dates. Some work was committed later. Do not use the operation date as the commit date.

- **September 29 diagnostic probes:** a saved review records different results from suspicious Workday catalog keys and same-site controls. It also records BambooHR redirects to vendor marketing pages. The review keeps the cause of many failures unresolved. Later sampling was committed in `a9e41ae` on October 23. [C38](11-evidence-index.md#c38)
- **October 19 full-history storage work:** the first full-candidate review retains memory failures. A later review records narrower queries, separate workers, exact SQL comparisons, and successful full-history qualification. A separate migration receipt records production acceptance on October 19 at 20:50 CDT. [C39](11-evidence-index.md#c39), [H10](11-evidence-index.md#h10)
- **October 20 to 21 storage safeguards:** dated guides and code describe stronger monthly ledger writes, batch locks, guarded retirement plans, daily history backup, and refresh locking. The repository has saved operation receipts. Do not present all files in `docs/plans/` as pending plans. Conversely, an old acceptance receipt does not establish the state of every later run. [C27](11-evidence-index.md#c27)
- **October 22 accepted history:** the preserved [October 23 checkpoint](../../docs/plans/history-checkpoint-2026-10-23.md) identifies 155 accepted snapshots through `20261022-0622`. It also records a later source-hash failure. The mutable current validation now describes a later generation. Use the checkpoint for this historical count, not the current validation file.

- **October 23 package repair:** a dashboard update after history import changed a manifest size. The accepted source check failed. The repair retained both versions, restored only approved metadata, finalized later packages before import, and checked a new backup. [C43](11-evidence-index.md#c43)
- **October 24 to 25 employment release:** a title containing Variable Compensation exposed a false schedule inference. Tests now distinguish that phrase from explicit variable hours. Saved production review also retains genuine schedule conflicts. [C42](11-evidence-index.md#c42)
- **October 25 publication and October 26 remote-view change:** saved records report exact table read-back, repairs to pivot and link metadata, and a later change from fixed Location values to Work Arrangement = Remote. These are external operation records, not automatic refresh behavior. [C45](11-evidence-index.md#c45), [C46](11-evidence-index.md#c46)
- **October 26 latest local run:** saved receipts report package `20261026-0638`, 735 public rows, and history through that package. This review did not rerun it. [C47](11-evidence-index.md#c47)

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

**Known:** `2faf9c2c` adds SQL history. Later later work separates raw rows, selected observations, public membership, shared text, and content versions. Source anomalies remain visible.

**Proposed story:** useful history requires a definition of “the same item” and “a change.” Losing a row from a list is not proof that a job was filled. [C21-C24](11-evidence-index.md#c21)

### 5. A metadata update broke an accepted source check

**Known:** the October 23 repair links a source-hash failure to a dashboard update after history import. Current code moves finalization before import and blocks guarded changes after import. The saved repair checks preserve the job CSVs. [C43](11-evidence-index.md#c43)

**Proposed story:** lifecycle rules must apply to operational metadata too. A dashboard can be useful current status, yet unsafe to change inside an accepted historical package. Use this as an alternate challenge or a discussion answer. The later employment correction gives a second example of preserving evidence while changing an interpretation. [C42](11-evidence-index.md#c42)

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
