const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { diffBoardEntries, toBoardEntries } = require("../lib/board-registry");
const { rowsToCsv } = require("../lib/csv");
const { fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const manifestPath = fromRoot("data", "catalogs", "catalog-manifest.json");
const queuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const boardCatalogPath = fromRoot("data", "catalogs", "crawl", "board-catalog.json");
const diffJsonPath = fromRoot("data", "catalogs", "crawl", "catalog-queue-diff.json");
const diffCsvPath = fromRoot("data", "catalogs", "crawl", "catalog-queue-added.csv");

const diffHeaders = [
  "BoardKey",
  "ATS",
  "CatalogSlug",
  "Company",
  "CompanyKey",
  "BoardURL",
  "FetchEligible",
  "CrawlPriority",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() !== "false";
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    return fallback;
  }
}

function runNode(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fromRoot("src", "scripts", scriptName), ...args], {
      cwd: fromRoot(),
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

function isFresh(manifest, maxAgeHours) {
  const timestamp = Date.parse(manifest.PipelineCompletedAt || "");
  if (!Number.isFinite(timestamp) || manifest.PipelineStatus !== "complete") return false;
  return Date.now() - timestamp < maxAgeHours * 60 * 60 * 1000;
}

function compactEntry(entry) {
  const row = {};
  for (const header of diffHeaders) row[header] = entry[header];
  return row;
}

async function writeDiff(previousQueue, nextQueue, generatedAt, skippedReason = "") {
  const diff = diffBoardEntries(previousQueue, nextQueue);
  const added = diff.AddedBoards.map(compactEntry).sort((a, b) => a.BoardKey.localeCompare(b.BoardKey));
  const removed = diff.RemovedBoards.map(compactEntry).sort((a, b) => a.BoardKey.localeCompare(b.BoardKey));
  const report = {
    GeneratedAt: generatedAt,
    SkippedReason: skippedReason,
    PreviousBoardCount: toBoardEntries(previousQueue, { includeIneligible: true }).length,
    CurrentBoardCount: toBoardEntries(nextQueue, { includeIneligible: true }).length,
    AddedBoardCount: added.length,
    RemovedBoardCount: removed.length,
    RetainedBoardCount: diff.RetainedBoardCount,
    AddedBoards: added,
    RemovedBoards: removed,
  };
  await Promise.all([
    writeJsonFile(diffJsonPath, report),
    writeTextFile(diffCsvPath, rowsToCsv(diffHeaders, added)),
  ]);
  return report;
}

async function updateManifest(values) {
  const manifest = await readJsonIfExists(manifestPath, {});
  await writeJsonFile(manifestPath, { ...manifest, ...values });
}

async function main() {
  const maxAgeHours = Number(getArgValue("--max-age-hours", "24"));
  const force = parseBoolean(getArgValue("--force", "false"));
  const allowLargeDrop = parseBoolean(getArgValue("--allow-large-drop", "false"));
  const previousManifest = await readJsonIfExists(manifestPath, {});
  const queueRows = await readJsonIfExists(queuePath, []);
  const previousBoards = await readJsonIfExists(boardCatalogPath, queueRows);
  const startedAt = new Date().toISOString();

  if (!force && Number.isFinite(maxAgeHours) && maxAgeHours > 0 && isFresh(previousManifest, maxAgeHours)) {
    try {
      await fs.access(diffJsonPath);
    } catch (error) {
      await writeDiff(previousBoards, previousBoards, startedAt, `catalog pipeline is younger than ${maxAgeHours} hours`);
    }
    console.log(`Catalog refresh skipped: catalog pipeline is younger than ${maxAgeHours} hours.`);
    return;
  }

  try {
    const downloadArgs = [];
    if (force) downloadArgs.push("--force", "true");
    if (allowLargeDrop) downloadArgs.push("--allow-large-drop", "true");
    await runNode("download-catalogs.js", downloadArgs);
    await runNode("normalize-catalogs.js");
    await runNode("analyze-catalogs.js");
    await runNode("build-crawl-queue.js");

    const nextQueue = await readJsonIfExists(queuePath, []);
    const nextBoards = await readJsonIfExists(boardCatalogPath, []);
    if (!Array.isArray(nextQueue) || nextQueue.length === 0) {
      throw new Error("rebuilt crawl queue is empty");
    }
    const completedAt = new Date().toISOString();
    if (!Array.isArray(nextBoards) || nextBoards.length === 0) {
      throw new Error("rebuilt board catalog is empty");
    }
    const diff = await writeDiff(previousBoards, nextBoards, completedAt);
    await updateManifest({
      PipelineStatus: "complete",
      PipelineStartedAt: startedAt,
      PipelineCompletedAt: completedAt,
      QueueCompanyCount: nextQueue.length,
      QueueBoardCount: diff.CurrentBoardCount,
      AddedBoardCount: diff.AddedBoardCount,
      RemovedBoardCount: diff.RemovedBoardCount,
      PipelineError: "",
    });
    console.log(
      `Catalog pipeline complete: ${nextQueue.length} companies, ${diff.CurrentBoardCount} boards, ` +
        `${diff.AddedBoardCount} added, ${diff.RemovedBoardCount} removed.`
    );
  } catch (error) {
    await updateManifest({
      PipelineStatus: "failed",
      PipelineStartedAt: startedAt,
      PipelineFailedAt: new Date().toISOString(),
      PipelineError: error.message,
    });
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { isFresh, main, writeDiff };
