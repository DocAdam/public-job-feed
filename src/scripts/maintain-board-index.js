const { withBatchRun } = require("../lib/batch-run");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const { countAttempts, fetchHealth } = require("../lib/index-run-status");
const { enumerateBoardEntries, toFetchQueueRow } = require("../lib/board-registry");
const { selectBoards, syncBoardStateFromEntries, updateBoardState } = require("../lib/board-state");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");
const { buildJobExportArtifacts } = require("../lib/job-export");
const { readJobTitles } = require("../lib/job-titles");
const { fetchAtsRows, getOutputPaths, writeBatchOutputs } = require("./fetch-batch-jobs");

const queuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const boardCatalogPath = fromRoot("data", "catalogs", "crawl", "board-catalog.json");
const coveragePath = fromRoot("data", "jobs", "reports", "company-coverage.json");
const statePath = fromRoot("data", "jobs", "state", "board-state.json");
const reportsDir = fromRoot("data", "jobs", "reports");
const batchesRoot = fromRoot("data", "jobs", "batches");
const jobTitlesPath = fromRoot("data", "config", "job-titles.md");

const atsOptions = {
  ashby: { cap: 100, concurrency: 3, delayMs: 250 },
  greenhouse: { cap: 100, concurrency: 3, delayMs: 250 },
  lever: { cap: 75, concurrency: 3, delayMs: 250 },
  bamboohr: { cap: 50, concurrency: 2, delayMs: 350 },
  workday: { cap: 20, concurrency: 1, delayMs: 750 },
  icims: { cap: 10, concurrency: 1, delayMs: 750 },
};

const planHeaders = [
  "BoardKey",
  "ATS",
  "Company",
  "CompanyKey",
  "CatalogSlug",
  "CoverageStatus",
  "LastAttemptAt",
  "NextCheckAt",
  "SelectionScope",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() !== "false";
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function timestampForName(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    return fallback;
  }
}

async function requestedKeysFromFile(filePath) {
  if (!filePath) return null;
  const data = await readJsonFile(path.resolve(fromRoot(), filePath));
  const rows = Array.isArray(data) ? data : data.AddedBoards;
  if (!Array.isArray(rows)) throw new Error(`Key file does not contain AddedBoards: ${filePath}`);
  return rows.map((row) => (typeof row === "string" ? row : row.BoardKey)).filter(Boolean);
}

function getPerAtsLimits() {
  const limits = {};
  for (const [ats, options] of Object.entries(atsOptions)) {
    limits[ats] = positiveNumber(getArgValue(`--${ats}-limit`, ""), options.cap);
  }
  return limits;
}

function planRows(selected, scope) {
  return selected.map((row) => ({
    BoardKey: row.BoardKey,
    ATS: row.ATS,
    Company: row.Company,
    CompanyKey: row.CompanyKey,
    CatalogSlug: row.CatalogSlug,
    CoverageStatus: row.CoverageStatus,
    LastAttemptAt: row.LastAttemptAt,
    NextCheckAt: row.NextCheckAt,
    SelectionScope: scope,
  }));
}

async function writePlan(rows, generatedAt, dryRun, scope) {
  const byAts = {};
  for (const row of rows) byAts[row.ATS] = (byAts[row.ATS] || 0) + 1;
  const report = {
    GeneratedAt: generatedAt,
    DryRun: dryRun,
    Scope: scope,
    SelectedBoardCount: rows.length,
    SelectedByATS: byAts,
    Boards: rows,
  };
  const markdown = [
    "# Board Maintenance Plan",
    "",
    `Generated: ${generatedAt}`,
    `Dry run: ${dryRun}`,
    `Scope: ${scope}`,
    `Selected boards: ${rows.length}`,
    "",
    "| ATS | Boards |",
    "| --- | ---: |",
    ...Object.entries(byAts).sort().map(([ats, count]) => `| ${ats} | ${count} |`),
    "",
  ].join("\n");
  await ensureDir(reportsDir);
  await Promise.all([
    writeJsonFile(path.join(reportsDir, "board-maintenance-plan.json"), report),
    writeTextFile(path.join(reportsDir, "board-maintenance-plan.csv"), rowsToCsv(planHeaders, rows)),
    writeTextFile(path.join(reportsDir, "board-maintenance-plan.md"), markdown),
  ]);
}

