const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const defaultCatchupRoot = "/Users/adampugh/Desktop/public-job-feed-catchup";
const defaultBatchesRoot = path.join(defaultCatchupRoot, "batches");
const defaultOutputDir = path.join(defaultCatchupRoot, "reports");

const summaryHeaders = [
  "BatchName",
  "ATS",
  "GeneratedAt",
  "BoardsAttempted",
  "BoardsSucceeded",
  "BoardsFailed",
  "BoardsEmpty",
  "JobsFetched",
  "WriterFitA",
  "WriterFitB",
  "WriterFitC",
  "StrongMatchCount",
  "PossibleMatchCount",
  "RemoteCount",
  "ExportOKCount",
  "ExportReviewCount",
  "FailureRate",
  "JobsPerAttemptedBoard",
  "OutputFolder",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
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

function percent(numerator, denominator) {
  if (!denominator) {
    return "";
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function average(numerator, denominator) {
  if (!denominator) {
    return "";
  }

  return Number((numerator / denominator).toFixed(2));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function listBatchDirs(batchesRoot) {
  if (!(await pathExists(batchesRoot))) {
    return [];
  }

  const entries = await fs.readdir(batchesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(batchesRoot, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await pathExists(filePath))) {
    return fallback;
  }

  return readJsonFile(filePath);
}

async function summarizeBatch(batchDir) {
  const summaryPath = path.join(batchDir, "jobs-batch-summary.json");
  const fetchLogPath = path.join(batchDir, "jobs-batch-fetch-log.json");
  const summary = await readJsonIfExists(summaryPath, null);
  const fetchLog = await readJsonIfExists(fetchLogPath, []);

  if (!summary) {
    return null;
  }

  const statuses = new Map();
  for (const row of Array.isArray(fetchLog) ? fetchLog : []) {
    const status = cleanText(row.Status).toLowerCase() || "unknown";
    statuses.set(status, (statuses.get(status) || 0) + 1);
  }

  const attempted = numberValue(summary.BoardsAttempted);
  const failed = numberValue(summary.BoardsFailed);

  return {
    BatchName: path.basename(batchDir),
    ATS: cleanText((Array.isArray(fetchLog) && fetchLog[0] && fetchLog[0].ATS) || ""),
    GeneratedAt: cleanText(summary.GeneratedAt),
    BoardsAttempted: attempted,
    BoardsSucceeded: numberValue(summary.BoardsSucceeded),
    BoardsFailed: failed,
    BoardsEmpty: numberValue(summary.BoardsEmpty),
    JobsFetched: numberValue(summary.JobsFetched),
    WriterFitA: numberValue(summary.WriterFitACount),
    WriterFitB: numberValue(summary.WriterFitBCount),
    WriterFitC: numberValue(summary.WriterFitCCount),
    StrongMatchCount: numberValue(summary.StrongMatchCount),
    PossibleMatchCount: numberValue(summary.PossibleMatchCount),
    RemoteCount: numberValue(summary.RemoteCount),
    ExportOKCount: numberValue(summary.ExportOKCount),
    ExportReviewCount: numberValue(summary.ExportReviewCount),
    FailureRate: percent(failed, attempted),
    JobsPerAttemptedBoard: average(numberValue(summary.JobsFetched), attempted),
    OutputFolder: batchDir,
    FetchStatusCounts: Object.fromEntries([...statuses.entries()].sort()),
  };
}

function buildMarkdown(generatedAt, batchesRoot, rows) {
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.BoardsAttempted += numberValue(row.BoardsAttempted);
      accumulator.BoardsSucceeded += numberValue(row.BoardsSucceeded);
      accumulator.BoardsFailed += numberValue(row.BoardsFailed);
      accumulator.BoardsEmpty += numberValue(row.BoardsEmpty);
      accumulator.JobsFetched += numberValue(row.JobsFetched);
      accumulator.WriterFitA += numberValue(row.WriterFitA);
      accumulator.WriterFitB += numberValue(row.WriterFitB);
      accumulator.WriterFitC += numberValue(row.WriterFitC);
      return accumulator;
    },
    {
      BoardsAttempted: 0,
      BoardsSucceeded: 0,
      BoardsFailed: 0,
      BoardsEmpty: 0,
      JobsFetched: 0,
      WriterFitA: 0,
      WriterFitB: 0,
      WriterFitC: 0,
    }
  );

  const lines = [
    "# Catch-Up Batch Report",
    "",
    `Generated: ${generatedAt}`,
    `Batches root: \`${batchesRoot}\``,
    "",
    "## Totals",
    "",
    `- Batches: ${rows.length}`,
    `- Boards attempted: ${totals.BoardsAttempted}`,
    `- Boards succeeded: ${totals.BoardsSucceeded}`,
    `- Boards failed: ${totals.BoardsFailed}`,
    `- Boards empty: ${totals.BoardsEmpty}`,
    `- Jobs fetched: ${totals.JobsFetched}`,
    `- Writer Fit A jobs: ${totals.WriterFitA}`,
    `- Writer Fit B jobs: ${totals.WriterFitB}`,
    `- Writer Fit C jobs: ${totals.WriterFitC}`,
    `- Failure rate: ${percent(totals.BoardsFailed, totals.BoardsAttempted) || 0}%`,
    "",
    "## Batches",
    "",
    "| Batch | Attempted | Succeeded | Failed | Empty | Jobs | A | B | C | Failure Rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.BatchName} | ${row.BoardsAttempted} | ${row.BoardsSucceeded} | ${row.BoardsFailed} | ${row.BoardsEmpty} | ${row.JobsFetched} | ${row.WriterFitA} | ${row.WriterFitB} | ${row.WriterFitC} | ${row.FailureRate || 0}% |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const batchesRoot = path.resolve(fromRoot(), getArgValue("--batches-root", defaultBatchesRoot));
  const outputDir = path.resolve(fromRoot(), getArgValue("--output-dir", defaultOutputDir));
  const generatedAt = new Date().toISOString();
  const batchDirs = await listBatchDirs(batchesRoot);
  const rows = (await Promise.all(batchDirs.map(summarizeBatch))).filter(Boolean);

  await ensureDir(outputDir);
  await Promise.all([
    writeJsonFile(path.join(outputDir, "catchup-batch-report.json"), rows),
    fs.writeFile(path.join(outputDir, "catchup-batch-report.csv"), rowsToCsv(summaryHeaders, rows), "utf8"),
    fs.writeFile(path.join(outputDir, "catchup-batch-report.md"), buildMarkdown(generatedAt, batchesRoot, rows), "utf8"),
  ]);

  console.log("Catch-up batch report complete.");
  console.log(`Batches root: ${batchesRoot}`);
  console.log(`Batches summarized: ${rows.length}`);
  console.log(`Report folder: ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
