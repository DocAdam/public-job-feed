const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { getAshbySlugFromUrl } = require("../lib/ats/ashby");
const { getBambooHRSlugFromUrl } = require("../lib/ats/bamboohr");
const { getGreenhouseSlugFromUrl } = require("../lib/ats/greenhouse");
const { getLeverSlugFromUrl } = require("../lib/ats/lever");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");
const { buildJobExportArtifacts } = require("../lib/job-export");
const { readJobTitles } = require("../lib/job-titles");
const {
  fetchAtsRows,
  getOutputPaths,
  writeBatchOutputs,
} = require("./fetch-batch-jobs");

const topMatchesJsonPath = fromRoot("data", "jobs", "public", "public-job-feed-deduped-top.json");
const companyCoverageJsonPath = fromRoot("data", "jobs", "reports", "company-coverage.json");
const reportsDir = fromRoot("data", "jobs", "reports");
const batchesRoot = fromRoot("data", "jobs", "batches");
const jobTitlesPath = fromRoot("data", "config", "job-titles.md");
const supportedRefreshAts = ["greenhouse", "ashby", "lever", "bamboohr"];
const defaultLimits = {
  greenhouse: 250,
  ashby: 100,
  lever: 100,
  bamboohr: 100,
};

const planHeaders = [
  "ATS",
  "Company",
  "CompanyKey",
  "CatalogSlug",
  "BoardURL",
  "LatestFetchedAt",
  "MaxWriterFitScore",
  "GoodMatchRows",
  "SourceReasons",
  "PlanStatus",
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

function parsePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
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

function parseDate(value) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function timestampForName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

async function readJsonArrayIfExists(filePath) {
  try {
    const rows = await readJsonFile(filePath);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function getSlugFromUrl(ats, value) {
  if (ats === "ashby") return getAshbySlugFromUrl(value);
  if (ats === "greenhouse") return getGreenhouseSlugFromUrl(value);
  if (ats === "lever") return getLeverSlugFromUrl(value);
  if (ats === "bamboohr") return getBambooHRSlugFromUrl(value);
  return "";
}

function boardKey(ats, slug) {
  return `${normalizeAts(ats)}|${cleanText(slug).toLowerCase()}`;
}

function ensureCandidate(candidates, ats, slug) {
  const key = boardKey(ats, slug);
  if (!key || key.endsWith("|")) {
    return null;
  }

  if (!candidates.has(key)) {
    candidates.set(key, {
      ATS: normalizeAts(ats),
      Company: "",
      CompanyKey: "",
      CatalogSlug: cleanText(slug),
      BoardURL: "",
      LatestFetchedAt: "",
      MaxWriterFitScore: 0,
      GoodMatchRows: 0,
      SourceReasons: new Set(),
    });
  }

  return candidates.get(key);
}

function mergeCandidate(candidate, values) {
  if (!candidate) return;

  candidate.Company = candidate.Company || cleanText(values.Company);
  candidate.CompanyKey = candidate.CompanyKey || cleanText(values.CompanyKey);
  candidate.BoardURL = candidate.BoardURL || cleanText(values.BoardURL);
  candidate.MaxWriterFitScore = Math.max(candidate.MaxWriterFitScore, Number(values.WriterFitScore) || 0);
  candidate.GoodMatchRows += Number(values.GoodMatchRows) || 0;

  if (parseDate(values.FetchedAt) > parseDate(candidate.LatestFetchedAt)) {
    candidate.LatestFetchedAt = cleanText(values.FetchedAt);
  }

  if (values.SourceReason) {
    candidate.SourceReasons.add(values.SourceReason);
  }
}

function addTopMatchCandidates(candidates, rows, allowedAts) {
  for (const row of rows) {
    const ats = normalizeAts(row.ATS || row.Source);
    if (!allowedAts.has(ats)) continue;

    const slug = cleanText(row.CatalogSlug) || getSlugFromUrl(ats, row.BoardURL || row.URL || row.FetchURL);
    const candidate = ensureCandidate(candidates, ats, slug);
    mergeCandidate(candidate, {
      Company: row.Company,
      CompanyKey: row.CompanyKey,
      BoardURL: row.BoardURL,
      FetchedAt: row.FetchedAt,
      WriterFitScore: row.WriterFitScore,
      GoodMatchRows: 1,
      SourceReason: "top-match",
    });
  }
}

function addCoverageCandidates(candidates, rows, allowedAts) {
  for (const row of rows) {
    const ats = normalizeAts(row.ATS);
    if (!allowedAts.has(ats)) continue;
    if (cleanText(row.CoverageStatus) !== "GOOD_MATCHES_FOUND") continue;

    const boardUrl = cleanText(row.CareerSiteURL || row.EstimatedFetchURL);
    const slug = getSlugFromUrl(ats, boardUrl) || cleanText(row.CompanyKey);
    const candidate = ensureCandidate(candidates, ats, slug);
    mergeCandidate(candidate, {
      Company: row.Company,
      CompanyKey: row.CompanyKey,
      BoardURL: boardUrl,
      FetchedAt: row.LastChecked,
      WriterFitScore: 0,
      GoodMatchRows: Number(row.GoodMatchesFound) || 1,
      SourceReason: "coverage-good-matches",
    });
  }
}

function candidateToFetchRow(candidate) {
  const row = {
    PreferredCompanyName: candidate.Company,
    CompanyKey: candidate.CompanyKey,
    BestATS: candidate.ATS,
  };

  if (candidate.ATS === "ashby") {
    row.AshbySlug = candidate.CatalogSlug;
    row.AshbyURL = candidate.BoardURL;
  } else if (candidate.ATS === "greenhouse") {
    row.GreenhouseSlug = candidate.CatalogSlug;
    row.GreenhouseURL = candidate.BoardURL;
  } else if (candidate.ATS === "lever") {
    row.LeverSlug = candidate.CatalogSlug;
    row.LeverURL = candidate.BoardURL;
  } else if (candidate.ATS === "bamboohr") {
    row.BambooHRSlug = candidate.CatalogSlug;
    row.BambooHRURL = candidate.BoardURL;
  }

  return row;
}

function sortCandidates(left, right) {
  return (
    parseDate(left.LatestFetchedAt) - parseDate(right.LatestFetchedAt)
    || right.GoodMatchRows - left.GoodMatchRows
    || right.MaxWriterFitScore - left.MaxWriterFitScore
    || left.ATS.localeCompare(right.ATS)
    || left.Company.localeCompare(right.Company)
    || left.CatalogSlug.localeCompare(right.CatalogSlug)
  );
}

function getAllowedAts() {
  const raw = cleanText(getArgValue("--ats", supportedRefreshAts.join(",")));
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeAts(item))
      .filter((item) => supportedRefreshAts.includes(item))
  );
}

function getLimitForAts(ats) {
  const allLimit = parsePositiveInteger(getArgValue("--limit-per-ats", ""), 0);
  if (allLimit > 0) return allLimit;
  return parsePositiveInteger(getArgValue(`--${ats}-limit`, ""), defaultLimits[ats] || 100);
}

function toPlanRow(candidate, status) {
  return {
    ATS: candidate.ATS,
    Company: candidate.Company,
    CompanyKey: candidate.CompanyKey,
    CatalogSlug: candidate.CatalogSlug,
    BoardURL: candidate.BoardURL,
    LatestFetchedAt: candidate.LatestFetchedAt,
    MaxWriterFitScore: candidate.MaxWriterFitScore,
    GoodMatchRows: candidate.GoodMatchRows,
    SourceReasons: Array.from(candidate.SourceReasons).sort().join("|"),
    PlanStatus: status,
  };
}

function buildMarkdown(generatedAt, dryRun, selectedRows, skippedRows) {
  const lines = [
    "# Known-Good Board Refresh Plan",
    "",
    `Generated: ${generatedAt}`,
    `Dry run: ${dryRun}`,
    "",
    "## Selected",
    "",
    `- Selected boards: ${selectedRows.length}`,
    `- Skipped by cap: ${skippedRows.length}`,
    "",
    "| ATS | Boards |",
    "| --- | ---: |",
  ];

  const byAts = new Map();
  for (const row of selectedRows) {
    byAts.set(row.ATS, (byAts.get(row.ATS) || 0) + 1);
  }
  for (const ats of supportedRefreshAts) {
    if (byAts.has(ats)) {
      lines.push(`| ${ats} | ${byAts.get(ats)} |`);
    }
  }

  lines.push("", "## Notes", "");
  lines.push(
    "This refresh lane is built from current/recent good documentation matches and company coverage rows marked GOOD_MATCHES_FOUND.",
    "Workday and iCIMS are intentionally excluded until their fetch behavior is reliable.",
    ""
  );

  return lines.join("\n");
}

async function writePlanReports(generatedAt, dryRun, selectedRows, skippedRows) {
  const rows = [...selectedRows, ...skippedRows];
  await ensureDir(reportsDir);
  await Promise.all([
    fs.writeFile(path.join(reportsDir, "known-good-refresh-plan.csv"), rowsToCsv(planHeaders, rows), "utf8"),
    writeJsonFile(path.join(reportsDir, "known-good-refresh-plan.json"), rows),
    fs.writeFile(
      path.join(reportsDir, "known-good-refresh-plan.md"),
      buildMarkdown(generatedAt, dryRun, selectedRows, skippedRows),
      "utf8"
    ),
  ]);
}

async function writeRefreshBatch(ats, candidates, options, titleRecords, generatedAt) {
  const batchName = `refresh-known-good-${ats}-${options.runId}`;
  const batchDir = path.join(options.outputRoot, batchName);
  const outputPaths = getOutputPaths(batchDir);
  const rowsToFetch = candidates.map(candidateToFetchRow);

  await ensureDir(batchDir);
  const runResults = await fetchAtsRows(rowsToFetch, ats, titleRecords, options.delayMs, options.concurrency);
  const artifacts = buildJobExportArtifacts(runResults.jobRows, runResults.fetchLogRows, titleRecords, generatedAt);
  artifacts.fetchLogRows = runResults.fetchLogRows;
  artifacts.summary.ATS = ats;
  artifacts.summary.Priority = "REFRESH";
  artifacts.summary.Offset = 0;
  artifacts.summary.Limit = candidates.length;
  artifacts.summary.BoardsSelected = candidates.length;
  artifacts.summary.RefreshKnownGood = true;

  await writeBatchOutputs(outputPaths, artifacts);

  return {
    ATS: ats,
    BatchName: batchName,
    BatchDir: batchDir,
    BoardsSelected: candidates.length,
    BoardsAttempted: runResults.fetchLogRows.length,
    JobsFetched: runResults.jobRows.length,
  };
}

async function main() {
  const dryRun = parseBoolean(getArgValue("--dry-run", "true"), true);
  const delayMs = parsePositiveInteger(getArgValue("--delay-ms", "250"), 250);
  const concurrency = Math.min(parsePositiveInteger(getArgValue("--concurrency", "3"), 3), 10);
  const outputRoot = path.resolve(fromRoot(), getArgValue("--output-root", batchesRoot));
  const runId = getArgValue("--run-id", timestampForName());
  const allowedAts = getAllowedAts();
  const generatedAt = new Date().toISOString();
  const [topRows, coverageRows] = await Promise.all([
    readJsonArrayIfExists(topMatchesJsonPath),
    readJsonArrayIfExists(companyCoverageJsonPath),
  ]);
  const candidates = new Map();

  addTopMatchCandidates(candidates, topRows, allowedAts);
  addCoverageCandidates(candidates, coverageRows, allowedAts);

  const selected = [];
  const skipped = [];
  for (const ats of supportedRefreshAts.filter((item) => allowedAts.has(item))) {
    const limit = getLimitForAts(ats);
    const atsCandidates = Array.from(candidates.values())
      .filter((candidate) => candidate.ATS === ats)
      .sort(sortCandidates);

    selected.push(...atsCandidates.slice(0, limit).map((candidate) => toPlanRow(candidate, "READY")));
    skipped.push(...atsCandidates.slice(limit).map((candidate) => toPlanRow(candidate, "SKIPPED_BY_ATS_LIMIT")));
  }

  await writePlanReports(generatedAt, dryRun, selected, skipped);

  console.log("Known-good board refresh plan complete.");
  console.log(`Dry run: ${dryRun}`);
  console.log(`Selected boards: ${selected.length}`);
  console.log(`Skipped by cap: ${skipped.length}`);
  console.log("Plan report:");
  console.log(path.join(reportsDir, "known-good-refresh-plan.md"));

  if (dryRun) {
    console.log("No boards fetched. Rerun with --dry-run false to refresh selected boards.");
    return;
  }

  const titleRecords = await readJobTitles(jobTitlesPath);
  const batchResults = [];
  await ensureDir(outputRoot);

  for (const ats of supportedRefreshAts.filter((item) => allowedAts.has(item))) {
    const atsCandidates = selected
      .filter((row) => row.ATS === ats)
      .map((row) => candidates.get(boardKey(row.ATS, row.CatalogSlug)))
      .filter(Boolean);

    if (atsCandidates.length === 0) {
      continue;
    }

    console.log(`\nRefreshing ${ats}: ${atsCandidates.length} boards`);
    batchResults.push(await writeRefreshBatch(ats, atsCandidates, { outputRoot, runId, delayMs, concurrency }, titleRecords, generatedAt));
  }

  await writeJsonFile(path.join(reportsDir, "known-good-refresh-results.json"), batchResults);
  console.log("\nKnown-good board refresh complete.");
  for (const result of batchResults) {
    console.log(`${result.ATS}: ${result.BoardsAttempted} boards, ${result.JobsFetched} jobs, ${result.BatchName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
