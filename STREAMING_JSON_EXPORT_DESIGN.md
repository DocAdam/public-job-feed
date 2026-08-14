# Streaming JSON Export Design

## Status

Phases 1 and 2 are implemented as a non-publishing dry run. The production
exporter and published outputs remain unchanged. Phases 3 and 4 remain design
work.

Implemented Phase 1 components:

- Strict line-oriented JSON-array reader.
- Worker-owned SQLite run store using approved better-sqlite3.
- Slice memberships, dedupe keys, and disk-backed summary metrics.
- Disk-backed transitive dedupe components, selected rows, and decision rows.
- New jobs:export-slices:streaming-dry-run command.
- Fixture parity coverage for selected rows and decision rows, plus malformed
  input, resource telemetry, and published-output non-mutation.

## Problem

The public feed is currently 3.6 GB. The public-slice exporter calls
readLargeJsonArrayFile(), which consumes the row iterator and retains every
row in an array. Slice arrays, dedupe groups, sort copies, and JSON output
arrays then increase peak memory further.

The existing writeLargeCsvFile() already streams with backpressure. The design
therefore replaces full-array ingestion and in-memory dedupe/sorting; it does
not replace the current CSV writer.

## Compatibility contract

The feed is a pretty JSON array with one complete object per physical line.
iterateLargeJsonArrayFile() relies on that physical layout; it is not a
general JSON-array parser. This design keeps that layout and adds validation.

The streaming implementation must preserve:

- Published file names, profile semantics, columns, and rows.
- Existing CSV writer behavior, including its final newline.
- Slice membership, dedupe selection, decision rows, and summary values.
- All-or-nothing publication: a failure must leave the previous output set
  untouched.

## Non-goals

- No change to job facts, ranking rules, dedupe keys, or CSV escaping.
- No replacement of the production export command in the first rollout.
- No in-memory approximation of global deduplication.
- No requirement to migrate every other JSON reader in this project.

## Architecture

Use a staged, disk-backed pipeline:

    JSON array iterator
      -> validation and source sequence number
      -> raw-slice writers and metric aggregators
      -> SQLite-backed dedupe graph and row store
      -> per-slice selected-row scan
      -> streaming JSON and CSV writers in a staging directory
      -> validation
      -> atomic output promotion

SQLite is recommended because dedupe is global and transitive: a row can be
connected through DuplicateGroupKey or CanonicalURLKey. Hash-partitioning rows
alone is unsafe unless it implements the same cross-key connected components
as the existing union-find algorithm.

### Proposed SQLite execution model

Subject to dependency approval, use better-sqlite3 behind the run-store
boundary, inside one dedicated Worker thread. It supports fast synchronous
batched inserts and indexed scans without blocking the CLI event loop.

- The main thread parses input and sends bounded batches to the worker.
- The worker keeps one connection open for the entire run, enables WAL mode,
  and owns every transaction.
- Phase 1 uses a prepared-statement batch transaction, committed every 100
  rows by default. It never opens a connection per batch.
- Phases 2 and 3 use the same connection and explicit phase transactions.
- The main thread receives progress, metrics, and fatal errors over messages;
  it never holds the feed or a dedupe component in memory.

This is a proposal, not an approved dependency addition. If native module
deployment or the Worker model is unacceptable, implementation must stop for a
new storage decision rather than silently substitute an untested async driver.

## Proposed modules

### src/adapters/storage/export-run-store.js

New persistence boundary. It owns a temporary SQLite database inside the run
staging directory; scripts and core logic must not issue SQL directly.

Required operations:

- open(options)
- addRow({ row, sequence, memberships, dedupeKeys })
- finalizeIngestion()
- iterateRawSlice(sliceName)
- iterateSelectedSlice(sliceName, options)
- iterateDedupeDecisions(sliceName)
- getSliceMetrics(sliceName)
- getDedupeSummary(sliceName)
- close()

Required durable state:

