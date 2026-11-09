# Source review and checks

Derived review material. Prepared October 26, 2026. [Article draft](substack-draft-2026-10-26.md).

## Status

Draft prepared for review. The edition date is October 26, 2026, as supplied by Adam. The support footer uses the exact wording recorded as approved on October 16. The approval comes from the saved session summary; the original session file was not available at its recorded path.

## Scope and source checks

- Assumption: Use the full saved public list, as in the October 19 edition. Keep the broad series separate from the five-job series.
- Current source: `data/jobs/gsheet-package/20261026-0638/01_good_documentation_jobs.csv`. Its contents match the `latest` copy.
- Preserved all 735 rows in source order, 735 distinct primary application URLs, and 785 application-link occurrences, including additional links. Retained all existing grouped rows.
- Work arrangements: 127 remote, 116 hybrid, 463 onsite, and 29 unknown. Total: 735.
- Daily comparison against `20261025-0724`: 10 added, 7 removed, 725 continuing. The previous list has 732 entries. These counts agree with the saved daily report.
- Seven-day comparison against `20261019-0616`: 106 added, 114 removed, 629 continuing. Baseline: 743 entries. Net change: -8. Recomputed from the two saved CSVs with the report's primary-URL key rule.
- The daily report uses October 20 as its weekly baseline. The draft instead uses October 19 to give an exact seven-day comparison with the previous edition. It does not reuse the report's weekly counts.
- The saved `substack-full-report.md` still uses October 10 data and a different selection. Its counts and listings were not used.
- Board-check range: `2026-06-30 12:08 UTC` to `2026-10-26 11:24 UTC`. 27 entries have a saved board-check date before October 19. No check date is missing.
- 29 locations are blank in the source. The draft marks these as unspecified in the saved list. It does not infer that the employer omitted them.
- Source company labels can include intermediaries. No independent employer-name review was made for every entry. Source labels remain unchanged.
- No new employer-page or application-link checks were made. The live public Sheet was not inspected. The draft does not claim that it contains this package.
- Additions and removals describe saved list membership. They do not prove employer publication dates, closures, or hiring outcomes.

## Guidance and writing review

- Used `docs/substack-publication.md` and the available local mirror of Working Notes project instructions. The mirror's current sync state was not verified.
- Read the Library Charter and the voice skill's Charter. They match and are marked version 2.1 draft. This label does not establish approval.
- Applied `adam-substack-voice`, profile `job-roundup`. The current broad-list guide controls the form, ahead of the older five-job template.
- The sample selector has no close broad-list sample. Read the confirmed-human `Authenticity and Service` sample as a limited clarity reference. Its experience, facts, opinions, and wording were not copied.
- Editorial review: Retained compact entries and source order. Kept source limits separate from the brief metrics text. Added no personal experience, opinion, salary, or employer posting date.
- The voice check returned one warning for the source company label `Runway Ml`. This is a name, not figurative prose. The label remains unchanged. The check does not prove authorship or accuracy.
- Verified all 735 entries and the sequence of all 785 application links against the saved CSV. Work arrangement totals and comparison counts agree with the source data.
- Source hashes remained unchanged. `git diff --check` passed. The two new files have no trailing whitespace. The existing four modified files remain outside this task.

## Publication notes

- Copy the title into Substack's title field and the week label into its subtitle field. Start the article body with the Good Doc Jobs link. Omit the draft label and review link above the separator.
- Retain the source note and approved support footer.
- Publication and email delivery remain manual. This task did not publish the article.

## Preservation

Created only this review file and the article draft. Existing packages, source reports, project instructions, guides, code, and Job Finder records were not changed. No refresh, commit, push, or PR was made.

Source SHA-256 values, checked before and after draft creation:

- `data/jobs/gsheet-package/20261026-0638/01_good_documentation_jobs.csv`: `a34cca8df3e48bf1f5e53620142943228c12a8a3be22006bf3da606369ca3f01`
- `data/jobs/gsheet-package/20261025-0724/01_good_documentation_jobs.csv`: `460338c0067c15a64196c836b83032b4309c6095f08b8e03b70b27ebbadbc963`
- `data/jobs/gsheet-package/20261019-0616/01_good_documentation_jobs.csv`: `de8885d5661605ac7cc8d15f9533f1d607dcd5e25e02aae4e3d21ef370eb4515`
- `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`: `a34cca8df3e48bf1f5e53620142943228c12a8a3be22006bf3da606369ca3f01`
- `data/jobs/gsheet-package/20261026-0638/README_GSHEET_PACKAGE.md`: `fc029ddfc183a64041e54646b75c4d51f656112d5481f524f40e25b1dca9b6ff`
- `docs/substack-publication.md`: `6a9121de5f8d53169a53d13c28036f62c244e4090b6c3c9a162579fc221ea2c7`
- `data/jobs/reports/all-remote-daily-report.md`: `b17bd75e77e6d1a6450c46903bacbd3e35d21fa4c13f12317fba04bf3cb6947b`
