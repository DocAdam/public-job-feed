# Engineering stories

These are proposed presentation stories. Examples are source fixtures or saved results, not newly checked jobs. A tradeoff below is an analysis of the behavior unless a source explicitly records the author's decision.

## 1. A successful response can contain no job

**Problem:** HTTP 200 means the server sent a successful response. It does not establish that the response contains the requested posting.

**Example:** `test-job-url-health.js` supplies an Ashby page with `<title>Jobs </title>` and no role. A second fixture has a specific Technical Writer title. The first must produce `Ashby job URL returned an empty generic Jobs page.` The second must produce no issue. A generic title on another host is not treated as the same failure.

**Solution:** `classifyUrlIssue` checks final URL and page patterns. The package checker treats the known Ashby shell as eligible for safe removal. Rate limits, timeouts, and other uncertain failures have separate handling.

**Tradeoff:** the rule is provider-specific and depends on a sampled response. It cannot prove all valid jobs remain or all invalid jobs are removed. “Good” is not permanent verification.

**Evidence:** `src/lib/job-url-health.js:isAshbyEmptyJobShell`, `classifyUrlIssue`; `src/scripts/check-gsheet-url-health.js:isPrunableFailure`; `src/scripts/test-job-url-health.js`. [C18](11-evidence-index.md#c18)

**Presentation value: High.** A two-card before/after image makes the issue clear without code. It resembles checking that published documentation contains the correct content, not only that the URL loads.

## 2. The same role has several labels and links

**Problem:** alternate company labels and source rows can repeat one posting. Simple text equality misses related rows.

**Example:** `test-dedupe-select.js` uses “Careers Chenega” and “Chenega” with the same canonical application URL but different duplicate-group labels. The expected result is one selected row, with “Chenega” as the company label.

**Solution:** `groupRows` joins rows through shared duplicate or canonical-URL keys. `compareRows` gives deterministic preference to stronger records. A decision record names the selected row and summarizes rejected alternatives. The full feed still keeps duplicate flags.

**Tradeoff:** normalized URLs remove query strings. Some query strings contain job identity. Company/title/location keys can also combine separate openings. Deterministic selection is reproducible; it is not proof that the group represents one vacancy.

**Evidence:** `src/lib/job-dedupe.js:getCanonicalURLKey`, `addDedupeFields`; `src/lib/dedupe-select.js`; `src/scripts/test-dedupe-select.js`. [C09](11-evidence-index.md#c09), [C10](11-evidence-index.md#c10)

**Presentation value: High.** This shows identity design, normalization, and an audit trail in one small example.

## 3. Relevance and remote location are different questions

**Problem:** a useful writing role can be onsite, while a remote role can be unrelated to writing. Generic remote text does not establish country eligibility.

**Example:** the U.S.-remote report fixtures accept `Remote - United States` and reject generic `Remote`, `Europe, Americas`, and city/state-only `Boston, MA`. International fixtures accept explicit non-U.S. markers. The broad work-arrangement classifier can use North America as a U.S.-eligibility signal, so its population is wider than the report's.

**Solution:** `scoreWriterFit` does not add remote points. Work arrangement and geography remain filters. The public remote reports apply explicit-location rules to the final package. A multi-region role can qualify for both reports.

**Tradeoff:** cautious report rules omit some jobs that might be eligible. Broad source heuristics can include false positives. Neither checks a particular applicant's location or authorization.

**Evidence:** `src/lib/writer-fit-score.js:scoreWriterFit`; `src/lib/work-arrangement.js`; `src/lib/us-remote-daily-report.js:isConfirmedUsRemote`; U.S. and international report tests. [C11](11-evidence-index.md#c11), [C13](11-evidence-index.md#c13), [C14](11-evidence-index.md#c14)

**Presentation value: High.** A small classification table shows why metadata dimensions must stay separate.

## 4. A keyword can describe the wrong work

**Problem:** documentation terms occur in nursing, loan documents, records processing, engineering, and other work that does not own reader-facing documentation.

**Example:** the score code has clinical/non-writer penalties and writing-title exceptions. The reviewed public-package policy excludes exact posting URLs for duties outside the intended scope. It does not exclude every role called “specialist.” The local October 22 exclusion CSV records 38 selected rows affected in that package; the configured review list is a different population.

**Solution:** combine title buckets, domain signals, description evidence, quality penalties, and score guardrails. Apply human-reviewed exact posting decisions at the package boundary. Retain source records and the exclusion reason.

**Tradeoff:** phrase rules cannot fully interpret responsibilities. An exact-URL decision does not cover a new posting URL. Human review adds maintenance work. The top predicate can still include a strong title bucket even when the tier is below B.

**Evidence:** `writer-fit-score.js:applyV3Penalties`, `applyTitleMatchFloor`, `scoreWriterFit`; `test/writer-fit-regression.json`; `public-package-eligibility.js`; `docs/job-scope-review-2026-10-12.md`. [C11](11-evidence-index.md#c11), [C12](11-evidence-index.md#c12), [C17](11-evidence-index.md#c17)

**Presentation value: High.** Experienced writers can assess duties and intended audience. This story also shows the limit of title matching.

## 5. Several location postings should not overwhelm the reader

**Problem:** repeated exact titles across locations can dominate a list, but each location can have a distinct application link.

**Example:** the grouping fixture combines Technical Writer rows for US and Canada. It keeps a primary URL, puts the other URL in Additional Apply Links, shows both locations, uses the earliest posted date, and the newest last-checked time. Rows with the same title and the same location stay separate.

**Solution:** group exact normalized company/title variants only when locations differ. Keep additional application links. Prefer a Remote representative if any member is Remote.

**Tradeoff:** one display row can represent several postings. Its dates and arrangement are summaries, not values shared by every member. Grouping can hide differences in duties or eligibility if readers do not follow the individual links.

**Evidence:** `build-gsheet-package.js:groupPublicSheetCountryPostings`, `getGroupedWorkArrangement`; `src/scripts/test-gsheet-grouping.js`. [C16](11-evidence-index.md#c16)

**Presentation value: High.** It connects a visible spreadsheet feature to information design. Use a clearly labeled fixture, not a claim that these example jobs are open.

## 6. A failed fetch must not look like an empty board

**Problem:** treating a timeout as zero jobs would erase usable records. Always retaining old rows would also hide real successful empty results.

**Example:** `keepFreshBoardRow` treats the latest `success` and `empty` records differently. Failed logs do not enter the latest-live selection. A later successful empty result suppresses older rows. The saved package validation also warns about stale rows.

**Solution:** track board status and source batch separately. Use the most recent successful or empty board result. Keep the prior usable snapshot when a newer attempt fails, and report freshness separately.

**Tradeoff:** old jobs can remain after collection failure. Empty results can reflect incomplete upstream data. The system must expose both collection state and age; neither is a confirmed closure event.

**Evidence:** `merge-batches.js:updateLatestLiveFetchByBoard`, `keepFreshBoardRow`; `batch-history.js:isLiveFetch`; `test-batch-history.js`; saved package validation. [C07](11-evidence-index.md#c07), [C26](11-evidence-index.md#c26)

**Presentation value: High.** This is a strong operational story, but it needs more explanation than the three main challenge examples.

## 7. “Added,” “posted,” and “first seen” are different dates

**Problem:** a discovered job can already be old. A provider can move its reported date forward. An output can be newly generated from old source data.

**Example:** `getGreenhouseDatePosted` prefers publication fields but can fall back to `updated_at`. The saved October 22 package test records one continuing role whose Posted Date moved from October 16 to October 22. This is a saved observation, not a newly verified employer repost.

**Solution:** keep posted date, fetch time, package time, and history observation separately. Tests warn when dates move or displayed age decreases. Reports define added/removed as membership changes.

**Tradeoff:** a single normalized DatePosted field still hides differences in provider date semantics. Warnings do not recover an unknown original posting date.

**Evidence:** `jobs-normalize.js:getGreenhouseDatePosted`; `simple-public-export.js:getAgeDays`; `test-gsheet-package.js`; saved `test-gsheet-package-results.json`. [C15](11-evidence-index.md#c15), [C20](11-evidence-index.md#c20), [C26](11-evidence-index.md#c26)

**Presentation value: High.** Date labels are familiar to writers. This can replace a main example if Adam wants a stronger reporting focus.

## 8. Historical anomalies must remain explainable

**Problem:** historical files contain duplicate keys, header changes, and public rows that do not match detailed rows. Dropping them can make a clean-looking history that is wrong.

**Example:** saved validation preserves ten excess duplicate raw rows in package `20260715-0556`, and 40 unmatched public rows across historical packages. The exception reason is `no_matching_top_match_url`.

**Solution:** store raw rows, selected observations, public membership, and exceptions separately. Keep source hashes and manifests. Reject structural errors while retaining documented source warnings.

**Tradeoff:** storage and queries become more complex. Counts must name their population. A canonical key can still inherit an earlier identity limitation.

**Evidence:** `jobs-history.js:scan`; `job-history-storage.js:TABLES`; `job-history-bounded-storage.js`; `data/jobs/history/validation.json`. [C22](11-evidence-index.md#c22), [C34](11-evidence-index.md#c34)

**Presentation value: High.** This is the clearest connection to source-faithful structured content and version control. Keep the database implementation in reserve.

## 9. A redesign can pass small checks and fail at full size

**Problem:** full-history lifecycle queries and wide comparisons exceeded memory limits during local storage work.

**Example:** `job-history-full-candidate-review.md` records a full-size query failure even after other checks passed. The later full-memory review records narrower queries, short-lived workers, exact SQL/report comparisons, and a qualified candidate. A later separate receipt records migration acceptance.

**Solution:** bound parsing and database work, compare actual row values, keep failed evidence, test recovery, and use an independent old-format control before replacement.

**Tradeoff:** the test path is complex and uses temporary disk space. Measured memory margins are finite. A smaller active database does not mean all retained copies consume less disk space.

**Evidence:** the three dated review records; `job-history-prototype-files.js`; `job-history-bounded-runner.js`; relevant memory, SQL, and recovery tests. [C39](11-evidence-index.md#c39), [H10](11-evidence-index.md#h10)

**Presentation value: Medium.** Strong engineering evidence, but too much storage detail for the main 35-minute story. Use one sentence or answer it in discussion.

## 10. Coverage needs a defined unit

**Problem:** a displayed 100% coverage figure can be mistaken for complete or recent job coverage.

**Example:** saved October 22 coverage says all 50,170 eligible board keys have been attempted. A later freshness report records recent successful snapshots for 25,721 of those keys and 21,978 current failed boards. These reports have different times and should not be presented as one atomic snapshot.

**Solution:** count stable ATS plus slug board keys. Report attempts, recent successful snapshots, failures, retry delay, and package status separately.

**Tradeoff:** correct counters still need clear labels. They cannot measure employers missing from the source catalog or jobs omitted by a provider.

**Evidence:** `board-registry.js:boardKey`; `report-crawl-coverage.js`; `report-board-freshness.js`; saved coverage and freshness reports. [C32](11-evidence-index.md#c32), [C33](11-evidence-index.md#c33)

**Presentation value: High.** A useful example of documentation work inside a data product: define the noun before showing the number.

## Strongest five for this audience

1. **HTTP success without job content:** clear, surprising, and easy to demonstrate.
2. **Duplicate identity and recorded selection:** shows normalization with a visible reader benefit.
3. **Separate relevance from remote eligibility:** shows taxonomy and uncertainty.
4. **Location grouping with retained links:** connects engineering to a spreadsheet design choice.
5. **Raw history and exceptions:** shows how to preserve evidence when the clean view changes.

Use stories 2, 3, and 1 as the three main challenges, in that order. Use story 5 in the Sheet demonstration. Use story 8 for the closing documentation-engineering connection. The other stories support questions or an alternate outline.
