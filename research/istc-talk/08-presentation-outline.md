# Proposed 35-minute presentation

Status: proposed narrative, not a script or finished deck. Allow a separate 15 to 20 minutes for questions. Total event allocation: 50 to 55 minutes. Confirm the host's slot before final slide creation.

Title: **I Got Tired of Searching for Documentation Jobs, So I Built My Own Job Feed**.

Central point: Adam encountered a repeated information problem. He reports starting with Excel and Power Query. The repository shows a larger process that collects, structures, checks, and presents job records. The most useful lesson is how explicit content and quality decisions make the output usable and its limits visible.

Personal narrative must come from Adam. Notes below are draft prompts. They do not supply invented reactions, time savings, or outcomes.

## Part 1. Why I built it

**Time:** 0:00 to 5:00. Slides 1 to 3: 1 + 2 + 2 minutes.

**Main point:** this began with a specific information need, not a technology choice.

**Supporting evidence:** Adam's supplied account of irrelevant results, repeated postings, old links, and repeated searches. The README identifies the reader-facing Sheet and local pipeline. The Excel origin is not independently established by Git. [P01](11-evidence-index.md#p01), [C01](11-evidence-index.md#c01)

**Draft narrative prompts:**

- Identify the documentation-job search task you repeated.
- Give one true example of a result that was difficult to use.
- Explain what the first spreadsheet needed to do.
- State that Excel and Power Query were the first solution, after confirming the dates and supporting image.

**Slide concepts:** title plus reader output; one search problem; the first workbook. A simple “collect, organize, review” drawing can replace the workbook image until Adam supplies one.

**Visual:** a real old workbook image, if available. Otherwise use a labeled reconstruction with no invented data or dates.

**Transition:** “The spreadsheet addressed the first problem. The next question was how to make the process repeatable.” This is a proposed transition; Adam must confirm that it matches his experience.

## Part 2. From spreadsheet to application

**Time:** 5:00 to 12:00. Slides 4 to 6: 2 + 3 + 2 minutes.

**Main point:** the project is now a set of connected information-processing steps. It did not acquire all of them in the first Git commit.

