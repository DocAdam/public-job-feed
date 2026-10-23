# October 23 history manifest repair

Status: PASS. The repair finished on October 23, 2026 at 14:26:33 UTC.
History and the new 1Pugh backup passed. All 36 configured test suites passed.
This is derived repair evidence, not a new job collection.

## Approved scope

Finalize package dashboards and both manifest formats before history import.
Keep later status results outside the package. Preserve the complete CSV schema
and refuse writes to packages that history has imported. Reject a pending
package whose operational dashboard has the wrong package ID or size.

Restore only these three derived metadata files in `20261022-0622` from their
accepted backup bytes: `gsheet-package-manifest.json`,
`gsheet-package-manifest.csv`, and `PROJECT_STATUS_DASHBOARD.md`. Preserve their
current versions and the original failure records. Import the pending
`20261023-0624` package and verify a new backup. No job CSV, raw catalog, public
feed, Job Finder record, or legacy recovery copy is changed by this scope.

## Cause and historical limit

The former launcher imported history before its final dashboard sync. That sync
changed the dashboard size in the JSON manifest from 7,390 to 7,809 bytes.
All other 1,084 reviewed history inputs matched, including 310 job CSV files.
The CSV writer also dropped `RecommendedSheetTabName` because it selected only
the first row's keys.

The accepted October 22 backup contains the copied October 21 dashboard. Its
restored bytes are pre-finalization historical evidence, not a fresh October 22
status. The later correct dashboard is retained separately. Restoration does
not rewrite source hashes or replace the accepted database with an older one.

## Evidence and checks

- [Verification](verification.json): production phases, exact changed paths,
  preservation counts, the final audit, and the repeat update.
- [Test results](test-results.json): 36 suites, all with exit code zero.
- [Final checks](final-checks.json): 248 program files match the verified
  backup, the database hash matches, locks are released, and documentation
  links pass.
- [History result](history-result.json): repair run
  `99f28a70-8b5b-44b0-9c63-fa4542f6dad0`, linked to the original feed run.
- [Accepted audit](accepted-audit.json): 156 snapshots through `20261023-0624`,
  no pending snapshots, and no audit errors.
- [Backup summary](backup-summary.json) and [restore proof](backup-proof.json):
  3,222 files, 4,541,513,259 uncompressed bytes, full restore, and report match.
- [Restoration receipt](restoration.json), [accepted copies](accepted-metadata/),
  and [later copies](current-metadata/): the three restored metadata files and
  their preserved versions.
- [Original history failure](original-history-result.json) and
  [original feed result](original-refresh-result.json): the earlier results.

The accepted database generation is `a96222a8-98be-4e16-b0d6-2826841f7235`.
Its SHA-256 is
`99a5f6929cda8d982321c31fc074223702db86a55c5993c56db5e85a3c1b6975`.
The verified backup is:

```text
/Volumes/1Pugh/Public Job Feed Archives/daily-history-v1/daily-20261023T141746767Z-ce7bb563-ae8b-4b73-a152-11af034a1110
```

The final checks compared all 2,985 saved package records. Only nine metadata
files changed: the dashboard and two manifests in `20261022-0622`,
`20261023-0624`, and `latest`. All 314 checked job CSV files were unchanged.
All 711 existing local recovery files and the existing daily backup were
unchanged. Retention did not run. No backup or recovery copy was removed.

| Requirement | Test result | Production result |
| --- | --- | --- |
| Finalize the correct dashboard before import | PASS | PASS |
| Keep all manifest CSV columns | PASS | PASS; 11 columns |
| Refuse package writes after import | PASS | PASS; sync refused |
| Keep packages unchanged after final status | PASS | PASS |
| Import and back up the next daily snapshot | PASS in temporary data | A future daily refresh was not run |
| Refuse altered job CSV and unrelated manifest data | PASS | No intentional source corruption |
| Keep feed success separate from backup failure or missing drive | PASS | Original feed result unchanged |
| Restore the complete backup and match its report | PASS | PASS |
| Repeat update without another import | PASS | PASS; zero imports and unchanged database hash |

The private operation folder in [status](status.json) holds the source
checkpoint, all package hashes, before copies, test logs, and the execution
journal. The source checkpoint is the pushed commit
`f40a789498d26289ce2d569b1551f062e028edef`. At the verification checkpoint, the
repair had not been committed or pushed. The saved check results describe that
checkpoint.

## Limits

No live job refresh, Google Sheets update, or publication ran. The next full
desktop refresh remains unobserved. Its order was tested with a launcher
fixture, and the repaired sequence was used for this production import.
Historical duplicate rows, unmatched rows, and header variants remain recorded
in the audit; they were not removed to obtain a passing result.

The original [failure checkpoint](../history-checkpoint-2026-10-23.md) and
earlier operation records remain unchanged. Current procedures are in
[Daily history and backup](../../daily-history-backups.md).
