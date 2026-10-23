# Accepted history checkpoint and current source failure

Derived commit-review record. Checked October 23, 2026.

The October 23 refresh has feed result `COMPLETE`, history `FAILED`, and backup
`NOT_RUN`. Both saved reports use run ID
`b7c60842-15b2-49c7-b33d-b2dc18f6a3e1`. This record does not mark current history
as healthy or authorize a rebuild.

## Last accepted generation

- Generation: `c4fe469c-5f61-46ea-8717-2f5e363fb804`.
- Database format: v2; 155 snapshots through `20261022-0622`.
- Database SHA-256: `7370ade23f897fb6fe9fb120081254d2ef3ddb070cfc593e6a1f8bd0cf13de7d`.
- The closed database hash matches the accepted journal and `validation.json`.
- The generated README and history report name that generation. The report also
  names the same database hash. No WAL or history writer lock was present.

The tracked history README and validation record describe this accepted
generation. They are not a successful audit of the current source archive.

## Current failure and limits

The saved refresh stopped history on this source hash mismatch:

`20261022-0622/gsheet-package-manifest.json`

The last verified backup remains the October 22 daily backup through
`20261022-0622`. The commit work did not independently restore the external
backup or rerun the production history audit. It did not edit source packages,
the database, the accepted journal, recovery copies, or runtime reports.

Preserve the current source bytes, accepted generation, and failed-run evidence.
A separate review must explain the source change and define a checked repair.
Do not edit recorded hashes or overwrite accepted history to bypass the check.

See [Daily history and backup](../daily-history-backups.md) for current operating
rules and the [review index](README.md) for earlier accepted operations.
