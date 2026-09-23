const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const { packageIdentity } = require("../lib/package-status");
const { saveRunSummary } = require("../lib/run-summary");

const releasesDir = fromRoot("data", "jobs", "public", "releases");
const reportsDir = fromRoot("data", "jobs", "reports");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function listReleaseFolders() {
  if (!(await fileExists(releasesDir))) {
    return [];
  }

  const entries = await fs.readdir(releasesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      Name: entry.name,
      Path: path.join(releasesDir, entry.name),
    }))
    .sort((a, b) => b.Name.localeCompare(a.Name));
}

async function readJsonIfExists(filePath, fallback = null) {
  if (!(await fileExists(filePath))) {
    return fallback;
  }

  return readJsonFile(filePath);
}

async function countJsonRows(filePath) {
  const rows = await readJsonIfExists(filePath, []);
  return Array.isArray(rows) ? rows.length : 0;
}

async function getCoveragePercentForRelease(releaseFolder) {
  const coveragePath = path.join(releaseFolder.Path, "reports", "crawl-coverage-summary.json");
  const coverage = await readJsonIfExists(coveragePath, null);
  return coverage ? coverage.CoveragePercentOverall : null;
}

async function getMetrics(releaseFolder) {
  const summary = (await readJsonIfExists(path.join(releaseFolder.Path, "public-job-feed-latest-summary.json"), {})) || {};

  return {
    ReleaseName: releaseFolder.Name,
    ReleasePath: releaseFolder.Path,
    TotalRows: Number(summary.TotalRows) || 0,
    GoodDocumentationJobsRows: await countJsonRows(path.join(releaseFolder.Path, "public-job-feed-deduped-top.json")),
    WriterFitA: Number(summary.WriterFitACount) || 0,
    WriterFitB: Number(summary.WriterFitBCount) || 0,
    WriterFitC: Number(summary.WriterFitCCount) || 0,
    CoveragePercent: await getCoveragePercentForRelease(releaseFolder),
    CompanyCoverageRows: await countJsonRows(path.join(releaseFolder.Path, "reports", "company-coverage.json")),
  };
}

function percentChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) {
    return current === previous ? 0 : null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function buildDifference(metric, current, previous) {
  const currentValue = current[metric];
  const previousValue = previous[metric];

  if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
    return {
      Metric: metric,
      Current: currentValue,
      Previous: previousValue,
      Difference: null,
      PercentChange: null,
    };
  }

  return {
    Metric: metric,
    Current: currentValue,
    Previous: previousValue,
    Difference: Number((currentValue - previousValue).toFixed(2)),
    PercentChange: percentChange(currentValue, previousValue),
  };
}

function formatSigned(value) {
  if (value === null || value === undefined) return "n/a";
  return `${value >= 0 ? "+" : ""}${value}`;
}

function buildMarkdown(report) {
  const lines = [
    "# Release Comparison",
    "",
    `Generated: ${report.GeneratedAt}`,
    "",
    `Status: ${report.Status}`,
    "",
  ];

  if (report.Note) {
    lines.push(report.Note, "");
    return lines.join("\n");
  }

  if (report.Warning) {
    lines.push("## Warning", "", report.Warning, "");
    return lines.join("\n");
  }

  lines.push(
    `Newest release: ${report.Current.ReleaseName}`,
    `Previous release: ${report.Previous.ReleaseName}`,
    "",
    "## Summary",
    "",
    `- ${formatSigned(report.Differences.TotalRows.Difference)} jobs`,
    `- ${formatSigned(report.Differences.WriterFitA.Difference)} A tier`,
    `- ${formatSigned(report.Differences.WriterFitB.Difference)} B tier`,
    `- ${formatSigned(report.Differences.WriterFitC.Difference)} C tier`,
    `- ${formatSigned(report.Differences.CoveragePercent.Difference)} coverage`,
    "",
    "## Metrics",
    "",
    "| Metric | Current | Previous | Difference | Percent Change |",
    "| --- | ---: | ---: | ---: | ---: |"
  );

  for (const row of Object.values(report.Differences)) {
    lines.push(
      `| ${row.Metric} | ${row.Current ?? "n/a"} | ${row.Previous ?? "n/a"} | ${row.Difference ?? "n/a"} | ${
        row.PercentChange ?? "n/a"
      } |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  await ensureDir(reportsDir);

  const releaseFolders = await listReleaseFolders();
  const report = {
    GeneratedAt: new Date().toISOString(),
    Status: "PASS",
    Warning: "",
    Current: null,
    Previous: null,
    Differences: {},
  };

  const summaryDir = path.join(reportsDir, "run-summaries");
  const currentRun = await packageIdentity(fromRoot("data", "jobs", "gsheet-package", "latest"));
  const packageTest = await readJsonIfExists(path.join(reportsDir, "test-gsheet-package-results.json"));
  const latestSummary = await readJsonIfExists(fromRoot("data", "jobs", "public", "public-job-feed-latest-summary.json"));
  const coverage = await readJsonIfExists(path.join(reportsDir, "crawl-coverage-summary.json"));
  if (packageTest?.PackageRun === currentRun && latestSummary) {
    await saveRunSummary(summaryDir, { GeneratedAt: report.GeneratedAt, PackageRun: currentRun,
      TestStatus: { PackageRows: packageTest.GoodDocumentationJobsRows },
      CrawlCoverage: { CoveragePercentOverall: coverage?.CoveragePercentOverall ?? null } }, latestSummary);
  }

  const summaryNames = (await fs.readdir(summaryDir).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  })).filter((name) => /^\d{8}-\d{4}\.json$/.test(name)).sort().reverse();
  const summaries = await Promise.all(summaryNames.slice(0, 2).map((name) => readJsonFile(path.join(summaryDir, name))));
  if (summaries.length < 2 && releaseFolders.length < 2) {
    report.Status = "NOT_APPLICABLE";
    report.Mode = "No comparison baseline";
    report.Note = `Archive comparison not applicable: fewer than two optional archives. Saved small run summaries: ${summaries.length}; two distinct runs are needed.`;
    await writeJsonFile(path.join(reportsDir, "release-comparison.json"), report);
    await fs.writeFile(path.join(reportsDir, "release-comparison.md"), buildMarkdown(report), "utf8");
    console.log(report.Note);
    return;
  }

  report.Mode = summaries.length >= 2 ? "Small run summaries" : "Archive snapshots";
  report.Current = summaries.length >= 2 ? summaries[0] : await getMetrics(releaseFolders[0]);
  report.Previous = summaries.length >= 2 ? summaries[1] : await getMetrics(releaseFolders[1]);

  const metrics = [
    "TotalRows",
    "GoodDocumentationJobsRows",
    "WriterFitA",
    "WriterFitB",
    "WriterFitC",
    "CoveragePercent",
    "CompanyCoverageRows",
  ];

  for (const metric of metrics) {
    report.Differences[metric] = buildDifference(metric, report.Current, report.Previous);
  }

  await writeJsonFile(path.join(reportsDir, "release-comparison.json"), report);
  await fs.writeFile(path.join(reportsDir, "release-comparison.md"), buildMarkdown(report), "utf8");

  console.log("Release comparison complete.");
  console.log(`Newest release: ${report.Current.ReleaseName}`);
  console.log(`Previous release: ${report.Previous.ReleaseName}`);
  console.log(`Rows difference: ${formatSigned(report.Differences.TotalRows.Difference)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
