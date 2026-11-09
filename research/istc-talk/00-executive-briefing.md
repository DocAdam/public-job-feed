# Executive briefing

Review date: October 27, 2026. Status: research findings and draft presentation choices. This review updates the existing package. It uses local code, Git history, fixtures, and dated results. No production workflow, application test, database query, or external request ran.

## Five useful findings

1. **The reader table is a separate information product.** The fixed October 25 review records 836,592 broad records, 1,017 candidates, 847 selected representatives, and 732 final public display rows. Selection, exact exclusions, location grouping, and link checks do different work. A display row can represent several postings. [M01, M05-M09](06-project-metrics.md#main-metric-register)

2. **A loaded page can have no usable job.** The Ashby fixture returns HTTP 200 with only a generic Jobs title. The checker distinguishes that case from a role-specific page and from uncertain failures. The October 25 saved check records 761 rows checked, 29 removed, and 12 uncertain failures retained. [C18](11-evidence-index.md#c18), [C19](11-evidence-index.md#c19)

3. **Classification now preserves its source evidence.** Employment Type separates schedule from contract terms. It can display Full-time; Contract. A saved Variable Compensation case exposed a false schedule inference. The corrected rule distinguishes compensation from explicit variable hours. Missing support stays Not stated; conflicting evidence stays Needs review. [C42](11-evidence-index.md#c42)

4. **Operational metadata can damage historical evidence.** A dashboard sync changed a package after history accepted it. The October 23 repair retained the failed checks and both metadata versions. Current code finalizes metadata before import and guards later package writes. This is a clear lifecycle story. [C43](11-evidence-index.md#c43)

5. **Local output and publication have separate evidence.** The latest local package has 735 rows from October 26. The saved Sheet publication check covers 732 rows from October 25. A later remote-view operation matches 125 Remote results, with no Location filter. Its browser check found clipped text despite successful value and link checks. [C45-C47](11-evidence-index.md#c45)

## Three stories for the main talk

Use **duplicate identity**, **relevance versus remote geography**, and **a successful response without job content**. Each has a small fixture, an explicit rule, and a useful limit. They show depth without a code walkthrough.

Keep the Employment Type correction as the first reserve story. It can replace remote geography if you prefer a recent failure with a direct taxonomy connection. Keep the package-finalization failure for discussion. The [story register](04-engineering-stories.md) has 13 examples and selects five for this audience.

## Strongest documentation-engineering connection

Use **information modeling with retained source evidence**. The project distinguishes employer text, normalized fields, inferred classifications, review decisions, historical observations, and reader rows. This connects structured content, metadata, taxonomy, validation, and lifecycle management to visible behavior.

The comparison has limits. Source fields can be incomplete. Job identity is uncertain. A rule result is not employer confirmation. The [skill comparison](05-documentation-engineering-connections.md) states where each analogy stops. Your own account must establish which skills you used consciously.

## Recommended narrative and diagram

Use this sequence: a repeated search problem -> the first spreadsheet -> a repeatable application -> three difficult information decisions -> the reader table -> transferable techniques and limits.

The [outline](08-presentation-outline.md) allocates 5, 7, 10, 8, and 5 minutes. The [slide plan](09-slide-plan.md) has 15 slides and totals 35 minutes, including both demonstrations. Allow another 15 to 20 minutes for questions.

Use five main boxes: **employer source -> common record -> review rules -> reader table -> separate approved upload**. Keep source URL and fetch date visible below the path. The [full Mermaid diagram](03-system-architecture.md#current-pipeline) shows the actual launcher order, curated intake, reports, history, and optional staging. The normal launcher does not publish the Sheet or Working Notes.

## Best two demonstrations

1. **A copied October 25 public CSV.** Show title, location, primary link, match reason, Employment Type, and last-check time. Use one grouped-location fixture to explain additional links. Label it as saved output. A saved publication record supports its historical Sheet use; current live access still needs a separate check.
2. **The HTTP 200 fixture comparison.** Show the generic Jobs shell beside the role-specific title. Explain the host-specific rule and why uncertain failures stay. Static cards are the preferred form. A fixture-only terminal run is optional after rehearsal.

The [demo plan](07-demo-options.md) gives five options, inputs, expected results, preparation, risk, static alternatives, and times. No screenshots or finished deck were created.

## Metrics worth showing

Use the fixed October 25 processing counts: **1,017 candidates -> 847 representatives** and **761 link rows checked -> 29 removed; 12 uncertain failures kept -> 732 display rows**. Put the package date beside each count. Do not call these verified unique open jobs.

The Employment Type result is also useful: of 732 public rows, 202 have a supported schedule, 48 have supported terms, and 492 have neither. The first two groups overlap. This makes missing evidence visible. [M25](06-project-metrics.md#main-metric-register)

Keep the larger internal count optional. Avoid market conclusions, user success, and time-saving claims. The [metric register](06-project-metrics.md) separates October 25 talk evidence, October 26 local output, and October 27 source health.

## Claims that need your confirmation

The Excel and Power Query origin comes from your request. Reachable Git history starts with a substantial application on August 13. It does not establish the first workbook, transition date, or motive for each technology choice. Supply an original workbook, query, or dated image if you want an origin visual. [P01](11-evidence-index.md#p01), [H01](11-evidence-index.md#h01)

Current public access, repository reachability, contribution expectations, maintenance effort, and the chosen Working Notes article remain unresolved. The local repository has an MIT license and a documented free Sheet policy. Saved publication records do not establish current sharing settings or live job status.

## Material to omit

Omit invented time savings, reader feedback, application outcomes, and market claims. Omit line-by-line code, every provider endpoint, private diagnostic previews, backup locations, and old operational commands. Do not present optional SQLite staging as the normal production exporter. DuckDB history is a side branch built from packages, not the source of the current feed.

An unexpected useful detail is that a valid spreadsheet filter answered the wrong question. The old fixed Location policy was not equivalent to all rows marked Remote. The later saved view change makes that distinction concrete. Another useful detail is that history retains raw anomalies instead of erasing them to obtain a clean count. [C22](11-evidence-index.md#c22), [C46](11-evidence-index.md#c46)

## Final questions for Adam

- [ ] What is one true search example for the opening? What may be shown publicly?
- [ ] When did the Excel/Power Query version start, what did it do, and can you supply a workbook, query, or image?
- [ ] Which limit led to the application? Why these technologies and providers? Is there a public launch date distinct from Git dates?
- [ ] Which failure or redesign can you describe firsthand? Which documentation skills helped, and how do you balance writing and programming?
- [ ] What is the current maintenance routine and actual effort? Is there a public update commitment?
- [ ] Which reader view should the talk show? Do you prefer static fixture cards or a rehearsed terminal run?
- [ ] What are the final Sheet, repository, contact, and Working Notes links? Which article or images may be used? Are free-access and contribution terms current?
- [ ] What would you change if starting again? Which next step is a real priority?
- [ ] Does the host confirm the title, 35-minute talk, and 15 to 20 minutes of questions?

The [evidence index](11-evidence-index.md) maps the claims to code, dated records, and commits. It also records conflicts and limits. Only these 13 research documents were changed. Existing staged work was preserved. No commit was made.
