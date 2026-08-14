const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

const dataDir = fromRoot("data");
const reportsDir = fromRoot("data", "jobs", "reports");
const releasesDir = fromRoot("data", "jobs", "public", "releases");
const batchesDir = fromRoot("data", "jobs", "batches");
const mergedDir = fromRoot("data", "jobs", "merged");
const largeFileThresholdBytes = 10 * 1024 * 1024;

const inventoryHeaders = ["Path", "Category", "FileType", "SizeBytes", "LastModified"];
const releaseHistoryHeaders = ["ReleaseName", "ReleaseDate", "TotalFiles", "TotalSizeBytes"];
const staleFileHeaders = ["Path", "Category", "SizeBytes", "LastModified", "AgeDays", "StaleBucket"];
const largeFileHeaders = ["Path", "Category", "SizeBytes", "LastModified"];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function toProjectPath(filePath) {
  return path.relative(fromRoot(), filePath).split(path.sep).join("/");
}

function getFileType(filePath) {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return ext || "none";
}

function categorize(projectPath) {
  if (projectPath.startsWith("data/catalogs/raw/") || projectPath.startsWith("data/catalogs/normalized/")) {
    return "catalog";
  }

  if (projectPath.startsWith("data/catalogs/analysis/")) return "analysis";
  if (projectPath.startsWith("data/catalogs/crawl/")) return "crawl";
  if (projectPath.startsWith("data/config/")) return "config";
  if (projectPath.startsWith("data/jobs/sample/")) return "sample";
  if (projectPath.startsWith("data/jobs/batches/")) return "batch";
  if (projectPath.startsWith("data/jobs/merged/")) return "merged";
  if (projectPath.startsWith("data/jobs/public/releases/")) return "release";
  if (projectPath.startsWith("data/jobs/public/") && projectPath.endsWith(".md")) return "documentation";
  if (projectPath.startsWith("data/jobs/public/")) return "public";
  if (projectPath.startsWith("data/jobs/reports/")) return "report";
  if (projectPath.startsWith("data/jobs/plans/")) return "plan";
  if (projectPath.endsWith(".md")) return "documentation";

  return "other";
}

