# Posting history and content storage plan

Status: proposed; reviewed against the current project. No implementation authorized or performed.
Review date: October 19, 2026. Scope: Public Job Feed only.

## Decision

Keep DuckDB. Extend the existing history system so that a posting has one identity,
reusable content versions, small observations, and derived presence periods.
Keep the daily CSV as an output. Use the database for historical questions.

Do not create a second unrelated history database or infer employer closure from
absence in a shortlist. Do not import the 114 GiB crawler archive into this model.
Build a replacement candidate database from saved packages, validate it, and then
cut over with a rollback copy. Compaction must replace repeated physical storage;
adding version tables while keeping every full row would not meet the storage goal.

This document is a design, not a migration script. Table names below are proposed.
The companion [review](job-history-lifecycle-review.md) records risks and acceptance
conditions. The [evidence file](job-history-lifecycle-evidence-2026-10-19.json) records
actual file hashes, header variants, per-snapshot counts, and exploratory results.

## 1. Current project: checked facts

| Measure | Current DuckDB | Saved dated packages |
| --- | ---: | ---: |
| Snapshots | 131 | 152 |
| Latest snapshot | 20260928-0552 | 20261019-0616 |
| Raw 03 rows | 94,079 | 111,624 |
| Resolved 03 observations | 94,069 | 111,614 |
| Canonical posting keys | 2,973 | 3,419 |
| Raw 01 rows | 83,474 | 98,896 |
| Unmatched 01 rows | 40 | 40 |

There are 21 packages not yet imported. The October 19 package has 878 `03` rows
and 743 `01` rows, with no duplicate canonical rows or unmatched primary links.
The saved archive has ten excess canonical rows, all in `20260715-0556`, and ten
repeated `01` primary links. All required CSV files were present. There was one
`03` header variant and four `01` variants. No missing canonical key or URL was
found in the parsed `03` rows. These are review observations, not a full importer
validation or a claim that every job is open.

The existing database contains nine physical tables and three views. Read-only
`auditMetrics` returned no errors for its 131 snapshots. All 262 stored required
CSV hashes matched the current files. No full production audit, update, build,
or test suite was run for this planning task.

### Code evidence and constraints

| Current file and symbol | Finding that affects this design |
| --- | --- |
| `src/lib/jobs-history.js:79`, `scan` | Reads both CSVs, preserves raw rows, resolves duplicates, records exceptions, and stages all dated packages on every run. |
| `src/lib/jobs-history.js:154`, `schema` | Raw JSON is stored in raw tables and again in wide resolved observations. |
| `src/lib/jobs-history.js:165`, `views` | `posting_lifecycle` gives first/last observation and count, but no periods or change history. |
| `src/lib/jobs-history.js:191`, `audit` | Compares raw and resolved content with staged files, not only counts. Preserve this strength. |
| `src/lib/jobs-history.js:242`, `runHistory` | Build uses a candidate file and rename; update uses a transaction and a lock. It is not yet a schema-versioned migration framework. |
| `src/lib/historical-content-metrics.js:65`, `loadPopulation` | Reads original 01 rows and raw 03 rows in CSV order. |
| `src/lib/daily-jobs-review.js:78`, `enrich` | Last matching raw URL supplies text; this is different from latest-FetchedAt duplicate resolution. |
| `src/lib/job-dedupe.js:21`, `getCanonicalURLKey` | Drops URL query text. Do not regenerate saved identities through this helper. |
| `src/lib/us-remote-daily-report.js`, `jobKey` | Primary-link comparison uses lowercase and trailing-slash removal. Preserve this export identity rule. |
| `src/scripts/build-gsheet-package.js:317`, `groupPublicSheetCountryPostings` | A public row can group multiple location variants and carry Additional Apply Links. |
| `src/scripts/build-gsheet-package.js:796`, `buildSimpleTopFiles` | Eligibility decisions and grouping affect the 01 export. |
| `src/lib/public-job-url-overrides.js` | Employer URL overrides help explain some unmatched 01 links. They are not proof of a historical match. |
| `src/scripts/check-gsheet-url-health.js:261`, `applyPrune` | Pruning rewrites 01 and its count after initial package creation. |
| `launchers/Refresh Job Feed.command:91` and final Step 8 | Package creation precedes pruning, validation, and status sync. No history command is currently hooked into this launcher. |
| `src/lib/package-time.js:11`, `readPackageTimestamp` | Reads recorded UTC time from package metadata. Keep it distinct from folder time. |
| `src/scripts/test-jobs-history.js`, `test-history-content.js` | Existing tests cover preservation, exceptions, selection, parity, and incremental metric dependencies. Extend these tests. |

