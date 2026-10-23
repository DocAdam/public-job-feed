# Batch retention plan

Generated: 2026-10-20T19:24:32.690Z

Status: checked proposal. No deletion is authorized by this file.

- Keep raw batches for 30 days.
- Keep every current board source, regardless of age.
- Keep review folders and folders with unfinished collection records.
- Source hashes, full current state, retained-source state, and saved fetch events were checked.
- The executor must repeat these checks under the shared lock. Plans expire after 24 hours.

- KEEP_CURRENT_SOURCE: 751
- KEEP_RECENT: 381
- RETIRE_CANDIDATE: 762
- REVIEW: 4
- Candidate bytes: 52741474676 (49.12 GiB).
- Current boards: 29551.
- Raw fetch rows checked: 590622.
- Candidate fetch rows checked: 185491.
- Saved history events: 590622.

The monthly ledger keeps fetch records. It does not keep every raw job description or every batch export. Decide whether a verified external archive is needed before approving removal.

A stopped process leaves its lock for manual review. Other tools that write files directly do not follow this lock. Stop such work before any approved cleanup.
