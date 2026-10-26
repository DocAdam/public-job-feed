# Employment Type and backup release verification — 2026-10-25

**Overall result: NEEDS REVIEW.** The backup correction passed isolated tests and a real recovery backup. The one approved production refresh verified the corrected parser. Feed, package integrity, and history passed. The backup for the new history generation failed the local space guard. The full task is not complete.

Derived verification report. Assumption: a later Sheet import will use the final cleaned public CSV. No live Sheet state was read or changed.

## Run and code state

- Run: `67c4d611-e94f-4394-ab60-11a1de04e4bf`.
- Package: `20261025-0724`.
- Time: 2026-10-25 07:02:42 to 07:36:30 CDT. Elapsed: **33 minutes 48 seconds** (2028.128 seconds).
- Revision: `96067095fd634c6f5e0d9d2f381423997a743b11` with existing working changes. No commit was made.
- Launcher SHA-256: `c8bc35baccefbaf9f1187dd52890de1d9faadb94851234137d29804f02039026`.
- No conflicting lock was present at launch. The launcher refuses a conflicting owner; no lock wait was observed. Its source and tested backup/parser code stayed unchanged. All 289 frozen file hashes match.

[Run result](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/process-result.json) · [Preflight](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/preflight.json) · [Frozen-code check](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/code-freeze-check.json)

## Backup correction and recovery

The October 24 pending bundle had 3,304 extra AppleDouble files. Its failed report and candidate remain unchanged. No older candidate was promoted or edited. The exact file producer remains unknown: small file-creation probes on the same drive produced no sidecars, with or without COPYFILE_DISABLE.

New bundles select `metadataPolicy: appledouble-provenance-v1`. A permitted sidecar must have the exact observed 4,096-byte encoding and name a required file or the payload directory in the same directory. Only the 11-byte com.apple.provenance value can vary. Every other byte must match the fixed profile, including the attribute table, padding, zero Finder data and blank resource-fork representation. A ._ name alone is insufficient. Unknown encodings, attributes, files and symbolic links fail. Old manifests retain their exact-file rule. No source or backup xattr is removed. Payload checksums, required files, safe paths, full restore, audit and report comparison remain mandatory. The updated verifier is included in new saved runtimes.

`npm run jobs:history-backup` uses the shared backup creator under the refresh lock and history lease. It audits the accepted generation without collection, import or retention. It writes a separate backup-only report and returns a failing exit code on failure. It does not rewrite the earlier daily failure.

**Recovery backup: PASS.** Run `68c5ece2-eff1-4828-8e83-b485b12c958a` took 515.593 seconds (8 minutes 36 seconds). It restored all 3,306 payload files, checked their hashes, audited the restored database, matched the report exactly, passed final inventory acceptance, and then promoted the candidate. It imported zero packages. This new bundle contained zero metadata sidecars; the observed metadata case passed in isolation.

- Folder: `/Volumes/1Pugh/Public Job Feed Archives/daily-history-v1/daily-20261025T115307546Z-0803bb1b-9cf2-49ee-81db-61287e4955da`.
- Covered package: `20261024-0954`; generation `66646ce5-b440-47c2-a8a8-75c003da4c28`.
- Database SHA-256: `74ecdf0af2a90b3c9986cd575e325bd6e28cde60d226c117e3432868cd4cfc42`.
- This recovery backup does not cover the later production generation.

[Recovery result](../../verification/backup-recovery-release-20261025T114249Z/backup-recovery/attempt-1-result.json) · [Full restore proof](../../verification/backup-recovery-release-20261025T114249Z/backup-recovery/VERIFIED.json) · [Fresh accepted-bundle check](../../verification/backup-recovery-release-20261025T114249Z/backup-recovery/accepted-verification.json) · [Correction design and limits](../../verification/backup-recovery-release-20261025T114249Z/backup-recovery/correction-design.json)

## Isolated tests

