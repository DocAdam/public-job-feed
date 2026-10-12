# Job scope review: October 12, 2026

## Source and method

This review used saved package `20261012-0604`, generated on October 12,
2026, at 11:04 UTC (6:04 a.m. Central). The public list contained 765 rows.
The source files were:

- `data/jobs/gsheet-package/20261012-0604/01_good_documentation_jobs.csv`:
  public titles, application links, posting dates, and grouped links.
- `data/jobs/gsheet-package/20261012-0604/03_top_matches_full.csv`:
  844 detailed records with saved descriptions and score reasons.

The review checked whether the main duties involved technical writing or
record processing. It used saved evidence. It did not check whether the
postings were still open. Some descriptions contained only a title or a
short extract; those records remained uncertain until the user made the
inclusion decision.

## Findings

The review flagged 48 public rows for clinical records, financial records,
freight and customs documents, personnel records, legal documents, quality
and regulatory documents, and other administration. At least 18 had saved
duties that showed work outside the initial technical-writing scope.

The word `specialist` appeared in 94 of the 765 public titles, 45 of the
48 flagged rows, and 16 of the 18 rows with clear saved duties outside scope.
These counts came from a review focused on document-related titles. They
do not establish a false-match rate for all specialist roles.

The review found that a broad title match could raise a score to 85.
A strong title match could also keep a clinical role in the shortlist after
a score penalty. The title-based role label could classify clinical
documentation work as technical writing. This update records the user's
decisions for the reviewed postings; it does not change those score or
title-category rules.

## Approved decisions

The user approved removal of the 48 flagged public rows. Two grouped rows
each contained a second posting link, so the decision covers 50 posting URLs.
The exact URLs, saved titles, company labels, posting dates, review date,
source package, and reasons are in
[`public-package-role-exclusions.json`](../src/config/public-package-role-exclusions.json).
A blank posting date means the saved public row supplied no date.

The user approved these six roles to remain eligible:

- [Keeper Security: Web Developer, Technical SEO](https://job-boards.greenhouse.io/keepersecurity/jobs/4444326009)
- [Airbnb: Senior Manager, Technical Program Management](https://careers.airbnb.com/positions/8231975?gh_jid=8231975)
- [Verisign: Senior Information Security Architect](https://job-boards.greenhouse.io/verisign/jobs/8011544003)
- [SumUp: Information Security Architect](https://sumup.com/careers/positions/8644927002?gh_jid=8644927002)
- [OpenAI: Technical Program Manager, Developer Velocity](https://jobs.ashbyhq.com/openai/ad958934-fd89-4033-8b13-1a4871d8073c)
- [Anthropic: Technical Program Manager, API Platform](https://job-boards.greenhouse.io/anthropic/jobs/5256303008)

## Implemented behavior

[`packageEligibility`](../src/lib/public-package-eligibility.js) applies
the new exact-URL decisions with the existing Carvana exclusion.
It checks the public URL, source URL, application URL, and raw posting URL.
The package build applies the filter before it groups public rows and writes
`public-package-exclusions.csv` with each excluded URL, review date, and reason.

The word `specialist` alone does not cause removal. Valid documentation
specialists remain eligible. The decisions do not exclude a company or all
roles with the same title. A new posting URL requires a separate review.
The filter preserves source records, scores, and diagnostic exports.
Other outputs apply the decisions only when they call this filter or read a
package built with it.

## Validation and limits

The focused tests check that all 50 reviewed URLs are excluded, all six
approved roles remain, valid specialist roles remain, a different posting
URL is retained, source records are unchanged, and both plain-link and
formula exports include the correct rows. They also check the exclusion
audit and both additional links from the grouped rows.

Run the focused checks with:

```sh
npm run jobs:test-review-improvements
npm run jobs:test-gsheet-grouping
```

The saved-package check found that 48 public rows would be removed and 717
would remain. The detailed input had 51 excluded records: the 50 new decisions
and the existing Carvana decision. Of its 844 records, 793 remained eligible.
A temporary build from the detailed CSV had 746 grouped rows before URL
pruning, compared with 794 before the new decisions. These temporary-build
counts use a different stage from the final public list.

The source update did not rebuild saved packages, change published Sheets,
or run a live refresh. The next normal package build applies the decisions.
A live refresh and publication remain unverified for this update.
