# Board identity state assessment: 2026-11-05

**Derived read-only assessment. Existing state is not repaired.**

Fix commit: `656948c29807a1854f039b6b7b321a9ce3aaa749`. Saved board state: `2026-11-05T11:53:44.365Z`. These are saved-file results, not live board-health results.

The comparison found **14 confirmed saved-field mismatches**, **17 possible exposure cases**, and **1 known-identity case with insufficient evidence**. Another 30 comparison boards had no date mismatch in the inspected evidence. A separate group of 336 legacy BambooHR records has an unresolved coverage-identity policy.

## Scope and evidence

- Examined all 50,170 state records and 40,857 company-coverage rows to identify current fallback relationships. Of these state records, 27,178 use ATS types that permit company-key fallback.
- Current same-company groups for those ATS types contain 62 boards in 31 groups: 50 Ashby boards and 12 Lever boards. There are 31 known-different current fallback targets.
- Detailed comparison covers those 62 boards plus 336 legacy BambooHR records. Workday and iCIMS are excluded from company-key fallback; their 10,462 shared-company boards are outside this defect assessment.
- Read 1,507 available raw fetch logs with 509,493 rows, and six monthly history files, June through November 2026, with 694,984 rows. These sources overlap. Do not add their row counts.
- Joined relevant events by source batch, ATS, slug, fetch date, and status. Retained 6,782 distinct relevant events. Date comparisons use events at or before the saved state generation time.
- Hashed 1,518 source files. A second read confirmed unchanged bytes and the same raw-log inventory. The JSON companion contains every source path, SHA-256 hash, source location, saved record, and case result.

## Confirmed saved-field mismatches

A saved attempt or success date does not match an exact-board event, but matches a known different board event with the same company key. Each positive different-board match has both a raw-log reference and a monthly-history reference. The discrepancy is confirmed within this retained evidence. Attribution to the earlier synchronization call is an inference from the reproduced code defect; a writer trace is not retained.

| Saved board | Different board | Mismatched saved fields | Saved fetch status |
| --- | --- | --- | --- |
| `ashby\|axiom-co` | `ashby\|axiom` | `LastAttemptAt`, `LastSuccessAt` | `empty` |
| `ashby\|bland-ai` | `ashby\|bland` | `LastAttemptAt`, `LastSuccessAt` | `success` |
| `ashby\|cside` | `ashby\|c-side` | `LastAttemptAt` | `failed` |
| `ashby\|duckduckgo` | `ashby\|duck-duck-go` | `LastAttemptAt`, `LastSuccessAt` | `success` |
| `ashby\|finnihealth` | `ashby\|finni-health` | `LastAttemptAt`, `LastSuccessAt` | `success` |
| `ashby\|focus-ai` | `ashby\|focus` | `LastSuccessAt` | `failed` |
| `ashby\|himsandhers` | `ashby\|hims-and-hers` | `LastSuccessAt` | `failed` |
| `ashby\|meridian-ai` | `ashby\|meridian` | `LastAttemptAt` | `failed` |
| `ashby\|paradigm-ai` | `ashby\|paradigm` | `LastSuccessAt` | `failed` |
| `ashby\|plaud-ai` | `ashby\|plaud` | `LastSuccessAt` | `failed` |
| `ashby\|scrunch-ai` | `ashby\|scrunch` | `LastSuccessAt` | `failed` |
| `ashby\|workos-inc` | `ashby\|workos` | `LastSuccessAt` | `failed` |
| `lever\|beetalents` | `lever\|bee-talents` | `LastSuccessAt` | `failed` |
| `lever\|vevo-ai` | `lever\|vevo` | `LastSuccessAt` | `failed` |

These 14 records include four success or empty records with both dates attributed to another board, eight failed records with a different board's success date, and two records with a different board's failed-attempt date. This is 18 mismatched date fields. Other fields can also be affected; they were not reconstructed here.

### WorkOS example