| Store | Purpose |
| --- | --- |
| rows | Original row JSON, sequence, and fields required for ranking/output |
| slice_memberships | Row-to-slice relationship and per-slice input sequence without duplicate row payloads |
| dedupe_keys | Strong and fallback keys for every row and dedupe slice |
| dedupe_edges | Key equivalence edges needed for transitive components |
| dedupe_components | Final component ID per row and dedupe slice |
| selected_rows | One winner per component, including group size and reason |
| dedupe_decisions | Current decision-report fields for multi-row groups |
| slice_metrics | Counts and distinct-value state for summaries |

Store unmodified JSON text initially. Compression is allowed only after parity
tests prove it preserves every output value.

Required indexes include:

- unique rows(sequence);
- slice_memberships(slice_name, membership_sequence);
- dedupe_keys(slice_name, key, row_id);
- dedupe_edges(slice_name, left_row_id, right_row_id);
- selected_rows(slice_name, source_sequence); and
- selected_rows(slice_name, top-sort fields) for deduped top.

Every member of a deduped slice receives a component ID, including an isolated
row with no shared key. Isolated rows are represented as a singleton component;
they do not require a dedupe edge or decision row.

### src/adapters/exports/stream-json-array.js

New writer only; do not alter the current writer before parity is proven. It
accepts an Iterable or AsyncIterable and produces the existing JSON-array
layout through a temporary file and atomic rename.

It must:

- Write opening bracket, line-oriented objects separated by commas, closing
  bracket, and final newline.
- Respect stream backpressure.
- Delete its temporary file if the write fails.

### src/adapters/exports/streaming-slice-export.js

Owns the staged workflow. It receives paths and an explicit profile, not
process arguments. The CLI remains a thin wrapper.

## Algorithm

### Phase 0: preflight and staging

1. Validate the input exists, is readable, and follows the line-oriented
   JSON-array contract.
2. Create a unique directory under
   data/jobs/public/.staging/export-slices-TIMESTAMP-PID.
3. Write a run manifest with input path, size, modification time, profile,
   start time, and code revision when available.
4. Check an explicit disk budget before ingestion.

No published output is changed in this phase.

The initial preflight estimate is:

    requiredBytes =
      inputBytes * 4.0 +
      expectedPublishedOutputBytes * 2.0 +
      5 GB safety reserve

The 4.0 multiplier covers stored row JSON, SQLite indexes/working tables, and
staged raw outputs. The 2.0 multiplier retains prior published outputs while
the new version stages. The implementation must call filesystem free-space
reporting at runtime, fail if free bytes are below requiredBytes, and record
the estimate and observed peak disk use in the manifest. After the first two
full staging runs, replace these conservative multipliers with measured bounds.

### Phase 1: one streaming input pass

For each row from iterateLargeJsonArrayFile(inputPath):

1. Assign an increasing raw source sequence.
2. Capture header order from the first row.
3. Evaluate all slice predicates once.
4. Update count metrics. Store distinct companies and titles in indexes, not
   JavaScript Sets.
5. Add memberships for profile-enabled raw outputs. Each membership receives a
   membership sequence matching the current slice input order.
6. Add memberships and the exact existing getDedupeKeys() results for every
   deduped input slice.

For all normal slices, membership sequence is raw source sequence. For the
deduped-top input, it must instead follow the current sortTopRows() ordering
of strong matches, with stable raw source sequence as the final tie-breaker.
This ordering must be materialized before component winner selection.

Use 100-row batch transactions by default. A full-feed measurement showed that
5,000-row batches exceeded the 512 MB RSS target, while 100-row batches
completed within it. Larger batches require a new full-run resource
measurement before they may become the default.

### Phase 2: resolve components and winners

For each deduped slice:

1. Resolve connected components across all keys.
2. Rank every component using existing compareRows() rules, then ascending
   membership sequence for that deduped slice when rows otherwise tie.
3. Persist the winner, group size, existing selection reason, and decision
   fields.
