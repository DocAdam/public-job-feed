const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDir, fromRoot, readJsonFile, writeTextFile } = require("../lib/files");
const { startIndexRun, saveIndexRun, recordPath, readQueue } = require("./record-index-run");
const { sumAttempts, terminalResult, fetchHealth } = require("../lib/index-run-status");

const stateDir = fromRoot("data", "jobs", "state");
const lockPath = path.join(stateDir, "maintenance.lock");
const reportsDir = fromRoot("data", "jobs", "reports");
const diffPath = fromRoot("data", "catalogs", "crawl", "catalog-queue-diff.json");

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
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").toLowerCase();
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(waitMinutes, options = {}) {
  const file = options.lockPath || lockPath;
  await ensureDir(path.dirname(file));
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  let lastNotice = 0;

  while (true) {
    options.checkInterrupted?.();
    try {
      const handle = await fs.open(file, "wx");
      await handle.writeFile(`${JSON.stringify({ PID: process.pid, StartedAt: new Date().toISOString() }, null, 2)}\n`);
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let lock = {};
      try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe maintenance lock.");
        lock = JSON.parse(await fs.readFile(file, "utf8"));
      } catch (readError) {
        throw new Error("Cannot verify the maintenance lock; manual review is required.");
      }
      if (!Number.isInteger(lock.PID) || lock.PID <= 0) throw new Error("Cannot verify the maintenance lock owner; manual review is required.");
      if (!processIsRunning(lock.PID)) {
        console.warn("Removing stale maintenance lock.");
        await fs.rm(file, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        const error = new Error(`another maintenance run (PID ${lock.PID}) is still active after ${waitMinutes} minutes`);
        error.code = "MAINTENANCE_OVERLAP";
        throw error;
      }
      if (Date.now() - lastNotice > 30000) {
        console.log(`Another maintenance run (PID ${lock.PID}) is active; waiting for it to finish...`);
        lastNotice = Date.now();
      }
      await sleep(5000);
    }
  }
}

function runNode(scriptName, args = []) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fromRoot("src", "scripts", scriptName), ...args], {
      cwd: fromRoot(),
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = { Script: scriptName, ExitCode: code, Signal: signal, ElapsedSeconds: Math.round((Date.now() - startedAt) / 1000) };
      if (code === 0) resolve(result);
      else {
        const error = new Error(`${scriptName} exited with code ${code}`);
        error.result = result;
        reject(error);
      }
    });
  });
}

async function getAddedBoardCount() {
  try {
    const diff = await readJsonFile(diffPath);
    return Number(diff.AddedBoardCount) || 0;
  } catch (error) {
    return 0;
  }
}

async function writeRunReport(report) {
  await ensureDir(reportsDir);
  const markdown = [
    "# Job Index Maintenance Run",
    "",
    `Started: ${report.StartedAt}`,
    `Completed: ${report.CompletedAt}`,
    `Status: ${report.Status}`,
    `Run ID: ${report.RunId}`,
    `Exit reason: ${report.ExitReason}`,
    `Fetch health: ${report.FetchHealth || "UNKNOWN"}`,
    `Queue state: ${report.QueueState || "UNKNOWN"}`,
    `Attempts: success ${report.Counts.Successful}; empty ${report.Counts.Empty}; failed ${report.Counts.Failed}; skipped ${report.Counts.Skipped}; unknown ${report.Counts.Unknown}`,
    `Due boards: ${report.QueueAfter?.DueBoards ?? "UNKNOWN"}; retry-delayed failed boards: ${report.QueueAfter?.RetryDelayedFailedBoards ?? "UNKNOWN"}`,
    `Catalog status: ${report.CatalogStatus}`,
    `Catalog boards added: ${report.AddedBoardCount}`,
    "",
    "## Steps",
    "",
    ...report.Steps.map((row) => `- ${row.Script}: exit ${row.ExitCode}, ${row.ElapsedSeconds}s`),
    ...(report.Warnings.length ? ["", "## Warnings", "", ...report.Warnings.map((warning) => `- ${warning}`)] : []),
    "",
  ].join("\n");
  await Promise.all([
    saveIndexRun(report),
    writeTextFile(path.join(reportsDir, "job-index-maintenance-run.md"), markdown),
  ]);
}