- `ashby|workos-inc` has saved `LastSuccessAt = 2026-10-31T09:00:36.993Z`.
- That date belongs to a successful `ashby|workos` event in batch `maintain-due-ashby-20261031t090004`. Raw log: `data/jobs/batches/maintain-due-ashby-20261031t090004/jobs-batch-fetch-log.json`, array item 203. History: `data/jobs/index/history/fetch-events/2026-10.jsonl.gz`, uncompressed JSONL line 17577.
- All 28 retained exact-board attempts for `ashby|workos-inc` are failed. No retained exact-board success supports the saved success date. This does not prove the board never succeeded outside retained evidence.
- Its current `2026-11-05T10:00:34.203Z` failure has exact-board support in both the raw log and November history. A valid latest failure does not validate the earlier saved success date.
- The saved failure count is 1 and the retry date is `2026-11-06T10:00:34.203Z`. This assessment does not infer corrected values.

## Possible exposure, without confirmed current date corruption

These 17 records have a known-different company fallback candidate, but their populated saved dates have exact-board support. They are possible exposure cases, not confirmed damaged records. Company equality alone is not evidence of a bad saved result.

`ashby|arcade-ai`, `ashby|clasp-group`, `ashby|daydream-ai`, `ashby|fractional-ai`, `ashby|fulcrum-inc`, `ashby|glimpse`, `ashby|gradient-labs`, `ashby|injective-labs`, `ashby|nory-co`, `ashby|posh-ai`, `ashby|pylon-labs`, `ashby|titan-ai`, `ashby|twelve-labs`, `lever|apex-ai`, `lever|invisible-ai`, `lever|ritual-technologies`, `lever|spear-ai`.

## Unknown cases

### Known board identity

`lever|apex` has saved `LastSuccessAt = 2026-07-14T20:52:16.039Z`. No retained exact-board live event or same-company sibling event supports that date. Its current failure is supported by an exact-board event. The origin of the success date is unknown. It must not be assigned to `lever|apex-ai` without more evidence.

### Legacy coverage without usable identity

There are 10,245 company-coverage rows without identity under the current URL readers. After the existing ATS exclusions and exact-board precedence, 336 current board records can use such fallback; all are BambooHR. These 336 records have exact-board support for their populated saved attempt and success dates. The comparison did not find a date mismatch in that group.

The missing coverage identity still prevents a decision about past fallback attribution or future acceptance policy. No legacy row was reclassified, rejected, or migrated. The JSON companion lists all 336 records separately.

## Evidence limits

Four batch folders have no raw fetch log:

- `data/jobs/batches/maintain-catalog-delta-icims-20260714t214752/jobs-batch-fetch-log.json`: missing raw fetch log.
- `data/jobs/batches/maintain-catalog-delta-workday-20260714t214752/jobs-batch-fetch-log.json`: missing raw fetch log.
- `data/jobs/batches/maintain-due-greenhouse-20260927t210002/jobs-batch-fetch-log.json`: missing raw fetch log.
- `data/jobs/batches/maintain-due-greenhouse-20260928t090002/jobs-batch-fetch-log.json`: missing raw fetch log.

These missing files are two excluded ATS batches and two Greenhouse batches. They do not supply the positive different-board matches listed above. Monthly history can retain events after raw batches are absent; retained evidence is not a complete proof of every historical attempt.

The 30 comparison boards with no date mismatch are listed in the JSON companion. This result does not prove that all saved fields or past states were correct. Groups are based on current company keys and current coverage. Removed siblings and historical company-key changes are not fully covered. No archive restoration or external fetch was performed.

## Separate next scope

Review the 14 confirmed discrepancies first. Any later repair design must identify each affected field, its exact-board source, and a rule for evidence gaps. Preserve the original records and retain the source manifest. Assess the 17 possible exposures and the unresolved `lever|apex` date without assuming they need repair. Decide legacy coverage policy separately.

No repair values, state reset, retry change, deletion, collection run, schedule change, Sheet update, or publication is proposed or performed in this assessment. This report and its JSON companion were created after the fix commit and remain uncommitted.

Companion evidence: [board-identity-state-assessment-2026-11-05.json](board-identity-state-assessment-2026-11-05.json).