async function fetchAtsGroup(ats, records, entryByKey, options) {
  const config = atsOptions[ats];
  const rows = records.map((record) => toFetchQueueRow(entryByKey.get(record.BoardKey))).filter(Boolean);
  const batchName = `maintain-${options.scope}-${ats}-${options.runId}-${randomUUID()}`;
  const batchDir = path.join(options.outputRoot, batchName);
  const outputPaths = getOutputPaths(batchDir);
  return withBatchRun(batchDir, async phase => {
    await phase("fetch");
    console.log(`\nMaintenance ${ats}: ${rows.length} boards`);
    const result = await fetchAtsRows(rows, ats, options.titleRecords, config.delayMs, config.concurrency, {
      deadlineAt: options.deadlineAt,
  });
  await phase("build_artifacts");
  const generatedAt = new Date().toISOString();
  const artifacts = buildJobExportArtifacts(result.jobRows, result.fetchLogRows, options.titleRecords, generatedAt);
  artifacts.fetchLogRows = result.fetchLogRows;
  artifacts.summary.ATS = ats;
  artifacts.summary.Priority = "MAINTENANCE";
  artifacts.summary.Offset = "";
  artifacts.summary.Limit = records.length;
  artifacts.summary.BoardsSelected = records.length;
  artifacts.summary.MaintenanceScope = options.scope;
  await phase("write_outputs");
  await writeBatchOutputs(outputPaths, artifacts, { includePublicFeedCsv: options.includePublicFeedCsv });
  return { ats, batchName, fetchLogRows: result.fetchLogRows, jobRows: artifacts.jobRows };
  });
}

async function fetchAtsGroups(selectedByAts, entryByKey, options, fetchGroup = fetchAtsGroup) {
  const results = [];
  // Each group takes the same exclusive batch lock. Keep the shared deadline.
  for (const [ats, records] of selectedByAts) {
    const result = await fetchGroup(ats, records, entryByKey, options);
    results.push(result);
    if (options.onResult) await options.onResult(result, results);
  }
  return results;
}