All **38/38 commands passed** for the final candidate, run `isolated-c88544ba-746a-46ec-94c7-926c08242254`. The focused backup test also passed. The suite includes backup, history, package finalization, restore, parser, grouping, streaming, and saved-corpus release checks. The OS denied network access and writes outside the isolated folder. The passive-launcher smoke test read the original launcher configuration under the same restrictions. The network guard self-test blocked its test request before transmission.

The backup tests cover a normal and an old valid bundle; the exact observed sidecar; every fixed profile byte; missing and changed payloads; unrelated files; misleading ._ names; an extra attribute; unknown policy; unsafe paths; symlinks; incomplete proofs; interrupted creation; rejected candidates; a complete real fixture restore; and state updates only after acceptance.

The first suite attempt stopped because the test copy lacked the repository test folder. That setup failure is retained. The folder was copied and the entire suite passed. No production data or report was changed by the isolated tests.

After testing, this task moved its completed large test-input copies to its separate drive test folder. Hashes were checked before removal of the new local copies. The old verification snapshot remains in place. The relocation record gives retained paths and rerun instructions. It is test evidence, not a substitute production backup.

[Full suite and per-command results](../../verification/backup-recovery-release-20261025T114249Z/isolated/suite-results.json) · [Focused backup test](../../verification/backup-recovery-release-20261025T114249Z/isolated/focused-backup.log) · [Guard self-test](../../verification/backup-recovery-release-20261025T114249Z/isolated/guard-self-test.json) · [Setup correction](../../verification/backup-recovery-release-20261025T114249Z/isolated/attempt-1-isolation-setup-error/diagnosis.json) · [Fixed-input relocation](../../verification/backup-recovery-release-20261025T114249Z/isolated/relocated-fixed-inputs.json)

## Actual parser and source results

The complete canonical feed has **836,592 records**: 35,192 observations at or after run start, including two curated records, and 801,400 retained observations. All 35,190 collected batch contracts match the merged output. There are zero schema or evidence-date errors. Export time did not replace source observation dates.

- Zero unqualified Variable schedule values remain. Four Variable Compensation titles were observed without that false schedule inference.
- All 42 compatible variable-hours/schedule records retain supported evidence without a false full-time or part-time conflict.
- All 343 genuine full-time/part-time contradictions retain Needs review.
- All 836,592 stored employment contracts are unchanged by a further application of the corrected parser.

The previous in-memory projection changed 153 old canonical records. The new collection does not have the same observation population. The review matched 137 observations; 16 no longer occur with the same source identity and date. All 137 matched records come from legacy batches without employment fields. The normal merge re-extracted those batches. Its output differs from the old canonical-only projection in 116 cases, but all 137 match their source-batch contracts. Source titles, descriptions, URLs and dates are unchanged. The audit retains the 116 rejected earlier derived annotations with their original passages, URLs and dates. The current canonical file has no RejectedValue entries. A migration of an existing invalid normalized evidence item passed in isolated tests; no such current batch item was observed.

The initial checker treated any difference from the old canonical projection as a failure. The first result is retained. Source-batch review resolved that assumption. No production code or data was changed after the run.

[Full artifact checks](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json) · [Retained source and rejected-annotation review](../../verification/backup-recovery-release-20261025T114249Z/final/retained-parser-evidence-review.json) · [Initial comparison record](../../verification/backup-recovery-release-20261025T114249Z/final/artifact-check-first-comparison.json)

## Coverage and source limits

| Population | Rows | Stated schedule | Stated terms | Neither | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Detailed shortlist | 847 | 249 | 54 | 556 | 0 |
| Eligible detailed records before grouping | 811 | 239 | 52 | 531 | 0 |
| Cleaned public rows | 732 | 202 | 48 | 492 | 0 |

Schedule and terms counts overlap. The original 15 public columns retain their positions; Employment Type is P. Internal evidence is absent from the simple CSV. The schema, coverage, import instructions, manifest sizes, and dated/latest copies agree. The daily profile has no formula CSV; formula parity and prune synchronization passed in isolated tests.