The working tree contains unrelated edits to reports, refresh tools, package.json,
and other files. Preserve them. A future implementation should use an isolated
working copy that includes the agreed current baseline; do not assume HEAD alone
contains the current intended behavior.

## 2. What the saved data can establish

Treat two populations separately:

- **Shortlist presence:** canonical identity present in saved `03`.
- **Export presence:** normalized primary Apply Link present in saved `01`.

A third fact links them: a matched export row refers to a canonical observation in
that same snapshot. An unmatched export row remains an export-only observation.
It must not create an invented `03` posting.

Use labels such as “first observed,” “absent from saved shortlist,” “returned to
saved shortlist,” and “left the public export.” A valid, complete package can
still reflect a failed crawler, stale board results, filtering, or source growth.
Neither population proves that the employer opened or closed the job.

Preserve four different times: folder timestamp, recorded package time, row
FetchedAt, and stated DatePosted. Never substitute one for another silently.
A repeated snapshot row is evidence of package membership; it is not necessarily
a fresh successful employer fetch.

## 3. Identity and matching contract

Keep the exact saved CanonicalURLKey as the default posting identity. Give it a
stable internal ID derived from a versioned namespace and that key, rather than
an import-order sequence. Keep ATS, board/catalog, RawJobId, JobKey, and URL as
evidence. JobKey is not unique: this review found 77 JobKey values associated
with more than one canonical key. The known BambooHR/iCIMS examples remain.

Do not merge by company and title. Do not drop query text, rewrite URLs, or apply
current URL overrides retroactively. Detect contradictory identities and retain
an anomaly for review. Same URL with materially different job content is a new
content version under the current identity policy, with an identity-reuse warning
when appropriate; it is not automatically a new requisition.

For 01, use the existing normalized primary-link key in a separate namespace.
Create a subject even for an unmatched link so its export history remains visible.
Matched canonical IDs are per-snapshot links. A later exact match does not erase
an earlier unmatched exception. Keep first-seen dates separate for the two streams;
an earlier export-only row must not move a canonical posting’s first 03 observation.
Additional Apply Links are evidence of grouping,
not extra primary membership or automatic identity aliases.

Different URLs for similar roles are **possible reposts**, not the same posting.
First release: support a query/manual review list and evidence links; no fuzzy
matcher, automatic merge, probability score, or confirmed-repost label. A future
relation record can carry both IDs, evidence, decision, author, and date after
that feature is separately approved.

## 4. Proposed storage model

Use `history_v2_*` physical names in the candidate database. Keep current public
query names as compatibility views where practical. Do not leave two complete
physical copies of every full row in the final database.

| Proposed physical object | Key | Data and purpose |
| --- | --- | --- |
| `history_metadata` | schema version | Import, identity, content-projection, event, and metrics-definition versions; source-set hash; build state. |
| `snapshots`, `snapshot_files`, `source_artifacts` | Existing keys | Keep current contracts. Add capture/quality metadata in a separate metadata field or narrow companion table if needed. |
| `history_v2_postings` | posting ID; unique canonical key | Stable identity only. Current title/location are derived, not overwritten identity fields. |
| `history_v2_text_blobs` | SHA-256 of exact text bytes | Description stored once. Keep exact decoded text; no stripping HTML, case folding, or whitespace changes. |
| `history_v2_row_payloads` | format version + payload hash | Lossless parsed row metadata plus description reference. This retains fields not in the business-content projection. |
| `history_v2_raw_rows` | snapshot ID, source file, row number | Payload reference, original parsed-row hash, canonical/export keys, and duplicate-selection references. Retains every sibling and exception. |
| `history_v2_content_versions` | posting ID, projection version, content hash | Typed analytical fields plus exact projected values and description reference. Identical content can be reused after a later reversion. |
| `history_v2_observations` | snapshot ID, posting ID | Selected raw row, content-version reference, group size, anomaly flags, and current 01 inclusion flag. No copied description. |
| `history_v2_export_subjects` | normalized primary-link key | Separate public-export identity. Not an employer-posting substitute. |
| `history_v2_export_observations` | snapshot ID, export subject ID | Representative raw 01 row, raw multiplicity, nullable matched posting ID, exception reason, and raw sibling references. |
| Presence periods and change events | Derived deterministic keys | Views initially. Materialize only if measured query cost justifies it. |
| Existing content/role metric tables | Existing keys | Keep calculation rules and saved outputs. |

