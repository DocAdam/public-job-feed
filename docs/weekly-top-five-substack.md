# Prepare the weekly Top 5 Jobs post

## Quick workflow

1. Finish the Public Job Feed refresh.

   For a normal weekly post:

   ```sh
   open launchers/Refresh\ Job\ Feed.command
   ```

   For a new global baseline, run the overnight catch-up first, wait for it to
   finish, and then run the normal refresh:

   ```sh
   open launchers/Run\ Overnight\ Index\ Catch-Up.command
   open launchers/Refresh\ Job\ Feed.command
   ```

2. Prepare the weekly writing inputs:

   ```sh
   open launchers/Prepare\ Weekly\ Top\ 5\ Substack.command
   ```

   The launcher regenerates the seven-day trend files, opens the latest writing
   inputs, and copies the drafting request below to the clipboard.

3. Paste the copied request into Codex.

4. Review the completed draft in:

   ```text
   /Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-YYYY-MM-DD.md
   ```

Nothing in this workflow publishes to Substack automatically. The final step is
still Adam's review and manual paste into Substack.

## Request to Give Codex

```text
Build this week's Top 5 documentation jobs Substack post.

Use:
- data/jobs/trends/latest/weekly-new-jobs.csv as the initial candidate pool.
- data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv to confirm each candidate is still in the current Good Documentation Jobs package.
- data/jobs/trends/latest/weekly-substack-report.md for the weekly feed count and factual market context.
- /Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-2026-07-20.md only as a previous-format reference. Do not carry its job facts into the new post.
- The adam-substack-voice skill with the job-roundup profile.

Research the official application pages. Choose exactly five live roles with meaningful documentation, developer education, content design, knowledge management, or closely related ownership. Prefer direct employer postings and exclude obvious scoring false positives, duplicate/location variants, stale listings, and aggregator copies when a direct employer posting is unavailable.

For every selected job, verify the exact title, company, location or remote restrictions, published salary, posted date, application URL, concrete work, and the qualification or constraint that most changes whether someone should apply. Do not infer missing salary or location details.

Draft a clear title, a two-sentence Substack subheading, five parallel job sections, one short comparison paragraph, and a source note. Give each job one compact prose paragraph after its metadata. Do not invent my experience, reaction, application history, interview history, or judgment. Mark any place where one sentence from me would materially improve the post with [ADAM NOTE].

Save the finished draft as /Users/adampugh/GitHub/writing-projects/substack-top-5-jobs-YYYY-MM-DD.md using today's date. Run the job-roundup voice review and make the smallest useful revisions before handing it back to me.
```

## What “Top 5” Means

The feed score is only the first pass. It is not the final ranking.

Each selected role should:

- still appear in the current cleaned feed;
- open to a live employer-controlled or official ATS application page;
- contain real documentation-related work rather than a title-only match;
- offer enough scope, compensation, specialization, ownership, or unusual work
  to explain why it made the cut;
- add something distinct to the five-job set; and
- have its important eligibility limits stated plainly.

The final five do not need to be the five highest numeric scores. The selection
requires reading the postings.

## Files Used

- `data/jobs/trends/latest/weekly-new-jobs.csv`: roles first seen during the
  selected seven-day window.
- `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`: the current
  cleaned jobs list after deterministic dead links are removed.
- `data/jobs/trends/latest/weekly-substack-report.md`: feed counts and weekly
  market context.
- `data/jobs/trends/latest/substack-notes.md`: shorter factual notes when the
  full weekly report is more detail than needed.

## Expected Article Shape

```text
Title
Subheading: feed/source sentence + why these five made the cut

1. Role — Company
   Location
   Base salary
   Posted
   Apply
   One compact paragraph about the work, important constraint, and supplied judgment

Repeat through job 5

One short comparison paragraph
Source note with the date checked
```

“Remote” must include its actual country, state, coast, or timezone restriction.
If the posting does not publish a salary or posted date, say “Not published”
rather than guessing.
