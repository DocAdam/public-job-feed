# Refresh Job Feed process

These diagrams summarize the current `Refresh Job Feed.command` process.
Script names refer to `src/scripts/` unless a different folder is shown.
The refresh prepares local files. Publication is a separate manual step.

## Source checks and feed build

```mermaid
flowchart TD
    A(["Refresh Job Feed.command"]) --> B["refresh-job-index.js<br/>Take maintenance lock; wait if another run is active"]
    B --> C["refresh-catalogs.js<br/>Refresh catalogs older than 24 hours"]
    B --> D["maintain-board-index.js: due scope<br/>Include known good-match boards<br/>Due limit: 300; budget: 45 minutes"]
    C --> V{"Catalog refresh succeeds?"}
    V -- Yes --> E["maintain-board-index.js: catalog-delta scope<br/>Check newly added ATS + slug keys<br/>Limit: 250; skip if no additions"]
    V -- No --> W["Keep last-known-good queue<br/>Record warning"]
    D --> F["index-batches.js<br/>Index board results and fetch history"]
    E --> F
    W --> F
    F --> G["report-board-freshness.js<br/>report-ats-anomalies.js"]
    G --> H["build-public-release.js --profile daily<br/>Check local files and index batches"]
    H --> M["merge-batches.js<br/>Use latest successful or empty board result<br/>A newer empty result removes older listings<br/>Fetch errors do not count as confirmed closure"]
    I["Approved curated submissions<br/>Read employer JobPosting data<br/>Temporary failure: keep last verified row<br/>Confirmed 404 or 410: omit row"] -. "Additional input" .-> M
    M --> J["job-export.js<br/>Flag duplicates and export quality<br/>Apply Writer Fit v3 scoring"]
    J --> K[("public-job-feed-latest.json and .csv<br/>Keep full current feed with diagnostic fields")]
    K --> L["export-public-slices.js --profile daily<br/>Top set: tier A or B, OR STRONG_MATCH title<br/>Select one row per duplicate group"]
    L --> O[("Top-match exports and duplicate decisions<br/>Daily profile skips expensive full slice outputs")]
```

Catalog checks and due-board checks start in parallel. The index step waits
for the required checks to finish. Invalid catalog data uses the previous
source; an unapproved row-count decline above 20% also triggers this fallback.
A required maintenance failure stops the refresh before the release build.

## Writer Fit v3 scoring

The score is a ranking aid. Location and remote status do not add score points.

```mermaid
flowchart TD
    A["Title analysis<br/>title-match.js and title-review.js"] --> B["writer-fit-score.js: starting points<br/>STRONG_MATCH: 50; POSSIBLE_MATCH: 30<br/>ADJACENT: 15; LOW_SIGNAL: 5; other: 0"]
    B --> C["Add evidence points<br/>Salary detected: +5<br/>Leadership signal: +10; IC signal: +10<br/>Domain signals: +5 each, maximum +25"]
    C --> D["Apply quality and duplicate points<br/>OK: +5; REVIEW: -5; BAD_ROW: -50<br/>Possible duplicate: -5"]
    D -. "Save value limited to 0–100" .-> BASE[("WriterFitBaseScore")]
    D --> E["Apply role penalties to running score<br/>Examples: non-writer title -35<br/>Architect without relevant evidence -40<br/>Clinical role without writer evidence -50<br/>Applicable penalties can combine"]
    E --> F["Limit score to 0–100"]
    F --> G{"Qualifying strong writer title<br/>or strong watchlist match?<br/>No severe non-writer title signal?"}
    G -- Yes --> H["Raise score to at least 85"]
    G -- No --> I{"Score at least 60, but no<br/>strong writer or docs signal?"}
    H --> I
    I -- Yes --> J["Cap score at 59<br/>Record guardrail and reason"]
    I -- No --> K["Assign final tier"]
    J --> K
    K --> L[("A: 80–100; B: 60–79; C: 40–59<br/>D: 20–39; F: 0–19<br/>Save score, reasons, and penalty fields")]
```

