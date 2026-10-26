const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv, writeLargeCsvFile } = require("../lib/csv");
const {
  ensureDir,
  fromRoot,
  readJsonFile,
  writeJsonFile,
  writeJsonObjectFile,
  writeTextFile,
  writeLargeJsonArrayFile,
} = require("../lib/files");
const {
  bucketSummaryHeaders,
  buildJobExportArtifacts,
  duplicateSummaryHeaders,
  duplicatesHeaders,
  formatCsvValue,
  publicFeedHeaders,
  qualitySummaryHeaders,
  remoteSummaryHeaders,
  salarySummaryHeaders,
  writerFitSummaryHeaders,
} = require("../lib/job-export");
const { normalizeTitle, readJobTitles } = require("../lib/job-titles");
const { loadCuratedSubmissionRows } = require("../lib/curated-submissions");
const { isUsableBoardState } = require("../lib/batch-history");

const batchIndexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const boardStatePath = fromRoot("data", "jobs", "index", "board-latest-fetch.json");
const mergedRoot = fromRoot("data", "jobs", "merged");
const publicRoot = fromRoot("data", "jobs", "public");
const jobTitlesPath = fromRoot("data", "config", "job-titles.md");
const supportedAts = ["ashby", "greenhouse", "lever", "workday", "bamboohr", "icims"];

const mergedSummaryHeaders = [
  "GeneratedAt",
  "ATS",
  "SupportedATS",
  "ATSIncluded",
  "BatchCount",
  "TotalRows",
  "UniqueCompanies",
  "UniqueTitles",
  "ExportOKCount",
  "ExportReviewCount",
  "ExportBadRowCount",
  "PossibleDuplicateCount",
  "DuplicateGroupCount",
  "StrongMatchCount",
  "PossibleMatchCount",
  "AdjacentCount",
  "LowSignalCount",
  "IgnoreForNowCount",
  "RemoteCount",
  "HybridCount",
  "OnsiteCount",
  "UnknownRemoteStatusCount",
  "USRemoteEligibleTrueCount",
  "SalaryDetectedCount",
  "WriterFitACount",
  "WriterFitBCount",
  "WriterFitCCount",
  "WriterFitDCount",
  "WriterFitFCount",
  "AverageWriterFitScore",
  "MaxWriterFitScore",
  "WriterFitGuardrailAppliedCount",
  "WriterFitPenaltyAppliedCount",
  "DemotedHighScoreCount",
];