| New source | Collected records | Records with structured evidence, including unknown labels |
| --- | ---: | ---: |
| ashby | 6902 | 6902 |
| bamboohr | 614 | 614 |
| greenhouse | 13965 | 5482 |
| icims | 1465 | 0 |
| lever | 10147 | 9961 |
| workday | 2097 | 1660 |

The normal collector archived normalized records and evidence. Successful raw API responses were not retained, so independent source tracing starts at those normalized batches. Workday detail-only fields and iCIMS detail fields remain outside this release; no new detail requests were added. New iCIMS cards had no structured employment field. Missing or unmapped labels remain unknown.

## Counts, links and freshness

On the same 836,592 canonical records, both comparison rule sets selected 847 rows from 1,017 strong candidates. Both retained 811 eligible records and produced 761 rows after grouping. Selection and grouping deltas are zero. Employment fields cause zero score or identity-key differences on these same candidates.

The prior public package had 715 rows; this one has 732. It has 22 added public URLs, 5 removed URLs, and 710 shared URLs. Employment labels changed on 52 shared URLs. These are URL-row differences, not proof of an employer posting, reopening or closing a job. The pre-link population increased from 744 to 761, while both runs pruned 29 rows.

The current link check examined 761 rows: 720 Good, 41 Bad, 29 deterministic failures pruned, and 12 ambiguous failures retained. A retained row is not proof that its application is open.

Collection attempted 300 boards: 297 success, one empty, and two failed Lever checks (Mainspringenergy and Hive, TIMEOUT). The package has 24 rows last checked more than seven days ago, including five more than fourteen days ago. The oldest date is June 30. The wider saved board report has 21,047 due boards out of 50,170; 30,232 were checked within seven days, but only 21,299 have a successful snapshot within that period. Its 22,061 failed-board states and 8,758 retry-delayed failures remain visible. Attempt coverage, freshness and success are separate measures.

[Same-input comparison](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/artifact-verification.json) · [Public row comparison](../../verification/backup-recovery-release-20261025T114249Z/final/public-row-comparison.json) · [Collection outcomes](../../verification/backup-recovery-release-20261025T114249Z/final/collection-results.json) · [Freshness report](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/board-freshness-report.json)

## Current history and backup gate

**History: PASS.** Package 20261025-0724 is snapshot 159. Generation: `2b1dae2f-4112-493d-8252-e1a14d0832d1`. Database hash: `346ef76c186cf0c9ba795d078c6347c9c99fc5b50fbed6f9a82cbaf3a5af3014`. The normal audit passed. A separate READ_ONLY query confirmed 847 observations, zero missing employment statuses and zero invalid evidence JSON.

**Current backup: FAILED.** The normal space guard stopped before creating a candidate for this generation. The report says Insufficient space for backup and full restore test. No unchanged failing retry was made. The last accepted backup still covers 20261024-0954.

The exact current inventory has 3,329 files and requires 4,608,705,398 restore bytes (4.29 GiB), plus the unchanged 32 GiB reserve. At measurement, free space was 34.25 GiB; required space was 36.29 GiB. The shortfall was 2.04 GiB (2,195,800,950 bytes).

The authorized work is complete up to this gate. A narrow proposed next action is to relocate one 4,017,995,774-byte prior fixed-input snapshot to the verified drive, verify its hash, and keep its original path as a link. This proposal is not executed because it changes an older saved snapshot protected by AGENTS.md. APFS sharing can limit the space released; check actual headroom before any backup-only retry. Do not rerun the complete refresh.

[Current history/backup result](../../verification/backup-recovery-release-20261025T114249Z/production-refresh/reports/daily-history-backup.json) · [Independent history query](../../verification/backup-recovery-release-20261025T114249Z/final/history-readonly-verification.json) · [Exact space check](../../verification/backup-recovery-release-20261025T114249Z/final/exact-backup-space.json) · [Reviewable relocation proposal](../../verification/backup-recovery-release-20261025T114249Z/final/proposed-space-action.json)

