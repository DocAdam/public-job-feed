# Greenhouse Normalize Regression

Generated: 2026-10-24T13:24:13.916Z

Status: PASS

## Results

| Fixture | DatePosted | Posted Date | Age (Days) | Status |
| --- | --- | --- | ---: | --- |
| prefers first_published over updated_at | 2026-06-03T12:00:00.000Z | 2026-06-03 | 32 | PASS |
| falls back to published_at before updated_at | 2026-06-10T09:00:00.000Z | 2026-06-10 | 25 | PASS |
| falls back to created_at before updated_at | 2026-06-15T09:00:00.000Z | 2026-06-15 | 20 | PASS |
| uses updated_at as last fallback | 2026-07-03T12:00:00.000Z | 2026-07-03 | 2 | PASS |

## Failures

None
