# Approved snapshot relocation and backup-only result

**Result: PASS.** Only the named snapshot was relocated. The external copy is preserved. One backup-only attempt passed complete restore, audit, report comparison and final bundle acceptance for the current generation.

- [Relocation, exact timestamps and rollback instructions](relocation.json)
- [Full copy verification before link replacement](copy-verification.json)
- [Actual space check](space-after-relocation.json)
- [Backup-only process result](backup-attempt-1-result.json)
- [Complete restore proof](VERIFIED.json)
- [Fresh accepted-bundle check](accepted-bundle-verification.json)
- [Current acceptance result](current-acceptance.json)

The original daily space failure remains unchanged. No feed refresh, additional existing-file relocation, live Sheet update, commit, push or publication ran. Original dates are retained exactly in the receipt; the external filesystem stores file dates at lower precision. Keep the external snapshot copy after any rollback.
