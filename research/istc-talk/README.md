# ISTC talk research package

Research date: 2026-10-22, America/Chicago. Status: research and proposed content, not a finished presentation.

Evidence availability note added October 23, 2026: most links under `data/`
refer to generated local files that Git excludes. They will not be present in
a new clone. Latest-run reports can also change after the research date.
Use the matching dated source files when checking a historical claim; a newer
report does not verify an older figure. The commit review checked local file
availability, not every original report byte or research claim again. No raw
feed, source package, or runtime report was added to this research commit.
See the [October 23 history checkpoint](../../docs/plans/history-checkpoint-2026-10-23.md)
for the later history failure. The October 22 research figures remain dated.

Proposed title: **I Got Tired of Searching for Documentation Jobs, So I Built My Own Job Feed**.

This package supports a 35-minute talk and 15 to 20 minutes of questions. The audience is technical writers, content designers, documentation engineers, and related staff. The main subject is an information problem: how to turn inconsistent job records into a useful public list.

## Read first

1. [Executive briefing](00-executive-briefing.md): findings, recommended story, and questions for Adam.
2. [Presentation outline](08-presentation-outline.md): the proposed 35-minute sequence.
3. [Slide plan](09-slide-plan.md): 15 slide concepts, evidence, notes, and times.
4. [Engineering stories](04-engineering-stories.md): concrete problems and tradeoffs.
5. [Demo options](07-demo-options.md): five options and static alternatives.

## Research references

| File | Purpose |
| --- | --- |
| [01-project-inventory.md](01-project-inventory.md) | Main components, entry points, technologies, configuration, and status. |
| [02-project-evolution.md](02-project-evolution.md) | Git milestones, saved historical evidence, and gaps in the origin story. |
| [03-system-architecture.md](03-system-architecture.md) | Actual local workflow, Mermaid diagram, inputs, outputs, failures, and limits. |
| [05-documentation-engineering-connections.md](05-documentation-engineering-connections.md) | Specific connections to documentation skills, with limits to each comparison. |
| [06-project-metrics.md](06-project-metrics.md) | Dated measures with units, populations, methods, and limits. |
| [10-audience-questions.md](10-audience-questions.md) | Suggested answers and questions that need Adam's input. |
| [11-evidence-index.md](11-evidence-index.md) | Claim IDs, source paths, symbols, commits, confidence, and conflicts. |

For a technical review, read 01, 03, 06, and 11 before the outline. Claim links such as [C07](11-evidence-index.md#c07) lead to evidence. Source paths are relative to the repository root. Links use `../../` to reach that root from this directory.

## Evidence rules

- **Current code:** the local files inspected on the research date. Some files have uncommitted changes. This label confirms implementation, not a fresh execution.
- **Saved result:** a local output with a stated package or report date. This confirms what the saved artifact records. It does not confirm a job's live status today.
- **Git history:** a committed change with its author date and commit ID. Commit dates are not feature release dates.
- **Adam supplied:** information in the task request. The Excel and Power Query origin belongs here until supporting material is supplied.
- **Interpretation:** a proposed explanation or presentation connection. It is not a confirmed statement of author intent.
- **[NEEDS ADAM'S INPUT]:** an unresolved personal, historical, or public-access detail.

The baseline commit was `73ec53ddbdc8162a5d1b32823b9c00149b92219a` on branch `failure-evidence-sampling-v1`. The working tree was already dirty. This package describes the inspected local tree, not only that commit. The saved morning refresh records an earlier revision, `16e43cfb`, with working-tree changes. These two evidence sets are not identical.

Terms used in the research:

| Term | Meaning here |
| --- | --- |
| Provenance | The source, date, and processing evidence for a value. |
| Normalization | Conversion of different source formats into common fields. |
| Canonical key | The selected standard key used to compare records. It can still have identity limits. |
| Deduplication | Selection of representatives from records that the rules identify as possible duplicates. |
| Heuristic | A practical rule that can give an incorrect result. |
| Snapshot | Saved data from one observation or package. |
| Fixture | A small saved or synthetic input used to test a rule. |
| Parity | Agreement between the outputs of two implementations. |
| Denominator | The population used to calculate a share or rate. |
| Taxonomy | The category system used to organize records. |

No network research, production workflow, test suite, database query, or publication command ran for this investigation. Existing test results were read. The full multi-gigabyte feed was not scanned. Small summaries, manifests, source files, fixtures, and selected CSV files supplied the evidence. No secret files or environment values were read. External URLs are retained from local evidence; their live state was not checked.

## Review and completion

All 13 requested files were created in this directory. The source references, internal links, timing, numeric populations, and file scope were checked. The slide times total 35 minutes. The executive briefing is below 1,500 words. Existing source and document files in the bounded baseline retained their hashes. Git HEAD and all pre-existing Git changes were preserved. No commit was made.

The talk remains a proposal. Adam must confirm the origin details, personal judgments, live Sheet view, public repository access, and intended publication examples. See the final checklist in the briefing.

| Completion check | Result |
| --- | --- |
| All requested files exist and contain substantive research | PASS |
| Source paths, claim links, and internal anchors resolve | PASS |
| Current code, Git history, saved results, and personal history have separate labels | PASS |
| Metric register gives values, units, populations, sources, dates, methods, and limits | PASS |
| Authored files contain no accessed credential values or secret material | PASS |
| Outline and 15 slide times total 35 minutes | PASS |
| Content uses reader tasks and concrete examples for technical writers | PASS |
| Bounded source/document hashes and pre-existing Git state are preserved | PASS |
| New-file diffs and whitespace checks are complete | PASS |
| No production workflow, dependency change, publication, or commit occurred | PASS |
| Live Sheet contents, installed schedules, and public repository access | NOT VERIFIED; outside the permitted local investigation |
| Original workbook, personal motives, effort, preferences, and future priorities | NEEDS ADAM'S INPUT |

## Created-file report

All files below are new. No pre-existing project file was modified by this task.

| File | Task change |
| --- | --- |
| `README.md` | Created |
| `00-executive-briefing.md` | Created |
| `01-project-inventory.md` | Created |
| `02-project-evolution.md` | Created |
| `03-system-architecture.md` | Created |
| `04-engineering-stories.md` | Created |
| `05-documentation-engineering-connections.md` | Created |
| `06-project-metrics.md` | Created |
| `07-demo-options.md` | Created |
| `08-presentation-outline.md` | Created |
| `09-slide-plan.md` | Created |
| `10-audience-questions.md` | Created |
| `11-evidence-index.md` | Created |
