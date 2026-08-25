const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const {
  getLatestLiveFetchByBoard,
  isUsableBoardState,
  writeDerivedBatchHistory,
} = require("../lib/batch-history");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "public-job-feed-history-test-"));
  try {
    const rows = [
      { ATS: "ashby", CatalogSlug: "alpha", Status: "success", FetchedAt: "2026-07-01T00:00:00.000Z", SourceBatch: "old", JobCount: 2 },
      { ATS: "ashby", CatalogSlug: "alpha", Status: "failed", FetchedAt: "2026-07-02T00:00:00.000Z", SourceBatch: "failed" },
      { ATS: "ashby", CatalogSlug: "alpha", Status: "empty", FetchedAt: "2026-07-03T00:00:00.000Z", SourceBatch: "new" },
      { ATS: "lever", CatalogSlug: "beta", Status: "success", FetchedAt: "2026-08-01T00:00:00.000Z", SourceBatch: "current", JobCount: 1 },
    ];
    const latest = getLatestLiveFetchByBoard(rows);
    assert.equal(latest.get("ashby|alpha").SourceBatch, "new");
    const result = await writeDerivedBatchHistory({
      outputDir: tempDir,
      generatedAt: "2026-08-02T00:00:00.000Z",
      sourceBatchCount: 3,
      fetchLogRows: rows,
    });
    assert.equal(result.boardCount, 2);
    assert.equal(result.eventCount, 4);
    const state = JSON.parse(await fs.readFile(path.join(tempDir, "board-latest-fetch.json"), "utf8"));
    assert.equal(isUsableBoardState(state, 3), true);
    assert.equal(state.Boards.find((row) => row.BoardKey === "ashby|alpha").SourceBatch, "new");
    const july = zlib
      .gunzipSync(await fs.readFile(path.join(tempDir, "history", "fetch-events", "2026-07.jsonl.gz")))
      .toString("utf8");
    assert.equal(july.trim().split("\n").length, 3);
    console.log("Batch history tests passed.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
