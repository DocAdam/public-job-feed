# Prepare Five recent documentation jobs

**Five recent documentation jobs** is a separate series. It gives readers a
closer look at five recent and interesting employer postings. Each role has
consistent metadata and one short paragraph about the actual work and an
important qualification or limit. Link back to Good Doc Jobs for the broad list.

**Writing and documentation jobs** is the broad weekly roundup of useful feed
statistics and links to many types of jobs. Do not use that title for this
five-job series. See [Substack publication](substack-publication.md) for the
proposed schedule, source limits, free access, and support rules.

The guide and launcher retain their old `Top 5` filenames to preserve existing
links and shortcuts. The public series title does not imply a score ranking.
Adam's pasted September 18, 2026 edition is a form reference. Its job facts are
historical and must not be copied into a new edition.

## Quick workflow

1. Check the saved package dates and refresh result. Use existing data when
   it is suitable for the requested edition. Do not refresh just to write.

   If Adam has authorized a normal refresh:

   ```sh
   open launchers/Refresh\ Job\ Feed.command
   ```

   A global catch-up needs separate authorization. If it is authorized, run
   the catch-up first and wait for completion before the normal refresh:

   ```sh
   open launchers/Run\ Overnight\ Index\ Catch-Up.command
   open launchers/Refresh\ Job\ Feed.command
   ```

2. Prepare candidate inputs for the five-job series:

   ```sh
   open launchers/Prepare\ Weekly\ Top\ 5\ Substack.command
   ```

   The launcher regenerates local trend files from saved packages, opens the
   writing inputs, and copies the request below to the clipboard. Read the
   actual range and source dates in those files. It does not fetch jobs.

3. Paste the copied request into Codex.

4. Review the draft and unresolved checks in:

   ```text
   /Users/adampugh/GitHub/writing-projects/substack-five-recent-documentation-jobs-YYYY-MM-DD.md
   ```

Use Adam's edition date for `YYYY-MM-DD`. If it is missing, leave the date
unresolved and ask for it before saving a dated file. Do not overwrite an
existing draft. Nothing in this workflow publishes to Substack automatically.
Adam reviews the draft and pastes it into Substack.

## Request to Give Codex