const mergedPublicFeedHeaders = [
  "SourceBatch",
  "SourceATSCount",
  "CrossATSDuplicate",
  "CrossATSDuplicateATSList",
  ...publicFeedHeaders,
];
const mergedDuplicatesHeaders = [
  "SourceBatch",
  "SourceATSCount",
  "CrossATSDuplicate",
  "CrossATSDuplicateATSList",
  ...duplicatesHeaders,
];
const atsSummaryHeaders = [
  "ATS",
  "Rows",
  "UniqueCompanies",
  "UniqueTitles",
  "ExportOKCount",
  "ExportReviewCount",
  "ExportBadRowCount",
  "WriterFitACount",
  "WriterFitBCount",
  "WriterFitCCount",
  "WriterFitDCount",
  "WriterFitFCount",
  "RemoteCount",
  "USRemoteEligibleTrueCount",
  "SalaryDetectedCount",
  "PossibleDuplicateCount",
  "CrossATSDuplicateCount",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function timestampForName() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function selectRows(headers, rows) {
  return rows.map((row) => {
    const selected = {};

    for (const header of headers) {
      selected[header] = row[header];
    }

    return selected;
  });
}

function selectRow(headers, row) {
  const selected = {};

  for (const header of headers) {
    selected[header] = row[header];
  }

  return selected;
}

function getOutputPaths(outputDir) {
  return {
    publicFeedCsv: path.join(outputDir, "public-job-feed-merged.csv"),
    publicFeedJson: path.join(outputDir, "public-job-feed-merged.json"),
    summaryCsv: path.join(outputDir, "public-job-feed-merged-summary.csv"),
    summaryJson: path.join(outputDir, "public-job-feed-merged-summary.json"),
    duplicatesCsv: path.join(outputDir, "public-job-feed-merged-duplicates.csv"),
    qualitySummaryCsv: path.join(outputDir, "public-job-feed-merged-quality-summary.csv"),
    qualitySummaryJson: path.join(outputDir, "public-job-feed-merged-quality-summary.json"),
    titleBucketSummaryCsv: path.join(outputDir, "public-job-feed-merged-title-bucket-summary.csv"),
    titleBucketSummaryJson: path.join(outputDir, "public-job-feed-merged-title-bucket-summary.json"),
    remoteSummaryCsv: path.join(outputDir, "public-job-feed-merged-remote-summary.csv"),
    remoteSummaryJson: path.join(outputDir, "public-job-feed-merged-remote-summary.json"),
    salarySummaryCsv: path.join(outputDir, "public-job-feed-merged-salary-summary.csv"),
    salarySummaryJson: path.join(outputDir, "public-job-feed-merged-salary-summary.json"),
    writerFitSummaryCsv: path.join(outputDir, "public-job-feed-merged-writer-fit-summary.csv"),
    writerFitSummaryJson: path.join(outputDir, "public-job-feed-merged-writer-fit-summary.json"),
    duplicateSummaryCsv: path.join(outputDir, "public-job-feed-merged-duplicate-summary.csv"),
    duplicateSummaryJson: path.join(outputDir, "public-job-feed-merged-duplicate-summary.json"),
    atsSummaryCsv: path.join(outputDir, "public-job-feed-merged-ats-summary.csv"),
    atsSummaryJson: path.join(outputDir, "public-job-feed-merged-ats-summary.json"),
  };
}

function getPublicLatestPaths() {
  return {
    publicFeedCsv: path.join(publicRoot, "public-job-feed-latest.csv"),
    publicFeedJson: path.join(publicRoot, "public-job-feed-latest.json"),
    summaryCsv: path.join(publicRoot, "public-job-feed-latest-summary.csv"),
    summaryJson: path.join(publicRoot, "public-job-feed-latest-summary.json"),
  };
}

function getUniqueCount(rows, field, normalizer) {
  return new Set(
    rows
      .map((row) => (normalizer ? normalizer(row[field]) : row[field]))
      .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
      .filter(Boolean)
  ).size;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function maxValue(values, fallback = "") {
  let max = -Infinity;

  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }

  return max === -Infinity ? fallback : max;
}

function getAtsIncluded(jobRows) {
  return Array.from(new Set(jobRows.map((row) => String(row.ATS || "").toLowerCase()).filter(Boolean)))
    .sort((a, b) => supportedAts.indexOf(a) - supportedAts.indexOf(b))
    .join("|");
}

function createMergedSummary(ats, batchCount, jobRows, duplicateSummary, generatedAt) {
  return {
    GeneratedAt: generatedAt,
    ATS: ats,
    SupportedATS: supportedAts.join("|"),
    ATSIncluded: getAtsIncluded(jobRows),
    BatchCount: batchCount,
    TotalRows: jobRows.length,
    UniqueCompanies: getUniqueCount(jobRows, "CompanyKey") || getUniqueCount(jobRows, "Company"),
    UniqueTitles: getUniqueCount(jobRows, "Title", normalizeTitle),
    ExportOKCount: jobRows.filter((row) => row.ExportQualityFlag === "OK").length,
    ExportReviewCount: jobRows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
    ExportBadRowCount: jobRows.filter((row) => row.ExportQualityFlag === "BAD_ROW").length,
    PossibleDuplicateCount: duplicateSummary.PossibleDuplicateCount,
    DuplicateGroupCount: duplicateSummary.DuplicateGroupCount,
    StrongMatchCount: jobRows.filter((row) => row.TitleReviewBucket === "STRONG_MATCH").length,
    PossibleMatchCount: jobRows.filter((row) => row.TitleReviewBucket === "POSSIBLE_MATCH").length,
    AdjacentCount: jobRows.filter((row) => row.TitleReviewBucket === "ADJACENT").length,
    LowSignalCount: jobRows.filter((row) => row.TitleReviewBucket === "LOW_SIGNAL").length,
    IgnoreForNowCount: jobRows.filter((row) => row.TitleReviewBucket === "IGNORE_FOR_NOW").length,
    RemoteCount: jobRows.filter((row) => row.RemoteStatus === "Remote").length,
    HybridCount: jobRows.filter((row) => row.RemoteStatus === "Hybrid").length,
    OnsiteCount: jobRows.filter((row) => row.RemoteStatus === "Onsite").length,
    UnknownRemoteStatusCount: jobRows.filter((row) => row.RemoteStatus === "Unknown").length,
    USRemoteEligibleTrueCount: jobRows.filter((row) => row.USRemoteEligible === true).length,
    SalaryDetectedCount: jobRows.filter((row) => row.SalaryDetected).length,
    WriterFitACount: jobRows.filter((row) => row.WriterFitTier === "A").length,
    WriterFitBCount: jobRows.filter((row) => row.WriterFitTier === "B").length,
    WriterFitCCount: jobRows.filter((row) => row.WriterFitTier === "C").length,
    WriterFitDCount: jobRows.filter((row) => row.WriterFitTier === "D").length,
    WriterFitFCount: jobRows.filter((row) => row.WriterFitTier === "F").length,
    AverageWriterFitScore: average(jobRows.map((row) => Number(row.WriterFitScore) || 0)),
    MaxWriterFitScore: maxValue(jobRows.map((row) => Number(row.WriterFitScore) || 0), 0),
    WriterFitGuardrailAppliedCount: jobRows.filter((row) => row.WriterFitGuardrailApplied).length,
    WriterFitPenaltyAppliedCount: jobRows.filter((row) => row.WriterFitPenaltySignals).length,
    DemotedHighScoreCount: jobRows.filter(
      (row) =>
        (row.WriterFitGuardrailApplied || row.WriterFitPenaltySignals) && (Number(row.WriterFitBaseScore) || 0) >= 75
    ).length,
  };
}

function createMergedDuplicateRows(jobRows) {
  return jobRows
    .filter((row) => row.PossibleDuplicate)
    .map((row) => ({
      SourceBatch: row.SourceBatch,
      SourceATSCount: row.SourceATSCount,
      CrossATSDuplicate: row.CrossATSDuplicate,
      CrossATSDuplicateATSList: row.CrossATSDuplicateATSList,
      DuplicateGroupKey: row.DuplicateGroupKey,
      DuplicateReason: row.DuplicateReason,
      Company: row.Company,
      Title: row.Title,
      Location: row.Location,
      URL: row.URL,
      ATS: row.ATS,
      RawJobId: row.RawJobId,
    }))
    .sort(
      (a, b) =>
        a.DuplicateGroupKey.localeCompare(b.DuplicateGroupKey) ||
        a.SourceBatch.localeCompare(b.SourceBatch) ||
        a.Company.localeCompare(b.Company) ||
        a.Title.localeCompare(b.Title)
    );
}

function addToSetMap(map, key, value) {
  if (!key || !value) {
    return;
  }

  if (!map.has(key)) {
    map.set(key, new Set());
  }

  map.get(key).add(value);
}

function getSortedAtsList(values) {
  return Array.from(values).sort((a, b) => supportedAts.indexOf(a) - supportedAts.indexOf(b));
}

function addCrossAtsFields(jobRows) {
  const atsByCompanyTitleLocation = new Map();
  const atsByCanonicalUrl = new Map();

  for (const row of jobRows) {
    const ats = String(row.ATS || "").toLowerCase();
    addToSetMap(atsByCompanyTitleLocation, row.CompanyTitleLocationKey, ats);
    addToSetMap(atsByCanonicalUrl, row.CanonicalURLKey, ats);
  }

  for (const row of jobRows) {
    const atsValues = new Set();
    const companyTitleLocationAts = atsByCompanyTitleLocation.get(row.CompanyTitleLocationKey);
    const canonicalUrlAts = atsByCanonicalUrl.get(row.CanonicalURLKey);

    if (companyTitleLocationAts) {
      for (const ats of companyTitleLocationAts) atsValues.add(ats);
    }

    if (canonicalUrlAts) {
      for (const ats of canonicalUrlAts) atsValues.add(ats);
    }

    if (atsValues.size === 0 && row.ATS) {
      atsValues.add(String(row.ATS).toLowerCase());
    }

    const atsList = getSortedAtsList(atsValues);
    const crossAtsDuplicate = Boolean(row.PossibleDuplicate && atsList.length > 1);

    row.SourceATSCount = atsList.length || 1;
    row.CrossATSDuplicate = crossAtsDuplicate;
    row.CrossATSDuplicateATSList = crossAtsDuplicate ? atsList.join(" | ") : "";
  }

  return jobRows;
}

function createAtsSummaryRows(jobRows) {
  return supportedAts
    .map((ats) => {
      const rows = jobRows.filter((row) => String(row.ATS || "").toLowerCase() === ats);

      return {
        ATS: ats,
        Rows: rows.length,
        UniqueCompanies: getUniqueCount(rows, "CompanyKey") || getUniqueCount(rows, "Company"),
        UniqueTitles: getUniqueCount(rows, "Title", normalizeTitle),
        ExportOKCount: rows.filter((row) => row.ExportQualityFlag === "OK").length,
        ExportReviewCount: rows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
        ExportBadRowCount: rows.filter((row) => row.ExportQualityFlag === "BAD_ROW").length,
        WriterFitACount: rows.filter((row) => row.WriterFitTier === "A").length,
        WriterFitBCount: rows.filter((row) => row.WriterFitTier === "B").length,
        WriterFitCCount: rows.filter((row) => row.WriterFitTier === "C").length,
        WriterFitDCount: rows.filter((row) => row.WriterFitTier === "D").length,
        WriterFitFCount: rows.filter((row) => row.WriterFitTier === "F").length,
        RemoteCount: rows.filter((row) => row.RemoteStatus === "Remote").length,
        USRemoteEligibleTrueCount: rows.filter((row) => row.USRemoteEligible === true).length,
        SalaryDetectedCount: rows.filter((row) => row.SalaryDetected).length,
        PossibleDuplicateCount: rows.filter((row) => row.PossibleDuplicate).length,
        CrossATSDuplicateCount: rows.filter((row) => row.CrossATSDuplicate).length,
      };
    })
    .filter((row) => row.Rows > 0);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseDateTime(value) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getBoardKey(row) {
  const ats = cleanText(row.ATS).toLowerCase();
  const slug = cleanText(row.CatalogSlug).toLowerCase();
  return ats && slug ? `${ats}|${slug}` : "";
}

function getLatestLiveFetchByBoard(fetchLogRows) {
  const latest = new Map();

  updateLatestLiveFetchByBoard(latest, fetchLogRows);
  return latest;
}

function updateLatestLiveFetchByBoard(latest, fetchLogRows, sourceBatch = "") {
  const liveStatuses = new Set(["success", "empty"]);

  for (const row of fetchLogRows) {
    const status = cleanText(row.Status).toLowerCase();
    if (!liveStatuses.has(status)) {
      continue;
    }

    const key = getBoardKey(row);
    if (!key) {
      continue;
    }

    const current = latest.get(key);
    if (!current || parseDateTime(row.FetchedAt) >= parseDateTime(current.FetchedAt)) {
      latest.set(key, sourceBatch ? { ...row, SourceBatch: sourceBatch } : row);
    }
  }
}

function keepFreshBoardRow(row, latestLiveFetchByBoard, sourceBatch = row.SourceBatch) {
  const key = getBoardKey(row);
  const latestFetch = key ? latestLiveFetchByBoard.get(key) : null;
  if (!latestFetch) {
    return true;
  }

  const latestStatus = cleanText(latestFetch.Status).toLowerCase();
  if (latestStatus === "empty") {
    return parseDateTime(row.FetchedAt) > parseDateTime(latestFetch.FetchedAt);
  }

  if (latestStatus === "success") {
    return cleanText(sourceBatch) === cleanText(latestFetch.SourceBatch);
  }

  return true;
}

function filterSupersededBoardRows(rows, fetchLogRows) {
  const latestLiveFetchByBoard = getLatestLiveFetchByBoard(fetchLogRows);
  const filteredRows = rows.filter((row) => keepFreshBoardRow(row, latestLiveFetchByBoard));
  return {
    rows: filteredRows,
    removedCount: rows.length - filteredRows.length,
    refreshedBoardCount: latestLiveFetchByBoard.size,
  };
}

async function readBatchRows(batch, latestLiveFetchByBoard = null) {
  const feedPath = path.join(batch.BatchFolder, "public-job-feed-batch.json");
  const rows = await readJsonFile(feedPath);

  if (!Array.isArray(rows)) {
    throw new Error(`Batch feed is not an array: ${feedPath}`);
  }

  const selectedRows = [];

  for (const row of rows) {
    if (latestLiveFetchByBoard && !keepFreshBoardRow(row, latestLiveFetchByBoard, batch.BatchName)) {
      continue;
    }

    row.SourceBatch = batch.BatchName;
    selectedRows.push(row);
  }

  return { rows: selectedRows, originalRowCount: rows.length };
}

async function readBatchFetchLogRows(batch) {
  const fetchLogPath = path.join(batch.BatchFolder, "jobs-batch-fetch-log.json");
  const rows = await readJsonFile(fetchLogPath);

  if (!Array.isArray(rows)) {
    throw new Error(`Batch fetch log is not an array: ${fetchLogPath}`);
  }

  return rows.map((row) => ({
    ...row,
    SourceBatch: batch.BatchName,
  }));
}

async function loadDerivedLatestFetchByBoard(selectedBatches) {
  if (!(await fileExists(boardStatePath))) return null;

  try {
    const state = await readJsonFile(boardStatePath);
    if (!isUsableBoardState(state, selectedBatches.length)) return null;
    const latest = new Map();
    for (const row of state.Boards) {
      const key = getBoardKey(row);
      if (key) latest.set(key, row);
    }
    return latest;
  } catch (error) {
    console.warn(`Derived board state unavailable; rebuilding from batch logs: ${error.message}`);
    return null;
  }
}

function isLargeCsvWriteError(error) {
  return error instanceof RangeError || /invalid string length/i.test(error.message || "");
}

async function writeMergedOutputs(
  outputPaths,
  jobRows,
  summary,
  artifacts,
  duplicateRows,
  atsSummaryRows,
  skipJson,
  skipCsv,
  writeFullFeed = true
) {
  if (!writeFullFeed) {
    // The current all-ATS release exposes compatibility links after public latest is written.
  } else if (skipCsv) {
    await fs.rm(outputPaths.publicFeedCsv, { force: true });
    console.log(`Skipped large row CSV: ${outputPaths.publicFeedCsv}`);
  } else {
    await writeLargeCsvFile(outputPaths.publicFeedCsv, jobRows, mergedPublicFeedHeaders, formatCsvValue);
  }
  if (!writeFullFeed) {
    // See the CSV branch above.
  } else if (skipJson) {
    console.log(`Skipped large row JSON: ${outputPaths.publicFeedJson}`);
  } else {
    await writeLargeJsonArrayFile(outputPaths.publicFeedJson, jobRows, (row) => selectRow(mergedPublicFeedHeaders, row));
  }
  await writeTextFile(outputPaths.summaryCsv, rowsToCsv(mergedSummaryHeaders, [summary]));
  await writeJsonObjectFile(outputPaths.summaryJson, summary);
  await writeLargeCsvFile(outputPaths.duplicatesCsv, duplicateRows, mergedDuplicatesHeaders, formatCsvValue);
  await writeTextFile(outputPaths.qualitySummaryCsv, rowsToCsv(qualitySummaryHeaders, artifacts.qualitySummaryRows));
  await writeJsonFile(outputPaths.qualitySummaryJson, artifacts.qualitySummaryRows);
  await writeTextFile(
    outputPaths.titleBucketSummaryCsv,
    rowsToCsv(bucketSummaryHeaders, artifacts.bucketSummaryRows)
  );
  await writeJsonFile(outputPaths.titleBucketSummaryJson, artifacts.bucketSummaryRows);
  await writeTextFile(outputPaths.remoteSummaryCsv, rowsToCsv(remoteSummaryHeaders, artifacts.remoteSummaryRows));
  await writeJsonFile(outputPaths.remoteSummaryJson, artifacts.remoteSummaryRows);
  await writeTextFile(outputPaths.salarySummaryCsv, rowsToCsv(salarySummaryHeaders, artifacts.salarySummaryRows));
  await writeJsonFile(outputPaths.salarySummaryJson, artifacts.salarySummaryRows);
  await writeTextFile(
    outputPaths.writerFitSummaryCsv,
    rowsToCsv(writerFitSummaryHeaders, artifacts.writerFitSummaryRows)
  );
  await writeJsonFile(outputPaths.writerFitSummaryJson, artifacts.writerFitSummaryRows);
  await writeTextFile(
    outputPaths.duplicateSummaryCsv,
    rowsToCsv(duplicateSummaryHeaders, [artifacts.duplicateSummary])
  );
  await writeJsonFile(outputPaths.duplicateSummaryJson, artifacts.duplicateSummary);
  await writeTextFile(outputPaths.atsSummaryCsv, rowsToCsv(atsSummaryHeaders, atsSummaryRows));
  await writeJsonFile(outputPaths.atsSummaryJson, atsSummaryRows);
}

async function replaceWithRelativeSymlink(linkPath, targetPath) {
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath);
  await fs.rm(linkPath, { force: true });
  await fs.symlink(relativeTarget, linkPath);
}

async function linkMergedCurrentFeed(outputPaths, skipJson, skipCsv) {
  const publicPaths = getPublicLatestPaths();
  if (!skipCsv) await replaceWithRelativeSymlink(outputPaths.publicFeedCsv, publicPaths.publicFeedCsv);
  if (!skipJson) await replaceWithRelativeSymlink(outputPaths.publicFeedJson, publicPaths.publicFeedJson);
}

async function writePublicLatest(jobRows, summary, skipJson, skipCsv) {
  const outputPaths = getPublicLatestPaths();

  await ensureDir(publicRoot);
  if (skipCsv) {
    await fs.rm(outputPaths.publicFeedCsv, { force: true });
    console.log(`Skipped large row CSV: ${outputPaths.publicFeedCsv}`);
  } else {
    await writeLargeCsvFile(outputPaths.publicFeedCsv, jobRows, mergedPublicFeedHeaders, formatCsvValue);
  }
  if (skipJson) {
    console.log(`Skipped large row JSON: ${outputPaths.publicFeedJson}`);
  } else {
    await writeLargeJsonArrayFile(outputPaths.publicFeedJson, jobRows, (row) => selectRow(mergedPublicFeedHeaders, row));
  }
  await writeTextFile(outputPaths.summaryCsv, rowsToCsv(mergedSummaryHeaders, [summary]));
  await writeJsonObjectFile(outputPaths.summaryJson, summary);
}

async function main() {
  const ats = getArgValue("--ats", "ashby").toLowerCase();
  const outputName = getArgValue("--output-name", `${ats}-public-feed-merged-${timestampForName()}`);
  const includeReview = parseBoolean(getArgValue("--include-review", "true"), true);
  const skipJson = parseBoolean(getArgValue("--skip-json", "false"), false);
  const skipCsv = parseBoolean(getArgValue("--skip-csv", "false"), false);

  if (![...supportedAts, "all"].includes(ats)) {
    console.log("Only Ashby, Greenhouse, Lever, and all batch merging are supported right now.");
    process.exitCode = 1;
    return;
  }

  if (!(await fileExists(batchIndexPath))) {
    console.log("Batch index file is missing.");
    console.log(`Expected: ${batchIndexPath}`);
    console.log("Run:");
    console.log("  npm run jobs:index-batches");
    process.exitCode = 1;
    return;
  }

  const batchIndex = await readJsonFile(batchIndexPath);
  const selectedBatches = batchIndex.filter((row) => {
    const rowAts = String(row.ATS || "").toLowerCase();

    if (row.IndexStatus !== "OK") {
      return false;
    }

    if (ats === "all") {
      return supportedAts.includes(rowAts);
    }

    return rowAts === ats;
  });

  if (selectedBatches.length === 0) {
    console.log(`No OK ${ats} batches found in the batch index.`);
    console.log("Run:");
    console.log("  npm run jobs:index-batches");
    return;
  }

  const generatedAt = new Date().toISOString();
  const outputDir = path.join(mergedRoot, outputName);
  const outputPaths = getOutputPaths(outputDir);
  const useCurrentFeedCompatibilityLinks = ats === "all" && outputName === "public-feed-release";
  const titleRecords = await readJobTitles(jobTitlesPath);
  let mergedRows = [];
  let latestLiveFetchByBoard = await loadDerivedLatestFetchByBoard(selectedBatches);
  if (latestLiveFetchByBoard) {
    console.log(`Using derived board state: ${latestLiveFetchByBoard.size} current board records.`);
  } else {
    latestLiveFetchByBoard = new Map();
    for (const batch of selectedBatches) {
      updateLatestLiveFetchByBoard(
        latestLiveFetchByBoard,
        await readBatchFetchLogRows(batch),
        batch.BatchName
      );
    }
  }

  const latestBatchNames = new Set(
    Array.from(latestLiveFetchByBoard.values(), (row) => cleanText(row.SourceBatch)).filter(Boolean)
  );
  const batchesToRead = selectedBatches.filter(
    (batch) => latestBatchNames.has(batch.BatchName) || Number(batch.ExportBadRowCount || 0) > 0
  );
  const indexedRowCount = selectedBatches.reduce((sum, batch) => sum + Number(batch.PublicFeedRows || 0), 0);

  console.log(
    `Freshness prefilter: reading ${batchesToRead.length}/${selectedBatches.length} batches that can contribute current rows.`
  );

  for (const batch of batchesToRead) {
    const batchRows = await readBatchRows(batch, latestLiveFetchByBoard);
    for (const row of batchRows.rows) {
      mergedRows.push(row);
    }
  }

  const freshnessFilter = {
    removedCount: Math.max(0, indexedRowCount - mergedRows.length),
    refreshedBoardCount: latestLiveFetchByBoard.size,
  };

  if (!includeReview) {
    mergedRows = mergedRows.filter((row) => row.ExportQualityFlag === "OK");
  }

  const curated = await loadCuratedSubmissionRows(titleRecords, generatedAt);
  mergedRows.push(...curated.rows);
  console.log(`Approved curated submissions included: ${curated.rows.length}`);

  await ensureDir(outputDir);

  const artifacts = buildJobExportArtifacts(mergedRows, [], titleRecords, generatedAt, {
    includePublicFeedRows: false,
  });
  artifacts.jobRows = addCrossAtsFields(artifacts.jobRows);
  const duplicateRows = createMergedDuplicateRows(artifacts.jobRows);
  const atsSummaryRows = createAtsSummaryRows(artifacts.jobRows);
  const summary = createMergedSummary(
    ats,
    selectedBatches.length,
    artifacts.jobRows,
    artifacts.duplicateSummary,
    generatedAt
  );

  try {
    await writeMergedOutputs(
      outputPaths,
      artifacts.jobRows,
      summary,
      artifacts,
      duplicateRows,
      atsSummaryRows,
      skipJson,
      skipCsv,
      !useCurrentFeedCompatibilityLinks
    );

    if (ats === "all") {
      await writePublicLatest(artifacts.jobRows, summary, skipJson, skipCsv);
      if (useCurrentFeedCompatibilityLinks) {
        await linkMergedCurrentFeed(outputPaths, skipJson, skipCsv);
      }
    }
  } catch (error) {
    if (isLargeCsvWriteError(error)) {
      console.error("Large CSV output failed. Use streaming CSV support or rerun with --skip-csv true.");
    } else if (/heap|memory|string/i.test(error.message || "")) {
      console.error("Large output failed. Try rerunning with --skip-json true or --skip-csv true.");
    }
    throw error;
  }

  console.log("Batch merge complete.");
  console.log(`ATS: ${ats}`);
  console.log(`Batches merged: ${selectedBatches.length}`);
  console.log(`Boards with latest success/empty fetch: ${freshnessFilter.refreshedBoardCount}`);
  console.log(`Superseded older board rows removed: ${freshnessFilter.removedCount}`);
  console.log(`Rows merged: ${artifacts.jobRows.length}`);
  console.log(`Possible duplicates: ${artifacts.duplicateSummary.PossibleDuplicateCount}`);
  console.log(`Duplicate groups: ${artifacts.duplicateSummary.DuplicateGroupCount}`);
  console.log(`ATS included: ${summary.ATSIncluded}`);
  if (skipJson) {
    console.log("Large row JSON outputs were skipped because --skip-json true was provided.");
  }
  if (skipCsv) {
    console.log("Large row CSV outputs were skipped because --skip-csv true was provided.");
  }
  if (ats === "all") {
    console.log("Public latest folder:");
    console.log(publicRoot);
  }
  console.log("Output folder:");
  console.log(outputDir);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  filterSupersededBoardRows,
  getLatestLiveFetchByBoard,
  keepFreshBoardRow,
  main,
  updateLatestLiveFetchByBoard,
};
