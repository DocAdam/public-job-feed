const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const Database = require("better-sqlite3");
const { selectDedupedRows } = require("../adapters/exports/export-dedupe");
const { fromRoot, readJsonFile } = require("../lib/files");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function getOnlyDirectory(parentPath) {
  const entries = await fs.readdir(parentPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(directories.length, 1, "Expected one staging run directory");
  return path.join(parentPath, directories[0]);
}

function runDryRun(inputPath, stagingRoot) {
  return spawnSync(
    process.execPath,
    [
      "src/scripts/export-public-slices-streaming-dry-run.js",
      "--input",
      inputPath,
      "--staging-root",
      stagingRoot,
      "--profile",
      "full",
    ],
    { cwd: fromRoot(), encoding: "utf8" }
  );
}

async function main() {
  const validFixture = fromRoot("test", "streaming-public-feed.json");
  const invalidFixture = fromRoot("test", "streaming-invalid-public-feed.json");
  const publishedPath = fromRoot("data", "jobs", "public", "public-job-feed-latest-summary.json");
  const publishedBefore = await fs.readFile(publishedPath);
  const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), "public-job-feed-streaming-test-"));

  try {
    const validStaging = path.join(parentPath, "valid");
    const validRun = runDryRun(validFixture, validStaging);
    assert.equal(validRun.status, 0, validRun.stderr);
    const manifest = await readJsonFile(path.join(await getOnlyDirectory(validStaging), "manifest.json"));
    assert.equal(manifest.Status, "PHASE_2_COMPLETE");
    assert.equal(manifest.RowsRead, 3);
    assert.equal(manifest.PublishedOutputsChanged, false);
    assert.equal(manifest.Summary.totalRows, 3);
    assert.equal(manifest.Summary.metrics.find((metric) => metric.slice_name === "firehose").rows, 3);
    assert.equal(manifest.Summary.metrics.find((metric) => metric.slice_name === "top").rows, 2);
    assert.deepEqual(
      manifest.DedupeSummary.find((item) => item.sliceName === "deduped-top"),
      { sliceName: "deduped-top", inputRows: 2, outputRows: 1 }
    );
    const fixtureRows = JSON.parse(await fs.readFile(validFixture, "utf8"));
    const legacyDedupe = selectDedupedRows(
      fixtureRows.filter((row) => ["A", "B"].includes(row.WriterFitTier)),
      "deduped-top"
    );
    const database = new Database(path.join(await getOnlyDirectory(validStaging), "run-store.sqlite"), { readonly: true });
    const selectedRows = database
      .prepare("SELECT row_json FROM selected_rows WHERE slice_name = ? ORDER BY membership_sequence")
      .all("deduped-top")
      .map((row) => JSON.parse(row.row_json));
    const decisions = database
      .prepare("SELECT decision_json FROM dedupe_decisions WHERE slice_name = ? ORDER BY component_id")
      .all("deduped-top")
      .map((row) => JSON.parse(row.decision_json));
    database.close();
    assert.deepEqual(selectedRows, legacyDedupe.rows);
    assert.deepEqual(decisions, legacyDedupe.decisions);
    assert.ok(manifest.FinalRssBytes > 0);
    assert.ok(manifest.MaxRssBytes >= manifest.FinalRssBytes);
    assert.ok(manifest.StagingBytesAtCompletion > 0);

    const invalidStaging = path.join(parentPath, "invalid");
    const invalidRun = runDryRun(invalidFixture, invalidStaging);
    assert.notEqual(invalidRun.status, 0, "Malformed input must fail");
    const invalidManifest = await readJsonFile(path.join(await getOnlyDirectory(invalidStaging), "manifest.json"));
    assert.equal(invalidManifest.Status, "FAILED");
    assert.match(invalidManifest.Error, /line 3/);

    const publishedAfter = await fs.readFile(publishedPath);
    assert.equal(digest(publishedAfter), digest(publishedBefore), "Dry runs must not modify published outputs");
    console.log("Streaming export Phase 1 tests passed.");
  } finally {
    await fs.rm(parentPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