async function walkFiles(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function getInventoryRows() {
  const files = await walkFiles(dataDir);
  const rows = [];

  for (const filePath of files) {
    const stats = await fs.stat(filePath);
    const projectPath = toProjectPath(filePath);

    rows.push({
      Path: projectPath,
      Category: categorize(projectPath),
      FileType: getFileType(filePath),
      SizeBytes: stats.size,
      LastModified: stats.mtime.toISOString(),
    });
  }

  return rows.sort((a, b) => a.Path.localeCompare(b.Path));
}

function addCount(map, key, amount) {
  map[key] = (map[key] || 0) + amount;
}

function getTopRows(rows, count) {
  return [...rows].sort((a, b) => b.SizeBytes - a.SizeBytes).slice(0, count);
}

function getFolderKey(projectPath, depth) {
  return projectPath.split("/").slice(0, depth).join("/");
}

function getLargestFolders(rows) {
  const folderSizes = {};

  for (const row of rows) {
    const parts = row.Path.split("/");
    for (let depth = 2; depth <= Math.min(parts.length - 1, 5); depth += 1) {
      addCount(folderSizes, getFolderKey(row.Path, depth), Number(row.SizeBytes) || 0);
    }
  }

  return Object.entries(folderSizes)
    .map(([Folder, SizeBytes]) => ({ Folder, SizeBytes }))
    .sort((a, b) => b.SizeBytes - a.SizeBytes)
    .slice(0, 20);
}

async function countDirs(dirPath) {
  if (!(await fileExists(dirPath))) {
    return 0;
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

function buildSummary(rows, releaseCount, batchCount, mergedCount) {
  const filesByCategory = {};
  const sizeByCategory = {};

  for (const row of rows) {
    addCount(filesByCategory, row.Category, 1);
    addCount(sizeByCategory, row.Category, Number(row.SizeBytes) || 0);
  }

  return {
    GeneratedAt: new Date().toISOString(),
    TotalFiles: rows.length,
    TotalSizeBytes: rows.reduce((sum, row) => sum + (Number(row.SizeBytes) || 0), 0),
    FilesByCategory: filesByCategory,
    SizeByCategory: sizeByCategory,
    LargestFiles: getTopRows(rows, 20),
    LargestFolders: getLargestFolders(rows),
    ReleaseCount: releaseCount,
    BatchCount: batchCount,
    MergedCount: mergedCount,
  };
}

function buildSummaryMarkdown(summary) {
  const categoryRows = Object.keys(summary.FilesByCategory)
    .sort()
    .map((category) => ({
      category,
      files: summary.FilesByCategory[category],
      bytes: summary.SizeByCategory[category] || 0,
    }));

  const lines = [
    "# Project Inventory Summary",
    "",
    `Generated: ${summary.GeneratedAt}`,
    "",
    "## Totals",
    "",
    `- Total files: ${summary.TotalFiles}`,
    `- Total size bytes: ${summary.TotalSizeBytes}`,
    `- Release folders: ${summary.ReleaseCount}`,
    `- Batch folders: ${summary.BatchCount}`,
    `- Merged folders: ${summary.MergedCount}`,
    "",
    "## By Category",
    "",
    "| Category | Files | SizeBytes |",
    "| --- | ---: | ---: |",
    ...categoryRows.map((row) => `| ${row.category} | ${row.files} | ${row.bytes} |`),
    "",
    "## Largest Files",
    "",
    "| Path | Category | SizeBytes |",
    "| --- | --- | ---: |",
    ...summary.LargestFiles.slice(0, 10).map((row) => `| ${row.Path} | ${row.Category} | ${row.SizeBytes} |`),
    "",
    "## Largest Folders",
    "",
    "| Folder | SizeBytes |",
    "| --- | ---: |",
    ...summary.LargestFolders.slice(0, 10).map((row) => `| ${row.Folder} | ${row.SizeBytes} |`),
    "",
    "This report is read-only. It does not delete files.",
    "",
  ];

  return lines.join("\n");
}

function getRowsUnderProjectDir(rows, projectDir) {
  const prefix = projectDir.endsWith("/") ? projectDir : `${projectDir}/`;
  return rows.filter((row) => row.Path.startsWith(prefix));
}

async function getReleaseHistory(rows) {
  if (!(await fileExists(releasesDir))) {
    return [];
  }

  const entries = await fs.readdir(releasesDir, { withFileTypes: true });
  const releaseRows = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const releasePath = `data/jobs/public/releases/${entry.name}`;
    const files = getRowsUnderProjectDir(rows, releasePath);
    const stats = await fs.stat(path.join(releasesDir, entry.name));

    releaseRows.push({
      ReleaseName: entry.name,
      ReleaseDate: stats.mtime.toISOString(),
      TotalFiles: files.length,
      TotalSizeBytes: files.reduce((sum, row) => sum + (Number(row.SizeBytes) || 0), 0),
    });
  }

  return releaseRows.sort((a, b) => a.ReleaseName.localeCompare(b.ReleaseName));
}

function getAgeDays(lastModified, now) {
  return Math.floor((now.getTime() - Date.parse(lastModified)) / 86400000);
}

function getStaleBucket(ageDays) {
  if (ageDays >= 90) return "90+ days";
  if (ageDays >= 60) return "60+ days";
  if (ageDays >= 30) return "30+ days";
  return "";
}

function isGeneratedCategory(category) {
  return ["sample", "batch", "merged", "public", "release", "report", "plan"].includes(category);
}

function getStaleRows(rows) {
  const now = new Date();

  return rows
    .map((row) => {
      const ageDays = getAgeDays(row.LastModified, now);
      return {
        Path: row.Path,
        Category: row.Category,
        SizeBytes: row.SizeBytes,
        LastModified: row.LastModified,
        AgeDays: ageDays,
        StaleBucket: getStaleBucket(ageDays),
      };
    })
    .filter((row) => row.StaleBucket && isGeneratedCategory(row.Category))
    .sort((a, b) => b.AgeDays - a.AgeDays || b.SizeBytes - a.SizeBytes);
}

function getLargeRows(rows) {
  return rows
    .filter((row) => Number(row.SizeBytes) >= largeFileThresholdBytes)
    .map((row) => ({
      Path: row.Path,
      Category: row.Category,
      SizeBytes: row.SizeBytes,
      LastModified: row.LastModified,
    }))
    .sort((a, b) => b.SizeBytes - a.SizeBytes);
}

async function writeCsv(filePath, headers, rows) {
  await fs.writeFile(filePath, rowsToCsv(headers, rows), "utf8");
}

async function main() {
  await ensureDir(reportsDir);

  const rows = await getInventoryRows();
  const [releaseCount, batchCount, mergedCount] = await Promise.all([
    countDirs(releasesDir),
    countDirs(batchesDir),
    countDirs(mergedDir),
  ]);
  const summary = buildSummary(rows, releaseCount, batchCount, mergedCount);
  const releaseHistoryRows = await getReleaseHistory(rows);
  const staleRows = getStaleRows(rows);
  const largeRows = getLargeRows(rows);

  await Promise.all([
    writeCsv(path.join(reportsDir, "project-inventory.csv"), inventoryHeaders, rows),
    writeJsonFile(path.join(reportsDir, "project-inventory.json"), rows),
    writeJsonFile(path.join(reportsDir, "project-inventory-summary.json"), summary),
    fs.writeFile(path.join(reportsDir, "project-inventory-summary.md"), buildSummaryMarkdown(summary), "utf8"),
    writeCsv(path.join(reportsDir, "release-history.csv"), releaseHistoryHeaders, releaseHistoryRows),
    writeJsonFile(path.join(reportsDir, "release-history.json"), releaseHistoryRows),
    writeCsv(path.join(reportsDir, "stale-files.csv"), staleFileHeaders, staleRows),
    writeJsonFile(path.join(reportsDir, "stale-files.json"), staleRows),
    writeCsv(path.join(reportsDir, "large-files.csv"), largeFileHeaders, largeRows),
    writeJsonFile(path.join(reportsDir, "large-files.json"), largeRows),
  ]);

  console.log("Project inventory complete.");
  console.log(`Total files: ${summary.TotalFiles}`);
  console.log(`Total size bytes: ${summary.TotalSizeBytes}`);
  console.log(`Release count: ${releaseCount}`);
  console.log(`Batch count: ${batchCount}`);
  console.log(`Merged count: ${mergedCount}`);
  console.log(`Large file count: ${largeRows.length}`);
  console.log(`Stale file count: ${staleRows.length}`);
  console.log("Output folder:");
  console.log(reportsDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
