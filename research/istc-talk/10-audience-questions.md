# Audience questions and suggested answers

These are draft answers for Adam to adapt. They use local evidence as of 2026-10-22. They do not invent his opinions or personal history.

## 1. Why did you build your own feed?

**Suggested answer:** “I was searching for documentation jobs and kept encountering irrelevant results, duplicates, old links, and repeated searches across sites.” This is Adam's supplied account. **[NEEDS ADAM'S INPUT]** Add one true example and confirm the wording. [P01](11-evidence-index.md#p01)

## 2. Why did you start with Excel and Power Query?

**Suggested answer:** “Excel and Power Query were the first version.” The repository does not show the original workbook or the decision. **[NEEDS ADAM'S INPUT]** Explain why those tools suited the first task, what the query did, and what later required a change. [P01](11-evidence-index.md#p01)

## 3. When did it become an application?

**Suggested answer:** “The first recorded project commit is from August 13, 2026, and already contains a substantial JavaScript and shell pipeline. That commit does not date the earlier development.” **[NEEDS ADAM'S INPUT]** Supply the actual transition date or describe it without a date. [H01](11-evidence-index.md#h01)

## 4. Where do the sources come from, and how do you select them?

**Suggested answer:** “The routine uses six public ATS catalog definitions and then reads the employer boards. There is also a reviewed direct-employer submission route. A board's presence in a catalog does not establish that it is valid or complete.” **[NEEDS ADAM'S INPUT]** Explain the original provider-selection rationale. [C02](11-evidence-index.md#c02), [C03](11-evidence-index.md#c03), [C08](11-evidence-index.md#c08)

## 5. Are you using private employer systems?

**Suggested answer:** “The inspected collectors use public job-board JSON or public HTML. They do not establish a private employer ATS integration. The public catalog and each provider can still change.” Do not extend this answer into an unreviewed legal claim about all provider terms. [C02](11-evidence-index.md#c02), [C03](11-evidence-index.md#c03)

## 6. How do you handle duplicates?

**Suggested answer:** “The full feed flags likely duplicates. Selected views join shared URL or duplicate keys and choose a representative under explicit ranking rules. The decision output records why. Similar rows can still be separate openings, so the result is a selected view rather than proof of unique vacancies.” [C09](11-evidence-index.md#c09), [C10](11-evidence-index.md#c10)

## 7. Does the score say whether I should apply?

**Suggested answer:** “No personal application decision is made. Writer Fit uses title, domain, description-related evidence, quality, and penalties as sorting signals. It does not compare the role to your qualifications. The top selection also admits a strong title bucket, so it is not simply all A and B tiers.” [C11](11-evidence-index.md#c11), [C12](11-evidence-index.md#c12), [C41](11-evidence-index.md#c41)

## 8. How do you distinguish a writing role from document processing?

**Suggested answer:** “The rules include non-writer penalties and exceptions for clear writing titles. Reviewed exact posting URLs can also be excluded from the public package with a date and reason. Those decisions leave the source record in place. The rules still need review because duties matter more than one word in a title.” [C11](11-evidence-index.md#c11), [C17](11-evidence-index.md#c17)

## 9. How do you classify remote jobs?

**Suggested answer:** “A broad classifier reads title, location, and description signals. The public U.S.-remote report is more cautious: it requires Remote arrangement and an explicit U.S. marker. Generic Remote is not enough. Neither establishes that a role accepts a particular state or applicant.” [C13](11-evidence-index.md#c13), [C14](11-evidence-index.md#c14)

## 10. Are all the listings verified and open?

**Suggested answer:** “There are source checks and primary-link checks, but no permanent open-job guarantee. The checker can detect known closures, redirects, and some empty pages. Access blocks and rate limits remain uncertain. Always confirm the employer posting.” [C18](11-evidence-index.md#c18)

## 11. Why can a page return HTTP 200 and still be unusable?

**Suggested answer:** “The response can be a generic shell rather than the job page. An Ashby fixture demonstrates a successful response with only the title Jobs. The code uses a host-specific rule to identify that case. It is a content check in addition to a transport check.” [C18](11-evidence-index.md#c18)

## 12. Why retain some failed links?

**Suggested answer:** “A blocked or rate-limited checker is not proof that the job is gone. The saved October 22 package removed 30 rows under its safe-removal rules and retained 12 ambiguous failures from 743 checked rows. Those are dated check results, not a guarantee for the remaining jobs.” [C19](11-evidence-index.md#c19)

## 13. What does Last Checked mean?

**Suggested answer:** “It comes from the board observation/fetch time, not the package generation time or the later link check. Posted Date is separate and depends on provider fields. Some provider date fallbacks can mean last update rather than first publication.” [C04](11-evidence-index.md#c04), [C15](11-evidence-index.md#c15)

## 14. Does removed mean that someone got the job?

**Suggested answer:** “It means the item is absent from the compared list. Source changes, grouping, selection, or link rules can change membership. A return to the feed is also not proof that an employer reposted the role. The history describes observations.” [C20](11-evidence-index.md#c20), [C23](11-evidence-index.md#c23)

## 15. Is the feed complete?

**Suggested answer:** “The saved coverage report counts whether known board keys were attempted. It does not measure every employer or every vacancy. Provider access, collection limits, catalog errors, stale snapshots, and selection rules constrain the result. A 100% attempted figure needs that label.” [C03](11-evidence-index.md#c03), [C32](11-evidence-index.md#c32), [C33](11-evidence-index.md#c33)

## 16. How often does it update, and is it fully automatic?

**Suggested answer:** “The normal launcher refreshes due sources, prepares local outputs, checks them, and updates history. The repository has a passive maintenance schedule example at 04:00 and 16:00, but that does not prove the schedule is installed or currently loaded. Upload to Google Sheets and publication remain manual.” **[NEEDS ADAM'S INPUT]** Confirm the present operating routine and a public update commitment, if any. [C27](11-evidence-index.md#c27), [C28](11-evidence-index.md#c28)

## 17. How much maintenance does it need?

**Suggested answer:** “The system has health reports, backoff for repeated failures, source diagnostics, tests, and backup checks. Provider changes and ambiguous failures still require investigation.” **[NEEDS ADAM'S INPUT]** Give an actual maintenance example and time commitment. No measured weekly workload was found. [C06](11-evidence-index.md#c06), [C26](11-evidence-index.md#c26), [C38](11-evidence-index.md#c38)

## 18. Why JavaScript, Bash, and SQL?

**Suggested answer:** “JavaScript and Node.js implement the collectors and transformations. Bash orders the local refresh steps. SQL supports saved-history queries and reporting in DuckDB. SQLite supports a separate optional export-staging path.” **[NEEDS ADAM'S INPUT]** Explain why these were your choices. Do not claim the repository proves the motivation. [C05](11-evidence-index.md#c05), [C21](11-evidence-index.md#c21), [C25](11-evidence-index.md#c25)

## 19. What was technically difficult?

**Suggested answer:** “The records show difficult identity, location, source-response, and storage problems. In the later history work, some full-size queries failed despite smaller checks passing. Later reviews record narrower queries, worker isolation, exact comparisons, and recovery checks before migration.” **[NEEDS ADAM'S INPUT]** Choose the experience you want to tell in the first person. [C09](11-evidence-index.md#c09), [C38](11-evidence-index.md#c38), [C39](11-evidence-index.md#c39)

## 20. Is it open source? Can I use or adapt it?

**Suggested answer:** “The repository contains an MIT license that permits reuse subject to its terms.” Public repository reachability was not checked, and `private: true` in package.json prevents npm publication; it does not establish repository visibility. **[NEEDS ADAM'S INPUT]** Confirm the repository URL, access, contribution route, and support expectations. [C36](11-evidence-index.md#c36)

## 21. Could another writer build something smaller?

**Suggested answer:** “A useful starting exercise is one public source, a small common record, a source date, and a reader view. Add a fixture for one known failure before adding more sources.” This is a proposed approach, not a tested training program or deployment promise. The repository's adapters, metadata, and fixtures show the techniques. [C03](11-evidence-index.md#c03), [C04](11-evidence-index.md#c04), [C26](11-evidence-index.md#c26)

## 22. How do you balance documentation work and programming?

**Suggested answer:** the project contains concrete work in information modeling, taxonomy, validation, reporting, and source preservation. **[NEEDS ADAM'S INPUT]** Explain your own balance and what helped you learn. The repository cannot establish time spent, confidence, or professional identity. [05-documentation-engineering-connections.md](05-documentation-engineering-connections.md)

## 23. What would you change if starting again?

**Suggested answer:** **[NEEDS ADAM'S INPUT]** The evidence offers possible discussion topics: define job identity earlier, keep date meanings separate, measure classification quality, or preserve provider evidence. These are research suggestions, not Adam's retrospective judgment or an approved plan.

## 24. Does the report show what is happening in the job market?

**Suggested answer:** “It shows changes in this feed. Catalog coverage, collection failures, selection rules, and grouping can change counts. Topic mentions are phrase matches in available text, not verified requirements. The report needs those limits next to the number.” [C24](11-evidence-index.md#c24), [C30](11-evidence-index.md#c30), [C33](11-evidence-index.md#c33)

## 25. Where can I access Good Doc Jobs, and does it cost anything?

**Suggested answer:** “The project README links to [Good Doc Jobs](https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing) and says the Sheet is free to use and share. Optional Working Notes support does not provide earlier or better feed access.” These are documented terms; live access was not checked. **[NEEDS ADAM'S INPUT]** Confirm the link and current sharing settings before the event. [C01](11-evidence-index.md#c01), [C41](11-evidence-index.md#c41)

## 26. How does Working Notes relate to the feed?

**Suggested answer:** “The repository prepares separate Markdown writing inputs from saved job selections and comparisons. The full Substack report means the selected detailed shortlist, not all collected records. Publishing is a separate editorial action.” **[NEEDS ADAM'S INPUT]** Supply the publication URL and one article you want to discuss. [C40](11-evidence-index.md#c40)