async function main() {
  const dryRun = parseBoolean(getArgValue("--dry-run", "true"), true);
  const budgetMinutes = positiveNumber(getArgValue("--budget-minutes", "45"), 45);
  const maxAgeHours = positiveNumber(getArgValue("--catalog-max-age-hours", "24"), 24);
  const dueLimit = positiveNumber(getArgValue("--due-limit", "250"), 250);
  const deltaLimit = positiveNumber(getArgValue("--catalog-delta-limit", "250"), 250);
  const includeKnownGood = parseBoolean(getArgValue("--include-known-good", "true"), true);
  const forceCatalog = parseBoolean(getArgValue("--force-catalog", "false"));
  const report = await startIndexRun("INDEX_MAINTENANCE", __filename, process.argv.slice(2), { id: getArgValue("--record-id", undefined) });
  Object.assign(report, { DryRun: dryRun, CatalogStatus: "", AddedBoardCount: 0, Steps: [] });
  const runId = getArgValue("--run-id", `${timestampForName()}-${report.RunId}`);
  let ownsLock = false;
  let interrupted = null;
  let reason = "pass_finished";
  let exitCode = 0;
  const scopeResults = [];
  const onInterrupt = signal => { interrupted = signal; };
  const onInt = () => onInterrupt("SIGINT");
  const onTerm = () => onInterrupt("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  const checkInterrupted = () => {
    if (interrupted) throw new Error(`Interrupted by ${interrupted}; current child commands have stopped.`);
  };
  const runStep = async (script, args = []) => {
    checkInterrupted();
    if (script === "maintain-board-index.js") {
      const scope = args[args.indexOf("--scope") + 1];
      const resultPath = path.join(path.dirname(recordPath(report.RunId)), report.RunId, `${scope}.json`);
      scopeResults.push({ Scope: scope, ResultPath: resultPath });
      args = [...args, "--result-path", resultPath];
      report.ScopeResults = scopeResults;
      await saveIndexRun(report);
    }
    try { return await runNode(script, args); }
    catch (error) { if (error.result) report.Steps.push(error.result); throw error; }
  };
  try {
    await acquireLock(budgetMinutes + 15, { checkInterrupted });
    ownsLock = true;
    try { report.QueueBefore = await readQueue(); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      report.QueueBefore = null; // A first pass can create state from the catalog.
    }
    await saveIndexRun(report);
    const commonMaintenanceArgs = [
      "--dry-run",
      String(dryRun),
      "--budget-minutes",
      String(budgetMinutes),
      "--run-id",
      runId,
    ];
    for (const ats of ["ashby", "greenhouse", "lever", "bamboohr", "workday", "icims"]) {
      const value = getArgValue(`--${ats}-limit`, "");
      if (value) commonMaintenanceArgs.push(`--${ats}-limit`, value);
    }
    const catalogArgs = ["--max-age-hours", String(maxAgeHours)];
    if (forceCatalog) catalogArgs.push("--force", "true");
    const dueArgs = [
      ...commonMaintenanceArgs,
      "--scope",
      "due",
      "--limit-total",
      String(dueLimit),
      "--include-known-good",
      String(includeKnownGood),
    ];

    console.log("Starting catalog refresh and due-board maintenance in parallel...");
    const [catalogResult, dueResult] = await Promise.allSettled([
      runStep("refresh-catalogs.js", catalogArgs),
      runStep("maintain-board-index.js", dueArgs),
    ]);

    checkInterrupted();
    if (dueResult.status === "rejected") throw dueResult.reason;
    report.Steps.push(dueResult.value);
    if (catalogResult.status === "fulfilled") {
      report.Steps.push(catalogResult.value);
      report.CatalogStatus = "complete";
      report.AddedBoardCount = await getAddedBoardCount();
      if (report.AddedBoardCount > 0) {
        report.Steps.push(
          await runStep("maintain-board-index.js", [
            ...commonMaintenanceArgs,
            "--scope",
            "catalog-delta",
            "--keys-file",
            diffPath,
            "--limit-total",
            String(deltaLimit),
          ])
        );
      }
    } else {
      report.CatalogStatus = "failed_using_last_known_good";
      report.Warnings.push(`Catalog refresh failed; continued with the last-known-good queue: ${catalogResult.reason.message}`);
    }

    if (!dryRun) report.Steps.push(await runStep("index-batches.js"));
    report.Steps.push(await runStep("report-board-freshness.js"));
    report.Steps.push(await runStep("report-ats-anomalies.js"));
    checkInterrupted();
  } catch (error) {
    reason = interrupted ? "interrupted" : error.code === "MAINTENANCE_OVERLAP" ? "overlap" : "command_failure";
    exitCode = interrupted ? (interrupted === "SIGINT" ? 130 : 143) : 1;
    report.Warnings.push(error.message);
  } finally {
    try {
      for (const scope of scopeResults) {
        try {
          const result = await readJsonFile(scope.ResultPath);
          if (result.RunId !== runId) throw new Error("Scope result run ID does not match.");
          report.Cycles.push(result);
          if (result.AttemptedBoardCount < result.SelectedBoardCount && !dryRun) report.Warnings.push(`${scope.Scope}: some selected boards were not attempted.`);
        } catch (error) {
          report.Warnings.push(`${scope.Scope}: result is unavailable: ${error.message}`);
          if (!exitCode) { reason = "command_failure"; exitCode = 1; }
        }
      }
      report.Counts = sumAttempts(report.Cycles.map(cycle => cycle.Counts));
      try { report.QueueAfter = await readQueue(); }
      catch (error) {
        report.QueueAfter = null;
        report.Warnings.push(error.message);
        if (!exitCode) { reason = "unreadable_state"; exitCode = 1; }
      }
      if (interrupted) { reason = "interrupted"; exitCode = interrupted === "SIGINT" ? 130 : 143; }
      if (!exitCode && fetchHealth(report.Counts) === "ALL_FAILED") { reason = "all_failed"; exitCode = 1; }
      else if (!exitCode && reason === "pass_finished") {
        if (dryRun) reason = "dry_run";
        else if (report.QueueAfter.DueBoards === 0) reason = report.QueueAfter.RetryDelayedFailedBoards ? "retry_deferred" : "queue_exhausted";
        else if (!report.Counts.Total) reason = "no_progress";
      }
      Object.assign(report, terminalResult(report, reason, exitCode));
      await writeRunReport(report);
      console.log(`Index maintenance ${report.Status}: ${reason}; fetch health ${report.FetchHealth}; due ${report.QueueAfter?.DueBoards ?? "UNKNOWN"}; retry-delayed failed ${report.QueueAfter?.RetryDelayedFailedBoards ?? "UNKNOWN"}.`);
    } finally {
      // SIGTERM waits for current child commands. Do not release a lock while
      // those commands can still write. SIGKILL leaves records for manual review.
      if (ownsLock) {
        const owner = await readJsonFile(lockPath);
        if (owner.PID !== process.pid) throw new Error("Maintenance lock owner changed; manual review is required.");
        await fs.rm(lockPath);
      }
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    }
  }
  if (exitCode) process.exitCode = exitCode;
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { acquireLock, main, processIsRunning };
