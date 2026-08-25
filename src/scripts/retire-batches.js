const fs = require("fs/promises");
const path = require("path");
const { fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");
const { getLatestLiveFetchByBoard, isUsableBoardState } = require("../lib/batch-history");

const batchesRoot = fromRoot("data", "jobs", "batches");
const indexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const statePath = fromRoot("data", "jobs", "index", "board-latest-fetch.json");
const planPath = fromRoot("data", "jobs", "reports", "batch-retention-plan.json");
const reportPath = fromRoot("data", "jobs", "reports", "batch-retirement-result.json");
const reportMarkdownPath = fromRoot("data", "jobs", "reports", "batch-retirement-result.md");

function parseBoolean(value, fallback) {
  return value === undefined || value === null ? fallback : String(value).toLowerCase() !== "false";
}

function sameState(expected, actual) {
  if (expected.size !== actual.size) return false;
  for (const [key, row] of expected) {
    const candidate = actual.get(key);
    if (
      !candidate ||
      candidate.SourceBatch !== row.SourceBatch ||
      String(candidate.Status).toLowerCase() !== String(row.Status).toLowerCase() ||
      candidate.FetchedAt !== row.FetchedAt
    ) return false;
  }
  return true;
}

function assertSafeBatchPath(batchName) {
  const target = path.resolve(batchesRoot, batchName);
  const relative = path.relative(batchesRoot, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe batch target: ${batchName}`);
  }
  return target;
}

async function loadProtectedState(index, retireNames) {
  const logs = [];
  for (const batch of index) {
    if (batch.IndexStatus !== "OK" || retireNames.has(batch.BatchName)) continue;
    const fetchLogPath = path.join(batch.BatchFolder, "jobs-batch-fetch-log.json");
    const rows = await readJsonFile(fetchLogPath);
    if (!Array.isArray(rows)) throw new Error(`Invalid fetch log: ${fetchLogPath}`);
    logs.push(...rows.map((row) => ({ ...row, SourceBatch: batch.BatchName })));
  }
  return getLatestLiveFetchByBoard(logs);
}

function markdown(result) {
  return [
    "# Batch Retirement Result",
    "",
    `Generated: ${result.GeneratedAt}`,
    `Applied: ${result.Applied}`,
    `Candidates: ${result.CandidateCount}`,
    `Deleted: ${result.DeletedCount}`,
    `Protected-state validation: ${result.Validation}`,
    "",
  ].join("\n");
}

async function main() {
  const apply = parseBoolean(process.argv.includes("--apply") ? "true" : "false", false);
  const [index, state, plan] = await Promise.all([readJsonFile(indexPath), readJsonFile(statePath), readJsonFile(planPath)]);
  const okBatches = index.filter((row) => row.IndexStatus === "OK");
  if (!isUsableBoardState(state, okBatches.length)) {
    throw new Error("Current board state does not match batch index. Run npm run jobs:index-batches and plan retention again.");
  }
  const retireRows = plan.filter((row) => row.Action === "RETIRE_CANDIDATE");
  const retireNames = new Set(retireRows.map((row) => row.BatchName));
  const expected = new Map(state.Boards.map((row) => [row.BoardKey, row]));
  const protectedState = await loadProtectedState(index, retireNames);
  if (!sameState(expected, protectedState)) {
    throw new Error("Protected batch subset does not reproduce current board state. Refusing retirement.");
  }

  const result = {
    GeneratedAt: new Date().toISOString(),
    Applied: apply,
    CandidateCount: retireRows.length,
    DeletedCount: 0,
    Validation: "PASS",
    DeletedBatches: [],
  };
  if (apply) {
    for (const row of retireRows) {
      const target = assertSafeBatchPath(row.BatchName);
      await fs.rm(target, { recursive: true, force: false, maxRetries: 3, retryDelay: 250 });
      result.DeletedCount += 1;
      result.DeletedBatches.push(row.BatchName);
    }
  }
  await Promise.all([writeJsonFile(reportPath, result), writeTextFile(reportMarkdownPath, markdown(result))]);
  console.log(`Batch retirement ${apply ? "complete" : "validated"}: ${result.DeletedCount}/${result.CandidateCount} folders deleted.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
