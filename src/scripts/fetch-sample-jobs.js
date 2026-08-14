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
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");
const {
  badRowsHeaders,
  bucketSummaryHeaders,
  buildJobExportArtifacts,
  duplicateSummaryHeaders,
  duplicatesHeaders,
  jobHeaders,
  publicFeedHeaders,
  qualitySummaryHeaders,
  remoteSummaryHeaders,
  salarySummaryHeaders,
  summaryHeaders,
  titleDiagnosticsHeaders,
  toCsvRows,
  toCsvTitleDiagnostics,
  unmatchedTitleHeaders,
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
const outputDir = fromRoot("data", "jobs", "sample");

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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
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

function getOutputPaths(ats) {
  return {
    jobsCsv: path.join(outputDir, `jobs-sample-${ats}.csv`),
    jobsJson: path.join(outputDir, `jobs-sample-${ats}.json`),
    summaryCsv: path.join(outputDir, "jobs-sample-summary.csv"),
    summaryJson: path.join(outputDir, "jobs-sample-summary.json"),
    fetchLogCsv: path.join(outputDir, "jobs-sample-fetch-log.csv"),
    fetchLogJson: path.join(outputDir, "jobs-sample-fetch-log.json"),
    titleDiagnosticsCsv: path.join(outputDir, "jobs-sample-title-diagnostics.csv"),
    titleDiagnosticsJson: path.join(outputDir, "jobs-sample-title-diagnostics.json"),
    unmatchedTitlesCsv: path.join(outputDir, "jobs-sample-unmatched-titles.csv"),
    titleBucketSummaryCsv: path.join(outputDir, "jobs-sample-title-bucket-summary.csv"),
    titleBucketSummaryJson: path.join(outputDir, "jobs-sample-title-bucket-summary.json"),
    publicFeedCsv: path.join(outputDir, "public-job-feed-sample.csv"),
    publicFeedJson: path.join(outputDir, "public-job-feed-sample.json"),
    remoteSummaryCsv: path.join(outputDir, "jobs-sample-remote-summary.csv"),
    remoteSummaryJson: path.join(outputDir, "jobs-sample-remote-summary.json"),
    salarySummaryCsv: path.join(outputDir, "jobs-sample-salary-summary.csv"),
    salarySummaryJson: path.join(outputDir, "jobs-sample-salary-summary.json"),
    qualitySummaryCsv: path.join(outputDir, "jobs-sample-quality-summary.csv"),
    qualitySummaryJson: path.join(outputDir, "jobs-sample-quality-summary.json"),
    writerFitSummaryCsv: path.join(outputDir, "jobs-sample-writer-fit-summary.csv"),
    writerFitSummaryJson: path.join(outputDir, "jobs-sample-writer-fit-summary.json"),
    duplicateSummaryCsv: path.join(outputDir, "jobs-sample-duplicate-summary.csv"),
    duplicateSummaryJson: path.join(outputDir, "jobs-sample-duplicate-summary.json"),
    duplicatesCsv: path.join(outputDir, "jobs-sample-duplicates.csv"),
    badRowsCsv: path.join(outputDir, "jobs-sample-bad-rows.csv"),
  };
}

function getCandidateRows(crawlQueue, ats, limit, offset) {
  if (!supportedAts.includes(ats)) {
    return [];
  }

  if (ats === "ashby") {
    return crawlQueue
      .filter((row) => row.CrawlReady && (row.HasAshby || row.BestATS === "Ashby") && getAshbySlug(row))
      .slice(offset, offset + limit);
  }

  if (bestEffortAts.has(ats)) {
    return crawlQueue
      .filter((row) => hasAtsData(row, ats) && getAtsSlug(row, ats))
      .slice(offset, offset + limit);
  }

  return crawlQueue
    .filter(
      (row) =>
        row.CrawlReady &&
        String(row.BestATS || "").toLowerCase() === ats &&
        getAtsSlug(row, ats)
    )
    .slice(offset, offset + limit);
}

async function fetchSampleRows(rows, ats, titleRecords) {
  const jobRows = [];
  const fetchLogRows = [];

  for (const row of rows) {
    const fetchedAt = new Date().toISOString();
    const slug = getAtsSlug(row, ats);
    const fetchUrl = getAtsFetchUrl(ats, slug, row);
    const boardUrl = slug ? getAtsBoardUrl(row, ats, slug) : row.BestFetchURL || "";

    console.log(`${ats}: ${row.PreferredCompanyName} (${slug})`);

    if (!slug) {
      fetchLogRows.push({
        ATS: ats,
        Company: row.PreferredCompanyName || "",
        CompanyKey: row.CompanyKey || "",
        CatalogSlug: "",
        BoardURL: boardUrl,
        FetchURL: "",
        FetchEndpoint: "",
        Status: "skipped",
        HttpStatus: "",
        JobCount: 0,
        Error: `Missing ${ats} slug`,
        FetchedAt: fetchedAt,
      });
      continue;
    }

    if (!fetchUrl) {
      const errorMessage = `No usable ${ats} fetch URL`;
      fetchLogRows.push({
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
        FetchedAt: fetchedAt,
      });
      console.log(`  skipped: ${errorMessage}`);
      continue;
    }

    try {
      const result = await fetchAtsBoard(ats, slug, row);
      const jobs = result.jobs;
      const status = jobs.length > 0 ? "success" : "empty";

      for (const job of jobs) {
        jobRows.push(
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
      }

      fetchLogRows.push({
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
        FetchedAt: fetchedAt,
      });

      console.log(`  ${status}: ${jobs.length} jobs`);
    } catch (error) {
      fetchLogRows.push({
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
        FetchedAt: fetchedAt,
      });

      console.log(`  failed: ${error.message}`);
    }
  }

  return {
    jobRows,
    fetchLogRows,
  };
}

async function writeOutputs(outputPaths, artifacts) {
  await writeCsv(outputPaths.jobsCsv, jobHeaders, toCsvRows(artifacts.jobRows));
  await writeJsonFile(outputPaths.jobsJson, artifacts.jobRows);
  await writeCsv(outputPaths.summaryCsv, summaryHeaders, [artifacts.summary]);
  await writeJsonFile(outputPaths.summaryJson, artifacts.summary);
  await writeCsv(outputPaths.fetchLogCsv, fetchLogHeaders, artifacts.fetchLogRows);
  await writeJsonFile(outputPaths.fetchLogJson, artifacts.fetchLogRows);
  await writeCsv(
    outputPaths.titleDiagnosticsCsv,
    titleDiagnosticsHeaders,
    toCsvTitleDiagnostics(artifacts.titleDiagnosticsRows)
  );
  await writeJsonFile(outputPaths.titleDiagnosticsJson, artifacts.titleDiagnosticsRows);
  await writeCsv(outputPaths.unmatchedTitlesCsv, unmatchedTitleHeaders, artifacts.unmatchedTitleRows);
  await writeCsv(outputPaths.titleBucketSummaryCsv, bucketSummaryHeaders, artifacts.bucketSummaryRows);
  await writeJsonFile(outputPaths.titleBucketSummaryJson, artifacts.bucketSummaryRows);
  await writeCsv(outputPaths.publicFeedCsv, publicFeedHeaders, toCsvRows(artifacts.publicFeedRows));
  await writeJsonFile(outputPaths.publicFeedJson, artifacts.publicFeedRows);
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
  const limit = Number.parseInt(getArgValue("--limit", "25"), 10);
  const offset = Number.parseInt(getArgValue("--offset", "0"), 10);

  if (!supportedAts.includes(ats)) {
    console.log("Only Ashby, Greenhouse, Lever, Workday, BambooHR, and iCIMS sample fetching are supported right now.");
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

  await ensureDir(outputDir);

  const crawlQueue = await readJsonFile(crawlQueuePath);
  const titleRecords = await readJobTitles(jobTitlesPath);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 25;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const rows = getCandidateRows(crawlQueue, ats, safeLimit, safeOffset);
  const generatedAt = new Date().toISOString();
  const outputPaths = getOutputPaths(ats);

  console.log(`Fetching sample jobs for ${ats} boards...`);
  console.log(`Board limit: ${rows.length}`);
  console.log(`Board offset: ${safeOffset}`);

  const results = await fetchSampleRows(rows, ats, titleRecords);
  const artifacts = buildJobExportArtifacts(
    results.jobRows,
    results.fetchLogRows,
    titleRecords,
    generatedAt
  );
  artifacts.fetchLogRows = results.fetchLogRows;

  await writeOutputs(outputPaths, artifacts);

  console.log("\nSample job fetch complete.");
  console.log(`Boards attempted: ${artifacts.summary.BoardsAttempted}`);
  console.log(`Boards succeeded: ${artifacts.summary.BoardsSucceeded}`);
  console.log(`Boards failed: ${artifacts.summary.BoardsFailed}`);
  console.log(`Boards empty: ${artifacts.summary.BoardsEmpty}`);
  console.log(`Jobs fetched: ${artifacts.summary.JobsFetched}`);
  console.log(`Jobs with title match: ${artifacts.summary.JobsWithTitleMatch}`);
  console.log(`Possible or stronger buckets: ${artifacts.summary.StrongMatchCount + artifacts.summary.PossibleMatchCount}`);
  console.log(`Adjacent bucket: ${artifacts.summary.AdjacentCount}`);
  console.log(`Remote jobs: ${artifacts.summary.RemoteCount}`);
  console.log(`Salary detected: ${artifacts.summary.SalaryDetectedCount}`);
  console.log(`Possible duplicates: ${artifacts.summary.PossibleDuplicateCount}`);
  console.log(`Writer Fit A/B/C: ${artifacts.summary.WriterFitACount + artifacts.summary.WriterFitBCount + artifacts.summary.WriterFitCCount}`);
  console.log(`Export bad rows: ${artifacts.summary.ExportBadRowCount}`);
  console.log(`Unique job titles: ${artifacts.summary.UniqueJobTitles}`);
  console.log(`Unmatched unique job titles: ${artifacts.summary.UnmatchedUniqueJobTitles}`);
  console.log("Output folder:");
  console.log(outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
