const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

const reportsDir = fromRoot("data", "jobs", "reports");
const releasesDir = fromRoot("data", "jobs", "public", "releases");
const mergedDir = fromRoot("data", "jobs", "merged");
const sampleDir = fromRoot("data", "jobs", "sample");
const plansDir = fromRoot("data", "jobs", "plans");

const cleanupHeaders = ["Path", "Type", "SizeBytes", "LastModified", "Action", "Reason"];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function parseInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function getPathSize(filePath) {
  const stats = await fs.stat(filePath);

  if (!stats.isDirectory()) {
    return stats.size;
  }

  const entries = await fs.readdir(filePath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    total += await getPathSize(path.join(filePath, entry.name));
  }

  return total;
}

async function getPathInfo(filePath) {
  const stats = await fs.stat(filePath);

  return {
    SizeBytes: await getPathSize(filePath),
    LastModified: stats.mtime.toISOString(),
  };
}

async function listChildren(dirPath, wantDirectory) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => (wantDirectory ? entry.isDirectory() : entry.isFile()))
    .map((entry) => path.join(dirPath, entry.name));
}

function sortByNewest(items) {
  return [...items].sort((a, b) => {
    const dateDiff = Date.parse(b.LastModified) - Date.parse(a.LastModified);
    if (dateDiff !== 0) return dateDiff;
    return a.Path.localeCompare(b.Path);
  });
}

async function buildRowsForPaths(paths, type) {
  const rows = [];

  for (const filePath of paths) {
    const info = await getPathInfo(filePath);
    rows.push({
      Path: filePath,
      Type: type,
      SizeBytes: info.SizeBytes,
      LastModified: info.LastModified,
      Action: "KEEP",
      Reason: "",
    });
  }

  return rows;
}

function markOldRows(rows, keepCount, deleteReason, keepReason) {
  const sortedRows = sortByNewest(rows);

  return sortedRows.map((row, index) => ({
    ...row,
    Action: index < keepCount ? "KEEP" : "DELETE_CANDIDATE",
    Reason: index < keepCount ? keepReason : deleteReason,
  }));
}

async function getReleaseRows(keepCount) {
  const paths = await listChildren(releasesDir, true);
  const rows = await buildRowsForPaths(paths, "release-folder");
  return markOldRows(
    rows,
    keepCount,
    `Old release folder beyond keep-releases=${keepCount}.`,
    `Protected as one of the latest ${keepCount} release folders.`
  );
}

async function getMergedRows(keepCount) {
  const paths = await listChildren(mergedDir, true);
  const rows = await buildRowsForPaths(paths, "merged-folder");
  return markOldRows(
    rows,
    keepCount,
    `Old merged output folder beyond keep-merged=${keepCount}.`,
    `Protected as one of the latest ${keepCount} merged folders.`
  );
}

async function getSampleRows(keepCount) {
  const paths = await listChildren(sampleDir, false);
  const rows = await buildRowsForPaths(paths, "sample-file");

  return rows.map((row) => ({
    ...row,
    Action: "KEEP",
    Reason: `Current sample outputs are not timestamped into removable sets yet; keep-samples=${keepCount} is recorded only.`,
  }));
}

async function getPlanRows(keepCount) {
  const paths = await listChildren(plansDir, false);
  const rows = await buildRowsForPaths(paths, "plan-file");

  return rows.map((row) => ({
    ...row,
    Action: "KEEP",
    Reason: `Current plan outputs are the latest plan set; keep-plans=${keepCount} is recorded only.`,
  }));
}

async function deleteCandidate(row) {
  try {
    await fs.rm(row.Path, { recursive: true, force: true });
    return {
      ...row,
      Action: "DELETED",
    };
  } catch (error) {
    return {
      ...row,
      Action: "SKIPPED",
      Reason: `${row.Reason} Delete failed: ${error.message}`,
    };
  }
}