## Timings

| Stage | This run seconds | October 24 seconds |
| --- | ---: | ---: |
| Step 1 | 388 | 409 |
| Step 2 | 883 | 926 |
| Step 3 | 63 | 64 |
| Step 4 | 21 | 21 |
| Step 5 | 58 | 52 |
| Step 6 | 1 | 1 |
| Step 7 | 84 | 76 |
| Package finalization | 0 | 0 |
| History and backup check | 530 | 839 |
| Step 8 | 0 | 0 |

This launcher took 2,028.128 seconds; the prior run took 2,388.318 seconds. The current backup stopped before copy and full restore. The runs also used different sources and records. The elapsed-time difference does not measure feature overhead or a speed improvement. The separate recovery backup took 515.593 seconds. The old 54 ms shortlist benchmark is not a daily-refresh duration.

## Preservation, documents and remaining work

All 224 baseline reports retain their saved bytes and modification dates. Checks found no changes or missing entries among 28,443 old batch/package entries and 16,286 old external entries. This is a metadata and link check for historical source trees, not a full byte rehash. The 289 frozen runtime files are unchanged. No lock remains. The earlier Greenhouse preservation failure remains historical evidence; no missing old contents or dates were invented.

README.md, feature documentation, the verification entry point, and daily backup instructions now state the implemented rule, backup-only command, observed production results, and current space failure. No live Google Sheet update, commit, push, PR, dependency installation, schedule change, publication, or Job Finder record change occurred.

Remaining required work: restore sufficient local headroom, then create and fully verify a backup-only candidate for the current generation. The exact metadata producer, original successful raw response bodies, and a natural current rejected-normalized-item migration remain unverified limits. The parser and feed gates pass. The current-generation backup gate fails.

## Acceptance ledger

[Complete requirement records with run, package, generation and input hash](../../verification/backup-recovery-release-20261025T114249Z/final/acceptance.json)