```text
Draft an edition of "Five recent documentation jobs."

This is the separate five-job series, not the broad weekly roundup. Read the current Working Notes
project instructions, its Library Voice Charter, and
/Users/adampugh/GitHub/public-job-feed/docs/substack-publication.md first.
State any missing guidance. Current task and project instructions take
priority over old articles and the skill's older job-roundup template.

Use:
- /Users/adampugh/GitHub/public-job-feed/data/jobs/trends/latest/weekly-new-jobs.csv as a starting candidate pool. Its first-seen dates do not establish recency.
- /Users/adampugh/GitHub/public-job-feed/data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv to confirm membership in the current saved public package.
- The current public package to find other roles with recent employer publication dates. The first-seen file is not an exhaustive recent-posting list.
- /Users/adampugh/GitHub/public-job-feed/data/jobs/trends/latest/weekly-substack-report.md for counts, range, source dates, and data limits. These describe this feed, not the whole job market.
- The adam-substack-voice skill with the job-roundup profile, when available. Do not invent personal judgment to satisfy its review rules.

Use Adam's supplied edition date. If it is missing, mark [NEEDS EDITION DATE]
and ask before saving a dated file. Do not use today's date by default.

Unless Adam supplies another window, use a seven-day publication window
ending on the edition date. State the actual date range. Require verified
employer publication dates within that window. Do not substitute a feed
first-seen date, last-checked date, or page update date. Keep material timezone
differences visible. Exclude roles with no verified publication date from this
recent-jobs selection.

Research official employer detail and application pages. Select five live
roles with meaningful documentation, developer education, content design,
knowledge management, or related ownership. Exclude title-only matches,
duplicate location variants, stale listings, and unverified aggregator copies.
Include remote, hybrid, and onsite roles when useful, with exact locations
and restrictions. This is a public selection, not Adam's personal job search.
Check previous editions to avoid repeating a featured role without an update.
If fewer than five suitable recent roles can be verified, report the shortfall
and hold the edition. Do not add weak or older roles to reach five.

For each role, verify the exact title, actual employer, location, work
arrangement, remote restrictions, published pay, employer posting date,
application link, actual work, and an important qualification or constraint.
Keep base pay separate from bonus, equity, and total compensation. State the
currency, pay period, and geographic scope when published. Do not infer
missing facts. If a checked page omits pay, use "Not published." If a check is
incomplete, label it unverified. A missing employer publication date makes
the role ineligible for this recent-jobs edition.

Use the title "Five recent documentation jobs" and a short descriptive
Substack subtitle. The supplied example uses "Current openings with
application links and location details." Keep the publication-date range in
a short source sentence. Do not use the broad roundup's title or week label.
Link to the free Good Doc Jobs sheet. Give each job the same metadata order
and one compact paragraph about the work and an important constraint. Add a
short comparison only when it adds useful information, then a source note
with the saved package dates and the actual official-page check dates.

Use plain English and standard punctuation. Do not add em dashes to new prose.
Preserve exact titles, quotations, URLs, and code. Do not invent my experience,
reaction, application history, interview history, or judgment. Mark material
gaps with specific placeholders, such as [NEEDS ADAM'S EXAMPLE].

Use the latest approved support footer after the editorial ending. If it is
missing, mark [NEEDS APPROVED SUPPORT FOOTER]. Good Doc Jobs is free to use and
share without signup. Paid subscriptions are optional support; they do not
provide better jobs or earlier feed access.

Label the result as a draft outside the article. Save it as
/Users/adampugh/GitHub/writing-projects/substack-five-recent-documentation-jobs-YYYY-MM-DD.md using
the supplied edition date. Preserve existing drafts. Complete the voice
review when available, make small useful repairs, and list unresolved checks
separately. Do not refresh the feed, publish, or claim that a voice checker
proves factual accuracy.
```

## Selection rules

The feed score is only the first pass. It is not the final ranking.

Each selected role should:

- still appear in the current cleaned feed;
- open to a live employer-controlled or official ATS application page;
- have a verified employer publication date within the stated recent window;
- contain real documentation-related work rather than a title-only match;
- offer enough scope, compensation, specialization, ownership, or unusual work
  to explain why it made the cut;
- add something distinct to the five-job set; and
- have its important eligibility limits stated plainly.

The five do not need to have the highest scores. Select useful differences in
work, sector, seniority, location, or requirements. Do not force variety at the
expense of relevance. The selection requires reading the postings.

## Files Used

- `data/jobs/trends/latest/weekly-new-jobs.csv`: roles first seen in the
  available saved history during the selected range.
- `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`: the current
  cleaned jobs list after deterministic dead links are removed.
- `data/jobs/trends/latest/weekly-substack-report.md`: feed counts, the actual
  range, source dates, and data limits.
- `data/jobs/trends/latest/substack-notes.md`: shorter factual notes when the
  full weekly report is more detail than needed.

## Expected Article Shape

```text
Five recent documentation jobs
Subtitle: short context about the five-job selection
Verified employer publication-date range
Free Good Doc Jobs sheet link

1. Role: Company
   Location and work arrangement, with eligibility limits
   Published pay, with currency, pay period, and compensation type
   Verified employer publication date
   Apply
   One compact paragraph about the work, constraint, and any supplied judgment

Repeat through job 5

One short comparison paragraph, if useful
Source note with saved package dates and official-page check dates
Approved support footer, separate from the editorial ending
```

“Remote” must include its actual country, state, coast, or timezone restriction.
For pay, use “Not published” only after checking the official page. Distinguish
missing published facts from incomplete checks and empty export fields. A role
needs a verified publication date to qualify for this series.
