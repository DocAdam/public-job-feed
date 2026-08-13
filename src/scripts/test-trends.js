const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const latestTrendDir = fromRoot("data", "jobs", "trends", "latest");
const reportsDir = fromRoot("data", "jobs", "reports");
const publicSheetUrl = "https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing";
const rawIsoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g;
const rawSnapshotPattern = /\b\d{8}-\d{4}\b/g;

const requiredFiles = [
  "weekly-trend-summary.md",
  "weekly-substack-report.md",
  "substack-notes.md",
  "trend-manifest.json",
  "market-history.csv",
  "job-lifecycle.csv",
  "outliers.csv",
];

const requiredManifestFields = [
  "GeneratedAt",
  "GeneratedAtDisplay",
  "CurrentSnapshot",
  "CurrentSnapshotDisplay",
  "TrendRangeMode",
  "TrendRangeStartDisplay",
  "TrendRangeEndDisplay",
  "TrendSnapshotsIncluded",
  "TrendSnapshotsIncludedDisplay",
];

const weeklyReportHeadings = [
  "Report Range",
  "Documentation Jobs Market Snapshot",
  "Job Categories",
  "Freshness",
  "Link to Sheet",
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTimeDisplay(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readTextIfExists(filePath) {
  if (!(await fileExists(filePath))) return "";
  return fs.readFile(filePath, "utf8");
}

function stripCodeBlocks(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function addFailure(result, message) {
  result.Failures.push(message);
}

function addWarning(result, message) {
  result.Warnings.push(message);
}

async function listMarkdownFiles() {
  if (!(await fileExists(latestTrendDir))) return [];
  const entries = await fs.readdir(latestTrendDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(latestTrendDir, entry.name))
    .sort();
}

function manifestValue(manifest, field) {
  if (field === "CurrentJobCount") return manifest.CurrentJobCount ?? (manifest.Counts ? manifest.Counts.CurrentJobs : undefined);
  return manifest[field];
}

function buildMarkdown(result) {
  return [
    "# Trend Quality Test Results",
    "",
    `Generated: ${result.GeneratedAtDisplay}`,
    "",
    `Status: ${result.Status}`,
    "",
    "## Checked Files",
    "",
    ...result.CheckedFiles.map((file) => `- ${file.Path}: ${file.Exists ? "found" : "missing"}`),
    "",
    "## Failures",
    "",
    ...(result.Failures.length ? result.Failures.map((item) => `- ${item}`) : ["None"]),
    "",
    "## Warnings",
    "",
    ...(result.Warnings.length ? result.Warnings.map((item) => `- ${item}`) : ["None"]),
    "",
  ].join("\n");
}

async function main() {
  await ensureDir(reportsDir);
  const generatedAt = new Date().toISOString();
  const result = {
    GeneratedAt: generatedAt,
    GeneratedAtDisplay: formatDateTimeDisplay(generatedAt),
    Status: "PASS",
    Failures: [],
    Warnings: [],
    CheckedFiles: [],
  };

  for (const fileName of requiredFiles) {
    const filePath = path.join(latestTrendDir, fileName);
    const exists = await fileExists(filePath);
    result.CheckedFiles.push({ Path: filePath, Exists: exists });
    if (!exists) addFailure(result, `Missing required trend file: ${filePath}`);
  }

  const markdownFiles = await listMarkdownFiles();
  for (const markdownPath of markdownFiles) {
    const markdown = await fs.readFile(markdownPath, "utf8");
    if (rawIsoPattern.test(markdown)) {
      addFailure(result, `Raw ISO timestamp found in Markdown: ${markdownPath}`);
    }
    rawIsoPattern.lastIndex = 0;

    const noCode = stripCodeBlocks(markdown);
    const snapshotMatches = noCode.match(rawSnapshotPattern) || [];
    if (snapshotMatches.length > 3) {
      addWarning(result, `Markdown contains ${snapshotMatches.length} raw snapshot IDs outside code blocks: ${markdownPath}`);
    }
  }

  for (const fileName of ["weekly-substack-report.md", "substack-notes.md"]) {
    const filePath = path.join(latestTrendDir, fileName);
    const text = await readTextIfExists(filePath);
    if (!text.includes(publicSheetUrl)) {
      addFailure(result, `${fileName} is missing the public Google Sheet link.`);
    }
  }

  const weeklyReportPath = path.join(latestTrendDir, "weekly-substack-report.md");
  const weeklyReport = await readTextIfExists(weeklyReportPath);
  if (!weeklyReport.trim()) {
    addFailure(result, "weekly-substack-report.md is missing or empty.");
  } else {
    for (const heading of weeklyReportHeadings) {
      if (!weeklyReport.includes(heading)) {
        addWarning(result, `weekly-substack-report.md is missing expected heading text: ${heading}`);
      }
    }
  }

  const manifestPath = path.join(latestTrendDir, "trend-manifest.json");
  if (await fileExists(manifestPath)) {
    const manifest = await readJsonFile(manifestPath);
    for (const field of requiredManifestFields) {
      const value = manifestValue(manifest, field);
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        addFailure(result, `trend-manifest.json is missing required field: ${field}`);
      }
    }

    if ((manifest.TrendSnapshotsIncluded || []).length < 2) addWarning(result, "TrendSnapshotsIncluded has fewer than 2 snapshots.");
    if (Number(manifestValue(manifest, "CurrentJobCount")) === 0) addWarning(result, "CurrentJobCount is 0.");
    if (Number(manifest.WeeklyCurrentJobs) === 0) addWarning(result, "WeeklyCurrentJobs is 0.");
    if (Number(manifest.WeeklyUniqueJobsSeen) === 0) addWarning(result, "WeeklyUniqueJobsSeen is 0.");
  }

  result.Status = result.Failures.length ? "FAIL" : result.Warnings.length ? "WARN" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-trends-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-trends-results.md"), buildMarkdown(result), "utf8");

  console.log(`Trend quality test: ${result.Status}`);
  console.log(`Failures: ${result.Failures.length}`);
  console.log(`Warnings: ${result.Warnings.length}`);

  if (result.Failures.length) {
    for (const failure of result.Failures) console.error(`FAIL: ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
