# Streaming export operations runbook

## Scope and safety boundary

This workflow is test-only until an explicit operational review approves a separate opt-in flag. It must not modify `data/jobs/public` publication paths. All runs use `data/jobs/public/.staging`.

The reversible opt-in is now available and remains off by default:

```sh
npm run jobs:export-slices -- --use-streaming-export --profile full
```

It invokes only the non-publishing streaming dry run. Running `npm run jobs:export-slices` without the flag continues to use the legacy exporter.

## Disk preflight

Before starting, inspect free space and retained staging artifacts:

```sh
df -h data/jobs/public/.staging
du -sh data/jobs/public/.staging/* 2>/dev/null | sort -h
```

The dry-run command independently checks available bytes. Keep one complete validation set within the approved 20–25 GB staging budget; retire a prior run only after preserving its manifest in `data/jobs/public/.audit/`.

## Full streaming run

```sh
npm run jobs:export-slices:streaming-dry-run -- --profile full --batch-size 100
```

Record the emitted run directory. The expected full-feed scale is 833,266 rows and roughly 440–452 MiB peak RSS. Do not use a run unless its `manifest.json` reports `PHASE_2_COMPLETE` and `PublishedOutputsChanged: false`.

## Stage and validate deduped outputs

```sh
RUN_DIR=data/jobs/public/.staging/export-slices-<run-id>
BASELINE_DIR=data/jobs/public/.staging/legacy-disk-baseline-<run-id>

npm run jobs:export-slices:streaming-stage-outputs -- --run-dir "$RUN_DIR" --dedupe-only
npm run jobs:export-slices:legacy-dedupe-baseline -- --run-dir "$RUN_DIR" --output-dir "$BASELINE_DIR"
npm run jobs:export-slices:compare-baselines -- \
  --left "$RUN_DIR/outputs/slices/deduped" \
  --right "$BASELINE_DIR/slices/deduped"
```

The comparison must report every JSON/CSV file byte-identical. The disk-backed baseline preserves legacy `getDedupeKeys`, `compareRows`, selection-reason, and rejected-row-summary rules without loading the firehose into memory.

## Test-only publication

The publisher requires the top pair in addition to deduped outputs:

```sh
npm run jobs:export-slices:streaming-stage-outputs -- --run-dir "$RUN_DIR" --raw-slice top
npm run jobs:export-slices:streaming-publish-test -- \
  --run-dir "$RUN_DIR"
```

`streaming-publish-test` derives a test-only publish root from `RUN_DIR`. It requires staged outputs, so run the staging command first.

Inspect the test-root symlink:

```sh
readlink data/jobs/public/.staging/publish-test-<run-id>/latest
```

The target must be a versioned `streaming-v1-*` directory. Required files and required JSON are validated before the version directory is promoted.

## Rollback

For a future explicitly approved publication root, retain the prior version directory and atomically repoint `latest` to it:

```sh
ln -s <previous-version> .latest-rollback
mv .latest-rollback latest
```

Perform this only inside the approved publication root. A failed preflight or failure before the symlink update must leave `latest` unchanged.

## Cleanup

Keep the active SQLite run, one test-published version, and the matching disk-backed baseline only while audit or comparison is needed. Preserve a completed `manifest.json` in `.audit/` before deleting a run. Remove temporary baselines and test publication roots after their review period to maintain the disk budget.