function buildSummaryMarkdown(rows, options) {
  const counts = rows.reduce((acc, row) => {
    acc[row.Action] = (acc[row.Action] || 0) + 1;
    return acc;
  }, {});
  const deleteBytes = rows
    .filter((row) => row.Action === "DELETE_CANDIDATE" || row.Action === "DELETED")
    .reduce((sum, row) => sum + (Number(row.SizeBytes) || 0), 0);

  return [
    "# Cleanup Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Options",
    "",
    `- Dry run: ${options.dryRun}`,
    `- Keep releases: ${options.keepReleases}`,
    `- Keep merged: ${options.keepMerged}`,
    `- Keep samples: ${options.keepSamples}`,
    `- Keep plans: ${options.keepPlans}`,
    "",
    "## Results",
    "",
    `- KEEP: ${counts.KEEP || 0}`,
    `- DELETE_CANDIDATE: ${counts.DELETE_CANDIDATE || 0}`,
    `- DELETED: ${counts.DELETED || 0}`,
    `- SKIPPED: ${counts.SKIPPED || 0}`,
    `- Candidate/deleted bytes: ${deleteBytes}`,
    "",
    "## Protected Areas",
    "",
    "- `data/catalogs/raw/`",
    "- `data/catalogs/normalized/`",
    "- `data/catalogs/analysis/`",
    "- `data/catalogs/crawl/`",
    "- `data/config/`",
    "- `data/jobs/batches/`",
    "- `data/jobs/index/`",
    "- `data/jobs/reports/`",
    "- latest public CSV/JSON files under `data/jobs/public/`",
    "- internal notes and data dictionary files",
    "- `README.md`, `package.json`, and `src/`",
    "",
    "Dry run is the default. Run with `--dry-run false` only after inspecting `cleanup-plan.csv`.",
    "",
  ].join("\n");
}

async function writeOutputs(rows, options) {
  await ensureDir(reportsDir);
  await fs.writeFile(path.join(reportsDir, "cleanup-plan.csv"), rowsToCsv(cleanupHeaders, rows), "utf8");
  await writeJsonFile(path.join(reportsDir, "cleanup-plan.json"), rows);
  await fs.writeFile(path.join(reportsDir, "cleanup-summary.md"), buildSummaryMarkdown(rows, options), "utf8");
}

async function main() {
  const options = {
    dryRun: parseBoolean(getArgValue("--dry-run", "true"), true),
    keepReleases: parseInteger(getArgValue("--keep-releases", "5"), 5),
    keepMerged: parseInteger(getArgValue("--keep-merged", "5"), 5),
    keepSamples: parseInteger(getArgValue("--keep-samples", "3"), 3),
    keepPlans: parseInteger(getArgValue("--keep-plans", "5"), 5),
  };

  let rows = [
    ...(await getReleaseRows(options.keepReleases)),
    ...(await getMergedRows(options.keepMerged)),
    ...(await getSampleRows(options.keepSamples)),
    ...(await getPlanRows(options.keepPlans)),
  ];

  if (!options.dryRun) {
    const updatedRows = [];
    for (const row of rows) {
      if (row.Action === "DELETE_CANDIDATE") {
        updatedRows.push(await deleteCandidate(row));
      } else {
        updatedRows.push(row);
      }
    }

    rows = updatedRows;
  }

  await writeOutputs(rows, options);

  const deleteCandidates = rows.filter((row) => row.Action === "DELETE_CANDIDATE").length;
  const deleted = rows.filter((row) => row.Action === "DELETED").length;
  const skipped = rows.filter((row) => row.Action === "SKIPPED").length;

  console.log("Cleanup plan complete.");
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Rows planned: ${rows.length}`);
  console.log(`Delete candidates: ${deleteCandidates}`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Skipped: ${skipped}`);
  console.log("Output files:");
  console.log(path.join(reportsDir, "cleanup-plan.csv"));
  console.log(path.join(reportsDir, "cleanup-plan.json"));
  console.log(path.join(reportsDir, "cleanup-summary.md"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
