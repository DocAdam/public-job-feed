const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, readLargeJsonArrayFile, writeJsonFile } = require("../lib/files");

const batchIndexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const batchesRoot = fromRoot("data", "jobs", "batches");
const publicFeedPath = fromRoot("data", "jobs", "public", "public-job-feed-latest.json");
const crawlQueuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const outputDir = fromRoot("data", "jobs", "reports");

const atsList = [
  { key: "ashby", label: "Ashby", hasField: "HasAshby", supportedType: "SUPPORTED" },
  { key: "greenhouse", label: "Greenhouse", hasField: "HasGreenhouse", supportedType: "SUPPORTED" },
  { key: "lever", label: "Lever", hasField: "HasLever", supportedType: "SUPPORTED" },
  { key: "workday", label: "Workday", hasField: "HasWorkday", supportedType: "BEST_EFFORT" },
  { key: "bamboohr", label: "BambooHR", hasField: "HasBambooHR", supportedType: "BEST_EFFORT" },
  { key: "icims", label: "ICIMS", hasField: "HasICIMS", supportedType: "BEST_EFFORT" },
];

const summaryHeaders = [
  "GeneratedAt",
  "ATSCount",
  "TotalBatches",
  "TotalBoardsAttempted",
  "TotalBoardsSucceeded",
  "TotalBoardsFailed",
  "TotalBoardsEmpty",
  "TotalBoardsSkipped",
  "TotalJobsFetched",
  "PublicFeedRows",
  "CatalogRows",
  "ScaleNowCount",
  "SampleMoreCount",
  "KeepBestEffortCount",
  "CatalogOnlyForNowCount",
  "ReviewFetcherCount",
];

const fetchHealthHeaders = [
  "ATS",
  "Batches",
  "BoardsAttempted",
  "BoardsSucceeded",
  "BoardsFailed",
  "BoardsEmpty",
  "BoardsSkipped",
  "SuccessRate",
  "FailureRate",
  "EmptyRate",
  "JobsFetched",
  "AverageJobsPerSuccessfulBoard",
];

const publicFeedHealthHeaders = [
  "ATS",
  "PublicRows",
  "UniqueCompanies",
  "UniqueTitles",
  "WriterFitACount",
  "WriterFitBCount",
  "WriterFitCCount",
  "WriterFitDCount",
  "WriterFitFCount",
  "RemoteCount",
  "USRemoteEligibleTrueCount",
  "SalaryDetectedCount",
  "ExportOKCount",
  "ExportReviewCount",
  "ExportBadRowCount",
];

const catalogHealthHeaders = [
  "ATS",
  "CatalogRows",
  "CrawlReadyCount",
  "CatalogOnlyCount",
  "FetchSupportStatusCounts",
  "MessyButExportableCount",
];

const recommendationHeaders = [
  "ATS",
  "ScaleRecommendation",
  "Reason",
  "SuggestedNextBatchLimit",
  "SuggestedDelayMs",
  "SuggestedNextAction",
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await fileExists(filePath))) {
    return fallback;
  }

  return readJsonFile(filePath);
}

async function readLargeJsonArrayIfExists(filePath, fallback) {
  if (!(await fileExists(filePath))) {
    return fallback;
  }

  return readLargeJsonArrayFile(filePath);
}

async function writeCsv(filePath, headers, rows) {
  await fs.writeFile(filePath, rowsToCsv(headers, rows), "utf8");
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeAts(value) {
  return cleanText(value).toLowerCase();
}

function asBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return cleanText(value).toLowerCase() === "true";
}

function percent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function average(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(2));
}

function countUnique(rows, field) {
  return new Set(rows.map((row) => cleanText(row[field])).filter(Boolean)).size;
}

function isAtsPresent(row, ats) {
  if (asBoolean(row[ats.hasField])) {
    return true;
  }

  if (Array.isArray(row.ATSList)) {
    return row.ATSList.map(normalizeAts).includes(ats.key);
  }

  if (Array.isArray(row.OriginalATSList)) {
    return row.OriginalATSList.map(normalizeAts).includes(ats.key);
  }

  return cleanText(row.ATSList)
    .split("|")
    .map(normalizeAts)
    .includes(ats.key);
}

