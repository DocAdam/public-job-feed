# Architecture Migration Contract

This repository is in a transitional state. A module is not retired merely
because an equivalent module exists in core or adapters.

## Rules for every migration

1. Name one source of truth for future behavior changes.
2. Preserve the existing public and CLI contract unless the change is
   explicitly approved as a behavior change.
3. Add a focused parity or regression test before redirecting consumers.
4. Migrate one vertical workflow at a time; do not bulk-rewrite every script.
5. Remove the legacy implementation only after all identified consumers have
   moved and the full test suite passes.
6. Retain a replaced legacy implementation for at least one release cycle
   after the new path becomes the default, unless an explicit deprecation
   decision approves earlier removal.

## Scope

This contract governs logical module migration: ownership, imports, and
compatibility interfaces. It does not authorize behavior changes, data
refreshes, CLI redesign, dependency additions, or performance optimization.
Streaming JSON export is a separate performance track governed by
STREAMING_JSON_EXPORT_DESIGN.md.

## Current migration register

| Area | Current source of truth | Transitional compatibility | Required gate before retirement |
| --- | --- | --- | --- |
| Core pipeline | src/core/pipeline/engine.js | src/lib/jobs-normalize.js preserves all existing normalizeAshbyJob, normalizeGreenhouseJob, normalizeLeverJob, normalizeWorkdayJob, normalizeBambooHRJob, normalizeICIMSJob, and normalizeGenericAtsJob exports; new normalizeJobRecord/normalizeJobBatch helpers are additive | jobs:test-core-pipeline, provider-normalizer regression tests, and all compatibility-wrapper consumers |
| Title parsing | src/core/models/job-titles.js | src/lib/job-titles.js | Fixture parity for parsing, normalization, and CSV title rows |
| Title file loading | src/lib/config-loader.js | src/lib/job-titles.js | Migrate callers one at a time; preserve read error behavior |
| Export dedupe selection | src/lib/dedupe-select.js | src/adapters/exports/export-dedupe.js is an exact transitional copy; the adapter owns no independent behavior until cutover | jobs:test-dedupe-select parity plus an export-slice fixture comparison |
| CSV streaming | src/lib/csv.js | none | Do not replace until a new API is byte-compatible and streams output |
| ATS ingestion | src/lib/ats/*.js | src/adapters/ingestion/index.js is registry-only | Provider-level contract tests and real adapter implementations |

## Track A: logical migration

export-public-slices is the next candidate. It may use
adapters/exports/export-dedupe.js, but must retain lib/csv.js until a fixture
confirms equivalent CSV bytes. The original exporter remains the production
command until that comparison passes.

The streaming run store must reuse the exact export-dedupe ranking, key, and
decision semantics. Before implementation, extract or expose the required
dedupe helpers through a tested interface; it must not reimplement them from
document prose. It must also preserve each deduped slice's input order for
exact ranking ties; deduped top is ordered by the existing top-row sort before
dedupe selection.

## Track B: performance optimization

The large-feed memory limit originates with full-array JSON loading, not the
existing streaming CSV writer. Streaming JSON ingestion, disk-backed
deduplication, and staged publication are independent of the logical dedupe
module move. Their implementation authority, storage decision, recovery
behavior, and acceptance criteria are defined exclusively in
STREAMING_JSON_EXPORT_DESIGN.md.

Phases 1 and 2 are available only through the non-publishing
jobs:export-slices:streaming-dry-run command. It must not replace or alter
jobs:export-slices until the later parity and publication gates pass.
