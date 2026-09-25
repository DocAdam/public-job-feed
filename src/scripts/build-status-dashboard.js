const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const { packageIdentity, syncDashboard } = require("../lib/package-status");

const { exportProfile, saveRunSummary } = require("../lib/run-summary");

const reportsDir = fromRoot("data", "jobs", "reports");

const inputs = {
  outputValidation: fromRoot("data", "jobs", "reports", "refresh-output-validation.json"),
  refreshRun: fromRoot("data", "jobs", "reports", "refresh-run.json"),
  exportRun: fromRoot("data", "jobs", "reports", "release-run-summary.json"),
  refreshStatus: fromRoot("data", "jobs", "reports", "refresh-job-feed-status.md"),
  publicSummaryMd: fromRoot("data", "jobs", "public", "public-job-feed-summary.md"),
  latestSummary: fromRoot("data", "jobs", "public", "public-job-feed-latest-summary.json"),
  sliceSummary: fromRoot("data", "jobs", "public", "slices", "public-job-feed-slice-summary.json"),
  dedupeSummary: fromRoot("data", "jobs", "public", "slices", "deduped", "public-job-feed-dedupe-summary.json"),
  atsHealthSummary: fromRoot("data", "jobs", "reports", "ats-health-summary.json"),
  atsRecommendations: fromRoot("data", "jobs", "reports", "ats-scale-recommendations.json"),
  crawlCoverageSummary: fromRoot("data", "jobs", "reports", "crawl-coverage-summary.json"),
  crawlCoverageByAts: fromRoot("data", "jobs", "reports", "crawl-coverage-by-ats.json"),
  inventorySummary: fromRoot("data", "jobs", "reports", "project-inventory-summary.json"),
  largeFiles: fromRoot("data", "jobs", "reports", "large-files.json"),
  cleanupSummary: fromRoot("data", "jobs", "reports", "cleanup-summary.md"),
  archiveSummary: fromRoot("data", "jobs", "reports", "archive-summary.md"),
  nextBatchPlan: fromRoot("data", "jobs", "plans", "next-batch-plan.json"),
  batchIndex: fromRoot("data", "jobs", "index", "batch-index.json"),
  evidenceReview: fromRoot("data", "jobs", "reports", "package-evidence-review.json"),
  packageTest: fromRoot("data", "jobs", "reports", "test-gsheet-package-results.json"),
  fullTest: fromRoot("data", "jobs", "reports", "test-all-results.json"),
  releaseTest: fromRoot("data", "jobs", "reports", "test-release-results.json"),
  scoringTest: fromRoot("data", "jobs", "reports", "test-scoring-results.json"),
  trendTest: fromRoot("data", "jobs", "reports", "test-trends-results.json"),
  releaseComparison: fromRoot("data", "jobs", "reports", "release-comparison.json"),
  boardFreshness: fromRoot("data", "jobs", "reports", "board-freshness-report.json"),
  catalogManifest: fromRoot("data", "catalogs", "catalog-manifest.json"),
  atsAnomaly: fromRoot("data", "jobs", "reports", "ats-anomaly-alert.json"),
  unknownCategories: fromRoot("data", "jobs", "reports", "unknown-title-category-analysis.json"),
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readJsonIfExists(filePath, fallback = null) {
  if (!(await fileExists(filePath))) {
    return fallback;
  }

  return readJsonFile(filePath);
}

async function readTextIfExists(filePath, fallback = "") {
  if (!(await fileExists(filePath))) {
    return fallback;
  }

  return fs.readFile(filePath, "utf8");
}

function sourceStatus(name, value, now = Date.now()) {
  const records = Array.isArray(value) ? value : [value];
  const dates = records.flatMap((row) => {
    if (typeof row === "string") {
      const match = row.match(/^Generated(?: at)?:\s*(.+)$/im);
      return match ? [match[1]] : [];
    }
    return row ? [row.GeneratedAt || row.GeneratedAtUTC || row.Generated || ""] : [];
  }).filter((date) => Number.isFinite(Date.parse(date)));
  // Use the oldest input date when a report contains several records.
  const timestamp = dates.length ? Math.min(...dates.map(Date.parse)) : null;
  const maxAgeHours = ["inventorySummary", "largeFiles"].includes(name) ? 168 : 24;
  const ageHours = timestamp === null ? null : Math.round((now - timestamp) / 3600000 * 10) / 10;
  return {
    Source: name,
    Path: inputs[name] || "",
    GeneratedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
    AgeHours: ageHours,
    MaxAgeHours: maxAgeHours,
    Status: value === null || value === undefined || value === "" ? "MISSING"
      : timestamp === null ? "DATE_UNKNOWN" : ageHours < 0 ? "FUTURE_DATE"
      : ageHours > maxAgeHours ? "STALE" : "CURRENT",
  };
}

function getSliceRows(sliceSummaryRows, sliceName) {
  const row = Array.isArray(sliceSummaryRows) ? sliceSummaryRows.find((item) => item.SliceName === sliceName) : null;
  return row ? row.Rows : null;
}

function getDedupeRows(dedupeSummaryRows, sliceName) {
  const row = Array.isArray(dedupeSummaryRows) ? dedupeSummaryRows.find((item) => item.SliceName === sliceName) : null;
  return row ? row.OutputRows : null;
}

function valueOrUnavailable(value) {
  return value === null || value === undefined || value === "" ? "Not available yet" : value;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getExistingBatchNames(batchIndexRows) {
  if (!Array.isArray(batchIndexRows)) {
    return new Set();
  }

  return new Set(batchIndexRows.map((row) => cleanText(row.BatchName)).filter(Boolean));
}

function parseMarkdownMetric(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`- ${escaped}:\\s*([^\\n]+)`));
  if (!match) {
    return null;
  }

  const text = match[1].trim();
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function getRowsByAts(latestSummary) {
  if (!latestSummary || !latestSummary.ATSIncluded) {
    return "Not available yet";
  }

  return latestSummary.ATSIncluded;
}

function getNextAction(hasLatestSummary, hasHealth, hasCoverage, boardFreshness, archiveCandidateSize) {
  if (!hasLatestSummary) {
    return "Run npm run jobs:public-release";
  }

  if (!hasHealth) {
    return "Run npm run jobs:ats-health";
  }

  if (!hasCoverage) {
    return "Run npm run jobs:crawl-coverage";
  }

  if (!boardFreshness) {
    return "Run npm run jobs:board-freshness";
  }

  if (Number(boardFreshness.Overall && boardFreshness.Overall.DueBoards) > 0) {
    return "Run npm run jobs:maintain-index -- --dry-run false to refresh due boards by stable ATS + slug keys.";
  }

  if ((Number(archiveCandidateSize) || 0) > 1024 * 1024 * 1024) {
    return "Run npm run jobs:archive for a dry run, or use npm run jobs:archive -- --dry-run false --max-candidates 1 for a chunked archive.";
  }

  return "Run npm run jobs:public-release";
}

function buildDashboard(data) {
  const latestSummary = data.latestSummary;
  const sliceSummary = data.sliceSummary;
  const dedupeSummary = data.dedupeSummary;
  const recommendations = data.atsRecommendations;
  const crawlCoverageSummary = data.crawlCoverageSummary;
  const crawlCoverageByAts = data.crawlCoverageByAts;
  const inventory = data.inventorySummary;
  const largeFiles = data.largeFiles;
  const cleanupSummary = data.cleanupSummary || "";
  const archiveSummary = data.archiveSummary || "";
  const nextBatchPlan = data.nextBatchPlan;
  const boardFreshness = data.boardFreshness;
  const existingBatchNames = getExistingBatchNames(data.batchIndex);
  const releaseComparisonSummary =
    data.releaseComparison && data.releaseComparison.Differences && Object.keys(data.releaseComparison.Differences).length > 0
      ? {
          CurrentRelease: data.releaseComparison.Current ? data.releaseComparison.Current.ReleaseName : "",
          PreviousRelease: data.releaseComparison.Previous ? data.releaseComparison.Previous.ReleaseName : "",
          TotalRowsDifference: data.releaseComparison.Differences.TotalRows
            ? data.releaseComparison.Differences.TotalRows.Difference
            : null,
          WriterFitADifference: data.releaseComparison.Differences.WriterFitA
            ? data.releaseComparison.Differences.WriterFitA.Difference
            : null,
          WriterFitBDifference: data.releaseComparison.Differences.WriterFitB
            ? data.releaseComparison.Differences.WriterFitB.Difference
            : null,
          WriterFitCDifference: data.releaseComparison.Differences.WriterFitC
            ? data.releaseComparison.Differences.WriterFitC.Difference
            : null,
          CoveragePercentDifference: data.releaseComparison.Differences.CoveragePercent
            ? data.releaseComparison.Differences.CoveragePercent.Difference
            : null,
        }
      : null;

  const publicFeedStatus = {
    TotalRows: latestSummary ? latestSummary.TotalRows : null,
    WriterFocusRows: getSliceRows(sliceSummary, "writer-focus"),
    StrongTopRows: getSliceRows(sliceSummary, "strong-matches"),
    RemoteWriterFocusRows: getSliceRows(sliceSummary, "remote-writer-focus"),
    SalaryDetectedRows: getSliceRows(sliceSummary, "salary-detected"),
    ReviewNeededRows: getSliceRows(sliceSummary, "review-needed"),
  };

  const profile = exportProfile(data);
  const dedupedMetric = (name) => getDedupeRows(dedupeSummary, name) ?? (profile.Profile === "daily" ? "Skipped by daily profile" : null);
  const dedupedExportStatus = {
    DedupedFirehoseRows: dedupedMetric("deduped-firehose"),
    DedupedWriterFocusRows: dedupedMetric("deduped-writer-focus"),
    DedupedStrongTopRows: getDedupeRows(dedupeSummary, "deduped-top"),
    DedupedRemoteWriterFocusRows: dedupedMetric("deduped-remote-writer-focus"),
  };

  const allReadyPlanRows = Array.isArray(nextBatchPlan)
    ? nextBatchPlan.filter((row) => row.PlanStatus === "READY")
    : [];
  const staleReadyPlanRows = allReadyPlanRows.filter((row) => existingBatchNames.has(cleanText(row.BatchName)));
  const readyPlanRows = allReadyPlanRows.filter((row) => !existingBatchNames.has(cleanText(row.BatchName)));
  const skippedPlanRows = Array.isArray(nextBatchPlan)
    ? nextBatchPlan.filter((row) => row.PlanStatus === "SKIPPED")
    : [];
  const planStale = staleReadyPlanRows.length > 0;

  const cleanupDeleteCandidates = parseMarkdownMetric(cleanupSummary, "DELETE_CANDIDATE");
  const archiveCandidateCount =
    parseMarkdownMetric(archiveSummary, "ARCHIVE_CANDIDATE");
  const archiveCandidateSize = parseMarkdownMetric(archiveSummary, "Candidate/archived size bytes");
  const archiveFilesCreated = parseMarkdownMetric(archiveSummary, "ARCHIVED");
  const deletedFoldersCount = parseMarkdownMetric(archiveSummary, "DELETED_AFTER_ARCHIVE");

  return {
    GeneratedAt: new Date().toISOString(),
    PackageRun: data.packageRun || "Unknown",
    RefreshRun: data.refreshRun || null,
    SourceReports: data.sourceReports || [],
    EvidenceReview: data.evidenceReview ? { PackageRun: data.evidenceReview.PackageRun, ReviewRows: data.evidenceReview.ReviewRows, WritingReviewRows: data.evidenceReview.WritingReviewRows ?? null, LiveChecks: data.evidenceReview.LiveChecks } : null,
    PublicFeedStatus: publicFeedStatus,
    DedupedExportStatus: dedupedExportStatus,
    ExportProfile: profile,
    ATSHealth: {
      Recommendations: Array.isArray(recommendations) ? recommendations : null,
      RowsByATS: getRowsByAts(latestSummary),
      WorkdayICIMSNote: Array.isArray(recommendations)
        ? "Workday now uses paginated POST search and iCIMS uses public HTML search parsing; both remain low-concurrency best-effort sources."
        : "Not available yet",
      AnomalyStatus: data.atsAnomaly ? data.atsAnomaly.Status : null,
      AbsoluteStatus: data.atsAnomaly?.AbsoluteStatus || "UNKNOWN",
      ByATS: data.atsAnomaly?.ByATS || [],
      AnomalyAlertCount: data.atsAnomaly ? data.atsAnomaly.AlertCount : null,
      AnomalyAlerts: data.atsAnomaly ? data.atsAnomaly.Alerts : null,
    },
    CrawlCoverage: {
      CoveragePercentOverall: crawlCoverageSummary ? crawlCoverageSummary.CoveragePercentOverall : null,
      RemainingSupportedCrawlRows: crawlCoverageSummary ? crawlCoverageSummary.RemainingTotal : null,
      CompletionStatuses: Array.isArray(crawlCoverageByAts)
        ? crawlCoverageByAts.map((row) => ({
            ATS: row.ATS,
            RemainingRows: row.RemainingRows,
            CoveragePercent: row.CoveragePercent,
            CompletionStatus: row.CompletionStatus,
          }))
        : null,
    },
    SnapshotFreshness: boardFreshness
      ? {
          CatalogPipelineStatus: boardFreshness.CatalogPipelineStatus,
          CatalogPipelineCompletedAt: boardFreshness.CatalogPipelineCompletedAt,
          FetchEligibleBoards: boardFreshness.Overall.FetchEligibleBoards,
          AttemptedBoards: boardFreshness.Overall.AttemptedBoards,
          Checked7Days: boardFreshness.Overall.Checked7Days,
          Fresh7DayPercent: boardFreshness.Overall.Fresh7DayPercent,
          SuccessfulSnapshots7Days: boardFreshness.Overall.SuccessfulSnapshots7Days,
          SuccessfulSnapshot7DayPercent: boardFreshness.Overall.SuccessfulSnapshot7DayPercent,
          FailedBoards: boardFreshness.Overall.FailedBoards,
          FailedBoardPercent: boardFreshness.Overall.FailedBoardPercent,
          StateGeneratedAt: boardFreshness.StateGeneratedAt,
          DueBoards: boardFreshness.Overall.DueBoards,
          NeverAttemptedBoards: boardFreshness.Overall.NeverAttemptedBoards,
          RetryDelayedFailedBoards: boardFreshness.Overall.RetryDelayedFailedBoards,
          DueFailedBoards: boardFreshness.Overall.DueFailedBoards,
          ConsistencyStatus: boardFreshness.ConsistencyStatus,
        }
      : null,
    NextBatchPlan: {
      ReadyCommandCount: Array.isArray(nextBatchPlan) ? readyPlanRows.length : null,
      StaleReadyCommandCount: Array.isArray(nextBatchPlan) ? staleReadyPlanRows.length : null,
      PlanStale: planStale,
      Warning: planStale ? "Next batch plan appears stale. Run npm run jobs:plan-next-batches." : "",
      RecommendedOrder: readyPlanRows.map((row) => ({
        ATS: row.ATS,
        BatchName: row.BatchName,
        Command: row.Command,
      })),
      StaleCompletedBatchNames: staleReadyPlanRows.map((row) => row.BatchName),
      SkippedATS: skippedPlanRows.map((row) => ({
        ATS: row.ATS,
        Reason: row.Reason,
      })),
    },
    StorageInventory: {
      TotalFiles: inventory ? inventory.TotalFiles : null,
      TotalSizeBytes: inventory ? inventory.TotalSizeBytes : null,
      ReleaseCount: inventory ? inventory.ReleaseCount : null,
      BatchCount: inventory ? inventory.BatchCount : null,
      MergedCount: inventory ? inventory.MergedCount : null,
      LargeFileCount: Array.isArray(largeFiles) ? largeFiles.length : null,
    },
    CleanupArchive: {
      CleanupDeleteCandidates: cleanupDeleteCandidates,
      ArchiveCandidateCount: archiveCandidateCount,
      ArchiveCandidateSizeBytes: archiveCandidateSize,
      ArchiveFilesCreated: archiveFilesCreated,
      DeletedFoldersCount: deletedFoldersCount,
    },
    TestStatus: {
      OutputValidationStatus: data.outputValidation && data.packageRun && data.outputValidation.PackageRun === data.packageRun ? data.outputValidation.Status : "NOT_CURRENT",
      OutputValidationFailures: data.outputValidation?.Failures || [],
      PackageStatus: data.packageTest?.Status || null,
      PackageRows: data.packageTest?.GoodDocumentationJobsRows ?? null,
      PackageWarnings: data.packageTest?.Warnings || [],
      PackageCopyConsistency: data.packageTest?.CopyConsistency || null,
      FullSuiteStatus: data.fullTest && data.packageRun && data.fullTest.PackageRun !== data.packageRun
        ? "OTHER_PACKAGE_RUN" : data.fullTest?.Status || "NOT_RECORDED",
      FullSuitePackageRun: data.fullTest?.PackageRun || null,
      FullSuiteFailedTest: data.fullTest?.FailedTest || null,
      ReleaseTestStatus: data.releaseTest ? data.releaseTest.Status : null,
      ReleaseTestFailures: data.releaseTest ? (data.releaseTest.CriticalFailures || []).length : null,
      ReleaseTestWarnings: data.releaseTest ? (data.releaseTest.Warnings || []).length : null,
      ScoringTestStatus: data.scoringTest ? data.scoringTest.Status : null,
      ScoringTestFailures: data.scoringTest ? (data.scoringTest.Failures || []).length : null,
      TrendTestStatus: data.trendTest ? data.trendTest.Status : null,
      TrendTestWarnings: data.trendTest ? (data.trendTest.Warnings || []).length : null,
      TrendTestFailures: data.trendTest ? (data.trendTest.Failures || []).length : null,
      ReleaseComparisonStatus: data.releaseComparison ? data.releaseComparison.Status : null,
      ReleaseComparisonSummary: releaseComparisonSummary,
      ReleaseComparisonWarning: data.releaseComparison ? data.releaseComparison.Warning : null,
      ReleaseComparisonNote: data.releaseComparison?.Note || null,
      ReleaseComparisonMode: data.releaseComparison?.Mode || null,
    },
    UnknownCategories: data.unknownCategories
      ? {
          InputRows: data.unknownCategories.InputRows,
          UnknownRows: data.unknownCategories.UnknownRows,
          UnknownPercent: data.unknownCategories.UnknownPercent,
          ReviewBuckets: data.unknownCategories.ReviewBuckets,
        }
      : null,
    SuggestedNextAction: data.outputValidation?.Status === "FAIL" || data.packageTest?.Status === "FAIL" || data.fullTest?.Status === "FAIL"
      ? "Resolve the failed validation before another package update. See test-all-results.json and test-gsheet-package-results.json."
      : (data.sourceReports || []).some((row) => ["latestSummary", "boardFreshness", "atsAnomaly"].includes(row.Source) && row.Status !== "CURRENT")
      ? "Refresh old or undated diagnostic reports before selecting more board fetches."
      : ["HIGH", "WARN"].includes(data.atsAnomaly?.AbsoluteStatus)
      ? "Review current ATS failure causes before increasing crawl volume. See board-freshness-report.md and ats-anomaly-alert.md."
      : getNextAction(
      Boolean(latestSummary),
      Boolean(data.atsHealthSummary && recommendations),
      Boolean(crawlCoverageSummary && crawlCoverageByAts),
      boardFreshness,
      archiveCandidateSize
    ),
    KeyCommands: [
      "npm run jobs:maintain-index -- --dry-run false",
      "npm run jobs:board-freshness",
      "npm run jobs:public-release",
      "npm run jobs:crawl-coverage",
      "npm run jobs:test-all",
      "npm run jobs:inventory",
      "npm run jobs:cleanup",
      "npm run jobs:archive",
    ],
  };
}

function markdownValue(value) {
  return valueOrUnavailable(value);
}

function buildMarkdown(dashboard) {
  const sourceNote = name => {
    const source = dashboard.SourceReports.find(row => row.Source === name);
    return `- ${name}: ${source?.GeneratedAt || "Unknown date"} (${source?.Status || "DATE_UNKNOWN"}). These figures describe that saved report.`;
  };
  const recommendations = dashboard.ATSHealth.Recommendations || [];
  const readyRows = dashboard.NextBatchPlan.RecommendedOrder || [];
  const skippedRows = dashboard.NextBatchPlan.SkippedATS || [];

  const lines = [
    "# Project Status Dashboard",
    "",
    "Internal status dashboard for the public-job-feed project. This is not public-facing documentation.",
    "",
    `Generated: ${dashboard.GeneratedAt}`,
    `Package run: ${dashboard.PackageRun}`,
    "",
    "## Refresh Run Evidence",
    "",
    ...(dashboard.RefreshRun ? [
      `- Run ID: ${dashboard.RefreshRun.RunId}`,
      `- Status: ${dashboard.RefreshRun.Status}`,
      `- Launcher: ${dashboard.RefreshRun.LauncherPath}`,
      `- Launcher SHA-256: ${dashboard.RefreshRun.LauncherSHA256}`,
      `- Git revision: ${dashboard.RefreshRun.GitRevision}`,
      `- Working tree changed: ${dashboard.RefreshRun.WorkingTreeChanged}`,
      `- Arguments: ${JSON.stringify(dashboard.RefreshRun.Arguments)}`,
    ] : ["No run evidence recorded. The next refresh will record the launcher path, hash, revision, and arguments."]),
    "",
    "## Source Report Dates",
    "",
    "Status age limits: 24 hours for operational reports; seven days for inventory. Missing dates remain unknown.",
    "",
    "| Source | Generated (UTC) | Age (hours) | Status |",
    "| --- | --- | ---: | --- |",
    ...(dashboard.SourceReports || []).map((row) => `| ${row.Source} | ${row.GeneratedAt || "Unknown"} | ${row.AgeHours ?? "Unknown"} | ${row.Status} |`),
    "",
    "## Public Feed Status",
    "",
    `- Total rows: ${markdownValue(dashboard.PublicFeedStatus.TotalRows)}`,
    `- Writer focus rows: ${markdownValue(dashboard.PublicFeedStatus.WriterFocusRows)}`,
    `- Strong/top rows: ${markdownValue(dashboard.PublicFeedStatus.StrongTopRows)}`,
    `- Remote writer focus rows: ${markdownValue(dashboard.PublicFeedStatus.RemoteWriterFocusRows)}`,
    `- Salary detected rows: ${markdownValue(dashboard.PublicFeedStatus.SalaryDetectedRows)}`,
    `- Review needed rows: ${markdownValue(dashboard.PublicFeedStatus.ReviewNeededRows)}`,
    "",
    "## Deduped Export Status",
    "",
    `- Export profile: ${dashboard.ExportProfile.Profile} (${dashboard.ExportProfile.Evidence})`,
    `- Deduped firehose rows: ${markdownValue(dashboard.DedupedExportStatus.DedupedFirehoseRows)}`,
    `- Deduped writer focus rows: ${markdownValue(dashboard.DedupedExportStatus.DedupedWriterFocusRows)}`,
    `- Deduped strong/top rows: ${markdownValue(dashboard.DedupedExportStatus.DedupedStrongTopRows)}`,
    `- Deduped remote writer focus rows: ${markdownValue(
      dashboard.DedupedExportStatus.DedupedRemoteWriterFocusRows
    )}`,
    "",
    "## ATS Health",
    "",
  ];

  if (recommendations.length === 0) {
    lines.push("Not available yet", "");
  } else {
    for (const row of recommendations) {
      lines.push(`- ${row.ATS}: ${row.ScaleRecommendation} (${row.Reason})`);
    }
    lines.push("", "These recommendations are based on historical fetch totals. Check recent health before increasing volume.", `ATS included: ${dashboard.ATSHealth.RowsByATS}`, dashboard.ATSHealth.WorkdayICIMSNote, "");
  }
  lines.push(`- Change from baseline: ${markdownValue(dashboard.ATSHealth.AnomalyStatus)}`);
  lines.push(`- Absolute recent failure status: ${dashboard.ATSHealth.AbsoluteStatus}`);
  for (const row of dashboard.ATSHealth.ByATS) {
    if (row.AbsoluteHealth) lines.push(`- ${row.ATS}: ${row.AbsoluteHealth.Status}; ${row.AbsoluteHealth.FailureCount}/${row.AbsoluteHealth.Attempts} recent results failed (${row.AbsoluteHealth.FailureRate}%); matched-board change: ${row.Status}`);
  }
  lines.push("Baseline-change alerts and absolute failure rates are separate. No baseline alert does not mean low failures.");
  lines.push(`- ATS anomaly alerts: ${markdownValue(dashboard.ATSHealth.AnomalyAlertCount)}`);
  for (const row of dashboard.ATSHealth.AnomalyAlerts || []) {
    lines.push(`- ${row.Severity}: ${row.ATS} ${row.Metric} ${row.BaselineRate}% -> ${row.RecentRate}%`);
  }
  lines.push("");

  lines.push("## Crawl Coverage", "", "Coverage records attempts. It does not confirm successful fetches or open jobs.", "");
  lines.push(`- Catalog accounted for percent: ${markdownValue(dashboard.CrawlCoverage.CoveragePercentOverall)}`);
  lines.push(`- Remaining supported crawl rows: ${markdownValue(dashboard.CrawlCoverage.RemainingSupportedCrawlRows)}`);

  if (Array.isArray(dashboard.CrawlCoverage.CompletionStatuses)) {
    lines.push("", "ATS completion statuses:");
    for (const row of dashboard.CrawlCoverage.CompletionStatuses) {
      lines.push(
        `- ${row.ATS}: ${row.CompletionStatus} (${row.CoveragePercent}% coverage, ${row.RemainingRows} remaining)`
      );
    }
    lines.push("");
  } else {
    lines.push("", "ATS completion statuses: Not available yet", "");
  }

  lines.push("## Snapshot Freshness", "");
  if (dashboard.SnapshotFreshness) {
    lines.push(
      `- Catalog pipeline: ${markdownValue(dashboard.SnapshotFreshness.CatalogPipelineStatus)}`,
      `- Catalog completed: ${markdownValue(dashboard.SnapshotFreshness.CatalogPipelineCompletedAt)}`,
      `- Fetch-eligible boards: ${markdownValue(dashboard.SnapshotFreshness.FetchEligibleBoards)}`,
      `- Attempted boards: ${markdownValue(dashboard.SnapshotFreshness.AttemptedBoards)}`,
      `- Attempted in 7 days: ${markdownValue(dashboard.SnapshotFreshness.Checked7Days)} (${markdownValue(dashboard.SnapshotFreshness.Fresh7DayPercent)}%)`,
      `- Successful snapshots in 7 days: ${markdownValue(dashboard.SnapshotFreshness.SuccessfulSnapshots7Days)} (${markdownValue(dashboard.SnapshotFreshness.SuccessfulSnapshot7DayPercent)}%)`,
      `- Current failed boards: ${markdownValue(dashboard.SnapshotFreshness.FailedBoards)} (${markdownValue(dashboard.SnapshotFreshness.FailedBoardPercent)}%)`,
      `- Board state generated: ${markdownValue(dashboard.SnapshotFreshness.StateGeneratedAt)}`,
      `- Due boards: ${markdownValue(dashboard.SnapshotFreshness.DueBoards)}`,
      `- Never attempted: ${markdownValue(dashboard.SnapshotFreshness.NeverAttemptedBoards)}`,
      `- Retry-delayed failed boards: ${markdownValue(dashboard.SnapshotFreshness.RetryDelayedFailedBoards)}`,
      `- Due failed boards: ${markdownValue(dashboard.SnapshotFreshness.DueFailedBoards)}`,
      `- Freshness consistency: ${markdownValue(dashboard.SnapshotFreshness.ConsistencyStatus)}`,
      ""
    );
  } else {
    lines.push("Not available yet", "");
  }

  lines.push("## Unknown Title Categories", "");
  if (dashboard.UnknownCategories) {
    lines.push(
      `- Input jobs: ${markdownValue(dashboard.UnknownCategories.InputRows)}`,
      `- Unknown jobs: ${markdownValue(dashboard.UnknownCategories.UnknownRows)} (${markdownValue(dashboard.UnknownCategories.UnknownPercent)}%)`,
      ...(dashboard.UnknownCategories.ReviewBuckets || []).map((row) => `- ${row.ReviewBucket}: ${row.Rows}`),
      ""
    );
  } else {
    lines.push("Not available yet", "");
  }

  lines.push("## Retained Jobs for Review", "",
    dashboard.EvidenceReview ? `- Rows: ${dashboard.EvidenceReview.ReviewRows}; package: ${dashboard.EvidenceReview.PackageRun}; live URL checks: ${dashboard.EvidenceReview.LiveChecks}; roles flagged for writing review: ${dashboard.EvidenceReview.WritingReviewRows ?? "Unknown"}` : "No review report recorded.",
    "- Evidence: data/jobs/reports/package-evidence-review.md",
    "- URL check time and board fetch time are separate. Job status uses attributed user observations where available.", "");

  lines.push("## Automated Tests", "");
  lines.push(`- Current output validation: ${dashboard.TestStatus.OutputValidationStatus}`);
  for (const failure of dashboard.TestStatus.OutputValidationFailures) lines.push(`- Output failure: ${failure}`);
  lines.push(`- Full suite: ${dashboard.TestStatus.FullSuiteStatus} (package ${dashboard.TestStatus.FullSuitePackageRun || "unknown"})`);
  if (dashboard.TestStatus.FullSuiteFailedTest) lines.push(`- Failed test: ${dashboard.TestStatus.FullSuiteFailedTest}`);
  lines.push(`- Package validation: ${markdownValue(dashboard.TestStatus.PackageStatus)}`);
  lines.push(`- Package copy consistency: ${markdownValue(dashboard.TestStatus.PackageCopyConsistency)}`);
  for (const warning of dashboard.TestStatus.PackageWarnings) lines.push(`- Package warning: ${warning}`);
  lines.push(`- Release Test Status: ${markdownValue(dashboard.TestStatus.ReleaseTestStatus)}`);
  if (dashboard.TestStatus.ReleaseTestStatus) {
    lines.push(
      `- Release Test Failures: ${markdownValue(dashboard.TestStatus.ReleaseTestFailures)}`,
      `- Release Test Warnings: ${markdownValue(dashboard.TestStatus.ReleaseTestWarnings)}`
    );
  }
  lines.push(`- Scoring Test Status: ${markdownValue(dashboard.TestStatus.ScoringTestStatus)}`);
  if (dashboard.TestStatus.ScoringTestStatus) {
    lines.push(`- Scoring Test Failures: ${markdownValue(dashboard.TestStatus.ScoringTestFailures)}`);
  }
  lines.push(`- Trend Test Status: ${markdownValue(dashboard.TestStatus.TrendTestStatus)}`);
  if (dashboard.TestStatus.TrendTestStatus) {
    lines.push(
      `- Trend Test Warnings: ${markdownValue(dashboard.TestStatus.TrendTestWarnings)}`,
      `- Trend Test Failures: ${markdownValue(dashboard.TestStatus.TrendTestFailures)}`
    );
  }
  lines.push(`- Release Comparison Status: ${markdownValue(dashboard.TestStatus.ReleaseComparisonStatus)}`);
  if (dashboard.TestStatus.ReleaseComparisonNote) lines.push(`- Comparison note: ${dashboard.TestStatus.ReleaseComparisonNote}`);
  if (dashboard.TestStatus.ReleaseComparisonMode) lines.push(`- Comparison mode: ${dashboard.TestStatus.ReleaseComparisonMode}`);
  if (dashboard.TestStatus.ReleaseComparisonWarning) {
    lines.push(`- Release Comparison Warning: ${dashboard.TestStatus.ReleaseComparisonWarning}`);
  }
  if (dashboard.TestStatus.ReleaseComparisonSummary) {
    const comparison = dashboard.TestStatus.ReleaseComparisonSummary;
    lines.push(
      `- Current release: ${markdownValue(comparison.CurrentRelease)}`,
      `- Previous release: ${markdownValue(comparison.PreviousRelease)}`,
      `- Row difference: ${markdownValue(comparison.TotalRowsDifference)}`,
      `- A tier difference: ${markdownValue(comparison.WriterFitADifference)}`,
      `- B tier difference: ${markdownValue(comparison.WriterFitBDifference)}`,
      `- C tier difference: ${markdownValue(comparison.WriterFitCDifference)}`,
      `- Coverage difference: ${markdownValue(comparison.CoveragePercentDifference)}`
    );
  }
  lines.push("");

  lines.push("## Legacy Offset Plan (Recovery Only)", "");
  lines.push("The normal refresh command uses the persistent key-based scheduler; this older plan is retained only for recovery and historical comparison.", "");
  lines.push(`- Ready command count: ${markdownValue(dashboard.NextBatchPlan.ReadyCommandCount)}`);
  lines.push(`- Stale completed ready commands: ${markdownValue(dashboard.NextBatchPlan.StaleReadyCommandCount)}`);

  if (dashboard.NextBatchPlan.Warning) {
    lines.push("", `Warning: ${dashboard.NextBatchPlan.Warning}`);
  }

  if (readyRows.length > 0) {
    lines.push("", "Recommended order:");
    readyRows.forEach((row, index) => {
      lines.push(`${index + 1}. ${row.ATS} - ${row.BatchName}`);
    });
  } else if (dashboard.NextBatchPlan.ReadyCommandCount === null) {
    lines.push("", "Recommended order: Not available yet");
  }

  if ((dashboard.NextBatchPlan.StaleCompletedBatchNames || []).length > 0) {
    lines.push("", "Completed batch names ignored by dashboard:");
    for (const batchName of dashboard.NextBatchPlan.StaleCompletedBatchNames) {
      lines.push(`- ${batchName}`);
    }
  }

  if (skippedRows.length > 0) lines.push("", `- Legacy skipped rows: ${skippedRows.length}`);

  lines.push(
    "",
    "## Storage / Inventory",
    "",
    sourceNote("inventorySummary"),
    `- Total files: ${markdownValue(dashboard.StorageInventory.TotalFiles)}`,
    `- Total size bytes: ${markdownValue(dashboard.StorageInventory.TotalSizeBytes)}`,
    `- Release count: ${markdownValue(dashboard.StorageInventory.ReleaseCount)}`,
    `- Batch count: ${markdownValue(dashboard.StorageInventory.BatchCount)}`,
    `- Merged count: ${markdownValue(dashboard.StorageInventory.MergedCount)}`,
    `- Large file count: ${markdownValue(dashboard.StorageInventory.LargeFileCount)}`,
    "",
    "## Cleanup / Archive",
    "",
    sourceNote("cleanupSummary"),
    sourceNote("archiveSummary"),
    `- Cleanup delete candidates: ${markdownValue(dashboard.CleanupArchive.CleanupDeleteCandidates)}`,
    `- Archive candidate count: ${markdownValue(dashboard.CleanupArchive.ArchiveCandidateCount)}`,
    `- Archive candidate size bytes: ${markdownValue(dashboard.CleanupArchive.ArchiveCandidateSizeBytes)}`,
    `- Archive files created: ${markdownValue(dashboard.CleanupArchive.ArchiveFilesCreated)}`,
    `- Deleted folders count: ${markdownValue(dashboard.CleanupArchive.DeletedFoldersCount)}`,
    "",
    "## Suggested Next Action",
    "",
    dashboard.SuggestedNextAction,
    "",
    "## Key Command Reminders",
    "",
    ...dashboard.KeyCommands.map((command) => `- \`${command}\``),
    ""
  );

  return lines.join("\n");
}

async function main() {
  await ensureDir(reportsDir);

  const data = {
    outputValidation: await readJsonIfExists(inputs.outputValidation),
    refreshRun: await readJsonIfExists(inputs.refreshRun),
    exportRun: await readJsonIfExists(inputs.exportRun),
    refreshStatus: await readTextIfExists(inputs.refreshStatus),
    publicSummaryMd: await readTextIfExists(inputs.publicSummaryMd, ""),
    latestSummary: await readJsonIfExists(inputs.latestSummary),
    sliceSummary: await readJsonIfExists(inputs.sliceSummary),
    dedupeSummary: await readJsonIfExists(inputs.dedupeSummary),
    atsHealthSummary: await readJsonIfExists(inputs.atsHealthSummary),
    atsRecommendations: await readJsonIfExists(inputs.atsRecommendations),
    crawlCoverageSummary: await readJsonIfExists(inputs.crawlCoverageSummary),
    crawlCoverageByAts: await readJsonIfExists(inputs.crawlCoverageByAts),
    inventorySummary: await readJsonIfExists(inputs.inventorySummary),
    largeFiles: await readJsonIfExists(inputs.largeFiles),
    cleanupSummary: await readTextIfExists(inputs.cleanupSummary, ""),
    archiveSummary: await readTextIfExists(inputs.archiveSummary, ""),
    nextBatchPlan: await readJsonIfExists(inputs.nextBatchPlan),
    batchIndex: await readJsonIfExists(inputs.batchIndex),
    evidenceReview: await readJsonIfExists(inputs.evidenceReview),
    packageTest: await readJsonIfExists(inputs.packageTest),
    fullTest: await readJsonIfExists(inputs.fullTest),
    releaseTest: await readJsonIfExists(inputs.releaseTest),
    scoringTest: await readJsonIfExists(inputs.scoringTest),
    trendTest: await readJsonIfExists(inputs.trendTest),
    releaseComparison: await readJsonIfExists(inputs.releaseComparison),
    boardFreshness: await readJsonIfExists(inputs.boardFreshness),
    catalogManifest: await readJsonIfExists(inputs.catalogManifest),
    atsAnomaly: await readJsonIfExists(inputs.atsAnomaly),
    unknownCategories: await readJsonIfExists(inputs.unknownCategories),
  };
  const packageRoot = fromRoot("data", "jobs", "gsheet-package");
  if (await fileExists(path.join(packageRoot, "latest", "gsheet-package-manifest.json"))) {
    data.packageRun = await packageIdentity(path.join(packageRoot, "latest"));
  }
  data.sourceReports = ["latestSummary", "sliceSummary", "dedupeSummary", "atsHealthSummary", "crawlCoverageSummary", "cleanupSummary", "boardFreshness", "atsAnomaly", "inventorySummary", "archiveSummary", "releaseTest", "outputValidation", "evidenceReview", "packageTest", "fullTest", "scoringTest", "trendTest", "unknownCategories"].map((name) => sourceStatus(name, data[name]));
  const dashboard = buildDashboard(data);

  await writeJsonFile(path.join(reportsDir, "project-status-dashboard.json"), dashboard);
  await fs.writeFile(path.join(reportsDir, "project-status-dashboard.md"), buildMarkdown(dashboard), "utf8");

  if (process.argv.includes("--sync-package")) {
    await syncDashboard(packageRoot, buildMarkdown(dashboard));
    await saveRunSummary(path.join(reportsDir, "run-summaries"), dashboard, data.latestSummary);
  }

  console.log("Project status dashboard complete.");
  console.log("Output files:");
  console.log(path.join(reportsDir, "project-status-dashboard.md"));
  console.log(path.join(reportsDir, "project-status-dashboard.json"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildDashboard, buildMarkdown, parseMarkdownMetric, sourceStatus };