function listIncludes(value, label) {
  const normalizedLabel = normalizeAts(label);
  const values = Array.isArray(value)
    ? value
    : cleanText(value)
        .split("|")
        .map(cleanText)
        .filter(Boolean);

  return values.map(normalizeAts).includes(normalizedLabel);
}

async function readAllFetchLogs() {
  const rows = [];

  if (!(await fileExists(batchesRoot))) {
    return rows;
  }

  const entries = await fs.readdir(batchesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fetchLogPath = path.join(batchesRoot, entry.name, "jobs-batch-fetch-log.json");
    const fetchLogRows = await readJsonIfExists(fetchLogPath, []);

    for (const row of fetchLogRows) {
      rows.push({
        ...row,
        BatchName: entry.name,
      });
    }
  }

  return rows;
}

function buildFetchHealth(batchIndexRows, fetchLogRows) {
  return atsList.map((ats) => {
    const batches = batchIndexRows.filter((row) => normalizeAts(row.ATS) === ats.key);
    const logs = fetchLogRows.filter((row) => normalizeAts(row.ATS) === ats.key);
    const boardsAttempted = logs.length;
    const boardsSucceeded = logs.filter((row) => cleanText(row.Status).toLowerCase() === "success").length;
    const boardsFailed = logs.filter((row) => cleanText(row.Status).toLowerCase() === "failed").length;
    const boardsEmpty = logs.filter((row) => cleanText(row.Status).toLowerCase() === "empty").length;
    const boardsSkipped = logs.filter((row) => cleanText(row.Status).toLowerCase() === "skipped").length;
    const jobsFetched = logs.reduce((sum, row) => sum + (Number(row.JobCount) || 0), 0);

    return {
      ATS: ats.key,
      Batches: batches.length,
      BoardsAttempted: boardsAttempted,
      BoardsSucceeded: boardsSucceeded,
      BoardsFailed: boardsFailed,
      BoardsEmpty: boardsEmpty,
      BoardsSkipped: boardsSkipped,
      SuccessRate: percent(boardsSucceeded, boardsAttempted),
      FailureRate: percent(boardsFailed, boardsAttempted),
      EmptyRate: percent(boardsEmpty, boardsAttempted),
      JobsFetched: jobsFetched,
      AverageJobsPerSuccessfulBoard: average(jobsFetched, boardsSucceeded),
    };
  });
}

function buildPublicFeedHealth(publicRows) {
  return atsList.map((ats) => {
    const rows = publicRows.filter((row) => normalizeAts(row.ATS) === ats.key);

    return {
      ATS: ats.key,
      PublicRows: rows.length,
      UniqueCompanies: countUnique(rows, "CompanyKey") || countUnique(rows, "Company"),
      UniqueTitles: countUnique(rows, "Title"),
      WriterFitACount: rows.filter((row) => row.WriterFitTier === "A").length,
      WriterFitBCount: rows.filter((row) => row.WriterFitTier === "B").length,
      WriterFitCCount: rows.filter((row) => row.WriterFitTier === "C").length,
      WriterFitDCount: rows.filter((row) => row.WriterFitTier === "D").length,
      WriterFitFCount: rows.filter((row) => row.WriterFitTier === "F").length,
      RemoteCount: rows.filter((row) => row.RemoteStatus === "Remote").length,
      USRemoteEligibleTrueCount: rows.filter((row) => asBoolean(row.USRemoteEligible)).length,
      SalaryDetectedCount: rows.filter((row) => asBoolean(row.SalaryDetected)).length,
      ExportOKCount: rows.filter((row) => row.ExportQualityFlag === "OK").length,
      ExportReviewCount: rows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
      ExportBadRowCount: rows.filter((row) => row.ExportQualityFlag === "BAD_ROW").length,
    };
  });
}

function getFetchSupportStatus(row, ats, catalogOnly) {
  if (catalogOnly) {
    return "CATALOG_ONLY";
  }

  if (ats.supportedType === "SUPPORTED") {
    return "SUPPORTED";
  }

  if (ats.supportedType === "BEST_EFFORT") {
    return "BEST_EFFORT";
  }

  return "UNSUPPORTED";
}