| Requirement | Status | Limit |
| --- | --- | --- |
| Preserve the baseline and current reports | PASS | 224 current reports retained with equal contents and original modification dates. |
| Earlier Greenhouse reports preserved before their original overwrite | FAIL | Historical failure from the implementation task. Missing prior contents and dates were not invented. |
| Strict handling of the demonstrated metadata format | PASS | Exact observed profile tested. New manifests opt in. Older manifests keep the strict file rule. No arbitrary ._ files qualify. |
| Backup safety and failure regression cases | PASS | Normal and old bundles, missing/changed payloads, unrelated files, invalid metadata, unknown attributes/policy, paths, symlinks, incomplete proof, interruption, rejection, full restore, and state update after promotion passed. |
| Complete final candidate suite | PASS | 38/38 commands passed with network denied and writes confined to the isolated folder. Initial missing-test-folder setup failure is retained separately. |
| Real recovery backup and complete restore | PASS | 3306 payloads restored and hashed. Restored audit and exact report comparison passed. Candidate accepted afterward. |
| Recovery covers the accepted pre-refresh generation | PASS | Generation 66646ce5-b440-47c2-a8a8-75c003da4c28; package 20261024-0954; not evidence for the later generation. |
| Old bundles preserved during recovery | PASS | 16286 original entries have unchanged size, modification date and mode. No old bundle was repaired. |
| Exactly one new normal production refresh | PASS | Run complete, exit 0; 2028.128 seconds. One launch marker. No second refresh. |
| Tested source unchanged during production | PASS | 289 runtime and launcher files plus package controls checked; differences zero. |
| Distinct package from this refresh | PASS | Package 20261025-0724 belongs to this run. |
| Public column is appended; evidence is internal | PASS | Original 15 columns retained; Employment Type is P. Internal evidence is absent. |
| Public labels validate | PASS | 732 rows; schedule 202, terms 48, neither 492, conflicts 0. Schedule and terms overlap. |
| Schema, final coverage, and import range agree | PASS | Final CSV, schema, coverage, and instructions agree on 732 rows and A1:P733. |
| Manifest sizes and formats agree | PASS | No size or format differences in dated and latest manifests. |
| Latest and dated copies agree | PASS | CSV, schema, coverage and instructions have equal hashes. |
| Current URL check and safe prune completed | PASS | 761 checked, 29 deterministic failures removed, 12 ambiguous failures retained; final 732. |
| Production suite belongs to this run | PASS | All 38 production commands passed for this run and package. |
| Current refresh and package validation pass | PASS | Refresh PASS. Package WARN with no failures: 24 rows older than 7 days, including 5 older than 14 days. |
| Detailed CSV contains valid JSON arrays | PASS | 847 detailed rows have valid employment arrays. |
| Shortlist evidence survives detailed CSV | PASS | No differences between shortlist and detailed CSV. |
| Corrected parser is materialized throughout the actual canonical feed | PASS | All 836592 actual records are stable under the corrected parser. Legacy source comparison resolves the old canonical projection difference; see the separate review. |
| Canonical employment contract and observation dates validate | PASS | 836592 records; zero contract or evidence-date errors. 35192 new observations and 801400 retained. |
| Genuine schedule contradictions remain Needs review | PASS | 343 genuine full-time/part-time contradictions; all retain Needs review. |
| Free text Variable values require an explicit schedule | PASS | Zero unsupported Variable schedule values. |
| Variable hours or shifts do not contradict stated full-time or part-time hours | PASS | 42 compatible variability records; zero false conflicts. |
| New normalized batch evidence survives merge | PASS | All 35190 collected records match their merged employment contracts. |
| Controlled selection reproduces actual shortlist | PASS | 1017 strong-match candidates reproduce 847 selected rows. |
| Final public labels trace to current grouped shortlist | PASS | No label differences. |
| Employment fields do not change scores or identity keys on the same inputs | PASS | 1017 candidates; zero score or identity-key differences. |
| History result belongs to this run and package | PASS | Current generation accepted; History PASS, Backup FAILED. |
| New accepted backup covers the production history generation | FAIL | FAIL. The new generation has no accepted backup. The space guard stopped before candidate creation. The recovery backup covers the earlier generation only. |
| Retained legacy source text, URLs, dates and rejected earlier annotations remain available | PASS | 137 same observations match their original batch contracts with unchanged source text, URLs and dates. The audit retains 116 rejected earlier annotations. |
| Current history contents verified independently | PASS | READ_ONLY query confirmed 847 observations, zero missing statuses and zero invalid JSON evidence. |
| Previous packages, batches, reports and external bundles retained | PASS | 224 report hashes/dates match. 28443 old batch/package entries and 16286 old external entries have no differences. Historical batch bytes were not all rehashed. |
| Exact metadata-file producer established | NOT VERIFIED | Small creation tests did not reproduce the files. The correction handles the observed format; it does not claim to remove its cause. |
| Successful raw API bodies independently inspected | NOT VERIFIED | Successful raw bodies are not archived. Trace starts at normalized batch evidence. No added detail request. |
| Current rejected-evidence migration observed from a normalized batch | NOT VERIFIED | Current matched legacy batches have no employment fields. Migration of an existing invalid normalized item passed in isolated tests; current canonical has zero RejectedValue entries. |
| Live Sheet unchanged | PASS | No Sheet import, resize, filter, pivot or API write occurred. |
| No commit, push, PR, dependencies, schedule or Job Finder record change | PASS | Existing work retained. The normal local consumer export belongs to this repository; its title-policy input was read only. |

## Exact CSV and proposed Sheet range

CSV: [/Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv](/Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv)

SHA-256: `460338c0067c15a64196c836b83032b4309c6095f08b8e03b70b27ebbadbc963`.

Proposed table, filter and pivot source range: `01_good_documentation_jobs!A1:P733`. This includes the header and 732 data rows. No Sheet import or range change was made.
