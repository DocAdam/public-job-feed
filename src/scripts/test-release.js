const nodeFs = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const reportsDir = fromRoot("data", "jobs", "reports");
const releasesDir = fromRoot("data", "jobs", "public", "releases");

const requiredFiles = [
  fromRoot("data", "jobs", "public", "public-job-feed-summary.md"),
  fromRoot("data", "jobs", "public", "public-job-feed-latest.csv"),
  fromRoot("data", "jobs", "gsheet-package", "latest", "01_good_documentation_jobs.csv"),
  fromRoot("data", "jobs", "gsheet-package", "latest", "02_company_coverage.csv"),
  fromRoot("data", "jobs", "reports", "project-status-dashboard.md"),
  fromRoot("data", "jobs", "reports", "crawl-coverage-summary.json"),
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function getLatestReleaseFolder() {
  if (!(await fileExists(releasesDir))) {
    return "";
  }

  const entries = await fs.readdir(releasesDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  return folders[0] ? path.join(releasesDir, folders[0]) : "";
}

function countCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let inQuotes = false;
    let quotePending = false;

    const stream = nodeFs.createReadStream(filePath, { encoding: "utf8" });

    stream.on("data", (chunk) => {
      for (const char of chunk) {
        if (inQuotes) {
          if (quotePending) {
            if (char === '"') {
              quotePending = false;
              continue;
            }
            inQuotes = false;
            quotePending = false;
          } else if (char === '"') {
            quotePending = true;
            continue;
          }
        }

        if (!inQuotes && char === '"') {
          inQuotes = true;
          continue;
        }
        if (char === "\n" && !inQuotes) {
          rowCount += 1;
        }
      }
    });

    stream.on("error", reject);
    stream.on("end", () => resolve(Math.max(0, rowCount - 1)));
  });
}

function addFailure(result, message) {
  result.CriticalFailures.push(message);
}

function addWarning(result, message) {
  result.Warnings.push(message);
}

function buildMarkdown(result) {
  return [
    "# Release Validation Results",
    "",
    `Generated: ${result.GeneratedAt}`,
    "",
    `Status: ${result.Status}`,
    "",
    "## Counts",
    "",
    `- Latest feed rows: ${result.LatestFeedRows}`,
    `- Good Documentation Jobs rows: ${result.GoodDocumentationJobsRows}`,
    `- Company Coverage rows: ${result.CompanyCoverageRows}`,
    `- Coverage percent: ${result.CoveragePercent}`,
    `- Latest release folder: ${result.LatestReleaseFolder || "missing"}`,
    "",
    "## Critical Failures",
    "",
    ...(result.CriticalFailures.length ? result.CriticalFailures.map((item) => `- ${item}`) : ["None"]),
    "",
    "## Warnings",
    "",
    ...(result.Warnings.length ? result.Warnings.map((item) => `- ${item}`) : ["None"]),
    "",
  ].join("\n");
}

async function main() {
  await ensureDir(reportsDir);

  const result = {
    GeneratedAt: new Date().toISOString(),
    Status: "PASS",
    LatestFeedRows: 0,
    ExpectedLatestFeedRows: 0,
    GoodDocumentationJobsRows: 0,
    CompanyCoverageRows: 0,
    CoveragePercent: "",
    LatestReleaseFolder: "",
    RequiredFiles: [],
    CriticalFailures: [],
    Warnings: [],
  };

  for (const filePath of requiredFiles) {
    const exists = await fileExists(filePath);
    result.RequiredFiles.push({ Path: filePath, Exists: exists });
    if (!exists) {
      addFailure(result, `Missing required file: ${filePath}`);
    }
  }

  const latestCsv = fromRoot("data", "jobs", "public", "public-job-feed-latest.csv");
  const goodJobsCsv = fromRoot("data", "jobs", "gsheet-package", "latest", "01_good_documentation_jobs.csv");
  const companyCoverageCsv = fromRoot("data", "jobs", "gsheet-package", "latest", "02_company_coverage.csv");

  if (await fileExists(latestCsv)) result.LatestFeedRows = await countCsvRows(latestCsv);
  const latestSummaryPath = fromRoot("data", "jobs", "public", "public-job-feed-latest-summary.json");
  if (await fileExists(latestSummaryPath)) {
    const latestSummary = await readJsonFile(latestSummaryPath);
    result.ExpectedLatestFeedRows = Number(latestSummary.TotalRows) || 0;
  }
  if (await fileExists(goodJobsCsv)) result.GoodDocumentationJobsRows = await countCsvRows(goodJobsCsv);
  if (await fileExists(companyCoverageCsv)) result.CompanyCoverageRows = await countCsvRows(companyCoverageCsv);

  if (result.LatestFeedRows <= 0) addFailure(result, "Latest feed row count is 0.");
  if (result.ExpectedLatestFeedRows > 0 && result.LatestFeedRows !== result.ExpectedLatestFeedRows) {
    addFailure(
      result,
      `Latest feed CSV has ${result.LatestFeedRows} rows but summary reports ${result.ExpectedLatestFeedRows}.`
    );
  }
  if (result.GoodDocumentationJobsRows <= 0) addFailure(result, "Good Documentation Jobs row count is 0.");
  if (result.CompanyCoverageRows <= 0) addFailure(result, "Company Coverage row count is 0.");

  if (result.GoodDocumentationJobsRows > 0 && result.GoodDocumentationJobsRows < 25) {
    addWarning(result, "Good Documentation Jobs rows < 25.");
  }

  const coveragePath = fromRoot("data", "jobs", "reports", "crawl-coverage-summary.json");
  if (await fileExists(coveragePath)) {
    const coverage = await readJsonFile(coveragePath);
    result.CoveragePercent = coverage.CoveragePercentOverall;
    if ((Number(coverage.CoveragePercentOverall) || 0) < 5) {
      addWarning(result, "Coverage percent < 5%.");
    }
  }

  result.LatestReleaseFolder = await getLatestReleaseFolder();
  if (!result.LatestReleaseFolder) {
    addWarning(result, "Release folder missing.");
  }

  result.Status = result.CriticalFailures.length > 0 ? "FAIL" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-release-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-release-results.md"), buildMarkdown(result), "utf8");

  console.log(`Release validation: ${result.Status}`);
  console.log(`Latest feed rows: ${result.LatestFeedRows}`);
  console.log(`Good Documentation Jobs rows: ${result.GoodDocumentationJobsRows}`);
  console.log(`Company Coverage rows: ${result.CompanyCoverageRows}`);

  if (result.CriticalFailures.length > 0) {
    for (const failure of result.CriticalFailures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { countCsvRows, main };
