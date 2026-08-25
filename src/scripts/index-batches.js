const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");
const { writeDerivedBatchHistory } = require("../lib/batch-history");

const batchesRoot = fromRoot("data", "jobs", "batches");
const outputDir = fromRoot("data", "jobs", "index");
const outputCsvPath = path.join(outputDir, "batch-index.csv");
const outputJsonPath = path.join(outputDir, "batch-index.json");

const indexHeaders = [
  "BatchName",
  "BatchFolder",
  "ATS",
  "Priority",
  "Offset",
  "Limit",
  "BoardsSelected",
  "BoardsAttempted",
  "BoardsSucceeded",
  "BoardsFailed",
  "BoardsEmpty",
  "JobsFetched",
  "PublicFeedRows",
  "ExportOKCount",
  "ExportReviewCount",
  "ExportBadRowCount",
  "PossibleDuplicateCount",
  "DuplicateGroupCount",
  "GeneratedAt",
  "IndexedAt",
  "IndexStatus",
  "IndexIssue",
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readJsonChecked(filePath) {
  if (!(await fileExists(filePath))) {
    return {
      ok: false,
      issue: "missing file",
      data: null,
    };
  }

  try {
    return {
      ok: true,
      issue: "",
      data: await readJsonFile(filePath),
    };
  } catch (error) {
    return {
      ok: false,
      issue: "invalid JSON",
      data: null,
    };
  }
}

function inferBatchParts(batchName) {
  const cleanName = String(batchName || "").trim();
  const parts = cleanName.split("-").filter(Boolean);
  const offsetIndex = parts.findIndex((part) => /^\d{4,}$/.test(part));

  if (parts.length === 0 || offsetIndex === -1) {
    return {
      ATS: "",
      Priority: "",
      Offset: "",
      Limit: "",
    };
  }

  return {
    ATS: parts[0].toLowerCase(),
    Priority: offsetIndex > 0 ? parts[offsetIndex - 1].toUpperCase() : "",
    Offset: Number(parts[offsetIndex]),
    Limit: /^\d+$/.test(parts[offsetIndex + 1] || "") ? Number(parts[offsetIndex + 1]) : "",
  };
}

function getFirstAts(fetchLogRows, feedRows, inferredAts) {
  const fromLog = Array.isArray(fetchLogRows) && fetchLogRows.find((row) => row && row.ATS);
  if (fromLog) {
    return String(fromLog.ATS).toLowerCase();
  }

  const fromFeed = Array.isArray(feedRows) && feedRows.find((row) => row && row.ATS);
  if (fromFeed) {
    return String(fromFeed.ATS).toLowerCase();
  }

  return inferredAts || "";
}

function getIssue(summaryResult, fetchLogResult, feedResult) {
  const issues = [];

  if (!summaryResult.ok) {
    issues.push(summaryResult.issue === "missing file" ? "missing summary" : "invalid JSON");
  }

  if (!fetchLogResult.ok) {
    issues.push(fetchLogResult.issue === "missing file" ? "missing fetch log" : "invalid JSON");
  }

  if (!feedResult.ok) {
    issues.push(feedResult.issue === "missing file" ? "missing feed" : "invalid JSON");
  }

  return Array.from(new Set(issues)).join(" | ");
}

async function indexBatchFolder(batchName, indexedAt) {
  const batchFolder = path.join(batchesRoot, batchName);
  const summaryPath = path.join(batchFolder, "jobs-batch-summary.json");
  const fetchLogPath = path.join(batchFolder, "jobs-batch-fetch-log.json");
  const feedPath = path.join(batchFolder, "public-job-feed-batch.json");
  const [summaryResult, fetchLogResult, feedResult] = await Promise.all([
    readJsonChecked(summaryPath),
    readJsonChecked(fetchLogPath),
    readJsonChecked(feedPath),
  ]);
  const inferred = inferBatchParts(batchName);
  const summary = summaryResult.data || {};
  const fetchLogRows = Array.isArray(fetchLogResult.data) ? fetchLogResult.data : [];
  const feedRows = Array.isArray(feedResult.data) ? feedResult.data : [];
  const indexIssue = getIssue(summaryResult, fetchLogResult, feedResult);

  return {
    BatchName: batchName,
    BatchFolder: batchFolder,
    ATS: summary.ATS || getFirstAts(fetchLogRows, feedRows, inferred.ATS),
    Priority: summary.Priority || inferred.Priority,
    Offset: summary.Offset !== undefined ? summary.Offset : inferred.Offset,
    Limit: summary.Limit !== undefined ? summary.Limit : inferred.Limit,
    BoardsSelected:
      summary.BoardsSelected !== undefined ? summary.BoardsSelected : summary.BoardsAttempted || fetchLogRows.length,
    BoardsAttempted: summary.BoardsAttempted || fetchLogRows.length,
    BoardsSucceeded: summary.BoardsSucceeded || fetchLogRows.filter((row) => row.Status === "success").length,
    BoardsFailed: summary.BoardsFailed || fetchLogRows.filter((row) => row.Status === "failed").length,
    BoardsEmpty: summary.BoardsEmpty || fetchLogRows.filter((row) => row.Status === "empty").length,
    JobsFetched: summary.JobsFetched || feedRows.length,
    PublicFeedRows: feedRows.length,
    ExportOKCount: summary.ExportOKCount || feedRows.filter((row) => row.ExportQualityFlag === "OK").length,
    ExportReviewCount: summary.ExportReviewCount || feedRows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
    ExportBadRowCount: summary.ExportBadRowCount || feedRows.filter((row) => row.ExportQualityFlag === "BAD_ROW").length,
    PossibleDuplicateCount:
      summary.PossibleDuplicateCount || feedRows.filter((row) => row.PossibleDuplicate === true).length,
    DuplicateGroupCount:
      summary.DuplicateGroupCount ||
      new Set(feedRows.map((row) => row.DuplicateGroupKey).filter(Boolean)).size,
    GeneratedAt: summary.GeneratedAt || "",
    IndexedAt: indexedAt,
    IndexStatus: indexIssue ? "REVIEW" : "OK",
    IndexIssue: indexIssue,
  };
}

async function getBatchNames() {
  try {
    const entries = await fs.readdir(batchesRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    return [];
  }
}

async function main() {
  const indexedAt = new Date().toISOString();
  const batchNames = await getBatchNames();

  await ensureDir(outputDir);

  if (batchNames.length === 0) {
    await fs.writeFile(outputCsvPath, rowsToCsv(indexHeaders, []), "utf8");
    await writeJsonFile(outputJsonPath, []);
    console.log("No batch folders found.");
    console.log(`Expected folder: ${batchesRoot}`);
    return;
  }

  const rows = [];
  const fetchLogRows = [];
  for (const batchName of batchNames) {
    const row = await indexBatchFolder(batchName, indexedAt);
    rows.push(row);
    if (row.IndexStatus !== "OK") continue;
    const fetchLog = await readJsonChecked(path.join(row.BatchFolder, "jobs-batch-fetch-log.json"));
    if (Array.isArray(fetchLog.data)) {
      fetchLogRows.push(...fetchLog.data.map((entry) => ({ ...entry, SourceBatch: row.BatchName })));
    }
  }

  await fs.writeFile(outputCsvPath, rowsToCsv(indexHeaders, rows), "utf8");
  await writeJsonFile(outputJsonPath, rows);
  const history = await writeDerivedBatchHistory({
    outputDir,
    generatedAt: indexedAt,
    sourceBatchCount: rows.filter((row) => row.IndexStatus === "OK").length,
    fetchLogRows,
  });

  console.log("Batch index complete.");
  console.log(`Batches indexed: ${rows.length}`);
  console.log(`OK batches: ${rows.filter((row) => row.IndexStatus === "OK").length}`);
  console.log(`Review batches: ${rows.filter((row) => row.IndexStatus === "REVIEW").length}`);
  console.log(`Current board state: ${history.boardCount} boards from ${history.eventCount} compact fetch events.`);
  console.log("Output folder:");
  console.log(outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
