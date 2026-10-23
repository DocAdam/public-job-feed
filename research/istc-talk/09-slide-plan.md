# Slide-by-slide content plan

Status: proposed content for 15 slides. This is not a slide deck. Total presentation time is 35 minutes. Personal statements need Adam's approval and evidence.

## Slide 1. I built the list I needed

- **Central takeaway:** the project started with a repeated job-search information problem.
- **Supporting points:** the talk title; Public Job Feed is the pipeline; Good Doc Jobs is the reader view.
- **Visual:** title beside one cropped reader-table image, with a saved-data date.
- **Speaker notes:** identify the task and the audience. Do not add download, user, or job-outcome claims.
- **Evidence:** [P01](11-evidence-index.md#p01), [C01](11-evidence-index.md#c01).
- **Demo replacement:** no.
- **Time:** 1 minute, 0:00 to 1:00.
- **Adam input:** confirm the title and opening statement.

## Slide 2. The search results were not the information I needed

- **Central takeaway:** collection alone does not produce a useful list.
- **Supporting points:** irrelevant roles, repeated postings, old links, and repeated searches, as supplied by Adam.
- **Visual:** four small problem cards. Use a real saved search example only if Adam supplies one.
- **Speaker notes:** tell one true example. Do not claim that every job board has these problems or that a particular service caused them without evidence.
- **Evidence:** [P01](11-evidence-index.md#p01).
- **Demo replacement:** no.
- **Time:** 2 minutes, 1:00 to 3:00.
- **Adam input:** one personal example and permission to show it.

## Slide 3. The first solution was Excel and Power Query

- **Central takeaway:** the initial tool supported a concrete collection and organization task.
- **Supporting points:** Adam reports the first spreadsheet approach; repository history does not contain that implementation.
- **Visual:** original workbook image if available. Otherwise a clearly labeled reconstruction: collect -> organize -> review.
- **Speaker notes:** explain what Power Query did in the actual workbook. Do not invent queries, row counts, dates, or reasons for leaving Excel.
- **Evidence:** [P01](11-evidence-index.md#p01), [H01](11-evidence-index.md#h01).
- **Demo replacement:** no.
- **Time:** 2 minutes, 3:00 to 5:00.
- **Adam input:** workbook, first date, and specific reason for the next step.

## Slide 4. What the repository can date

- **Central takeaway:** the recorded application evolved after a substantial initial import.
- **Supporting points:** August 13 initial application; August 24 curated intake; September report checks; September 29 SQL history. Later local storage work is a separate evidence class.
- **Visual:** four Git milestones and a separate “earlier personal history” box.
- **Speaker notes:** call these commit dates. Explain that the first commit already contains many features. Keep the rest of the timeline in backup notes.
- **Evidence:** [H01](11-evidence-index.md#h01), [H04](11-evidence-index.md#h04), [H07](11-evidence-index.md#h07), [H08](11-evidence-index.md#h08).
- **Demo replacement:** no.
- **Time:** 2 minutes, 5:00 to 7:00.
- **Adam input:** any public launch date, if he wants to name one.

## Slide 5. From employer source to reader table

- **Central takeaway:** the application makes several explicit transformations before manual publication.
- **Supporting points:** public board data; common fields; review rules; simple public rows; manual upload.
- **Visual:** five-box derivative of the full Mermaid diagram. Keep source URL and fetch date under the path.
- **Speaker notes:** define ATS once. Describe Node.js as the runtime, Bash as the sequence, and SQL as history reporting. Do not show every script.
- **Evidence:** [C02-C05](11-evidence-index.md#c02), [C16](11-evidence-index.md#c16), [C21](11-evidence-index.md#c21).
- **Demo replacement:** no; diagram walkthrough.
- **Time:** 3 minutes, 7:00 to 10:00.
- **Adam input:** none for the verified workflow.

## Slide 6. A broad collection and a useful public view

- **Central takeaway:** the full feed and public rows serve different purposes.
- **Supporting points:** 837,215 internal records; 713 local public display rows; selected and grouped views between them; date both counts October 22.
- **Visual:** two labeled containers with the selection steps between them. Avoid a proportional funnel that implies validated vacancies at every level.
- **Speaker notes:** the full feed retains low scores and possible duplicates. The public count is a saved local upload file, not a fresh live Sheet count.
- **Evidence:** [M01](06-project-metrics.md#main-metric-register), [M09](06-project-metrics.md#main-metric-register), [C12](11-evidence-index.md#c12).
- **Demo replacement:** no.
- **Time:** 2 minutes, 10:00 to 12:00.
- **Adam input:** decide whether the large internal count helps the audience; it is optional.

## Slide 7. What counts as the same posting?

- **Central takeaway:** duplicate removal starts with an identity rule.
- **Supporting points:** alternate company labels; shared canonical URL; deterministic selection; recorded reasons. Top-view result: 1,003 input rows to 836 representatives.
- **Visual:** two fixture cards feeding one selected card, with a small retained decision record.
- **Speaker notes:** use the Chenega fixture labels. Explain the risk in stripping URL query strings. Say “selected representatives,” not “167 duplicate jobs proved.”
- **Evidence:** [C09](11-evidence-index.md#c09), [C10](11-evidence-index.md#c10), [M05](06-project-metrics.md#main-metric-register).
- **Demo replacement:** no; static before/after is preferred.
- **Time:** 3 minutes, 12:00 to 15:00.
- **Adam input:** none; fixture label must remain visible.

## Slide 8. Writing relevance and location need separate fields

- **Central takeaway:** a job can be relevant without being eligible for a reader's location.
- **Supporting points:** writing score; Remote/Hybrid/Onsite; explicit country evidence; unknown values. Generic Remote is not sufficient for the cautious U.S. report.
- **Visual:** three-column classification table using fixture inputs, including Remote, Remote - United States, and Canada.
- **Speaker notes:** the score is a sorting aid, not a personal recommendation. The broad heuristic and the public report use different rules. Do not imply all U.S. states are accepted.
- **Evidence:** [C11](11-evidence-index.md#c11), [C13](11-evidence-index.md#c13), [C14](11-evidence-index.md#c14).
- **Demo replacement:** no.
- **Time:** 3 minutes, 15:00 to 18:00.
- **Adam input:** none for rule behavior.

## Slide 9. HTTP 200 does not establish a usable job page

- **Central takeaway:** validate the content a reader needs.
- **Supporting points:** generic Ashby Jobs shell; specific role page; host-specific rule; ambiguous failures retained. Saved package: 743 checks, 30 removals, 12 ambiguous failures kept.
- **Visual:** two page-title cards plus a small “keep for review” card.
- **Speaker notes:** use exact fixture content. Explain transport success in one sentence. State the limit of the pattern check. A rate limit is not proof of closure.
- **Evidence:** [C18](11-evidence-index.md#c18), [M07-M08](06-project-metrics.md#main-metric-register).
- **Demo replacement:** optional two-minute fixture demonstration replaces the card reveal. It is included in this slide's time.
- **Time:** 4 minutes, 18:00 to 22:00.
- **Adam input:** choose static reveal or rehearsed fixture run.

## Slide 10. Good Doc Jobs: start with the reader's task

- **Central takeaway:** the public view helps a reader locate a plausible role and return to its source.
- **Supporting points:** clear title/company/location; plain application link; match explanation; work arrangement.
- **Visual:** copied dated CSV or confirmed public Sheet, zoomed to readable columns.
- **Speaker notes:** state the date before showing a count. Explain that the source page remains the final place to confirm the job.
- **Evidence:** [C01](11-evidence-index.md#c01), [C16](11-evidence-index.md#c16), [C30](11-evidence-index.md#c30).
- **Demo replacement:** yes, first part of the reader-table demonstration. Screenshot fallback.
- **Time:** 2 minutes, 22:00 to 24:00.
- **Adam input:** confirm the live Sheet view and public access if using it.

## Slide 11. A shorter display must keep the useful detail

- **Central takeaway:** grouping can reduce repetition while preserving application routes.
- **Supporting points:** exact company/title grouping across locations; primary link plus Additional Apply Links; same-location rows remain separate; mixed arrangements need care.
- **Visual:** a suitable saved grouped row, or the clearly labeled US/Canada test fixture before and after grouping.
- **Speaker notes:** one display row can represent several postings. Explain summarized posted/checked dates. Demonstrate a filter only in a copy or a permitted filter view.
- **Evidence:** [C16](11-evidence-index.md#c16), `src/scripts/test-gsheet-grouping.js`.
- **Demo replacement:** yes, continuation of the reader-table demonstration. Static fixture fallback.
- **Time:** 3 minutes, 24:00 to 27:00.
- **Adam input:** choose a safe row or use the fixture.

## Slide 12. Which date, and what kind of change?

- **Central takeaway:** list membership, source date, and observation date answer different questions.
- **Supporting points:** Posted Date; Last Checked; package time; 29 added and 35 removed between named October 21/22 packages.
- **Visual:** three date labels beside a cropped saved comparison summary.
- **Speaker notes:** removed does not mean filled. Added does not mean newly posted. A provider can move a date forward. Keep known stale-row warnings visible in discussion.
- **Evidence:** [C15](11-evidence-index.md#c15), [C20](11-evidence-index.md#c20), [M12](06-project-metrics.md#main-metric-register).
- **Demo replacement:** optional saved report excerpt; no report generation.
- **Time:** 3 minutes, 27:00 to 30:00.
- **Adam input:** none for the saved facts.

## Slide 13. The documentation skills inside the system

- **Central takeaway:** modeling, classification, and evidence preservation are concrete documentation-engineering work.
- **Supporting points:** source to common fields; taxonomy to filters; validation to reader trust; raw rows and exceptions retained behind the clean view.
- **Visual:** three skill-to-feature pairs. Add a small raw row -> observation -> display-row path.
- **Speaker notes:** explain the work, not a broad argument about the profession. Adam can describe which existing skills helped him, in his own words.
- **Evidence:** [05-documentation-engineering-connections.md](05-documentation-engineering-connections.md), [C22](11-evidence-index.md#c22).
- **Demo replacement:** no.
- **Time:** 2 minutes, 30:00 to 32:00.
- **Adam input:** confirm the personal skill connection.

## Slide 14. What remains difficult

- **Central takeaway:** reliable automation still needs explicit limits and review.
- **Supporting points:** incomplete sources; uncertain identity and eligibility; ambiguous link failures; preserved exceptions. Optional streaming staging is not a finished public-export replacement.
- **Visual:** three known limits and a separate box labeled “possible next work.”
- **Speaker notes:** choose one next step that Adam actually wants. Candidate ideas include better source evidence or classification evaluation, but these are proposals until he confirms them. Keep the memory redesign as a question-time story.
- **Evidence:** [C09](11-evidence-index.md#c09), [C13](11-evidence-index.md#c13), [C25](11-evidence-index.md#c25), [C33](11-evidence-index.md#c33).
- **Demo replacement:** no.
- **Time:** 2 minutes, 32:00 to 34:00.
- **Adam input:** priorities and what he would change if starting again.

## Slide 15. Access and questions

- **Central takeaway:** readers can use the Sheet, while the project illustrates a repeatable information-design approach.
- **Supporting points:** Good Doc Jobs access link; confirm any Working Notes or repository link; invite questions about rules and maintenance.
- **Visual:** large Sheet link. A QR code can be created and verified during deck production if desired.
- **Speaker notes:** give the access route and stop at 35 minutes. Do not add unverified reader outcomes or a new closing anecdote.
- **Evidence:** [C01](11-evidence-index.md#c01), [C36](11-evidence-index.md#c36), [10-audience-questions.md](10-audience-questions.md).
- **Demo replacement:** no.
- **Time:** 1 minute, 34:00 to 35:00.
- **Adam input:** final links, preferred contact route, and host discussion format.

## Timing check

`1 + 2 + 2 + 2 + 3 + 2 + 3 + 3 + 4 + 2 + 3 + 3 + 2 + 2 + 1 = 35 minutes`.

Questions follow for 15 to 20 minutes. No extra demo time is added. Slides 3 and 4 must keep personal history and Git history distinct. All numeric slides must retain the date and population from the metric register.