4. Persist decisions only for groups with more than one row.

Selecting once per key is incorrect. Different keys can bridge a transitive
group and must result in a single winner.

The first implementation should use a deterministic disk-backed union-find
pass or an equivalently tested component algorithm. Recursive SQL CTEs may be
evaluated only through adversarial fixtures with long chains and dense,
multi-key groups; they are not assumed safe by default.

### Phase 3: stream staged outputs

1. Scan raw memberships in source order and write requested JSON/CSV slices.
2. Scan selected rows for each deduped output and stream JSON/CSV.
3. Apply the existing top-row comparator in the database for deduped top. Do
   not perform a whole-feed sort in JavaScript.
4. Create summary and decision reports from database aggregates using current
   CSV formatting.
5. Produce latest-copy outputs from the same selected-row scans.

### Phase 4: validate and publish

Before publication:

- Parse every staged JSON output.
- Compare its row count with stored metrics.
- Verify CSV header order and row counts.
- Verify each dedupe summary: input equals output plus removed.
- Verify the run manifest records completion.

Publish only after all validation passes. Version 1 supports POSIX filesystems
only (the local macOS volume and Linux CI); it relies on same-filesystem
rename semantics. The staging and destination directories must share a volume.
Use a versioned completed directory and a single atomic pointer or rename
strategy proven on the target filesystem. Network shares and Windows are out
of scope until separately tested. Keep the prior completed version until the
new one verifies.

## Failure policy

- Parse error: report input line and row sequence; never publish.
- Disk or database error: retain the incomplete staging directory and
  manifest; never publish.
- Interrupted before Phase 2 completes: mark the run incomplete; version 1
  does not resume ingestion or component resolution.
- Interrupted after Phase 2 commits: mark the manifest dedupe-ready. A later
  explicit resume command may restart Phase 3 only after validating the input
  fingerprint, store schema version, code version, and all component metrics.
  It must discard partial staged output files before rewriting them.
- Old staging cleanup is a separate, explicit maintenance operation.

## Resource target

JavaScript heap must be bounded by a row, a write batch, and driver buffers,
not feed size. Target peak heap is below 512 MB for the current 3.6 GB feed.
Record observed RSS, runtime, and temporary disk use in the run manifest.

Temporary disk use will exceed final output size because rows, indexes, staged
outputs, and prior outputs coexist. Measure it during a non-publishing full
run before setting a hard disk budget.

## Rollout

1. Add parser and streaming JSON-writer fixture tests.
2. Implement the run store and test transitive groups, ranking ties, empty
   input, and decision rows.
3. Add a new exporter option selecting the streaming implementation; preserve
   the current implementation as default.
4. Run both implementations on fixtures and compare CSV bytes, JSON rows,
   summaries, and decisions.
5. Run a full non-publishing staging export. Record resource use and output
   comparisons.
6. Exercise the explicit Phase 3 resume path after an injected interruption.
7. After two successful full runs, make streaming the reversible default.
8. Retain the all-array path for one release cycle before considering removal.

## Acceptance criteria

- Full 3.6 GB input completes without a Node heap-size override.
- An injected parse, disk, or process failure leaves published outputs intact.
- An interrupted, dedupe-ready run can resume Phase 3 only after manifest and
  input-fingerprint validation succeeds.
- Fixture CSV output matches legacy bytes; JSON has the same ordered values.
- Dedupe preserves transitive grouping and original per-slice tie selection.
- Daily profile does not materialize full-slice output.
- Manifest records input identity, output counts, runtime, peak memory, disk
  use, and completion state.
- Existing jobs:test-all and new streaming fixtures pass.

## Decisions required before implementation

1. Approve better-sqlite3 and its dedicated Worker-thread execution model, or
   approve a replacement design.
2. Confirm temporary-disk budget and staging retention.
3. Confirm whether CSV byte compatibility is mandatory for every output.
4. Approve the tested output-promotion strategy.
