const fs = require("fs/promises");
const path = require("path");
const { buildCrawlQueue } = require("../lib/crawl-queue");
const { buildBoardCatalog } = require("../lib/board-registry");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const registryCandidatesPath = fromRoot(
  "data",
  "catalogs",
  "analysis",
  "company-registry-candidates.json"
);
const normalizedCatalogPath = fromRoot("data", "catalogs", "normalized", "ats-catalog-normalized.json");
const crawlDir = fromRoot("data", "catalogs", "crawl");

const outputPaths = {
  queueCsv: path.join(crawlDir, "crawl-queue.csv"),
  queueJson: path.join(crawlDir, "crawl-queue.json"),
  summaryJson: path.join(crawlDir, "crawl-summary.json"),
  summaryCsv: path.join(crawlDir, "crawl-summary.csv"),
  priorityBreakdownCsv: path.join(crawlDir, "crawl-priority-breakdown.csv"),
  highPrioritySampleCsv: path.join(crawlDir, "crawl-sample-high-priority.csv"),
  mediumPrioritySampleCsv: path.join(crawlDir, "crawl-sample-medium-priority.csv"),
  lowPrioritySampleCsv: path.join(crawlDir, "crawl-sample-low-priority.csv"),
  boardCatalogJson: path.join(crawlDir, "board-catalog.json"),
  boardCatalogCsv: path.join(crawlDir, "board-catalog.csv"),
};

const boardCatalogHeaders = [
  "BoardKey",
  "ATS",
  "CatalogSlug",
  "Company",
  "CompanyKey",
  "BoardURL",
  "FetchEligible",
  "CrawlPriority",
  "FetchSupportStatus",
  "CatalogSource",
  "GeneratedAt",
];

const queueHeaders = [
  "CompanyKey",
  "PreferredCompanyName",
  "ATSCount",
  "ATSList",
  "HasAshby",
  "HasGreenhouse",
  "HasLever",
  "HasWorkday",
  "HasBambooHR",
  "HasICIMS",
  "AshbySlug",
  "GreenhouseSlug",
  "LeverSlug",
  "WorkdaySlug",
  "BambooHRSlug",
  "ICIMSSlug",
  "AshbyURL",
  "GreenhouseURL",
  "LeverURL",
  "WorkdayURL",
  "BambooHRURL",
  "ICIMSURL",
  "BestATS",
  "BestFetchURL",
  "FetchSupportStatus",
  "FetchSupportReason",
  "EstimatedFetchURL",
  "CrawlReady",
  "CrawlStatus",
  "CrawlPriority",
  "Reason",
  "SkipReason",
  "MessyButExportable",
  "OriginalATSList",
  "UnavailableATSList",
  "AvailableATSList",
  "SourceRows",
  "GeneratedAt",
];

const summaryHeaders = [
  "GeneratedAt",
  "TotalRegistryCompanies",
  "CrawlReadyCount",
  "SkipCount",
  "HighPriorityCount",
  "MediumPriorityCount",
  "LowPriorityCount",
  "AshbyCount",
  "GreenhouseCount",
  "LeverCount",
  "WorkdayCount",
  "BambooHRCount",
  "ICIMSCount",
  "AshbyReady",
  "GreenhouseReady",
  "LeverReady",
  "WorkdayCatalogOnly",
  "BambooHRCatalogOnly",
  "ICIMSCatalogOnly",
  "CatalogOnlyCount",
  "MessyButExportableCount",
];

const priorityBreakdownHeaders = ["Priority", "Count"];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function writeCsv(filePath, headers, rows) {
  await writeTextFile(filePath, rowsToCsv(headers, rows));
}

async function main() {
  if (!(await fileExists(registryCandidatesPath))) {
    console.log("Company registry candidates file is missing.");
    console.log(`Expected: ${registryCandidatesPath}`);
    console.log("Run:");
    console.log("  npm run catalogs:analyze");
    process.exitCode = 1;
    return;
  }

  await ensureDir(crawlDir);

  const registryCandidates = await readJsonFile(registryCandidatesPath);
  if (!Array.isArray(registryCandidates)) {
    throw new Error("Company registry candidates JSON must be an array.");
  }

  const results = buildCrawlQueue(registryCandidates, new Date().toISOString());
  const normalizedRows = await readJsonFile(normalizedCatalogPath);
  if (!Array.isArray(normalizedRows) || normalizedRows.length === 0) {
    throw new Error("Normalized catalog JSON must be a non-empty array.");
  }
  const boardCatalog = buildBoardCatalog(normalizedRows, results.queueRows, new Date().toISOString());

  await writeCsv(outputPaths.queueCsv, queueHeaders, results.queueCsvRows);
  await writeJsonFile(outputPaths.queueJson, results.queueRows);
  await writeJsonFile(outputPaths.summaryJson, results.summary);
  await writeCsv(outputPaths.summaryCsv, summaryHeaders, results.summaryRows);
  await writeCsv(outputPaths.priorityBreakdownCsv, priorityBreakdownHeaders, results.priorityBreakdownRows);
  await writeCsv(outputPaths.highPrioritySampleCsv, queueHeaders, results.highPrioritySampleRows);
  await writeCsv(outputPaths.mediumPrioritySampleCsv, queueHeaders, results.mediumPrioritySampleRows);
  await writeCsv(outputPaths.lowPrioritySampleCsv, queueHeaders, results.lowPrioritySampleRows);
  await writeJsonFile(outputPaths.boardCatalogJson, boardCatalog);
  await writeCsv(outputPaths.boardCatalogCsv, boardCatalogHeaders, boardCatalog);

  console.log("Crawl queue complete.");
  console.log(`Total registry companies: ${results.summary.TotalRegistryCompanies}`);
  console.log(`Crawl ready: ${results.summary.CrawlReadyCount}`);
  console.log(`High priority: ${results.summary.HighPriorityCount}`);
  console.log(`Medium priority: ${results.summary.MediumPriorityCount}`);
  console.log(`Low priority: ${results.summary.LowPriorityCount}`);
  console.log(`Skip: ${results.summary.SkipCount}`);
  console.log(`Catalog-only: ${results.summary.CatalogOnlyCount}`);
  console.log(`Messy but exportable: ${results.summary.MessyButExportableCount}`);
  console.log(`Distinct ATS boards preserved: ${boardCatalog.length}`);
  console.log("Output folder:");
  console.log(crawlDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
