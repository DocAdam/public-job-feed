# Saved source failure review — September 25, 2026

Derived from `data/jobs/state/board-state.json`, generated 2026-09-25T10:35:06.230Z. No live requests were made.

This review uses the latest saved state for every fetch-eligible board. These counts are not the 24-hour anomaly report denominator.

| ATS | Eligible boards | Failed boards | Saved cause | Count |
| --- | ---: | ---: | --- | ---: |
| lever | 4368 | 2433 | BOARD_NOT_FOUND | 2425 |
| lever | 4368 | 2433 | TIMEOUT | 8 |
| ashby | 3161 | 726 | BOARD_NOT_FOUND | 725 |
| ashby | 3161 | 726 | UNCLASSIFIED | 1 |
| greenhouse | 8333 | 3093 | BOARD_NOT_FOUND | 3087 |
| greenhouse | 8333 | 3093 | TIMEOUT | 6 |

## Bounded sample

Two records per saved cause and ATS, or all records when fewer than two exist. Selection follows saved board order; it is not a random sample.

| Board | Last attempt (UTC) | Saved error | Last success (UTC) |
| --- | --- | --- | --- |
| [lever|10up-2](https://jobs.lever.co/10up-2) | 2026-09-22T09:00:36.591Z | HTTP 404 | Unknown |
| [lever|174powerglobal](https://jobs.lever.co/174powerglobal) | 2026-09-17T21:01:24.661Z | HTTP 404 | Unknown |
| [lever|arsiem](https://jobs.lever.co/arsiem) | 2026-09-24T10:58:47.733Z | This operation was aborted | 2026-09-23T11:50:50.158Z |
| [lever|fundapps](https://jobs.lever.co/fundapps) | 2026-09-23T21:01:15.605Z | This operation was aborted | Unknown |
| [ashby|01c](https://jobs.ashbyhq.com/01c) | 2026-09-23T21:00:39.487Z | HTTP 404 | Unknown |
| [ashby|11x](https://jobs.ashbyhq.com/11x) | 2026-09-23T21:00:39.509Z | HTTP 404 | Unknown |
| [ashby|cside](https://jobs.ashbyhq.com/cside) | 2026-09-23T21:00:47.011Z | HTTP 404 | 2026-09-17T09:00:07.098Z |
| [greenhouse|0x](https://job-boards.greenhouse.io/0x) | 2026-09-24T09:00:26.561Z | HTTP 404 | Unknown |
| [greenhouse|100x](https://job-boards.greenhouse.io/100x) | 2026-09-24T21:01:42.137Z | HTTP 404 | Unknown |
| [greenhouse|cartodb](https://job-boards.greenhouse.io/cartodb) | 2026-09-24T21:00:46.785Z | This operation was aborted | Unknown |
| [greenhouse|magicleap](https://job-boards.greenhouse.io/magicleap) | 2026-09-24T09:00:33.021Z | This operation was aborted | 2026-08-29T21:03:53.316Z |

## Findings and next steps

- Missing-board classifications dominate these three providers. The sample contains HTTP 404 responses. This supports a missing-board diagnosis for those saved requests; it does not prove a company has no jobs or establish a current endpoint.
- Timeout samples contain aborted requests. Some boards have a prior successful snapshot. Preserve those snapshots; a timeout does not establish closure.
- Ashby `cside` has a saved HTTP 404 but no error class. Keep it visibly unclassified until a current attempt or explicit state migration assigns the class. Do not silently rewrite historical state.
- No parser defect or endpoint-construction defect was established by this bounded review. Current classifier rules already recognize HTTP 404/410 and timeout evidence.
- Next diagnostic step: with live-fetch approval, probe a small set of previously successful missing boards and never-successful boards separately. Retain requested URL, response status, redirect, and provider response evidence. Add a regression fixture only when a reproducible code defect is established.
- Do not increase volume, remove sources, or change retry schedules based only on these counts.

## Limits

The saved state does not include full response bodies. Retired board slugs, provider migration, and a wrong endpoint can produce similar symptoms. Fresh live evidence is needed to distinguish them.