async function main() {
  const dryRun = parseBoolean(getArgValue("--dry-run", "true"), true);
  const scope = String(getArgValue("--scope", "due")).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const runId = getArgValue("--run-id", timestampForName());
  const maxTotal = positiveNumber(getArgValue("--limit-total", "250"), 250);
  const budgetMinutes = positiveNumber(getArgValue("--budget-minutes", "45"), 45);
  const includeKnownGood = parseBoolean(getArgValue("--include-known-good", "false"));
  const includePublicFeedCsv = parseBoolean(getArgValue("--include-batch-csv", "false"));
  const keysFile = getArgValue("--keys-file", "");
  const keysUnattemptedOnly = parseBoolean(getArgValue("--keys-unattempted-only", "true"), true);
  const outputRoot = path.resolve(fromRoot(), getArgValue("--output-root", batchesRoot));
  const resultPath = path.resolve(fromRoot(), getArgValue("--result-path", path.join(reportsDir, "board-maintenance-results.json")));
  const generatedAt = new Date().toISOString();
  const [queueRows, boardCatalogRows, coverageRows, previousState, requestedKeys] = await Promise.all([
    readJsonFile(queuePath),
    readJsonIfExists(boardCatalogPath, []),
    readJsonIfExists(coveragePath, []),
    readJsonFile(statePath).then(saved => {
      if (!Array.isArray(saved.Boards)) throw new Error("Saved board state is invalid; manual review is required.");
      return saved;
    }).catch(error => {
      if (error.code === "ENOENT") return {};
      throw error;
    }),
    requestedKeysFromFile(keysFile),
  ]);

  if (!Array.isArray(queueRows) || queueRows.length === 0) throw new Error("crawl queue is empty");
  const entries = Array.isArray(boardCatalogRows) && boardCatalogRows.length > 0
    ? boardCatalogRows
    : enumerateBoardEntries(queueRows, { includeIneligible: true });
  const state = syncBoardStateFromEntries(entries, previousState, coverageRows, generatedAt);
  const selected = selectBoards(state, {
    keys: requestedKeys,
    keysUnattemptedOnly,
    includeKnownGood,
    maxTotal,
    perAtsLimits: getPerAtsLimits(),
    now: generatedAt,
  });
  const rows = planRows(selected, scope);
  await ensureDir(path.dirname(statePath));
  await Promise.all([writeJsonFile(statePath, state), writePlan(rows, generatedAt, dryRun, scope)]);

  const savedResults = [];
  const saveResults = async status => {
    const fetchLogs = savedResults.flatMap(result => result.fetchLogRows);
    const counts = countAttempts(fetchLogs);
    const health = fetchHealth(counts);
    const report = {
      RunId: runId, StartedAt: generatedAt, GeneratedAt: new Date().toISOString(),
      CompletedAt: status === "RUNNING" ? null : new Date().toISOString(),
      Status: status === "COMPLETE" && health === "ALL_FAILED" ? "FAILED" :
        status === "COMPLETE" && ["PARTIAL_FAILURE", "INCOMPLETE"].includes(health) ? "COMPLETE_WITH_WARNINGS" : status,
      FetchHealth: health, Scope: scope,
      SelectedBoardCount: selected.length, AttemptedBoardCount: fetchLogs.length,
      Counts: counts, JobsFetched: savedResults.reduce((sum, result) => sum + result.jobRows.length, 0),
      Batches: savedResults.map(result => ({ ATS: result.ats, BatchName: result.batchName, Boards: result.fetchLogRows.length })),
    };
    await writeJsonFile(resultPath, report);
    const latest = path.join(reportsDir, "board-maintenance-results.json");
    if (latest !== resultPath) await writeJsonFile(latest, report);
  };
  await saveResults("RUNNING");

  console.log(`Board state: ${state.ActiveBoardCount} active; ${state.FetchEligibleBoardCount} fetch eligible.`);
  console.log(`Maintenance scope ${scope}: ${selected.length} boards selected.`);
  if (dryRun || selected.length === 0) {
    await saveResults(dryRun ? "DRY_RUN" : "COMPLETE");
    console.log(dryRun ? "Dry run: no boards fetched." : "No boards are due in this scope.");
    return;
  }

  const entryByKey = new Map(entries.map((entry) => [entry.BoardKey, entry]));
  const selectedByAts = new Map();
  for (const record of selected) {
    if (!selectedByAts.has(record.ATS)) selectedByAts.set(record.ATS, []);
    selectedByAts.get(record.ATS).push(record);
  }
  const titleRecords = await readJobTitles(jobTitlesPath);
  const deadlineAt = Date.now() + budgetMinutes * 60 * 1000;
  await ensureDir(outputRoot);
  await fetchAtsGroups(selectedByAts, entryByKey, {
    outputRoot,
    runId,
    scope,
    titleRecords,
    deadlineAt,
    includePublicFeedCsv,
    onResult: async result => {
      // Keep each completed group before the next group starts. Interrupted
      // in-flight requests still require another fetch; do not reset saved state.
      updateBoardState(state, result.fetchLogRows, result.jobRows, new Date().toISOString());
      await writeJsonFile(statePath, state);
      savedResults.push(result);
      await saveResults("RUNNING");
    },
  });
  await saveResults("COMPLETE");
  const counts = countAttempts(savedResults.flatMap(result => result.fetchLogRows));
  console.log(`Maintenance attempts: success ${counts.Successful}, empty ${counts.Empty}, failed ${counts.Failed}, skipped ${counts.Skipped}, unknown ${counts.Unknown}.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, fetchAtsGroup, fetchAtsGroups };