The score floor applies after penalties. It is disabled for severe non-writer
title signals. The examples above are not the full penalty list; see
[writer-fit-score.js](../src/lib/writer-fit-score.js) for all conditions.

## Export, link checks, and validation

```mermaid
flowchart TD
    A[("Current public JSON feed")] --> B["export-job-finder-consumer.js<br/>Write local consumers/job-finder/latest.json"]
    B --> C["build-gsheet-package.js --profile daily<br/>Build timestamped package and latest copy"]
    T[("Top-match JSON after duplicate selection")] -. "Main jobs table input" .-> C
    C --> D["Build 01_good_documentation_jobs.csv<br/>Combine eligible repeated location listings<br/>Sort by newest job, then highest writer-fit score"]
    D --> E["Clean Broken Links.command<br/>Validate timestamped package before URL checks"]
    E --> F["check-gsheet-url-health.js --apply-safe<br/>Remove confirmed closed or invalid links<br/>Keep timeouts, rate limits, and access blocks for review"]
    F --> G["Validate cleaned package<br/>Regenerate trends<br/>Sync cleaned upload files to latest<br/>Validate latest and analyze unknown title categories"]
    G --> H["report-us-remote-daily.js<br/>report-international-remote-daily.js<br/>report-all-remote-daily.js"]
    P[("Two newest timestamped packages")] -. "Comparison input" .-> H
    H --> I{"npm run jobs:test-all passes?"}
    I -- No --> X["Record failure and stop<br/>Do not open package automatically"]
    E -. "Validation failure" .-> X
    F -. "Cleanup command failure" .-> X
    G -. "Cleanup or validation failure" .-> X
    I -- Yes --> V{"validate-refresh-output.js<br/>Current package IDs and source dates?"}
    V -- No --> X
    V -- Yes --> J["build-status-dashboard.js --sync-package<br/>Record completion, sync dashboards, and open latest package"]
    J -. "Separate manual step" .-> K(["Upload to Google Sheets<br/>or publish to Substack"])
```

Duplicate selection uses [dedupe-select.js](../src/lib/dedupe-select.js).
It joins rows by duplicate-group or canonical-URL keys, with fallback keys
when those are absent. It selects the highest writer-fit score first. Ties
use tier, quality, US remote eligibility, work arrangement, salary evidence,
ATS priority, posting date, and stable text order. Remote fields can affect
this tie-break without changing the writer-fit score.

Link cleanup changes the Google Sheets package after the public feed and
Job Finder export are built. Those earlier exports do not receive this
package cleanup. The Job Finder export does not change Job Finder records.

The daily reports require explicit location evidence. A generic `Remote`
location is not enough. A multi-region job can appear in both source reports.
Reports contain current, added, removed, and continuing jobs.

The desktop entry starts the repository launcher. Run records preserve the
launcher path, hash, Git revision, arguments, and result. The package evidence
review is generated after link cleanup; user observations stay separate from
automated checks. Trend windows use recorded UTC package times, not folder
names. Coverage uses stable ATS + catalog slug board keys.

Solid arrows show the main process. Dotted arrows show additional data inputs,
failure paths, saved diagnostic values, or a separate manual step.

## Source files

- [Refresh launcher](../launchers/Refresh%20Job%20Feed.command)
- [Index maintenance script](../src/scripts/refresh-job-index.js) and [maintenance guide](job-index-maintenance.md)
- [Public release build](../src/scripts/build-public-release.js) and [batch merge](../src/scripts/merge-batches.js)
- [Job export fields](../src/lib/job-export.js) and [Writer Fit v3](../src/lib/writer-fit-score.js)
- [Slice exports](../src/scripts/export-public-slices.js) and [duplicate selection](../src/lib/dedupe-select.js)
- [Google Sheets package build](../src/scripts/build-gsheet-package.js)
- [Link cleanup launcher](../launchers/Clean%20Broken%20Links.command)
- [Curated submission checks](curated-submissions.md)

Update these diagrams when the refresh steps or scoring rules change.
