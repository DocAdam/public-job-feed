const nodeFs = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const crawlQueuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const batchIndexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const batchesRoot = fromRoot("data", "jobs", "batches");
const reportsDir = fromRoot("data", "jobs", "reports");
const publicFeedCsvPath = fromRoot("data", "jobs", "public", "public-job-feed-latest.csv");

const atsList = [
  { key: "ashby", label: "Ashby", hasField: "HasAshby", slugField: "AshbySlug", supported: true, delayMs: 250, limit: 500 },
  {
    key: "greenhouse",
    label: "Greenhouse",
    hasField: "HasGreenhouse",
    slugField: "GreenhouseSlug",
    supported: true,
    delayMs: 250,
    limit: 250,
  },
  { key: "lever", label: "Lever", hasField: "HasLever", slugField: "LeverSlug", supported: true, delayMs: 250, limit: 100 },
  {
    key: "workday",
    label: "Workday",
    hasField: "HasWorkday",
    slugField: "WorkdaySlug",
    supported: true,
    delayMs: 500,
    limit: 50,
  },
  {
    key: "bamboohr",
    label: "BambooHR",
    hasField: "HasBambooHR",
    slugField: "BambooHRSlug",
    supported: true,
    delayMs: 300,
    limit: 100,
  },
  { key: "icims", label: "ICIMS", hasField: "HasICIMS", slugField: "ICIMSSlug", supported: true, delayMs: 750, limit: 25 },
];

const summaryHeaders = [
  "GeneratedAt",
  "CatalogRowsTotal",
  "CrawlReadyTotal",
  "FetchSupportedTotal",
  "AttemptedTotal",
  "RemainingTotal",
  "CatalogOnlyTotal",
  "CoveragePercentOverall",
  "SupportedATSCompleteCount",
  "SupportedATSInProgressCount",
  "CatalogOnlyATSCount",
];

const byAtsHeaders = [
  "ATS",
  "CatalogRows",
  "CrawlReadyRows",
  "FetchSupportedRows",
  "AttemptedRows",
  "SuccessRows",
  "EmptyRows",
  "FailedRows",
  "SkippedRows",
  "CatalogOnlyRows",
  "RemainingRows",
  "CoveragePercent",
  "CompletionStatus",
];

const remainingHeaders = [
  "ATS",
  "Company",
  "CompanyKey",
  "CatalogSlug",
  "BestATS",
  "BestFetchURL",
  "CrawlPriority",
  "FetchSupportStatus",
  "FetchSupportReason",
  "EstimatedFetchURL",
  "SuggestedBatchCommand",
];

const attemptedHeaders = [
  "ATS",
  "Company",
  "CompanyKey",
  "CatalogSlug",
  "Status",
  "HttpStatus",
  "JobCount",
  "Error",
  "FetchedAt",
  "BatchName",
  "CoverageKey",
];

