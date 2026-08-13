const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const defaultCatchupRoot = "/Users/adampugh/Desktop/public-job-feed-catchup";
const defaultSourceRoot = path.join(defaultCatchupRoot, "batches");
const defaultTargetRoot = fromRoot("data", "jobs", "batches");
const defaultReportDir = path.join(defaultCatchupRoot, "reports");

const requiredFiles = [
  "jobs-batch-summary.json",
  "jobs-batch-fetch-log.json",
  "public-job-feed-batch.json",
  "public-job-feed-batch.csv",
];

const reportHeaders = [
  "BatchName",
  "Status",
  "Issue",
  "ATS",
  "Priority",
  "Offset",
  "Limit",
  "BoardsAttempted",
  "BoardsSucceeded",
  "BoardsFailed",
  "BoardsEmpty",
  "JobsFetched",
  "SourceFolder",
  "TargetFolder",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function listBatchDirs(sourceRoot) {
  if (!(await pathExists(sourceRoot))) {
    return [];
  }

  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sourceRoot, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function getMissingRequiredFiles(batchDir) {
  const missing = [];

  for (const fileName of requiredFiles) {
    if (!(await pathExists(path.join(batchDir, fileName)))) {
      missing.push(fileName);
    }
  }

  return missing;
}

async function readSummary(batchDir) {
  const summaryPath = path.join(batchDir, "jobs-batch-summary.json");
  return readJsonFile(summaryPath);
}

function makeReportRow(batchDir, targetRoot, status, issue, summary) {
  const batchName = path.basename(batchDir);
  return {
    BatchName: batchName,
    Status: status,
    Issue: issue,
    ATS: cleanText(summary && summary.ATS),
    Priority: cleanText(summary && summary.Priority),
    Offset: summary && summary.Offset !== undefined ? summary.Offset : "",
    Limit: summary && summary.Limit !== undefined ? summary.Limit : "",
    BoardsAttempted: numberValue(summary && summary.BoardsAttempted),
    BoardsSucceeded: numberValue(summary && summary.BoardsSucceeded),
    BoardsFailed: numberValue(summary && summary.BoardsFailed),
    BoardsEmpty: numberValue(summary && summary.BoardsEmpty),
    JobsFetched: numberValue(summary && summary.JobsFetched),
    SourceFolder: batchDir,
    TargetFolder: path.join(targetRoot, batchName),
  };
}

async function inspectBatch(batchDir, targetRoot) {
  const batchName = path.basename(batchDir);
  const targetDir = path.join(targetRoot, batchName);
  const missing = await getMissingRequiredFiles(batchDir);

  if (missing.length > 0) {
    return makeReportRow(batchDir, targetRoot, "SKIP", `missing required files: ${missing.join(", ")}`, null);
  }

  let summary;
  try {
    summary = await readSummary(batchDir);
  } catch (error) {
    return makeReportRow(batchDir, targetRoot, "SKIP", "invalid jobs-batch-summary.json", null);
  }

  if (await pathExists(targetDir)) {
    return makeReportRow(batchDir, targetRoot, "SKIP", "target batch folder already exists", summary);
  }

  return makeReportRow(batchDir, targetRoot, "READY", "", summary);
}

async function copyBatch(row) {
  const tempDir = path.join(
    path.dirname(row.TargetFolder),
    `.${path.basename(row.TargetFolder)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await fs.cp(row.SourceFolder, tempDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    await fs.rename(tempDir, row.TargetFolder);
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function buildMarkdown(generatedAt, sourceRoot, targetRoot, apply, rows) {
  const readyRows = rows.filter((row) => row.Status === "READY" || row.Status === "IMPORTED");
  const skippedRows = rows.filter((row) => row.Status === "SKIP");
  const importedRows = rows.filter((row) => row.Status === "IMPORTED");
  const totals = rows.reduce(
    (accumulator, row) => {
      if (row.Status === "READY" || row.Status === "IMPORTED") {
        accumulator.BoardsAttempted += numberValue(row.BoardsAttempted);
        accumulator.JobsFetched += numberValue(row.JobsFetched);
      }
      return accumulator;
    },
    {
      BoardsAttempted: 0,
      JobsFetched: 0,
    }
  );

  const lines = [
    "# Catch-Up Import Report",
    "",
    `Generated: ${generatedAt}`,
    `Mode: ${apply ? "apply" : "dry-run"}`,
    `Source root: \`${sourceRoot}\``,
    `Target root: \`${targetRoot}\``,
    "",
    "## Summary",
    "",
    `- Batch folders inspected: ${rows.length}`,
    `- Ready/imported batches: ${readyRows.length}`,
    `- Imported batches: ${importedRows.length}`,
    `- Skipped batches: ${skippedRows.length}`,
    `- Ready/imported boards attempted: ${totals.BoardsAttempted}`,
    `- Ready/imported jobs fetched: ${totals.JobsFetched}`,
    "",
    "## Batches",
    "",
    "| Batch | Status | Issue | Attempted | Jobs |",
    "| --- | --- | --- | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.BatchName} | ${row.Status} | ${row.Issue || ""} | ${row.BoardsAttempted} | ${row.JobsFetched} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function writeReports(reportDir, generatedAt, sourceRoot, targetRoot, apply, rows) {
  await ensureDir(reportDir);
  await Promise.all([
    writeJsonFile(path.join(reportDir, "catchup-import-report.json"), rows),
    fs.writeFile(path.join(reportDir, "catchup-import-report.csv"), rowsToCsv(reportHeaders, rows), "utf8"),
    fs.writeFile(
      path.join(reportDir, "catchup-import-report.md"),
      buildMarkdown(generatedAt, sourceRoot, targetRoot, apply, rows),
      "utf8"
    ),
  ]);
}

async function main() {
  const sourceRoot = path.resolve(fromRoot(), getArgValue("--source-root", defaultSourceRoot));
  const targetRoot = path.resolve(fromRoot(), getArgValue("--target-root", defaultTargetRoot));
  const reportDir = path.resolve(fromRoot(), getArgValue("--report-dir", defaultReportDir));
  const apply = hasFlag("--apply");
  const generatedAt = new Date().toISOString();
  const batchDirs = await listBatchDirs(sourceRoot);

  if (batchDirs.length === 0) {
    console.log("No catch-up batch folders found.");
    console.log(`Source root: ${sourceRoot}`);
    return;
  }

  await ensureDir(targetRoot);

  const rows = [];
  for (const batchDir of batchDirs) {
    rows.push(await inspectBatch(batchDir, targetRoot));
  }

  if (apply) {
    for (const row of rows.filter((candidate) => candidate.Status === "READY")) {
      try {
        await copyBatch(row);
        row.Status = "IMPORTED";
      } catch (error) {
        row.Status = "SKIP";
        row.Issue = `copy failed: ${error.message}`;
      }
    }
  }

  await writeReports(reportDir, generatedAt, sourceRoot, targetRoot, apply, rows);

  const readyCount = rows.filter((row) => row.Status === "READY").length;
  const importedCount = rows.filter((row) => row.Status === "IMPORTED").length;
  const skippedCount = rows.filter((row) => row.Status === "SKIP").length;

  console.log("Catch-up batch import check complete.");
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Source root: ${sourceRoot}`);
  console.log(`Target root: ${targetRoot}`);
  console.log(`Batch folders inspected: ${rows.length}`);
  console.log(`Ready batches: ${readyCount}`);
  console.log(`Imported batches: ${importedCount}`);
  console.log(`Skipped batches: ${skippedCount}`);
  console.log(`Report folder: ${reportDir}`);

  if (!apply && readyCount > 0) {
    console.log("No files copied. Rerun with --apply to import ready batches.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