**Supporting evidence:** initial imported application, later architecture/streaming work, direct-employer intake, report provenance, and history. The normal launcher remains the best guide to operational order. [H01-H10](11-evidence-index.md#h01), [C05](11-evidence-index.md#c05)

**Draft narrative prompts:**

- Give the known origin separately from the first recorded Git milestone.
- Describe JavaScript/Node.js as the processing runtime, Bash as the ordered launcher, and SQL as the way to compare saved history.
- Explain the main path in plain language: employer source, common record, review rules, reader table, manual upload.
- Explain why the internal collection is much larger than the reader view.

**Slide concepts:** a short timeline; five-box architecture; broad collection versus useful display. Use the dated 837,215 internal records and 713 local public rows only with population labels. [M01](06-project-metrics.md#main-metric-register), [M09](06-project-metrics.md#main-metric-register)

**Visual:** a simplified derivative of [the research diagram](03-system-architecture.md#current-pipeline). Add “manual upload” at the final arrow. Put SQLite staging and DuckDB history in small side notes only if needed.

**Transition:** “The useful work happens in the rules between the source and the table. Three examples show why those rules matter.”

## Part 3. Three problems worth solving

**Time:** 12:00 to 22:00. Slides 7 to 9: 3 + 3 + 4 minutes.

**Main point:** a clean-looking list needs explicit identity, classification, and quality decisions.

### Duplicate identity, 3 minutes

Show two fixture rows with alternate company labels and the same canonical URL. Explain selection reasons and the retained broad record. State the limit: similar rows can still describe separate openings. Use the saved top-selection reduction, 1,003 to 836, as a processing measure. [C09](11-evidence-index.md#c09), [C10](11-evidence-index.md#c10), [M05](06-project-metrics.md#main-metric-register)

### Relevance and remote geography, 3 minutes

Show a small table with separate columns for writing relevance, work arrangement, and explicit country evidence. Use the remote-report fixture values. Explain that generic Remote is not sufficient for the cautious U.S. report. Do not equate a high writing score with applicant eligibility. [C11](11-evidence-index.md#c11), [C13](11-evidence-index.md#c13), [C14](11-evidence-index.md#c14)

### A loaded page without a job, 4 minutes

Spend two minutes on the HTTP 200 fixture cards. Spend two minutes on the rule and its limits. Show the saved 743 checks, 30 removals, and 12 retained ambiguous failures. Avoid saying “all remaining links are verified.” [C18](11-evidence-index.md#c18), [M07-M08](06-project-metrics.md#main-metric-register)

**Draft narrative prompt:** for each example, explain the bad result, the implemented rule, and what that rule still cannot know. If there was a personal debugging incident, Adam can add it after confirmation.

**Visuals:** before/after rows; a three-column classification table; two small page cards. No line-by-line source walkthrough.

**Transition:** “Those decisions explain the columns and links a reader sees.”

## Part 4. Good Doc Jobs walkthrough

**Time:** 22:00 to 30:00. Slides 10 to 12: 2 + 3 + 3 minutes.

**Main point:** show what a reader can do and explain the evidence behind the visible fields.

**Supporting evidence:** simple export schema, grouping rules, final saved package, and saved comparison report. The actual live Sheet must be checked separately. [C16](11-evidence-index.md#c16), [C20](11-evidence-index.md#c20), [C30](11-evidence-index.md#c30)

**Walkthrough sequence:**

1. State the saved package date and show the main columns. Identify the employer application link.
2. In a copied CSV, filter by role or arrangement. Show Why It Matched and Additional Apply Links using a suitable saved or labeled fixture example.
3. Compare Posted Date, Last Checked, and package/report time. Point out that they answer different questions.
4. Show the saved added/removed summary and explain list membership.

**Draft narrative prompts:** identify the reader task each field supports. Show how to return to the employer posting. Explain that a high score, current package, or old link check cannot guarantee a job is still open.

**Slide concepts:** reader view; one grouped row and useful fields; dates and membership changes.

**Visual/demo:** option 1 in [the demo plan](07-demo-options.md). Use a copied dated CSV as the default. Use the public Sheet only after confirming its current layout and update date. Keep two screenshots as the event fallback.

**Transition:** “The table is a result of content modeling, classification, validation, and lifecycle rules. Those are familiar kinds of documentation work.”

## Part 5. Lessons and open questions

**Time:** 30:00 to 35:00. Slides 13 to 15: 2 + 2 + 1 minutes.

**Main point:** make the information decisions explicit, keep source evidence, and expose uncertainty.

**Supporting evidence:** separate source/derived fields, deterministic duplicate selection, exact-URL review, raw history and exceptions, and code/documentation migration limits. [C04](11-evidence-index.md#c04), [C17](11-evidence-index.md#c17), [C22](11-evidence-index.md#c22), [C25](11-evidence-index.md#c25)

**Draft narrative prompts:**

- Give three concrete skill connections: information modeling, classification, and quality/lifecycle checks.
- State one thing the implementation does well, using the evidence rather than a personal success claim.
- State one hard limit: incomplete sources, ambiguous links, or uncertain job identity.
- Identify any next step as a plan or proposal. The optional streaming path is implemented staging, not a completed production replacement.

**Slide concepts:** record-to-view map; limits and possible next work; access link plus questions.

**Visual:** raw row -> selected observation -> public display, with a retained source path. Finish with the saved Good Doc Jobs URL. Adam must confirm public repository and Working Notes links before adding them.

**Transition to questions:** invite discussion about rules, maintenance, and how the audience might apply the approach. Do not invent a motivational conclusion or reader outcomes.

## Timing and rehearsal rules

The allocation is 5 + 7 + 10 + 8 + 5 = **35 minutes**. The fixture comparison is included in Part 3; it is not extra time. The reader demonstration is included in Part 4. Reserve the following 15 to 20 minutes for questions.

If a live view fails, switch to the static image at once. Do not debug the application during the talk. If behind time, shorten filtering interactions and the optional timeline detail. Keep the three rules, the provenance explanation, and the access link.

The talk should not spend time on worker-process memory, backup filenames, retention operations, every provider endpoint, SQL schema details, or all 12 research phases. Those details support the answers in [10-audience-questions.md](10-audience-questions.md).
