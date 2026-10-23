# Storage prototype: results and review

Status: Phase 1 prototype complete. Full migration not started.
Scope: Public Job Feed only. Existing database, saved packages, and production code unchanged.

## Review decision

The storage design passed the tested data-preservation checks. It can retain every source row while storing repeated descriptions and posting content once. The sample also produced the same metric values, role counts, and report text as the existing implementation.

Do not use this prototype for a full migration yet. The test process reached about 2.02 GiB of peak memory with eight saved packages plus synthetic fixtures. The prototype holds whole tables and reconstructed rows in memory. A bounded-memory importer and audit are required before a full candidate build. Lifecycle periods and events remain a separate, unfinished phase.

This is a code and results review by the implementing agent, not an independent review.

## What was added

- [Storage module](../../src/lib/job-history-storage.js): versioned encoding, exact text and row-payload reuse, posting identities, content versions, raw row references, selected observations, a separate exception table, a reconstruction reader, and an exact-content audit.
- [Tests](../../src/scripts/test-job-history-storage.js): synthetic cases and an optional fixed sample of eight saved packages. The test builds a separate v1 database from the same inputs for comparison.
- [Machine-readable results](job-history-storage-prototype-results.json): counts, checks, file sizes, elapsed times, memory, and source-protection evidence.

The storage API creates a fresh database in a temporary directory. It accepts no database destination path. The test copies the selected source files to a separate temporary directory before scanning them. All temporary databases and copied fixtures are removed after the test. No dependency, npm command, launcher, production importer, or metric definition was changed.

The current parser, duplicate selection, URL membership, source warnings, and exception rules are reused through the existing scanner. No second implementation of those rules was added.

## Saved-file results

The fixed sample covers all four 01 header layouts, the July 15 duplicate snapshot, all three known unmatched primary URLs, the September 28 warehouse endpoint, and the October 19 package. It contains eight complete dated packages, not the full archive.

| Check | Result |
| --- | ---: |
| Raw 03 rows recovered exactly | 5,185 |
| Raw 01 rows recovered exactly | 4,590 |
| Total raw rows recovered exactly | 9,775 |
| Resolved canonical observations | 5,175 |
| Duplicate excess rows retained | 10 |
| Unmatched 01 rows retained in the sample | 3 |
| Canonical posting identities | 2,402 |
| Per-posting content versions | 2,998 |
| Distinct description values | 2,228 |
| Distinct complete row payloads | 9,552 |
| Sample source files checked before/after | 56 |

“Recovered exactly” means the same parsed field values and JSON serialization order as the existing scanner. It does not mean that normalized parsed text reproduces the original CSV bytes. The original files remain unchanged, and their byte hashes remain the source record.

Deepnote's Technical Writer has eight sample observations and one content version. A separate 60-run synthetic test has one posting identity, one description, one content version, and 60 observations. All 120 source rows across its two CSV streams are retained.

The sample contains three of the 40 known historical exception rows. It does not establish full-archive preservation of all 40. That remains a full-migration acceptance check.

## Test coverage

Passed:

- Exact row recovery with ordered fields, quoted/multiline text, long text, Unicode, and source fields that resemble internal names.
- Missing field, empty string, and NULL remain distinct. Unknown storage formats are rejected.
- Exact hash reuse rejects unequal values that share an injected test hash.
- Same JobKey with different canonical URLs remains separate.
- Latest valid FetchedAt selection and first-row tie resolution remain unchanged. All raw siblings remain available.
- A → B → A reuses the first content version. Fetch time and score changes alone do not create content versions. Title, salary, and exact description changes do.
- A prior unmatched export row remains an exception after its URL matches a posting in a later run.
- Empty snapshots remain represented. Schema variants and additional fields are preserved.
- Five constraint violations are rejected. Six deliberate data corruptions are detected, including lost exception records, lost raw rows, changed selection, and altered payloads.
- A failed transaction leaves no partial snapshot. A checkpointed database can be closed and read again without encoder caches.
- Repeated builds produce the same logical data and identity/version keys. This tests build determinism, not incremental update idempotence.
- Reconstructed populations match the existing population reader. All saved metric values, role counts, and fixed-time Markdown report sections match for the same sampled history.

The report test preserves the important difference between last raw URL row for description enrichment and latest valid FetchedAt for canonical selection. A synthetic fixture deliberately makes those rows different.

The first saved-sample comparison exposed a timestamp formatting difference: DuckDB returns `.93` where the JavaScript calculation produces `.930`. The test now applies the same TIMESTAMP conversion before comparison. No timestamp value or production calculation was changed. A count assertion was also corrected to handle the existing reader's string representation of aggregate integers. Final reruns passed.

## Storage and memory findings

| Closed-file measurement | Bytes | MiB |
| --- | ---: | ---: |
| Existing v1 implementation on the sample | 111,685,632 | 106.51 |
| Storage prototype on the same sample | 55,586,816 | 53.01 |

This is a useful storage signal, not a final reduction forecast. Both retain the same sampled source rows and artifacts. The prototype does not yet provide the wide typed SQL compatibility views, lifecycle views, or stored metric tables present in v1. The metric/report comparison uses the reconstruction adapter and existing calculations instead.

The final recorded prototype build plus audit took about 1.14 seconds; the v1 build plus audit took about 2.30 seconds. These are single-run observations with different work included. They are not a speed comparison or a performance guarantee.

The complete test process peaked at 2,170,159,104 bytes of resident memory. That includes synthetic tests, both database implementations, and sample comparisons. It is not an isolated measurement of the normalized writer. It is sufficient reason to require separate memory measurements and bounded batches before a larger run.

## Validation and source protection

Commands run successfully:

```sh
node src/scripts/test-job-history-storage.js --saved-sample
npm run jobs:test-history
npm run jobs:test-history-content
npm run jobs:test-content-metrics
npm run jobs:test-all-remote-report
npm run jobs:test-us-remote-report
npm run jobs:test-international-remote-report
node --check src/lib/job-history-storage.js
node --check src/scripts/test-job-history-storage.js
git diff --check
```

The new JavaScript files also passed separate whitespace checks, because normal `git diff` does not include untracked files.

A before/after SHA-256 check covered 3,155 existing files. All matched, including the production database and the saved package files. The saved package and warehouse file inventories also matched. The results JSON records category counts and the database hash. Existing unrelated edits were preserved.

No production history build, update, audit, or report command was run. The v1 build and audit used only temporary copied fixtures. No jobs were fetched and no external sheet or publication was changed.

## Remaining gates

| Gate | Status |
| --- | --- |
| Phase 1 storage encoding, reconstruction, constraints, and sampled parity | Passed for the tested scope |
| Full historical raw-row/exception reconciliation | Not run |
| Bounded-memory writing, reading, and audit | Required before a full candidate build |
| All wide typed SQL query contracts | Not implemented |
| Presence periods, absence/reappearance events, and duration labels | Not implemented |
| Append/no-op update and late insertion | Not implemented in the prototype |
| Source mutation during import and concurrent writers | Not qualified for this prototype |
| Process-crash recovery, file promotion, and rollback | Not qualified; transaction rollback alone is insufficient |
| Production replacement and daily launcher integration | Not started |

Recommended next work: replace the whole-table prototype caches with bounded batches, measure their memory use, and add the planned lifecycle logic with focused tests. Review those results before authorizing a full historical candidate build. Keep the current database and CSV archive in place.
