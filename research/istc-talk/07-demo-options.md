# Demonstration options

These are preparation plans. No demonstration or production command ran during the research. Use copied fixtures or saved output. A job URL in a fixture is historical test input, not a current recommendation.

## 1. Show the reader table and trace one field

- **Purpose:** show the public result before explaining the internals.
- **Audience view:** title, company, location, Apply Link, Why It Matched, Work Arrangement, and Last Checked. Show one grouped row and its Additional Apply Links if a suitable saved example is present.
- **Files:** `data/jobs/gsheet-package/20261022-0622/01_good_documentation_jobs.csv`; `00_start_here.csv`; the Good Doc Jobs URL from the root README.
- **Expected output:** the saved CSV has 713 rows. Its arrangement counts are in [M09-M10](06-project-metrics.md#main-metric-register). The live Sheet is not verified to match it.
- **Preparation:** open a copy of the dated CSV in a spreadsheet viewer. Create a temporary filter view in that copy. Check text width and link display. If using the public Sheet, confirm its date and current visible features before the event.
- **Live risk:** network failure, a changed Sheet, unreadable columns, or an employer link that closes. Do not refresh the feed during the talk.
- **Static alternative:** two cropped screenshots from the copied dated CSV, with its package ID and date. Label it “saved local upload file.” A screenshot of the actual Sheet needs a separate permitted capture.
- **Time:** 3 to 5 minutes; the outline allocates 8 minutes to the full reader walkthrough and its limits.
- **Evidence:** [C01](11-evidence-index.md#c01), [C16](11-evidence-index.md#c16), [C30](11-evidence-index.md#c30).

## 2. Show two HTTP 200 pages with different meaning

- **Purpose:** show why content validation is different from link transport success.
- **Audience view:** two small cards. Both say HTTP 200. One has title Jobs; the other has a specific Technical Writer title. Reveal “remove by the Ashby shell rule” and “no issue from this rule.”
- **Files and optional command:** `src/scripts/test-job-url-health.js`; `src/lib/job-url-health.js:classifyUrlIssue`. A later rehearsal can use `node src/scripts/test-job-url-health.js` after confirming the file remains fixture-only. It imports the classifier, not the network-check function.
- **Expected output:** the inspected fixture assertions end with `Job URL health regression: PASS` if they pass. This research did not execute them.
- **Preparation:** prepare the cards from the exact fixture strings. Explain that the rule is host-specific. Include a third small card: HTTP 429 means retained uncertainty.
- **Live risk:** showing code can consume time; a terminal can use the wrong checkout. Do not call `checkJobUrl` or follow fixture links.
- **Static alternative:** the two fixture cards and a rule table. This is the recommended event form.
- **Time:** 2 minutes within the four-minute link-quality section.
- **Evidence:** [C18](11-evidence-index.md#c18), [C19](11-evidence-index.md#c19).

## 3. Turn two location rows into one reader row

- **Purpose:** show an information architecture choice with a visible result.
- **Audience view:** the test's Technical Writer / Jobgether rows for US and Canada become one row with both locations, a main link, and an additional link. Label all values “test fixture.”
- **Files and optional command:** `src/scripts/test-gsheet-grouping.js`; `build-gsheet-package.js:groupPublicSheetCountryPostings`. A later rehearsal can use `node src/scripts/test-gsheet-grouping.js` after another side-effect review of imports. The inspected builder guards its command entry point.
- **Expected output:** one grouped row for distinct locations. Same-title rows at the same location remain two rows. The fixture also checks mixed Remote/Onsite grouping.
- **Preparation:** use a two-to-one diagram, not a wide raw record dump. Show Additional Apply Links and the rule for summarized dates.
- **Live risk:** readers may assume the rows are one vacancy or that all locations are remote.
- **Static alternative:** before/after table with the caption “One display row can represent several postings.”
- **Time:** 2 to 3 minutes. Best alternate to option 2 if Adam prefers a display-design story.
- **Evidence:** [C16](11-evidence-index.md#c16).

## 4. Explain one saved list comparison

- **Purpose:** distinguish a list change from an employer action.
- **Audience view:** current, added, removed, and continuing counts for two named packages. Show one saved report excerpt with its source dates.
- **Files:** `data/jobs/reports/all-remote-daily-report.md`; dated packages `20261021-0636` and `20261022-0622`; `src/lib/us-remote-daily-report.js:compareRows` for the method.
- **Expected output:** saved public membership gives 713 current, 29 added, 35 removed, and 684 continuing. These are not posting or closure counts.
- **Preparation:** crop the opening report and dates. Keep the large job lists out of the shared view. Explain URL-based membership with a small three-item drawing.
- **Live risk:** the report may have been replaced by a later run. Do not run `allremotediff`; it writes current report files and can open an application.
- **Static alternative:** a labeled excerpt captured from the saved October 22 report during later preparation.
- **Time:** 2 to 3 minutes.
- **Evidence:** [C20](11-evidence-index.md#c20), [M12](06-project-metrics.md#main-metric-register).

## 5. Follow one record through a simplified architecture

- **Purpose:** explain the application without showing source code line by line.
- **Audience view:** Board -> Common record -> Review rules -> Reader row -> Manual upload. A provenance strip keeps source URL and fetch time visible as the display changes.
- **Files:** the Mermaid flowchart in [03-system-architecture.md](03-system-architecture.md#current-pipeline), plus the normalizer mappings in `jobs-normalize.js` and display headers in `simple-public-export.js`.
- **Expected output:** a diagram, not a program run. The expanded research diagram shows optional and side routes. The talk version should have only the five main boxes.
- **Preparation:** render and inspect the diagram during slide creation. Use a synthetic record labeled “illustration,” with a `.example` URL. Do not call the synthetic row an actual employer posting.
- **Live risk:** too many labels can turn this into an architecture review. Keep database and staging details off the main view.
- **Static alternative:** the same diagram as an exported image with large text.
- **Time:** 2 to 3 minutes.
- **Evidence:** [C04](11-evidence-index.md#c04), [C05](11-evidence-index.md#c05), [C16](11-evidence-index.md#c16).

## Recommended two

Use **option 1**, the saved reader table, and **option 2**, the HTTP 200 fixture comparison. They show the result and one clear quality decision. Keep option 3 available as a screenshot in the reader walkthrough.

A terminal run is optional. The presentation works with saved evidence alone. Static alternatives are specified here; no screenshots or finished slide assets were created in this research package.
