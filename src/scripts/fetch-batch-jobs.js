const fs = require("fs/promises");
const path = require("path");
const { fetchAshbyBoard, getAshbyFetchUrl, getAshbySlugFromUrl } = require("../lib/ats/ashby");
const {
  fetchGreenhouseBoard,
  getGreenhouseFetchUrl,
  getGreenhouseSlugFromUrl,
} = require("../lib/ats/greenhouse");
const { fetchLeverBoard, getLeverFetchUrl, getLeverSlugFromUrl } = require("../lib/ats/lever");
const {
  fetchWorkdayBoard,
  getWorkdayBoardUrl,
  getWorkdayFetchUrl,
  getWorkdaySlugFromUrl,
} = require("../lib/ats/workday");
const {
  fetchBambooHRBoard,
  getBambooHRBoardUrl,
  getBambooHRFetchUrl,
  getBambooHRSlugFromUrl,
} = require("../lib/ats/bamboohr");
const {
  fetchICIMSBoard,
  getICIMSBoardUrl,
  getICIMSFetchUrl,
  getICIMSSlugFromUrl,
} = require("../lib/ats/icims");
const { rowsToCsv } = require("../lib/csv");
const { classifyFetchError } = require("../lib/ats-error-classification");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");
const {
  badRowsHeaders,
  bucketSummaryHeaders,
  buildJobExportArtifacts,
  duplicateSummaryHeaders,
  duplicatesHeaders,
  publicFeedHeaders,
  qualitySummaryHeaders,
  remoteSummaryHeaders,
  salarySummaryHeaders,
  summaryHeaders,
  toCsvRows,
  writerFitSummaryHeaders,
} = require("../lib/job-export");
const { readJobTitles } = require("../lib/job-titles");
const {
  normalizeAshbyJob,
  normalizeBambooHRJob,
  normalizeGreenhouseJob,
  normalizeICIMSJob,
  normalizeLeverJob,
  normalizeWorkdayJob,
} = require("../lib/jobs-normalize");

const crawlQueuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const jobTitlesPath = fromRoot("data", "config", "job-titles.md");
const defaultBatchesRoot = fromRoot("data", "jobs", "batches");

const fetchLogHeaders = [
  "ATS",
  "Company",
  "CompanyKey",
  "CatalogSlug",
  "BoardURL",
  "FetchURL",
  "FetchEndpoint",
  "Status",
  "HttpStatus",
  "JobCount",
  "Error",
  "ErrorClass",
  "FetchedAt",
];