const companyCoverageHeaders = [
  "Company",
  "CompanyKey",
  "ATS",
  "BestATS",
  "CoverageStatus",
  "JobsFound",
  "GoodMatchesFound",
  "LastChecked",
  "LastFetchStatus",
  "LastFetchError",
  "FetchSupportStatus",
  "FetchSupportReason",
  "CatalogOnly",
  "CrawlReady",
  "CrawlPriority",
  "CareerSiteURL",
  "EstimatedFetchURL",
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

async function writeCsv(filePath, headers, rows) {
  await writeTextFile(filePath, rowsToCsv(headers, rows));
}

async function writeTextFile(filePath, text) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await fs.writeFile(tempPath, text, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
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

function normalizeSlug(value) {
  return cleanText(value).toLowerCase();
}

function normalizePriority(value) {
  return cleanText(value).toUpperCase() || "HIGH";
}

function percent(numerator, denominator) {
  if (!denominator) {
    return 100;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function getAtsConfig(atsKey) {
  return atsList.find((ats) => ats.key === normalizeAts(atsKey));
}

function isAtsPresent(row, ats) {
  if (asBoolean(row[ats.hasField])) {
    return true;
  }

  const values = Array.isArray(row.OriginalATSList)
    ? row.OriginalATSList
    : Array.isArray(row.ATSList)
      ? row.ATSList
      : cleanText(row.OriginalATSList || row.ATSList)
          .split("|")
          .map(cleanText)
          .filter(Boolean);

  return values.map(normalizeAts).includes(ats.key);
}

function getCatalogSlug(row, ats) {
  return cleanText(row[ats.slugField]) || cleanText(row.CatalogSlug) || cleanText(row.BestFetchURL);
}

function getCoverageKey(atsKey, rowOrLog) {
  const ats = normalizeAts(atsKey || rowOrLog.ATS || rowOrLog.BestATS);
  const companyKey = cleanText(rowOrLog.CompanyKey).toLowerCase();
  const slug = normalizeSlug(rowOrLog.CatalogSlug || rowOrLog[`${ats}Slug`] || rowOrLog.BestFetchURL || rowOrLog.BoardURL);

  if (slug) {
    return `${ats}:slug:${slug}`;
  }

  if (companyKey) {
    return `${ats}:company:${companyKey}`;
  }

  return `${ats}:unknown:${cleanText(rowOrLog.Company || rowOrLog.PreferredCompanyName).toLowerCase()}`;
}

function getQueueCoverageKey(row) {
  const ats = normalizeAts(row.BestATS);
  const atsConfig = getAtsConfig(ats);
  return getCoverageKey(ats, {
    ...row,
    CatalogSlug: atsConfig ? getCatalogSlug(row, atsConfig) : row.CatalogSlug,
  });
}

function getCoverageKeyForAts(row, ats) {
  return getCoverageKey(ats.key, {
    ...row,
    CatalogSlug: getCatalogSlug(row, ats),
  });
}

function getCareerSiteUrl(row, ats) {
  const urlFieldByAts = {
    ashby: "AshbyURL",
    greenhouse: "GreenhouseURL",
    lever: "LeverURL",
    workday: "WorkdayURL",
    bamboohr: "BambooHRURL",
    icims: "ICIMSURL",
  };

  return (
    cleanText(row[urlFieldByAts[ats.key]]) ||
    (normalizeAts(row.BestATS) === ats.key ? cleanText(row.BestFetchURL) : "") ||
    cleanText(row.EstimatedFetchURL)
  );
}

function isFetchSupportedRow(row) {
  const status = cleanText(row.FetchSupportStatus).toUpperCase();
  return status === "SUPPORTED" || status === "BEST_EFFORT";
}

function isCatalogOnlyRow(row) {
  const status = cleanText(row.FetchSupportStatus).toUpperCase();
  return status === "CATALOG_ONLY" || status === "UNSUPPORTED" || cleanText(row.CrawlStatus).toUpperCase() === "SKIP";
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
      const ats = normalizeAts(row.ATS);
      rows.push({
        ...row,
        ATS: ats,
        BatchName: entry.name,
        CoverageKey: getCoverageKey(ats, row),
      });
    }
  }

  return rows;
}

function latestLogByCoverageKey(fetchLogs) {
  const byKey = new Map();

  for (const log of fetchLogs) {
    const current = byKey.get(log.CoverageKey);
    if (!current || cleanText(log.FetchedAt) > cleanText(current.FetchedAt)) {
      byKey.set(log.CoverageKey, log);
    }
  }

  return byKey;
}

function buildLatestLogLookup(fetchLogs) {
  const byKey = latestLogByCoverageKey(fetchLogs);
  const byCompanyAts = new Map();

  for (const log of fetchLogs) {
    const companyKey = cleanText(log.CompanyKey).toLowerCase();
    const ats = normalizeAts(log.ATS);
    if (!companyKey || !ats) {
      continue;
    }

    const key = `${ats}:${companyKey}`;
    const current = byCompanyAts.get(key);
    if (!current || cleanText(log.FetchedAt) > cleanText(current.FetchedAt)) {
      byCompanyAts.set(key, log);
    }
  }

  return { byKey, byCompanyAts };
}

function getLatestLogForRow(row, ats, logLookup) {
  return (
    logLookup.byKey.get(getCoverageKeyForAts(row, ats)) ||
    logLookup.byCompanyAts.get(`${ats.key}:${cleanText(row.CompanyKey).toLowerCase()}`) ||
    null
  );
}

function buildJobCounts(publicRows) {
  const byCompanyAts = new Map();

  for (const row of publicRows) {
    const ats = normalizeAts(row.ATS);
    const companyKey = cleanText(row.CompanyKey).toLowerCase();
    if (!ats || !companyKey) {
      continue;
    }

    const key = `${ats}:${companyKey}`;
    const current = byCompanyAts.get(key) || {
      JobsFound: 0,
      GoodMatchesFound: 0,
      LastChecked: "",
    };

    current.JobsFound += 1;
    if (row.WriterFitTier === "A" || row.WriterFitTier === "B") {
      current.GoodMatchesFound += 1;
    }

    if (cleanText(row.FetchedAt) > current.LastChecked) {
      current.LastChecked = cleanText(row.FetchedAt);
    }

    byCompanyAts.set(key, current);
  }

  return byCompanyAts;
}

async function streamCsvRows(filePath, onRow) {
  if (!(await fileExists(filePath))) {
    return;
  }

  await new Promise((resolve, reject) => {
    const stream = nodeFs.createReadStream(filePath, { encoding: "utf8" });
    let headers = null;
    let row = [];
    let field = "";
    let inQuotes = false;

    function emitRow() {
      if (field.length > 0 || row.length > 0) {
        row.push(field);
      }

      if (row.length === 0) {
        field = "";
        return;
      }

      if (!headers) {
        headers = row;
      } else {
        const object = {};
        headers.forEach((header, index) => {
          object[header] = row[index] || "";
        });
        onRow(object);
      }

      row = [];
      field = "";
    }

    stream.on("data", (chunk) => {
      for (let index = 0; index < chunk.length; index += 1) {
        const char = chunk[index];

        if (char === '"') {
          if (inQuotes && chunk[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (char === "," && !inQuotes) {
          row.push(field);
          field = "";
          continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
          if (char === "\r" && chunk[index + 1] === "\n") {
            index += 1;
          }
          emitRow();
          continue;
        }

        field += char;
      }
    });

    stream.on("error", reject);
    stream.on("end", () => {
      emitRow();
      resolve();
    });
  });
}

async function buildJobCountsFromPublicFeedCsv() {
  const byCompanyAts = new Map();

  await streamCsvRows(publicFeedCsvPath, (row) => {
    const ats = normalizeAts(row.ATS);
    const companyKey = cleanText(row.CompanyKey).toLowerCase();
    if (!ats || !companyKey) {
      return;
    }

    const key = `${ats}:${companyKey}`;
    const current = byCompanyAts.get(key) || {
      JobsFound: 0,
      GoodMatchesFound: 0,
      LastChecked: "",
    };

    current.JobsFound += 1;
    if (row.WriterFitTier === "A" || row.WriterFitTier === "B") {
      current.GoodMatchesFound += 1;
    }

    if (cleanText(row.FetchedAt) > current.LastChecked) {
      current.LastChecked = cleanText(row.FetchedAt);
    }

    byCompanyAts.set(key, current);
  });

  return byCompanyAts;
}

function isAtsFetchSupportedForCoverage(row, ats) {
  if (!ats.supported) {
    return false;
  }

  if (!getCatalogSlug(row, ats) && !getCareerSiteUrl(row, ats)) {
    return false;
  }

  if (isStrictBestAts(ats)) {
    return normalizeAts(row.BestATS) === ats.key && asBoolean(row.CrawlReady) && isFetchSupportedRow(row);
  }

  return isAtsPresent(row, ats);
}

function getCoverageStatus(row, ats, latestLog, jobCounts) {
  if (jobCounts.GoodMatchesFound > 0) {
    return "GOOD_MATCHES_FOUND";
  }

  if (jobCounts.JobsFound > 0) {
    return "JOBS_FOUND";
  }

  const fetchSupportStatus = cleanText(row.FetchSupportStatus).toUpperCase();
  if (fetchSupportStatus === "CATALOG_ONLY") {
    return "CATALOG_ONLY";
  }

  if (!isAtsFetchSupportedForCoverage(row, ats)) {
    return "UNSUPPORTED";
  }

  if (latestLog) {
    const status = cleanText(latestLog.Status).toLowerCase();
    if (status === "empty") {
      return "FETCHED_EMPTY";
    }
    if (status === "failed") {
      return "FETCH_FAILED";
    }
    if (status === "skipped") {
      return fetchSupportStatus === "CATALOG_ONLY" ? "CATALOG_ONLY" : "UNSUPPORTED";
    }
  }

  if (asBoolean(row.CrawlReady) || isAtsPresent(row, ats)) {
    return "NOT_ATTEMPTED";
  }

  return "UNSUPPORTED";
}

function buildSuggestedCommand(row, ats, rowIndexByKey) {
  const priority = normalizePriority(row.CrawlPriority);
  const limit = ats.limit;
  const delayMs = ats.delayMs;
  const queueIndex = rowIndexByKey.get(getCoverageKeyForAts(row, ats)) || 0;
  const offset = Math.floor(queueIndex / limit) * limit;
  const batchName = `${ats.key}-${priority.toLowerCase()}-${String(offset).padStart(4, "0")}`;

  return `npm run jobs:fetch-batch -- --ats ${ats.key} --priority ${priority} --limit ${limit} --offset ${offset} --batch-name ${batchName} --delay-ms ${delayMs}`;
}

function isStrictBestAts(ats) {
  return ats.key === "ashby" || ats.key === "greenhouse" || ats.key === "lever";
}

function getCoverageCandidateRows(queueRows, ats) {
  if (!ats.supported) {
    return [];
  }

  return queueRows.filter((row) => {
    if (!getCatalogSlug(row, ats)) {
      return false;
    }

    if (isStrictBestAts(ats)) {
      return normalizeAts(row.BestATS) === ats.key && asBoolean(row.CrawlReady) && isFetchSupportedRow(row);
    }

    return isAtsPresent(row, ats) && normalizePriority(row.CrawlPriority);
  });
}

function buildRemainingRows(queueRows, attemptedByKey, rowIndexByKey) {
  const rows = [];

  for (const ats of atsList) {
    for (const row of getCoverageCandidateRows(queueRows, ats)) {
      if (attemptedByKey.has(getCoverageKeyForAts(row, ats))) {
        continue;
      }

      rows.push({
        ATS: ats.key,
        Company: cleanText(row.PreferredCompanyName),
        CompanyKey: cleanText(row.CompanyKey),
        CatalogSlug: getCatalogSlug(row, ats),
        BestATS: cleanText(row.BestATS),
        BestFetchURL: cleanText(row.BestFetchURL),
        CrawlPriority: cleanText(row.CrawlPriority),
        FetchSupportStatus: cleanText(row.FetchSupportStatus),
        FetchSupportReason: cleanText(row.FetchSupportReason),
        EstimatedFetchURL: cleanText(row.EstimatedFetchURL),
        SuggestedBatchCommand: buildSuggestedCommand(row, ats, rowIndexByKey),
      });
    }
  }

  return rows;
}

function buildAttemptedRows(fetchLogs) {
  return fetchLogs
    .slice()
    .sort((a, b) => {
      const atsCompare = cleanText(a.ATS).localeCompare(cleanText(b.ATS));
      if (atsCompare !== 0) return atsCompare;
      const companyCompare = cleanText(a.Company).localeCompare(cleanText(b.Company));
      if (companyCompare !== 0) return companyCompare;
      return cleanText(a.FetchedAt).localeCompare(cleanText(b.FetchedAt));
    })
    .map((row) => ({
      ATS: cleanText(row.ATS),
      Company: cleanText(row.Company),
      CompanyKey: cleanText(row.CompanyKey),
      CatalogSlug: cleanText(row.CatalogSlug),
      Status: cleanText(row.Status),
      HttpStatus: cleanText(row.HttpStatus),
      JobCount: Number(row.JobCount) || 0,
      Error: cleanText(row.Error),
      FetchedAt: cleanText(row.FetchedAt),
      BatchName: cleanText(row.BatchName),
      CoverageKey: cleanText(row.CoverageKey),
    }));
}

function buildCompanyCoverageRows(queueRows, fetchLogs, jobCountsByCompanyAts) {
  const logLookup = buildLatestLogLookup(fetchLogs);
  const rows = [];

  for (const queueRow of queueRows) {
    for (const ats of atsList) {
      if (!isAtsPresent(queueRow, ats) && normalizeAts(queueRow.BestATS) !== ats.key) {
        continue;
      }

      const latestLog = getLatestLogForRow(queueRow, ats, logLookup);
      const jobCounts = jobCountsByCompanyAts.get(`${ats.key}:${cleanText(queueRow.CompanyKey).toLowerCase()}`) || {
        JobsFound: 0,
        GoodMatchesFound: 0,
        LastChecked: "",
      };
      const coverageStatus = getCoverageStatus(queueRow, ats, latestLog, jobCounts);
      const catalogOnly = coverageStatus === "CATALOG_ONLY" || cleanText(queueRow.FetchSupportStatus).toUpperCase() === "CATALOG_ONLY";

      rows.push({
        Company: cleanText(queueRow.PreferredCompanyName),
        CompanyKey: cleanText(queueRow.CompanyKey),
        ATS: ats.key,
        BestATS: cleanText(queueRow.BestATS),
        CoverageStatus: coverageStatus,
        JobsFound: jobCounts.JobsFound,
        GoodMatchesFound: jobCounts.GoodMatchesFound,
        LastChecked: cleanText(latestLog && latestLog.FetchedAt) || jobCounts.LastChecked,
        LastFetchStatus: cleanText(latestLog && latestLog.Status),
        LastFetchError: cleanText(latestLog && latestLog.Error),
        FetchSupportStatus: cleanText(queueRow.FetchSupportStatus) || (ats.supported ? "SUPPORTED" : "UNSUPPORTED"),
        FetchSupportReason: cleanText(queueRow.FetchSupportReason),
        CatalogOnly: catalogOnly,
        CrawlReady: asBoolean(queueRow.CrawlReady) && isAtsFetchSupportedForCoverage(queueRow, ats),
        CrawlPriority: cleanText(queueRow.CrawlPriority),
        CareerSiteURL: getCareerSiteUrl(queueRow, ats),
        EstimatedFetchURL: cleanText(queueRow.EstimatedFetchURL),
      });
    }
  }

  return rows.sort((a, b) => {
    const companyCompare = cleanText(a.Company).localeCompare(cleanText(b.Company));
    if (companyCompare !== 0) return companyCompare;
    return cleanText(a.ATS).localeCompare(cleanText(b.ATS));
  });
}

function buildRowIndexes(queueRows) {
  const byKey = new Map();
  const byAtsPriority = new Map();

  for (const ats of atsList) {
    for (const row of getCoverageCandidateRows(queueRows, ats)) {
      const priority = normalizePriority(row.CrawlPriority);
      const groupKey = `${ats.key}:${priority}`;
      const nextIndex = byAtsPriority.get(groupKey) || 0;
      byAtsPriority.set(groupKey, nextIndex + 1);
      byKey.set(getCoverageKeyForAts(row, ats), nextIndex);
    }
  }

  return byKey;
}

function getCompletionStatus(row) {
  if (row.FetchSupportedRows > 0 && row.RemainingRows === 0) {
    return "COMPLETE";
  }

  if (row.FetchSupportedRows > 0 && row.AttemptedRows > 0) {
    return "IN_PROGRESS";
  }

  if (row.FetchSupportedRows > 0) {
    return "NOT_STARTED";
  }

  if (row.CatalogOnlyRows > 0) {
    return "CATALOG_ONLY";
  }

  return "NOT_STARTED";
}

function buildByAtsRows(queueRows, fetchLogs, attemptedByKey, remainingRows) {
  const latestLogs = Array.from(attemptedByKey.values());
  const logsByAts = new Map();
  for (const log of latestLogs) {
    const ats = normalizeAts(log.ATS);
    if (!logsByAts.has(ats)) {
      logsByAts.set(ats, []);
    }
    logsByAts.get(ats).push(log);
  }

  const remainingByAts = new Map();
  for (const row of remainingRows) {
    const ats = normalizeAts(row.ATS);
    remainingByAts.set(ats, (remainingByAts.get(ats) || 0) + 1);
  }

  return atsList.map((ats) => {
    const catalogRows = queueRows.filter((row) => isAtsPresent(row, ats)).length;
    const candidateRows = getCoverageCandidateRows(queueRows, ats);
    const crawlReadyRows = candidateRows.length;
    const fetchSupportedRows = candidateRows.length;
    const catalogOnlyRows = ats.supported ? 0 : queueRows.filter((row) => isAtsPresent(row, ats) || isCatalogOnlyRow(row)).length;
    const logs = logsByAts.get(ats.key) || [];
    const attemptedRows = logs.length;
    const successRows = logs.filter((row) => cleanText(row.Status).toLowerCase() === "success" && (Number(row.JobCount) || 0) > 0).length;
    const emptyRows = logs.filter((row) => cleanText(row.Status).toLowerCase() === "empty" || (cleanText(row.Status).toLowerCase() === "success" && !(Number(row.JobCount) || 0))).length;
    const failedRows = logs.filter((row) => cleanText(row.Status).toLowerCase() === "failed").length;
    const skippedRows = logs.filter((row) => cleanText(row.Status).toLowerCase() === "skipped").length;
    const remaining = remainingByAts.get(ats.key) || 0;
    const denominator = fetchSupportedRows + catalogOnlyRows;
    const covered = Math.min(fetchSupportedRows, attemptedRows) + catalogOnlyRows;

    const row = {
      ATS: ats.key,
      CatalogRows: catalogRows,
      CrawlReadyRows: crawlReadyRows,
      FetchSupportedRows: fetchSupportedRows,
      AttemptedRows: attemptedRows,
      SuccessRows: successRows,
      EmptyRows: emptyRows,
      FailedRows: failedRows,
      SkippedRows: skippedRows,
      CatalogOnlyRows: catalogOnlyRows,
      RemainingRows: remaining,
      CoveragePercent: percent(covered, denominator),
      CompletionStatus: "",
    };

    row.CompletionStatus = getCompletionStatus(row);
    return row;
  });
}

function buildSummary(generatedAt, byAtsRows) {
  const fetchSupportedTotal = byAtsRows.reduce((sum, row) => sum + row.FetchSupportedRows, 0);
  const catalogOnlyTotal = byAtsRows.reduce((sum, row) => sum + row.CatalogOnlyRows, 0);
  const attemptedTotal = byAtsRows.reduce((sum, row) => sum + Math.min(row.AttemptedRows, row.FetchSupportedRows), 0);
  const remainingTotal = byAtsRows.reduce((sum, row) => sum + row.RemainingRows, 0);
  const denominator = fetchSupportedTotal + catalogOnlyTotal;

  return {
    GeneratedAt: generatedAt,
    CatalogRowsTotal: byAtsRows.reduce((sum, row) => sum + row.CatalogRows, 0),
    CrawlReadyTotal: byAtsRows.reduce((sum, row) => sum + row.CrawlReadyRows, 0),
    FetchSupportedTotal: fetchSupportedTotal,
    AttemptedTotal: attemptedTotal,
    RemainingTotal: remainingTotal,
    CatalogOnlyTotal: catalogOnlyTotal,
    CoveragePercentOverall: percent(attemptedTotal + catalogOnlyTotal, denominator),
    SupportedATSCompleteCount: byAtsRows.filter((row) => row.CompletionStatus === "COMPLETE").length,
    SupportedATSInProgressCount: byAtsRows.filter((row) => row.CompletionStatus === "IN_PROGRESS").length,
    CatalogOnlyATSCount: byAtsRows.filter((row) => row.CompletionStatus === "CATALOG_ONLY").length,
  };
}

function buildMarkdownReport(generatedAt, summary, byAtsRows) {
  const haveCrawledEverything = summary.RemainingTotal === 0;
  const remainingRows = byAtsRows.filter((row) => row.RemainingRows > 0);
  const catalogOnlyRows = byAtsRows.filter((row) => row.CompletionStatus === "CATALOG_ONLY");
  const nextAction = haveCrawledEverything
    ? "Run npm run jobs:public-release after reviewing the latest outputs."
    : "Run npm run jobs:maintain-index so due and never-attempted boards are selected by stable ATS + slug keys.";

  const lines = [
    "# Crawl Coverage Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Have We Crawled Everything Yet?",
    "",
    haveCrawledEverything
      ? "Yes. All currently crawl-ready fetch-supported companies have been attempted."
      : `No. ${summary.RemainingTotal} crawl-ready fetch-supported rows remain.`,
    "",
    `Catalog accounted for: ${summary.CoveragePercentOverall}%`,
    "",
    "Catalog accounted for includes successful, empty, failed, skipped, and explicitly catalog-only rows. It is not a freshness or fetch-success percentage; see board-freshness-report.md for recent checks.",
    "",
    "## ATS Coverage",
    "",
    "| ATS | Catalog Rows | Crawl Ready | Fetch Supported | Attempted | Remaining | Catalog Only | Accounted For | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...byAtsRows.map(
      (row) =>
        `| ${row.ATS} | ${row.CatalogRows} | ${row.CrawlReadyRows} | ${row.FetchSupportedRows} | ${row.AttemptedRows} | ${row.RemainingRows} | ${row.CatalogOnlyRows} | ${row.CoveragePercent}% | ${row.CompletionStatus} |`
    ),
    "",
    "## Remaining Count By ATS",
    "",
  ];

  if (remainingRows.length === 0) {
    lines.push("No remaining crawl-ready fetch-supported rows.", "");
  } else {
    for (const row of remainingRows) {
      lines.push(`- ${row.ATS}: ${row.RemainingRows}`);
    }
    lines.push("");
  }

  if (catalogOnlyRows.length > 0) {
    lines.push(
      "## Catalog-Only Note",
      "",
      `${catalogOnlyRows.map((row) => row.ATS).join(", ")} are represented in the crawl queue as catalog-only.`,
      ""
    );
  }

  lines.push("## Next Recommended Action", "", nextAction, "");

  return lines.join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();

  if (!(await fileExists(crawlQueuePath))) {
    console.log("Missing crawl queue. Run:");
    console.log("npm run catalogs:crawl-queue");
    return;
  }

  if (!(await fileExists(batchIndexPath))) {
    console.log("Missing batch index. Run:");
    console.log("npm run jobs:index-batches");
    return;
  }

  await ensureDir(reportsDir);

  const queueRows = await readJsonFile(crawlQueuePath);
  await readJsonFile(batchIndexPath);
  const fetchLogs = await readAllFetchLogs();
  const jobCountsByCompanyAts = await buildJobCountsFromPublicFeedCsv();
  const attemptedByKey = latestLogByCoverageKey(fetchLogs);
  const rowIndexByKey = buildRowIndexes(queueRows);
  const remainingRows = buildRemainingRows(queueRows, attemptedByKey, rowIndexByKey);
  const attemptedRows = buildAttemptedRows(fetchLogs);
  const companyCoverageRows = buildCompanyCoverageRows(queueRows, fetchLogs, jobCountsByCompanyAts);
  const byAtsRows = buildByAtsRows(queueRows, fetchLogs, attemptedByKey, remainingRows);
  const summary = buildSummary(generatedAt, byAtsRows);

  await writeCsv(path.join(reportsDir, "crawl-coverage-summary.csv"), summaryHeaders, [summary]);
  await writeJsonFile(path.join(reportsDir, "crawl-coverage-summary.json"), summary);
  await writeCsv(path.join(reportsDir, "crawl-coverage-by-ats.csv"), byAtsHeaders, byAtsRows);
  await writeJsonFile(path.join(reportsDir, "crawl-coverage-by-ats.json"), byAtsRows);
  await writeCsv(path.join(reportsDir, "company-coverage.csv"), companyCoverageHeaders, companyCoverageRows);
  await writeJsonFile(path.join(reportsDir, "company-coverage.json"), companyCoverageRows);
  await writeCsv(path.join(reportsDir, "crawl-remaining.csv"), remainingHeaders, remainingRows);
  await writeJsonFile(path.join(reportsDir, "crawl-remaining.json"), remainingRows);
  await writeCsv(path.join(reportsDir, "crawl-attempted.csv"), attemptedHeaders, attemptedRows);
  await writeJsonFile(path.join(reportsDir, "crawl-attempted.json"), attemptedRows);
  await writeTextFile(path.join(reportsDir, "crawl-coverage-report.md"), buildMarkdownReport(generatedAt, summary, byAtsRows));

  console.log("Crawl coverage report complete.");
  console.log(`Catalog accounted for: ${summary.CoveragePercentOverall}%`);
  console.log(`Remaining supported crawl rows: ${summary.RemainingTotal}`);
  console.log("Output folder:");
  console.log(reportsDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
