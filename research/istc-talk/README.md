# ISTC talk research package

Review date: October 27, 2026, America/Chicago. Status: research and draft presentation content. This is not a slide deck.

Proposed title: **I Got Tired of Searching for Documentation Jobs, So I Built My Own Job Feed**.

This package supports a 35-minute talk, followed by 15 to 20 minutes of questions. It is for technical writers, content designers, and documentation engineers. The main subject is an information problem: how to make inconsistent job records useful to readers.

## Review scope

The 13 files already existed. Their first version is preserved in Git commit `f40a789498d26289ce2d569b1551f062e028edef`. This review updates them after inspection. It does not replace an unread draft.

The current baseline is `f4af4c2a8352daa89f31d3abb77bb43edd67a6df`, on branch `failure-evidence-sampling-v1`. Six staged files existed before this review: the root README, the history README and validation file, two October 26 Substack draft files, and `src/scripts/report-all-remote-daily.js`. Those changes are outside this task. Current code means the local files at this baseline, including that staged script change.

The main talk uses dated October 25 evidence. The later October 26 local package and October 27 board report have separate entries in the metric register. The saved Sheet publication check covers October 25. Its later remote-view check covers October 26. No live Sheet check was made for this review.

## Recommended reading order

1. [00-executive-briefing.md](00-executive-briefing.md): findings, story choices, and questions for Adam.
2. [08-presentation-outline.md](08-presentation-outline.md): the five-part, 35-minute sequence.
3. [09-slide-plan.md](09-slide-plan.md): 15 slide concepts, notes, evidence, and times.
4. [04-engineering-stories.md](04-engineering-stories.md): problems, examples, solutions, and tradeoffs.
5. [07-demo-options.md](07-demo-options.md): five demo plans and static alternatives.
6. [05-documentation-engineering-connections.md](05-documentation-engineering-connections.md): skill connections and the limits of each comparison.
7. [03-system-architecture.md](03-system-architecture.md): the actual workflow and Mermaid diagram.
8. [01-project-inventory.md](01-project-inventory.md): components, entry points, dependencies, and status.
9. [02-project-evolution.md](02-project-evolution.md): Git dates, operation dates, and gaps in the origin story.
10. [06-project-metrics.md](06-project-metrics.md): values, populations, dates, methods, and limits.
11. [10-audience-questions.md](10-audience-questions.md): draft answers and personal input needs.
12. [11-evidence-index.md](11-evidence-index.md): claim IDs, source paths, symbols, commits, and conflicts.

For a technical review, start with 01, 03, 06, and 11. Links such as [C42](11-evidence-index.md#c42) identify claims. Source paths are relative to the repository root. Markdown links use `../../` to reach that root.

## Evidence rules

- **Current code:** implementation inspected on October 27. This does not mean it was run or tested during this task.
- **Saved result:** a dated local output or verification record. It establishes what the record says. It does not establish live job or Sheet state today.
- **Git history:** a reachable commit and its author date. A commit date is not a feature release date.
- **Adam supplied:** personal history from the task request. The Excel and Power Query origin has this status.
- **Interpretation:** a proposed story, skill comparison, or explanation of a tradeoff. It is not confirmed author intent.
- **[NEEDS ADAM'S INPUT]:** a personal fact, priority, or missing source that needs Adam's answer.

Generated files under `data/` can be absent from a new clone. Mutable reports can change after this review. The metric register names fixed verification copies where available. It also records file hashes for selected mutable summaries. A later report cannot verify an earlier count.

The earlier October 23 [history checkpoint](../../docs/plans/history-checkpoint-2026-10-23.md) records a failure. The later [repair record](../../docs/plans/history-manifest-repair-20261023T135057Z/README.md) records its repair. Neither record should replace the other. The same rule applies to backup failures and later recovery.

## Terms

| Term | Meaning in this package |
| --- | --- |
| ATS | Applicant tracking system. Its public board supplies employer postings. |
| Provenance | The source, date, and processing evidence for a value. |
| Normalization | Conversion of different source formats into common fields. |
| Canonical key | A selected standard key used to compare records. Its identity rules can have limits. |
| Deduplication | Selection of representatives from records that the rules treat as possible duplicates. |
| Heuristic | A practical rule that can give an incorrect result. |
| Snapshot | Saved data from one observation or package. |
| Fixture | A small saved or synthetic input used to test a rule. |
| Parity | Agreement between two implementations or outputs. |
| Denominator | The population used for a share or rate. |
| Taxonomy | The category system used to organize records. |

## Method and limits

Only local source, documentation, Git history, small fixtures, saved summaries, and bounded CSV files were read. No network research, private service, external API, production workflow, test suite, database query, or publication command ran. No dependency was installed. No credential file or environment value was read. No multi-gigabyte feed was scanned. External links came from local records and were not opened.

The inventory and architecture were checked against imports, source symbols, dispatcher logic, and launcher order. The October 25 record was checked against its saved artifact report, dated CSV, URL summary, and publication records. The October 26 CSV and small current summaries were checked separately. Test results are saved results only.

## Completion checks

| Check | Result |
| --- | --- |
| All 13 files exist and contain substantive content | PASS |
| Local source links and internal anchors resolve | PASS |
| Architecture claims identify implementation sources | PASS |
| Current code, dated results, Git history, and supplied history have separate labels | PASS |
| Numeric claims identify dates and populations in the metric register | PASS |
| No credential values or secret material were copied | PASS; content and pattern review |
| Outline and 15 slide times total 35 minutes | PASS |
| Content uses reader tasks and concrete examples | PASS |
| Executive briefing is below 1,500 words | PASS |
| Existing application files and staged changes are preserved | PASS; baseline hash and Git-state comparison |
| Full application tests, live Sheet, public access, and loaded schedules | NOT VERIFIED; outside this task |
| Personal history, motives, effort, and future priorities | NEEDS ADAM'S INPUT |
| Production workflow, installation, publication, or commit by this task | NONE |

Validation detail: the local-link check covered 498 references after the final citation edits. All 612 non-research files in the bounded source/document baseline retained their SHA-256 values. The staged diff and Git HEAD also retained their baseline values. The separate application test suite was not run.

## Changed-file report

All paths below are relative to this directory. These are the only task changes. No new file was needed.

| File | Change |
| --- | --- |
| `README.md` | Updated scope, reading order, evidence rules, and checks. |
| `00-executive-briefing.md` | Updated discoveries, dated evidence, and personal questions. |
| `01-project-inventory.md` | Updated employment fields, package guards, and backup route. |
| `02-project-evolution.md` | Added later commits and separate operation dates. |
| `03-system-architecture.md` | Updated selection rules, package finalization, and publication boundary. |
| `04-engineering-stories.md` | Updated examples and added three later stories. |
| `05-documentation-engineering-connections.md` | Added evidence-based classification and publication checks. |
| `06-project-metrics.md` | Replaced mutable old references with dated evidence; added later observations. |
| `07-demo-options.md` | Updated fixed inputs, expected output, and static alternatives. |
| `08-presentation-outline.md` | Updated evidence and retained the 35-minute allocation. |
| `09-slide-plan.md` | Updated 15 slides and dated claims. |
| `10-audience-questions.md` | Updated draft answers and added later questions. |
| `11-evidence-index.md` | Updated sources, confidence, commits, and conflicts. |