Use required primary/unique constraints and explicit relation audits. Add foreign
keys only where compatible with the chosen bulk-load and migration order; do not
rely on application convention alone. DuckDB supports transactions and constraints;
prototype their use with the installed Node client before fixing the DDL.
[Transaction reference](https://duckdb.org/docs/current/sql/statements/transactions),
[constraint reference](https://duckdb.org/docs/current/sql/constraints).

### Lossless reconstruction is a required design gate

A payload hash must use a versioned, deterministic serialization. Distinguish a
missing column from an empty cell and from NULL. Keep ordered headers separately.
Keep source row numbers, including duplicate rows. These are one-based parsed
data-record positions under the existing parser, not physical text line numbers.
A quoted field can span several text lines. Verify bytes before reusing a
hash; a collision or mismatched payload must fail the import.

A proposed payload stores ordered field/value pairs, with Description represented
by a typed reference. Reconstruct the exact parsed object in original header
order. The reference is part of the storage envelope, never inserted as a fake
source CSV column. This preserves fields with names that resemble internal names.

Compatibility views must expose the original wide types and raw row JSON to the
existing query/report consumers. If exact JSON ordering cannot be reproduced in
SQL efficiently, use a shared JS reconstruction adapter for `loadPopulation` and
semantic audit, while retaining source-file hashes for byte-level provenance.
Do not accept “equivalent enough” JSON without testing all columns and values.
Current parser behavior already normalizes some line endings; raw-file hashes
remain the byte-level source of truth.

## 5. Content versions and change classes

Do not hash the full export row as the only definition of a job change. FetchedAt,
SourceBatch, Last Checked, and Age can change while the posting text stays the same.

Use a named content projection, initially covering Company, Title, Location,
Description, Department, DatePosted, SalaryMin/Max/Currency/Period/Text,
RawLocation, and RawDepartment. Preserve their exact source representations.
Company changes mean a source-label change, not proof of an employer change.
Salary fields are extracted observations, not verified compensation.

Retain all remaining fields in the lossless payload, and classify differences:

| Class | Examples | Display |
| --- | --- | --- |
| Posting content | Title, description, location, salary fields | Changed source fields, with before/after values. |
| Classification/scoring | RemoteStatus, USRemoteEligible, WriterFit*, TitleMatch*, quality flags | Pipeline classification changed. Never silently describe it as an employer edit. |
| Collection metadata | FetchedAt, SourceBatch, FetchURL | Collection evidence; collapsed by default. |
| Export presentation | Grouped location, Additional Apply Links, Fit Tier, primary URL | Export change, in the 01 stream. |
| Schema availability | Column introduced/absent in older file | Schema change; not a proven posting edit. |

Compare presence markers first. A newly available column with a value must not be
presented as a confirmed change from blank. Persist projection version in each
content record. Adding comparison fields requires an explicit full re-derivation
under a new version. Never compare hashes from two projection versions directly.

A→B→A uses two content values and three observation segments. It has two change
events. Distinct version count is not the count of change events. Formatting-only
description changes remain exact versions; any later “meaningful text change”
filter must be a separate, tested display rule.

## 6. Import and update algorithm

### First import

1. Inventory valid dated folders; exclude operational directories and symlinks.
2. Verify required files and headers. Record a source-set manifest and hashes.
   Define package eligibility before import. Existing historical packages need
   explicit structural checks and retained quality warnings. A readable CSV alone
   does not prove a complete crawler run. Future daily imports must wait for final
   pruning, validation, and status sync. Recheck the manifest to detect concurrent
   writes; file existence alone is not a completion signal.
3. Establish deterministic order using the existing snapshot-ID order. Preserve
   recorded UTC timestamps as a separate clock. Flag conflicting times; do not
   reorder the existing report history silently.
4. Parse each CSV with the existing parser and strict structural checks. Store
   every raw row through payload/text references.
5. Resolve 03 duplicates with the approved latest-valid-FetchedAt rule and lowest
   raw row number tie-breaker. Preserve every sibling and its selected reference.
6. Create/reuse posting identity and content version. Add one selected observation.
7. Preserve every 01 row. Match primary links using the current URL rule. Create
   export subjects/observations; retain unmatched rows and reason exactly.
8. Derive periods/events across successful snapshots. Calculate existing metrics
   through the compatibility reader. Validate counts, values, hashes, and reports.
9. Complete and close the candidate database. Do not replace production until the
   acceptance gates and the approved cutover are complete.

### Later updates

Discover new folders, validate their bytes, then import only missing snapshots in
one transaction with the existing process lock. An existing ID with changed source
hashes is a correction, not a new run: stop and request an explicit candidate
rebuild. Do not silently rewrite history or assign an unrelated run ID.

For the first implementation, keep the current full source-hash verification.
The scan currently reparses/stages old snapshots; a later measured optimization
can validate old hashes without reparsing them. Do not introduce a complex cache
before the storage and event contracts pass.

For late insertion of an older snapshot, do not append lifecycle events as if it
were the newest observation. Derived views must recompute chronological neighbors.
If periods/events are materialized later, rebuild the affected identities and
successor boundaries from the insertion point. Existing weekly metrics must also
refresh when the inserted snapshot changes their baseline.

No-op update must preserve table contents and event keys, not merely row counts.
Never regenerate import timestamps for existing snapshots on a no-op update.

## 7. Presence periods, events, and duration

Derive both 03 posting periods and 01 primary-export-link periods independently.
Within a stream, a period is a maximal sequence of consecutive successful saved
snapshots containing the subject. A missing calendar day is not an absent snapshot.
A missing, unreadable, or incomplete expected package stops advancement; it must
not create mass absence events. Failed runs are not empty successful snapshots.

| Previous evidence | Current valid snapshot | Event |
| --- | --- | --- |
| Never observed | Present | `first_observed` |
| Present, same content | Present | Observation only; no content-change event |
| Present, different content | Present | `content_changed` with exact field names and version references |
| Present | Absent | `absent_from_snapshot` once, at the first absence |
| Absent after earlier presence | Present | `reappeared`; also content comparison against last observed version |
| Previously present in 01 | Absent from 01 | `left_public_export`; not a closure, regardless of 03 presence |
| Absent from 03 | Present only in 01 | Export-only presence with unmatched evidence; no fabricated 03 record |

An absence event has a valid snapshot and prior observation but no current row.
Use the ordered index of eligible snapshots plus per-subject observation neighbors
to find gaps. The first missing ordinal after a presence period identifies its
absence boundary. Do not build a full posting-by-snapshot cross product.
All other event evidence links must identify their actual source rows. Event keys
include stream, subject, boundary snapshot, event type, and rule version. Content
changes after a gap compare the last seen version and mark the unobserved interval.

Expose: first_seen, last_seen, snapshots_seen, distinct_observed_dates,
observed_span_hours, presence_period_count, first_absent_after_period,
reappearance_count, distinct_content_versions, and content_change_count.
`observed_span_hours = last_seen - first_seen` when timestamps are comparable.
A single observation has span zero. Inclusive calendar span may be shown under
that exact label, not “days open.” Never multiply snapshot count by 24 hours.

Mark the start as left-censored when a posting is already present in the first
saved snapshot: it could have existed earlier. Mark the end as right-censored
when it remains present in the latest saved snapshot. Do not extend presence to
today or to a later fetch time. Show run gaps and coverage context with periods.

## 8. User-facing history design

Start with queryable views and a compact Markdown history report, not a new web
application. Preserve the existing market report unchanged. Proposed additions
can later use a separate `jobs:history-posting` command; do not overload current
report arguments without a contract review.

Default list: one row per canonical posting, latest observed title/company,
first/last seen, observed snapshot count, current shortlist/export status,
period count, content changes, and an evidence link. Keep export-only subjects
in a clearly labeled filter/list; do not hide the unmatched records.

Posting detail:

- Summary: “Seen in 152 saved snapshots; one observed content version.”
- Timeline: first observation, changes, first absence, reappearance, latest state.
- Change detail: before/after values; long description diff only on request.
- Presence periods: observed endpoints, first absent snapshot, and missing-run note.
- Evidence: folder/file/row, original URL, FetchedAt, DatePosted, and relevant warnings.

Use “present in latest saved shortlist,” not “open.” Show the archive's last
snapshot prominently. A stale report must not look current. Preserve filtering,
source-coverage, and topic-denominator caveats in the existing report.

## 9. Storage evidence and boundaries

The read-only probe found:

| Logical payload measure | All occurrences | Distinct exact values |
| --- | ---: | ---: |
| Parsed full 03 row JSON | 786,101,621 bytes | 582,006,702 bytes / 74,696 values |
| Description text | 494,270,118 bytes | 17,202,403 bytes / 3,345 values |
| Exploratory selected-content projection | 540,107,440 bytes | 27,266,011 bytes / 8,595 global values |

The projection count is global, not the final per-posting version count. These
are logical UTF-8 byte counts, not measured DuckDB disk savings. They show why
full-row hashing alone is insufficient and why descriptions merit shared storage.
Measure final database size, temporary disk, peak memory, build/update time, and
query time before claiming a reduction.

Example from real files: Deepnote Technical Writer at
`https://jobs.ashbyhq.com/deepnote/eb00d9b0-0dfc-4ff7-9aa4-19cf22e9644c`
appears in all 152 packages with one value under the exploratory content
projection. The proposed user view should show one posting, a version reference,
and 152 small observations. This is not proof of 152 days or continuous hiring.

Local storage currently includes about 114 GiB of batches, 17 GiB of generated
public outputs, 3.3 GiB of packages, and 1.8 GiB of DuckDB history. This change
addresses history organization and repeated payloads. It will not reclaim the
114 GiB batch archive. Batch retirement and external archival need their own
review and approval.

Keep raw CSV packages throughout this work. After migration, a separate archival
phase can compress exact originals, store a manifest and checksums, test restore,
and adjust the importer to read archived sources. Current code requires local
folders, so moving them now would break rebuild/audit. No deletion or archive
movement belongs in this implementation authorization.

## 10. Compatibility, cutover, and rollback

Build a separate candidate using current saved CSVs, not only the stale database.
Hold the source manifest stable during the build and recheck hashes before commit.
A concurrent source write must fail validation rather than yield a mixed capture.

Preserve the current raw row and observation query contracts through views or a
small shared reader. The v1 importer writes physical tables, so it cannot simply
insert into replacement views. Add a schema-version dispatcher and fail clearly
if v1 code attempts to write a v2 file. Avoid a broad in-place ALTER sequence.

Before cutover, compare the candidate's existing 131-snapshot prefix to the current
warehouse and old reporting logic. Validate the 21 new packages independently.
Any new-date total is a validation target, not an importer constant.

Close all readers/writers, checkpoint and close the candidate, retain the old file
as an approved rollback copy, and promote by same-filesystem rename under a lock.
Test every failure boundary, including rename failure and stale locks. Rollback
must restore both the database and a compatible code/schema reader. Avoid
simultaneous access to the same file through different writer implementations.

A filesystem replacement and a DuckDB transaction solve different problems.
Transaction tests do not prove safe file replacement. Reserve temporary capacity
for old database, candidate, staging, and rollback; measure it in the trial.

## 11. Phases and exit gates

| Phase | Work proposed | Exit gate |
| --- | --- | --- |
| 0. Contracts | Freeze source manifest, identity/content profiles, schema versions, and fixtures. | All known variants/exceptions represented; ambiguous mappings explicit. |
| 1. Storage prototype | Build normalized storage in an isolated fixture/candidate DB. | Exact parsed-row reconstruction; constraints and collision tests pass. |
| 2. Lifecycle | Add observations, content transitions, and period/event views. | A→B→A, missing-run, absence/reappearance, and stream separation tests pass. |
| 3. Full candidate | Import all reviewed packages; retain originals. | All 152 package counts reconcile; old-prefix reports and metrics match. |
| 4. Review and cutover | Benchmark, inspect history examples, test rollback, request cutover approval. | Storage and correctness results reviewed; production replacement explicitly approved. |
| 5. Daily integration | Add a local history step only after finalized package work. | Launcher regression tests pass; failure leaves explicit history-stale status. |

Phase 5 belongs after the current final package/status sync and output checks,
not directly after initial CSV creation. The existing launcher already marks its
feed run COMPLETE; history needs its own success/failure field or step result.
A failed history update must not rerun network collection or silently claim the
warehouse is current. No schedule is created by this plan.

## 12. Validation matrix for implementation

Audit contract: fully preserved and resolved canonical duplicates, unmatched 01
rows, and known header variants are source warnings. Unresolved duplicate
observations, missing required canonical identity, lost raw or exception rows,
column/schema collisions, source hash mismatches, broken database relations or
integrity, and non-idempotent updates are structural errors that fail the audit.
Keep these categories distinct in validation.json and the history README. Retain
snapshot raw_top_match_row_count, resolved_observation_count,
duplicate_canonical_row_count, and unmatched_good_job_count.

| Area | Required cases and acceptance |
| --- | --- |
| Identity | Same JobKey/different URLs remain distinct; saved keys unchanged; conflicting mapping fails or enters explicit review. |
| Versioning | Unchanged posting with new FetchedAt reuses content; salary/title/text changes create versions; A→B→A reuses A and emits both changes. |
| Schema | Missing versus blank fields; new columns; all header variants; long/multiline/quoted descriptions; serialization collisions. |
| Raw preservation | Every source row and duplicate sibling reconstructs with identical parsed values and order; source bytes match hashes. |
| Selection | Latest valid FetchedAt and deterministic ties; selection marker references the actual retained row. |
| Membership | 01 filter loss does not imply 03 absence; grouped links stay non-primary; unmatched links remain visible and can match in a later run without rewritten history. |
| Lifecycle | Multiple snapshots/day; missing calendar days; failed/partial packages; valid zero-row package; gaps; reappearance with changed content; initial/final censoring. |
| Incremental | Twice no-op gives identical content fingerprints; append equals full rebuild; late insertion equals full rebuild; changed old hash blocks silent rewrite. |
| Existing reports | All metric and role values match; raw CSV order for description enrichment preserved; fixed-time Markdown matches all existing sections. |
| Operations | Concurrent writer rejection, interrupted import, process crash, stale-lock review, source mutation, promotion failure, and full rollback. |
| Storage | Candidate closed-file size is measured against an equivalent full-population v1 baseline; compare equivalent retained evidence, not a smaller population. |
| Queries | One-row-per-posting view; exact timeline/field diffs; representative 60+ observation record; gaps and export-only subjects. |

Current archive acceptance targets: 152 snapshots; 111,624 raw 03 rows; 111,614
resolved observations; 3,419 canonical keys; 3,361 distinct JobKeys; 98,896 raw 01
rows; 98,846 matched canonical inclusions; 40 unmatched export rows; ten excess
canonical rows and ten repeated primary export links. Re-inventory if sources
change before implementation. The prior 131-snapshot prefix must still reconcile
to its existing warehouse counts and 40 exceptions.

Existing validation commands, to run in isolated fixtures/candidate paths after
implementation: `jobs:test-history`, `jobs:test-history-content`, relevant daily
report tests, syntax checks, candidate build/audit/report, update twice, then
`git diff --check`. Add focused storage, transition, and failure-injection tests.
Do not run a default production build merely to validate the candidate.

## 13. Proposed code boundaries

| File/module | Planned responsibility |
| --- | --- |
| `src/lib/jobs-history.js` | Schema dispatch, transactional ingestion orchestration, existing audit/command contracts. |
| New `src/lib/job-history-storage.js` | Content/text payload encoding, reconstruction, typed compatibility readers. |
| New `src/lib/job-history-lifecycle.js` | Pure identity/version/event rules and deterministic derived views. |
| `src/lib/historical-content-metrics.js` | Use shared reader; preserve calculation and baseline definitions. |
| Existing report modules | Preserve current output; separate posting-history presentation if approved. |
| Existing and new history tests | Fixture parity, content reconstruction, lifecycle state transitions, migration rollback. |
| `data/jobs/history/README.md` | Operational contracts, state labels, rebuild and rollback steps. |
| Refresh launcher/tests | Finalized local import step in Phase 5 only. |

No new dependency, server, cloud service, spreadsheet workflow, or general data
platform is required for the proposed first release.