const supportedAts = ["ashby", "greenhouse", "lever", "workday", "bamboohr", "icims"];
const bestEffortAts = new Set(["workday", "bamboohr", "icims"]);

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function resolveOutputRoot(value) {
  if (!value) {
    return defaultBatchesRoot;
  }

  return path.resolve(fromRoot(), value);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function parsePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function writeCsv(filePath, headers, rows) {
  await fs.writeFile(filePath, rowsToCsv(headers, rows), "utf8");
}

function getAshbySlug(row) {
  return (
    row.AshbySlug ||
    getAshbySlugFromUrl(row.AshbyURL) ||
    (row.BestATS === "Ashby" ? getAshbySlugFromUrl(row.BestFetchURL) : "")
  );
}

function getGreenhouseSlug(row) {
  return (
    row.GreenhouseSlug ||
    getGreenhouseSlugFromUrl(row.GreenhouseURL) ||
    (String(row.BestATS || "").toLowerCase() === "greenhouse" ? getGreenhouseSlugFromUrl(row.BestFetchURL) : "")
  );
}

function getLeverSlug(row) {
  return (
    row.LeverSlug ||
    getLeverSlugFromUrl(row.LeverURL) ||
    (String(row.BestATS || "").toLowerCase() === "lever" ? getLeverSlugFromUrl(row.BestFetchURL) : "")
  );
}

function getWorkdaySlug(row) {
  return (
    row.WorkdaySlug ||
    getWorkdaySlugFromUrl(row.WorkdayURL) ||
    (String(row.BestATS || "").toLowerCase() === "workday" ? getWorkdaySlugFromUrl(row.BestFetchURL) : "")
  );
}

function getBambooHRSlug(row) {
  return (
    row.BambooHRSlug ||
    getBambooHRSlugFromUrl(row.BambooHRURL) ||
    (String(row.BestATS || "").toLowerCase() === "bamboohr" ? getBambooHRSlugFromUrl(row.BestFetchURL) : "")
  );
}

function getICIMSSlug(row) {
  return (
    row.ICIMSSlug ||
    getICIMSSlugFromUrl(row.ICIMSURL) ||
    (String(row.BestATS || "").toLowerCase() === "icims" ? getICIMSSlugFromUrl(row.BestFetchURL) : "")
  );
}

function getAtsSlug(row, ats) {
  if (ats === "ashby") {
    return getAshbySlug(row);
  }

  if (ats === "greenhouse") {
    return getGreenhouseSlug(row);
  }

  if (ats === "lever") {
    return getLeverSlug(row);
  }

  if (ats === "workday") {
    return getWorkdaySlug(row);
  }

  if (ats === "bamboohr") {
    return getBambooHRSlug(row);
  }

  if (ats === "icims") {
    return getICIMSSlug(row);
  }

  return "";
}

function getAshbyBoardUrl(row, slug) {
  return row.AshbyURL || `https://jobs.ashbyhq.com/${slug}`;
}

function getGreenhouseBoardUrl(row, slug) {
  return row.GreenhouseURL || `https://job-boards.greenhouse.io/${slug}`;
}

function getLeverBoardUrl(row, slug) {
  return row.LeverURL || `https://jobs.lever.co/${slug}`;
}

function getAtsSourceUrl(row, ats) {
  if (ats === "workday") return row.WorkdayURL || "";
  if (ats === "bamboohr") return row.BambooHRURL || "";
  if (ats === "icims") return row.ICIMSURL || "";
  return "";
}

function getAtsBoardUrl(row, ats, slug) {
  if (ats === "ashby") {
    return getAshbyBoardUrl(row, slug);
  }

  if (ats === "greenhouse") {
    return getGreenhouseBoardUrl(row, slug);
  }

  if (ats === "lever") {
    return getLeverBoardUrl(row, slug);
  }

  if (ats === "workday") {
    return getWorkdayBoardUrl(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "bamboohr") {
    return getBambooHRBoardUrl(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "icims") {
    return getICIMSBoardUrl(slug, getAtsSourceUrl(row, ats));
  }

  return "";
}

function getAtsFetchUrl(ats, slug, row = {}) {
  if (ats === "ashby") {
    return getAshbyFetchUrl(slug);
  }

  if (ats === "greenhouse") {
    return getGreenhouseFetchUrl(slug);
  }

  if (ats === "lever") {
    return getLeverFetchUrl(slug);
  }

  if (ats === "workday") {
    return getWorkdayFetchUrl(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "bamboohr") {
    return getBambooHRFetchUrl(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "icims") {
    return getICIMSFetchUrl(slug, getAtsSourceUrl(row, ats));
  }

  return "";
}

async function fetchAtsBoard(ats, slug, row = {}) {
  if (ats === "ashby") {
    return fetchAshbyBoard(slug);
  }

  if (ats === "greenhouse") {
    return fetchGreenhouseBoard(slug);
  }

  if (ats === "lever") {
    return fetchLeverBoard(slug);
  }

  if (ats === "workday") {
    return fetchWorkdayBoard(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "bamboohr") {
    return fetchBambooHRBoard(slug, getAtsSourceUrl(row, ats));
  }

  if (ats === "icims") {
    return fetchICIMSBoard(slug, getAtsSourceUrl(row, ats));
  }

  throw new Error(`Unsupported ATS: ${ats}`);
}

function normalizeAtsJob(ats, job, context, titleRecords) {
  if (ats === "ashby") {
    return normalizeAshbyJob(job, context, titleRecords);
  }

  if (ats === "greenhouse") {
    return normalizeGreenhouseJob(job, context, titleRecords);
  }

  if (ats === "lever") {
    return normalizeLeverJob(job, context, titleRecords);
  }

  if (ats === "workday") {
    return normalizeWorkdayJob(job, context, titleRecords);
  }

  if (ats === "bamboohr") {
    return normalizeBambooHRJob(job, context, titleRecords);
  }

  if (ats === "icims") {
    return normalizeICIMSJob(job, context, titleRecords);
  }

  throw new Error(`Unsupported ATS: ${ats}`);
}

function hasAtsData(row, ats) {
  if (ats === "ashby") return row.HasAshby || Boolean(row.AshbySlug || row.AshbyURL);
  if (ats === "greenhouse") return row.HasGreenhouse || Boolean(row.GreenhouseSlug || row.GreenhouseURL);
  if (ats === "lever") return row.HasLever || Boolean(row.LeverSlug || row.LeverURL);
  if (ats === "workday") return row.HasWorkday || Boolean(row.WorkdaySlug || row.WorkdayURL);
  if (ats === "bamboohr") return row.HasBambooHR || Boolean(row.BambooHRSlug || row.BambooHRURL);
  if (ats === "icims") return row.HasICIMS || Boolean(row.ICIMSSlug || row.ICIMSURL);
  return false;
}

function getDefaultBatchName(ats, priority, offset, limit) {
  return `${ats}-${priority.toLowerCase()}-${String(offset).padStart(4, "0")}-${limit}`;
}

function getOutputPaths(batchDir) {
  return {
    publicFeedCsv: path.join(batchDir, "public-job-feed-batch.csv"),
    publicFeedJson: path.join(batchDir, "public-job-feed-batch.json"),
    summaryCsv: path.join(batchDir, "jobs-batch-summary.csv"),
    summaryJson: path.join(batchDir, "jobs-batch-summary.json"),
    fetchLogCsv: path.join(batchDir, "jobs-batch-fetch-log.csv"),
    fetchLogJson: path.join(batchDir, "jobs-batch-fetch-log.json"),
    titleBucketSummaryCsv: path.join(batchDir, "jobs-batch-title-bucket-summary.csv"),
    titleBucketSummaryJson: path.join(batchDir, "jobs-batch-title-bucket-summary.json"),
    remoteSummaryCsv: path.join(batchDir, "jobs-batch-remote-summary.csv"),
    remoteSummaryJson: path.join(batchDir, "jobs-batch-remote-summary.json"),
    salarySummaryCsv: path.join(batchDir, "jobs-batch-salary-summary.csv"),
    salarySummaryJson: path.join(batchDir, "jobs-batch-salary-summary.json"),
    qualitySummaryCsv: path.join(batchDir, "jobs-batch-quality-summary.csv"),
    qualitySummaryJson: path.join(batchDir, "jobs-batch-quality-summary.json"),
    writerFitSummaryCsv: path.join(batchDir, "jobs-batch-writer-fit-summary.csv"),
    writerFitSummaryJson: path.join(batchDir, "jobs-batch-writer-fit-summary.json"),
    duplicateSummaryCsv: path.join(batchDir, "jobs-batch-duplicate-summary.csv"),
    duplicateSummaryJson: path.join(batchDir, "jobs-batch-duplicate-summary.json"),
    duplicatesCsv: path.join(batchDir, "jobs-batch-duplicates.csv"),
    badRowsCsv: path.join(batchDir, "jobs-batch-bad-rows.csv"),
  };
}

function getCandidateRows(crawlQueue, ats, priority, limit, offset) {
  const bestAts = ats.toLowerCase();
  return crawlQueue
    .filter((row) => {
      if (!supportedAts.includes(bestAts)) {
        return false;
      }

      return (
        (bestEffortAts.has(bestAts)
          ? hasAtsData(row, bestAts)
          : String(row.BestATS || "").toLowerCase() === bestAts) &&
        String(row.CrawlPriority || "").toUpperCase() === priority &&
        (bestEffortAts.has(bestAts) || row.CrawlReady === true) &&
        getAtsSlug(row, bestAts)
      );
    })
    .slice(offset, offset + limit);
}

function getAttemptedSlugs(fetchLogRows) {
  const terminalStatuses = new Set(["success", "empty", "failed", "skipped"]);
  return new Set(
    fetchLogRows
      .filter((row) => terminalStatuses.has(String(row.Status || "").toLowerCase()))
      .map((row) => row.CatalogSlug)
      .filter(Boolean)
  );
}

function mergeFetchLogs(existingRows, newRows) {
  const bySlug = new Map();

  for (const row of [...existingRows, ...newRows]) {
    if (row.CatalogSlug) {
      bySlug.set(row.CatalogSlug, {
        ...row,
        FetchEndpoint: row.FetchEndpoint || row.FetchURL || "",
      });
    }
  }

  return Array.from(bySlug.values());
}

function mergeJobs(existingRows, newRows) {
  const byKey = new Map();

  for (const row of [...existingRows, ...newRows]) {
    const key = row.JobKey || `${row.ATS}:${row.RawJobId || row.URL || row.CompanyKey}:${row.Title}`;
    byKey.set(key, row);
  }

  return Array.from(byKey.values());
}

async function fetchOneAtsRow(row, ats, titleRecords) {
  const fetchedAt = new Date().toISOString();
  const slug = getAtsSlug(row, ats);
  const fetchUrl = getAtsFetchUrl(ats, slug, row);
  const boardUrl = getAtsBoardUrl(row, ats, slug);

  if (!fetchUrl) {
    const errorMessage = `No usable ${ats} fetch URL`;
    return {
      jobRows: [],
      fetchLogRow: {
        ATS: ats,
        Company: row.PreferredCompanyName || "",
        CompanyKey: row.CompanyKey || "",
        CatalogSlug: slug,
        BoardURL: boardUrl,
        FetchURL: "",
        FetchEndpoint: "",
        Status: "skipped",
        HttpStatus: "",
        JobCount: 0,
        Error: errorMessage,
        ErrorClass: "NO_USABLE_URL",
        FetchedAt: fetchedAt,
      },
    };
  }

  try {
    const result = await fetchAtsBoard(ats, slug, row);
    const jobs = result.jobs;
    const status = jobs.length > 0 ? "success" : "empty";
    const jobRows = jobs.map((job) =>
      normalizeAtsJob(
        ats,
        job,
        {
          company: row.PreferredCompanyName || "",
          companyKey: row.CompanyKey || "",
          catalogSlug: slug,
          boardUrl,
          fetchUrl: result.fetchUrl,
          fetchedAt,
        },
        titleRecords
      )
    );

    return {
      jobRows,
      fetchLogRow: {
        ATS: ats,
        Company: row.PreferredCompanyName || "",
        CompanyKey: row.CompanyKey || "",
        CatalogSlug: slug,
        BoardURL: boardUrl,
        FetchURL: result.fetchUrl,
        FetchEndpoint: result.fetchUrl,
        Status: status,
        HttpStatus: result.httpStatus,
        JobCount: jobs.length,
        Error: "",
        ErrorClass: "",
        FetchedAt: fetchedAt,
      },
    };
  } catch (error) {
    return {
      jobRows: [],
      fetchLogRow: {
        ATS: ats,
        Company: row.PreferredCompanyName || "",
        CompanyKey: row.CompanyKey || "",
        CatalogSlug: slug,
        BoardURL: boardUrl,
        FetchURL: fetchUrl,
        FetchEndpoint: fetchUrl,
        Status: "failed",
        HttpStatus: error.status || "",
        JobCount: 0,
        Error: error.message,
        ErrorClass: classifyFetchError(ats, error),
        FetchedAt: fetchedAt,
      },
    };
  }
}

function printProgress(progress) {
  console.log(
    `Progress: ${progress.completed}/${progress.total} complete, ` +
      `success ${progress.success}, failed ${progress.failed}, empty ${progress.empty}, skipped ${progress.skipped}, ` +
      `jobs fetched ${progress.jobsFetched}`
  );
}

async function fetchAtsRows(rows, ats, titleRecords, delayMs, concurrency, options = {}) {
  const results = new Array(rows.length);
  const progress = {
    total: rows.length,
    completed: 0,
    success: 0,
    failed: 0,
    empty: 0,
    skipped: 0,
    jobsFetched: 0,
  };
  let nextIndex = 0;

  async function worker(workerId) {
    while (nextIndex < rows.length) {
      if (options.deadlineAt && Date.now() >= options.deadlineAt) {
        console.log(`Worker ${workerId}: time budget reached; leaving remaining boards for the next run.`);
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      const row = rows[index];
      const slug = getAtsSlug(row, ats);

      console.log(`Worker ${workerId}: ${ats}: ${row.PreferredCompanyName} (${slug})`);
      const result = await fetchOneAtsRow(row, ats, titleRecords);
      results[index] = result;

      const status = result.fetchLogRow.Status;
      progress.completed += 1;
      progress.jobsFetched += result.jobRows.length;
      if (status === "success") progress.success += 1;
      if (status === "failed") progress.failed += 1;
      if (status === "empty") progress.empty += 1;
      if (status === "skipped") progress.skipped += 1;

      if (status === "failed") {
        console.log(`Worker ${workerId}: failed: ${result.fetchLogRow.Error}`);
      } else if (status === "skipped") {
        console.log(`Worker ${workerId}: skipped: ${result.fetchLogRow.Error}`);
      } else {
        console.log(`Worker ${workerId}: ${status}: ${result.jobRows.length} jobs`);
      }
      printProgress(progress);

      if (delayMs > 0 && nextIndex < rows.length) {
        await sleep(delayMs);
      }
    }
  }

  const workerCount = Math.min(concurrency, rows.length);
  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));

  const orderedResults = results.filter(Boolean);
  return {
    jobRows: orderedResults.flatMap((result) => result.jobRows),
    fetchLogRows: orderedResults.map((result) => result.fetchLogRow),
  };
}

async function writeBatchOutputs(outputPaths, artifacts, { includePublicFeedCsv = false } = {}) {
  if (includePublicFeedCsv) {
    await writeCsv(outputPaths.publicFeedCsv, publicFeedHeaders, toCsvRows(artifacts.publicFeedRows));
  }
  await writeJsonFile(outputPaths.publicFeedJson, artifacts.publicFeedRows);
  await writeCsv(outputPaths.summaryCsv, summaryHeaders, [artifacts.summary]);
  await writeJsonFile(outputPaths.summaryJson, artifacts.summary);
  await writeCsv(outputPaths.fetchLogCsv, fetchLogHeaders, artifacts.fetchLogRows);
  await writeJsonFile(outputPaths.fetchLogJson, artifacts.fetchLogRows);
  await writeCsv(outputPaths.titleBucketSummaryCsv, bucketSummaryHeaders, artifacts.bucketSummaryRows);
  await writeJsonFile(outputPaths.titleBucketSummaryJson, artifacts.bucketSummaryRows);
  await writeCsv(outputPaths.remoteSummaryCsv, remoteSummaryHeaders, artifacts.remoteSummaryRows);
  await writeJsonFile(outputPaths.remoteSummaryJson, artifacts.remoteSummaryRows);
  await writeCsv(outputPaths.salarySummaryCsv, salarySummaryHeaders, artifacts.salarySummaryRows);
  await writeJsonFile(outputPaths.salarySummaryJson, artifacts.salarySummaryRows);
  await writeCsv(outputPaths.qualitySummaryCsv, qualitySummaryHeaders, artifacts.qualitySummaryRows);
  await writeJsonFile(outputPaths.qualitySummaryJson, artifacts.qualitySummaryRows);
  await writeCsv(outputPaths.writerFitSummaryCsv, writerFitSummaryHeaders, artifacts.writerFitSummaryRows);
  await writeJsonFile(outputPaths.writerFitSummaryJson, artifacts.writerFitSummaryRows);
  await writeCsv(outputPaths.duplicateSummaryCsv, duplicateSummaryHeaders, [artifacts.duplicateSummary]);
  await writeJsonFile(outputPaths.duplicateSummaryJson, artifacts.duplicateSummary);
  await writeCsv(outputPaths.duplicatesCsv, duplicatesHeaders, artifacts.duplicateRows);
  await writeCsv(outputPaths.badRowsCsv, badRowsHeaders, artifacts.badRows);
}

async function main() {
  const ats = getArgValue("--ats", "ashby").toLowerCase();
  const priority = getArgValue("--priority", "HIGH").toUpperCase();
  const limit = Number.parseInt(getArgValue("--limit", "500"), 10);
  const offset = Number.parseInt(getArgValue("--offset", "0"), 10);
  const delayMs = Number.parseInt(getArgValue("--delay-ms", "250"), 10);
  const requestedConcurrency = parsePositiveInteger(getArgValue("--concurrency", "3"), 3);
  const resume = parseBoolean(getArgValue("--resume", "true"), true);
  const includePublicFeedCsv = parseBoolean(getArgValue("--include-batch-csv", "false"), false);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 500;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const safeDelayMs = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 250;
  const safeConcurrency = Math.min(requestedConcurrency, 10);
  const batchName = getArgValue("--batch-name", getDefaultBatchName(ats, priority, safeOffset, safeLimit));
  const batchesRoot = resolveOutputRoot(getArgValue("--output-root", ""));
  const batchDir = path.join(batchesRoot, batchName);
  const outputPaths = getOutputPaths(batchDir);

  if (requestedConcurrency > 10) {
    console.log(`Requested concurrency ${requestedConcurrency} is above the maximum of 10. Using 10.`);
  }

  if (!supportedAts.includes(ats)) {
    console.log("Only Ashby, Greenhouse, Lever, Workday, BambooHR, and iCIMS batch fetching are supported right now.");
    process.exitCode = 1;
    return;
  }

  if (!(await fileExists(crawlQueuePath))) {
    console.log("Crawl queue file is missing.");
    console.log(`Expected: ${crawlQueuePath}`);
    console.log("Run:");
    console.log("  npm run catalogs:crawl-queue");
    process.exitCode = 1;
    return;
  }

  await ensureDir(batchDir);

  const crawlQueue = await readJsonFile(crawlQueuePath);
  const titleRecords = await readJobTitles(jobTitlesPath);
  const selectedRows = getCandidateRows(crawlQueue, ats, priority, safeLimit, safeOffset);
  const existingFetchLogRows = resume ? await readJsonIfExists(outputPaths.fetchLogJson, []) : [];
  const existingJobRows = resume ? await readJsonIfExists(outputPaths.publicFeedJson, []) : [];
  const attemptedSlugs = getAttemptedSlugs(existingFetchLogRows);
  const rowsToFetch = selectedRows.filter((row) => !attemptedSlugs.has(getAtsSlug(row, ats)));
  const skippedDueToResume = selectedRows.length - rowsToFetch.length;

  console.log(`Batch name: ${batchName}`);
  console.log(`ATS: ${ats}`);
  console.log(`Priority: ${priority}`);
  console.log(`Offset: ${safeOffset}`);
  console.log(`Limit: ${safeLimit}`);
  console.log(`Delay ms: ${safeDelayMs}`);
  console.log(`Concurrency: ${safeConcurrency}`);
  console.log(`Output root: ${batchesRoot}`);
  console.log(`Boards selected: ${selectedRows.length}`);
  console.log(`Boards skipped due to resume: ${skippedDueToResume}`);
  console.log(`Boards attempted this run: ${rowsToFetch.length}`);

  const runResults = await fetchAtsRows(rowsToFetch, ats, titleRecords, safeDelayMs, safeConcurrency);
  const mergedFetchLogRows = mergeFetchLogs(existingFetchLogRows, runResults.fetchLogRows);
  const mergedRawJobRows = mergeJobs(existingJobRows, runResults.jobRows);
  const generatedAt = new Date().toISOString();
  const artifacts = buildJobExportArtifacts(mergedRawJobRows, mergedFetchLogRows, titleRecords, generatedAt);
  artifacts.fetchLogRows = mergedFetchLogRows;

  await writeBatchOutputs(outputPaths, artifacts, { includePublicFeedCsv });

  console.log("\nBatch fetch complete.");
  console.log(`Batch name: ${batchName}`);
  console.log(`ATS: ${ats}`);
  console.log(`Priority: ${priority}`);
  console.log(`Offset: ${safeOffset}`);
  console.log(`Limit: ${safeLimit}`);
  console.log(`Delay ms: ${safeDelayMs}`);
  console.log(`Concurrency: ${safeConcurrency}`);
  console.log(`Output root: ${batchesRoot}`);
  console.log(`Boards selected: ${selectedRows.length}`);
  console.log(`Boards skipped due to resume: ${skippedDueToResume}`);
  console.log(`Boards attempted this run: ${rowsToFetch.length}`);
  console.log(`Jobs fetched this run: ${runResults.jobRows.length}`);
  console.log(`Total jobs in batch output: ${artifacts.jobRows.length}`);
  console.log("Output folder:");
  console.log(batchDir);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchAtsRows,
  fetchLogHeaders,
  getAtsSlug,
  getOutputPaths,
  mergeFetchLogs,
  mergeJobs,
  writeBatchOutputs,
};
