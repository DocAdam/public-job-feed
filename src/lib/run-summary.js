const path = require("path");
const { writeJsonFile } = require("./files");

function exportProfile(data) {
  if (data.exportRun?.FeedGeneratedAt && data.exportRun.FeedGeneratedAt === data.latestSummary?.GeneratedAt) {
    return { Profile: data.exportRun.Profile, Evidence: "release-run-summary.json" };
  }
  const text = data.refreshStatus || "";
  const started = text.match(/^Started: (\d{4}-\d{2}-\d{2})/m)?.[1];
  if (started === data.latestSummary?.GeneratedAt?.slice(0, 10) && text.includes("rebuilding daily public release") && text.includes("Completed:")) {
    return { Profile: "daily", Evidence: "Derived from completed refresh-job-feed-status.md for the feed date" };
  }
  return { Profile: "unknown", Evidence: "No matching release-run metadata" };
}

function buildRunSummary(dashboard, latestSummary) {
  return {
    GeneratedAt: dashboard.GeneratedAt,
    PackageRun: dashboard.PackageRun,
    FeedGeneratedAt: latestSummary?.GeneratedAt || null,
    ReleaseName: dashboard.PackageRun,
    TotalRows: latestSummary?.TotalRows ?? null,
    WriterFitA: latestSummary?.WriterFitACount ?? null,
    WriterFitB: latestSummary?.WriterFitBCount ?? null,
    WriterFitC: latestSummary?.WriterFitCCount ?? null,
    GoodDocumentationJobsRows: dashboard.TestStatus.PackageRows ?? null,
    CoveragePercent: dashboard.CrawlCoverage.CoveragePercentOverall,
  };
}

async function saveRunSummary(dir, dashboard, latestSummary) {
  if (!/^\d{8}-\d{4}$/.test(dashboard.PackageRun)) throw new Error("Run summary requires a package identity.");
  await writeJsonFile(path.join(dir, `${dashboard.PackageRun}.json`), buildRunSummary(dashboard, latestSummary));
}

module.exports = { exportProfile, buildRunSummary, saveRunSummary };
