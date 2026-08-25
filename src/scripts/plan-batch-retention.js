const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");
const { isUsableBoardState } = require("../lib/batch-history");

const batchesRoot = fromRoot("data", "jobs", "batches");
const indexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const boardStatePath = fromRoot("data", "jobs", "index", "board-latest-fetch.json");
const reportsDir = fromRoot("data", "jobs", "reports");
const headers = ["BatchName", "ATS", "GeneratedAt", "AgeDays", "SizeBytes", "Action", "Reason"];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDate(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function getDirectorySize(directory) {
  let size = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) size += await getDirectorySize(entryPath);
    else if (entry.isFile()) size += (await fs.stat(entryPath)).size;
  }
  return size;
}

function buildMarkdown(rows, options) {
  const counts = rows.reduce((result, row) => {
    result[row.Action] = (result[row.Action] || 0) + 1;
    return result;
  }, {});
  const candidateBytes = rows
    .filter((row) => row.Action === "RETIRE_CANDIDATE")
    .reduce((sum, row) => sum + row.SizeBytes, 0);
  return [
    "# Batch Retention Plan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Policy",
    "",
    `- Raw batch retention: ${options.rawRetentionDays} days.`,
    "- Any batch referenced by the current board-state index is protected regardless of age.",
    "- Historical fetch events are retained in compressed monthly ledgers under `data/jobs/index/history/fetch-events/`.",
    "- This plan does not delete data. Apply support is intentionally deferred until a full rebuild validates derived-state-only operation.",
    "",
    "## Results",
    "",
    `- KEEP_CURRENT_SOURCE: ${counts.KEEP_CURRENT_SOURCE || 0}`,
    `- KEEP_RECENT: ${counts.KEEP_RECENT || 0}`,
    `- RETIRE_CANDIDATE: ${counts.RETIRE_CANDIDATE || 0}`,
    `- REVIEW: ${counts.REVIEW || 0}`,
    `- Candidate bytes: ${candidateBytes}`,
    "",
  ].join("\n");
}

async function main() {
  const options = { rawRetentionDays: positiveInteger(getArgValue("--raw-retention-days", "30"), 30) };
  const [batchIndex, boardState] = await Promise.all([readJsonFile(indexPath), readJsonFile(boardStatePath)]);
  const okBatches = batchIndex.filter((row) => row.IndexStatus === "OK");
  if (!isUsableBoardState(boardState, okBatches.length)) {
    throw new Error("Board state is missing or does not match the current batch index. Run npm run jobs:index-batches first.");
  }
  const referenced = new Set(boardState.Boards.map((row) => String(row.SourceBatch || "")).filter(Boolean));
  const now = Date.now();
  const rows = [];
  for (const batch of batchIndex) {
    const generatedAt = parseDate(batch.GeneratedAt);
    const ageDays = generatedAt ? Math.floor((now - generatedAt) / 86400000) : "";
    let action = "REVIEW";
    let reason = batch.IndexStatus !== "OK" ? `Batch index status: ${batch.IndexStatus}` : "Missing generated timestamp";
    if (batch.IndexStatus === "OK" && referenced.has(batch.BatchName)) {
      action = "KEEP_CURRENT_SOURCE";
      reason = "Referenced by current board-state index";
    } else if (batch.IndexStatus === "OK" && generatedAt && ageDays < options.rawRetentionDays) {
      action = "KEEP_RECENT";
      reason = `Within ${options.rawRetentionDays}-day raw retention window`;
    } else if (batch.IndexStatus === "OK" && generatedAt) {
      action = "RETIRE_CANDIDATE";
      reason = "Superseded by derived board state; compact fetch history retained";
    }
    rows.push({
      BatchName: batch.BatchName,
      ATS: batch.ATS,
      GeneratedAt: batch.GeneratedAt,
      AgeDays: ageDays,
      SizeBytes: await getDirectorySize(batch.BatchFolder),
      Action: action,
      Reason: reason,
    });
  }
  await Promise.all([
    writeTextFile(path.join(reportsDir, "batch-retention-plan.csv"), rowsToCsv(headers, rows)),
    writeJsonFile(path.join(reportsDir, "batch-retention-plan.json"), rows),
    writeTextFile(path.join(reportsDir, "batch-retention-plan.md"), buildMarkdown(rows, options)),
  ]);
  const candidateBytes = rows.filter((row) => row.Action === "RETIRE_CANDIDATE").reduce((sum, row) => sum + row.SizeBytes, 0);
  console.log(`Batch retention plan complete: ${rows.length} batches, ${rows.filter((row) => row.Action === "RETIRE_CANDIDATE").length} candidates, ${candidateBytes} bytes.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
