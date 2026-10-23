# Executive briefing

Research date: 2026-10-22. Status: research findings and proposed presentation content. Current code means the inspected local working tree, which already had substantial uncommitted work. Saved results are separate from fresh validation. No production workflow or external request ran for this research.

## Five useful findings

1. **The reader table is a distinct information product.** The broad saved feed has 837,215 records. The October 22 local public file has 713 display rows after selection, duplicate handling, exact exclusions, location grouping, and link cleanup. A display row can represent several postings. These are different populations, not two estimates of the same number. [M01-M10](06-project-metrics.md#main-metric-register)

2. **Link quality requires content checks.** A job URL can return HTTP 200 and only a generic Jobs page. The Ashby fixture gives a clear example. The code separates selected deterministic failures from rate limits and other ambiguous results. The saved October 22 check records 743 rows checked, 30 removed, and 12 ambiguous failures retained. [C18](11-evidence-index.md#c18), [C19](11-evidence-index.md#c19)

3. **The system has several definitions of identity and change.** Duplicate review, representative selection, public comparisons, and SQL history use related but different keys. The history keeps raw rows, selected observations, public membership, and exceptions separate. Absence from a list does not establish that an employer filled a role. [C09](11-evidence-index.md#c09), [C20-C23](11-evidence-index.md#c20)

4. **Operational success has several meanings.** A recent run can complete while some source boards fail. The saved full test dispatcher reports PASS, but the package test reports WARN, including five final rows older than fourteen days. Attempted coverage, recent successful snapshots, link checks, package identity, and public publication need separate labels. [C26](11-evidence-index.md#c26), [C32-C33](11-evidence-index.md#c32)

5. **The repository preserves incomplete transitions and failed attempts.** The default export still uses the legacy route; SQLite streaming is optional staging. Earlier history reviews retain memory failures. Later records show qualification and an accepted migration. This makes a useful story about preserving meaning during technical change, with clear dates and limits. [C25](11-evidence-index.md#c25), [C39](11-evidence-index.md#c39), [H10](11-evidence-index.md#h10)

## Three stories for the main talk

Use **duplicate identity**, **relevance versus remote geography**, and **a successful response without job content**. Each has a small example, a visible rule, and an honest limitation. They show technical depth without requiring JavaScript or SQL knowledge. The [engineering stories](04-engineering-stories.md) include ten options and select the strongest five.

Keep the memory redesign as a discussion answer. It is well documented, but it would consume too much of the main talk.

## Strongest documentation-engineering connection

The strongest connection is **information modeling with retained source evidence**. The project distinguishes what the employer supplied, what the program inferred, what a reviewer excluded, and what the reader sees. That is more specific than “technical writers can code.” It connects structured content, metadata, taxonomy, validation, and lifecycle management to concrete behavior. The comparison has limits: job identity and eligibility remain uncertain. [05-documentation-engineering-connections.md](05-documentation-engineering-connections.md)

## Recommended narrative and visual

Use this sequence: a repeated search problem -> the first spreadsheet -> a repeatable application -> three difficult information decisions -> the reader table -> transferable techniques and remaining limits.

The [outline](08-presentation-outline.md) allocates 5, 7, 10, 8, and 5 minutes, for 35 minutes total. The [slide plan](09-slide-plan.md) has 15 slides. Both demonstrations are included in those times. Allow another 15 to 20 minutes for questions.

Use a five-box talk diagram: **employer source -> common record -> review rules -> reader table -> manual upload**. Keep source URL and fetch date visible under the path. The [full Mermaid diagram](03-system-architecture.md#current-pipeline) supplies the actual technical structure, including history, reports, curated intake, and optional staging.

## Best two demonstrations

1. **A copied dated public CSV.** Show a reader's route from title and location to the employer link, match explanation, and last-check time. Show additional links for a grouped location example. Use the live Sheet only after confirming its current view and access.
2. **The HTTP 200 fixture comparison.** Show a generic Jobs shell beside a role-specific title. Explain why one rule removes the first and why uncertain failures remain. Use static cards by default; a fixture-only terminal run is optional after rehearsal.

[Five demonstration plans](07-demo-options.md) give files, expected results, preparation, risk, static alternatives, and time. No screenshots or finished deck were created.

## Numbers worth showing

Prefer three dated processing measures:

- October 22 local public file: **713 display rows**.
- October 22 top selection: **1,003 input rows -> 836 representatives**, with 167 rows removed under duplicate rules.
- October 22 primary-link review: **743 checked -> 30 removed; 12 ambiguous failures kept**.

The larger internal count is optional context. Keep recent source success separate from “100% attempted coverage.” Do not use topic mentions, feed movement, repository size, or test command counts as claims about hiring demand or user success. The [metric register](06-project-metrics.md) defines every measure and its limits.

## Claims that need confirmation

The Excel and Power Query origin comes from your request. Reachable project history starts with an already substantial application on August 13. Saved package history goes back earlier, but it does not establish when the code was written. Supply the original workbook or a dated image if you want a visual origin story. The reasons for technology choices and redesigns also need your own account. [P01](11-evidence-index.md#p01), [H01](11-evidence-index.md#h01)

Live Sheet state, public repository reachability, current sharing terms, contribution expectations, your maintenance effort, and the selected Working Notes article remain unverified. The local repository has an MIT license and a documented free Sheet policy. That is not a live access check.

## Material to omit

Omit invented time savings, audience feedback, application outcomes, market conclusions, and claims of complete or fully verified jobs. Omit code walkthroughs, every provider endpoint, private diagnostic previews, backup paths, operation identifiers, and obsolete review commands. Do not present optional staging performance as current production performance.

An unexpected useful detail is the preservation of raw historical anomalies. The clean view does not erase the ten excess duplicate raw rows or forty unmatched public rows recorded in saved history validation. That is a concrete example of evidence preservation, not just a claim that data quality matters. [C22](11-evidence-index.md#c22), [C34](11-evidence-index.md#c34)

## Final checklist for Adam

- [ ] What was one real search problem you want to describe in the opening?
- [ ] When did the Excel/Power Query version start? Can you provide the workbook, query, or an image? What did it do?
- [ ] What specific limit led you to the application? Why did you choose Node.js, Bash, and SQL? Is there a public launch date to distinguish from Git dates?
- [ ] Which debugging or redesign experience can you describe firsthand? Which existing documentation skills helped, and how do you balance the work?
- [ ] What is the current maintenance routine and actual effort? Is there a public update commitment?
- [ ] Does the public Sheet open for attendees, match the intended view, and retain the stated free-access terms? Which demonstration form do you prefer?
- [ ] Which repository, contribution, contact, and Working Notes links should appear? Which article and any images may be shown?
- [ ] What would you change if starting again, and which next step is a real priority rather than a research suggestion?
- [ ] Does the host confirm 35 minutes plus 15 to 20 minutes of questions, and the final title?

The [evidence index](11-evidence-index.md) maps claims to source symbols and commits. It also records document/code conflicts. No existing application file was edited and no commit was made.