function buildCatalogHealth(crawlQueueRows) {
  return atsList.map((ats) => {
    const rows = crawlQueueRows.filter((row) => isAtsPresent(row, ats));
    const statusCounts = {
      SUPPORTED: 0,
      BEST_EFFORT: 0,
      CATALOG_ONLY: 0,
      UNSUPPORTED: 0,
    };

    for (const row of rows) {
      const catalogOnly = listIncludes(row.UnavailableATSList, ats.label);
      statusCounts[getFetchSupportStatus(row, ats, catalogOnly)] += 1;
    }

    return {
      ATS: ats.key,
      CatalogRows: rows.length,
      CrawlReadyCount: rows.filter((row) => listIncludes(row.AvailableATSList, ats.label)).length,
      CatalogOnlyCount: rows.filter((row) => listIncludes(row.UnavailableATSList, ats.label)).length,
      FetchSupportStatusCounts: Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}:${count}`)
        .join(" | "),
      MessyButExportableCount: rows.filter((row) => asBoolean(row.MessyButExportable)).length,
    };
  });
}

function getRecommendation(ats, fetchHealth, publicHealth) {
  const supported = ats.supportedType === "SUPPORTED";
  const attempted = fetchHealth.BoardsAttempted;
  const successRate = Number(fetchHealth.SuccessRate) || 0;
  const failureRate = Number(fetchHealth.FailureRate) || 0;
  const jobsFetched = Number(fetchHealth.JobsFetched) || 0;
  const publicRows = Number(publicHealth.PublicRows) || 0;

  if (supported && jobsFetched > 1000 && successRate >= 50) {
    return {
      ScaleRecommendation: "SCALE_NOW",
      Reason: "Supported public API has solid success rate and meaningful job volume.",
      SuggestedNextBatchLimit: 500,
      SuggestedDelayMs: 250,
      SuggestedNextAction: `Run another controlled ${ats.key} HIGH batch with resume enabled.`,
    };
  }

  if (jobsFetched > 0 && (attempted < 100 || publicRows < 1000)) {
    return {
      ScaleRecommendation: "SAMPLE_MORE",
      Reason: "Fetcher produced jobs, but the current sample is still small.",
      SuggestedNextBatchLimit: ats.supportedType === "SUPPORTED" ? 100 : 50,
      SuggestedDelayMs: ats.supportedType === "SUPPORTED" ? 250 : 500,
      SuggestedNextAction: `Run a modest ${ats.key} batch and compare success/quality rates.`,
    };
  }

  if (supported && jobsFetched > 0 && failureRate >= 50) {
    return {
      ScaleRecommendation: "REVIEW_FETCHER",
      Reason: "Expected supported fetcher returned jobs, but failure rate is high.",
      SuggestedNextBatchLimit: 50,
      SuggestedDelayMs: 500,
      SuggestedNextAction: `Inspect failed ${ats.key} fetch logs before scaling.`,
    };
  }

  if (jobsFetched > 0) {
    return {
      ScaleRecommendation: "KEEP_BEST_EFFORT",
      Reason: "Fetcher can produce jobs, but this ATS remains best-effort or inconsistent.",
      SuggestedNextBatchLimit: 50,
      SuggestedDelayMs: 500,
      SuggestedNextAction: `Keep ${ats.key} batches small and review logs after each run.`,
    };
  }

  if (supported && attempted > 0) {
    return {
      ScaleRecommendation: "REVIEW_FETCHER",
      Reason: "Supported ATS has attempted boards but no fetched jobs.",
      SuggestedNextBatchLimit: 25,
      SuggestedDelayMs: 500,
      SuggestedNextAction: `Inspect ${ats.key} endpoint assumptions before more batches.`,
    };
  }

  if (attempted > 0) {
    return {
      ScaleRecommendation: "CATALOG_ONLY_FOR_NOW",
      Reason: "Attempts completed without crashing, but no usable jobs were fetched.",
      SuggestedNextBatchLimit: 0,
      SuggestedDelayMs: 0,
      SuggestedNextAction: `Keep ${ats.key} catalog-only until a better endpoint strategy is added.`,
    };
  }

  return {
    ScaleRecommendation: "CATALOG_ONLY_FOR_NOW",
    Reason: "No successful or attempted fetch signal is available yet.",
    SuggestedNextBatchLimit: 0,
    SuggestedDelayMs: 0,
    SuggestedNextAction: `Keep ${ats.key} catalog-only until a targeted sample is useful.`,
  };
}

function buildRecommendations(fetchHealthRows, publicHealthRows) {
  return atsList.map((ats) => {
    const fetchHealth = fetchHealthRows.find((row) => row.ATS === ats.key) || {};
    const publicHealth = publicHealthRows.find((row) => row.ATS === ats.key) || {};

    return {
      ATS: ats.key,
      ...getRecommendation(ats, fetchHealth, publicHealth),
    };
  });
}

function buildSummary(generatedAt, fetchHealthRows, publicHealthRows, catalogHealthRows, recommendationRows) {
  return {
    GeneratedAt: generatedAt,
    ATSCount: atsList.length,
    TotalBatches: fetchHealthRows.reduce((sum, row) => sum + row.Batches, 0),
    TotalBoardsAttempted: fetchHealthRows.reduce((sum, row) => sum + row.BoardsAttempted, 0),
    TotalBoardsSucceeded: fetchHealthRows.reduce((sum, row) => sum + row.BoardsSucceeded, 0),
    TotalBoardsFailed: fetchHealthRows.reduce((sum, row) => sum + row.BoardsFailed, 0),
    TotalBoardsEmpty: fetchHealthRows.reduce((sum, row) => sum + row.BoardsEmpty, 0),
    TotalBoardsSkipped: fetchHealthRows.reduce((sum, row) => sum + row.BoardsSkipped, 0),
    TotalJobsFetched: fetchHealthRows.reduce((sum, row) => sum + row.JobsFetched, 0),
    PublicFeedRows: publicHealthRows.reduce((sum, row) => sum + row.PublicRows, 0),
    CatalogRows: catalogHealthRows.reduce((sum, row) => sum + row.CatalogRows, 0),
    ScaleNowCount: recommendationRows.filter((row) => row.ScaleRecommendation === "SCALE_NOW").length,
    SampleMoreCount: recommendationRows.filter((row) => row.ScaleRecommendation === "SAMPLE_MORE").length,
    KeepBestEffortCount: recommendationRows.filter((row) => row.ScaleRecommendation === "KEEP_BEST_EFFORT").length,
    CatalogOnlyForNowCount: recommendationRows.filter((row) => row.ScaleRecommendation === "CATALOG_ONLY_FOR_NOW")
      .length,
    ReviewFetcherCount: recommendationRows.filter((row) => row.ScaleRecommendation === "REVIEW_FETCHER").length,
  };
}

function table(headers, rows) {
  const separator = headers.map(() => "---");
  const values = rows.map((row) => headers.map((header) => cleanText(row[header])));

  return [
    `| ${headers.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...values.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n");
}

function buildMarkdown(generatedAt, summary, fetchHealthRows, publicHealthRows, recommendationRows) {
  const atsRows = atsList.map((ats) => {
    const fetchHealth = fetchHealthRows.find((row) => row.ATS === ats.key) || {};
    const publicHealth = publicHealthRows.find((row) => row.ATS === ats.key) || {};
    const recommendation = recommendationRows.find((row) => row.ATS === ats.key) || {};

    return {
      ATS: ats.key,
      Batches: fetchHealth.Batches || 0,
      BoardsAttempted: fetchHealth.BoardsAttempted || 0,
      SuccessRate: fetchHealth.SuccessRate || 0,
      JobsFetched: fetchHealth.JobsFetched || 0,
      PublicRows: publicHealth.PublicRows || 0,
      Recommendation: recommendation.ScaleRecommendation || "",
    };
  });

  return [
    "# ATS Health Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- ATS represented: ${summary.ATSCount}`,
    `- Batches indexed: ${summary.TotalBatches}`,
    `- Boards attempted: ${summary.TotalBoardsAttempted}`,
    `- Jobs fetched from logs: ${summary.TotalJobsFetched}`,
    `- Rows in latest public feed: ${summary.PublicFeedRows}`,
    `- Scale now: ${summary.ScaleNowCount}`,
    `- Sample more: ${summary.SampleMoreCount}`,
    `- Catalog-only for now: ${summary.CatalogOnlyForNowCount}`,
    "",
    "## ATS Table",
    "",
    table(["ATS", "Batches", "BoardsAttempted", "SuccessRate", "JobsFetched", "PublicRows", "Recommendation"], atsRows),
    "",
    "## Scale Recommendations",
    "",
    table(["ATS", "ScaleRecommendation", "Reason", "SuggestedNextBatchLimit", "SuggestedDelayMs"], recommendationRows),
    "",
    "## Notes",
    "",
    "Failures, empty boards, and skipped boards are logged and are not fatal. Workday, BambooHR, and iCIMS are expected to be messy best-effort sources for now.",
    "",
    "Rows and messy normalized data are preserved for Excel review. Health reports help decide what to scale next; they do not delete rows or make publication decisions.",
    "",
  ].join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const [batchIndexRows, fetchLogRows, publicRows, crawlQueueRows] = await Promise.all([
    readJsonIfExists(batchIndexPath, []),
    readAllFetchLogs(),
    readLargeJsonArrayIfExists(publicFeedPath, []),
    readJsonIfExists(crawlQueuePath, []),
  ]);

  await ensureDir(outputDir);

  const fetchHealthRows = buildFetchHealth(batchIndexRows, fetchLogRows);
  const publicHealthRows = buildPublicFeedHealth(publicRows);
  const catalogHealthRows = buildCatalogHealth(crawlQueueRows);
  const recommendationRows = buildRecommendations(fetchHealthRows, publicHealthRows);
  const summaryRows = [
    buildSummary(generatedAt, fetchHealthRows, publicHealthRows, catalogHealthRows, recommendationRows),
  ];

  await Promise.all([
    writeCsv(path.join(outputDir, "ats-health-summary.csv"), summaryHeaders, summaryRows),
    writeJsonFile(path.join(outputDir, "ats-health-summary.json"), summaryRows[0]),
    writeCsv(path.join(outputDir, "ats-fetch-health.csv"), fetchHealthHeaders, fetchHealthRows),
    writeJsonFile(path.join(outputDir, "ats-fetch-health.json"), fetchHealthRows),
    writeCsv(path.join(outputDir, "ats-public-feed-health.csv"), publicFeedHealthHeaders, publicHealthRows),
    writeJsonFile(path.join(outputDir, "ats-public-feed-health.json"), publicHealthRows),
    writeCsv(path.join(outputDir, "ats-catalog-health.csv"), catalogHealthHeaders, catalogHealthRows),
    writeJsonFile(path.join(outputDir, "ats-catalog-health.json"), catalogHealthRows),
    writeCsv(path.join(outputDir, "ats-scale-recommendations.csv"), recommendationHeaders, recommendationRows),
    writeJsonFile(path.join(outputDir, "ats-scale-recommendations.json"), recommendationRows),
    fs.writeFile(
      path.join(outputDir, "ats-health-report.md"),
      buildMarkdown(generatedAt, summaryRows[0], fetchHealthRows, publicHealthRows, recommendationRows),
      "utf8"
    ),
  ]);

  console.log("ATS health report complete.");
  console.log(`ATS represented: ${atsList.length}`);
  console.log(`Batches indexed: ${summaryRows[0].TotalBatches}`);
  console.log(`Boards attempted: ${summaryRows[0].TotalBoardsAttempted}`);
  console.log(`Public feed rows: ${summaryRows[0].PublicFeedRows}`);
  console.log("Scale recommendations:");
  for (const row of recommendationRows) {
    console.log(`- ${row.ATS}: ${row.ScaleRecommendation}`);
  }
  console.log("Output folder:");
  console.log(outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
