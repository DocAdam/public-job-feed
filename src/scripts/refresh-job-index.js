const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

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

async function acquireLock(waitMinutes) {
  await ensureDir(stateDir);
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  let lastNotice = 0;

  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify({ PID: process.pid, StartedAt: new Date().toISOString() }, null, 2)}\n`);
      await handle.close();
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let lock = {};
      try {
        lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
      } catch (readError) {
        lock = {};
      }
      if (!processIsRunning(Number(lock.PID))) {
        console.warn("Removing stale maintenance lock.");
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`another maintenance run (PID ${lock.PID}) is still active after ${waitMinutes} minutes`);
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
    child.on("close", (code) => {
      const result = { Script: scriptName, ExitCode: code, ElapsedSeconds: Math.round((Date.now() - startedAt) / 1000) };
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
    writeJsonFile(path.join(reportsDir, "job-index-maintenance-run.json"), report),
    writeTextFile(path.join(reportsDir, "job-index-maintenance-run.md"), markdown),
  ]);
}

async function main() {
  const startedAt = new Date().toISOString();
  const dryRun = parseBoolean(getArgValue("--dry-run", "true"), true);
  const budgetMinutes = positiveNumber(getArgValue("--budget-minutes", "45"), 45);
  const maxAgeHours = positiveNumber(getArgValue("--catalog-max-age-hours", "24"), 24);
  const dueLimit = positiveNumber(getArgValue("--due-limit", "250"), 250);
  const deltaLimit = positiveNumber(getArgValue("--catalog-delta-limit", "250"), 250);
  const includeKnownGood = parseBoolean(getArgValue("--include-known-good", "true"), true);
  const forceCatalog = parseBoolean(getArgValue("--force-catalog", "false"));
  const runId = getArgValue("--run-id", timestampForName());
  const report = { StartedAt: startedAt, CompletedAt: "", Status: "running", CatalogStatus: "", AddedBoardCount: 0, Steps: [], Warnings: [] };

  await acquireLock(budgetMinutes + 15);
  try {
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
      runNode("refresh-catalogs.js", catalogArgs),
      runNode("maintain-board-index.js", dueArgs),
    ]);

    if (dueResult.status === "rejected") throw dueResult.reason;
    report.Steps.push(dueResult.value);
    if (catalogResult.status === "fulfilled") {
      report.Steps.push(catalogResult.value);
      report.CatalogStatus = "complete";
      report.AddedBoardCount = await getAddedBoardCount();
      if (report.AddedBoardCount > 0) {
        report.Steps.push(
          await runNode("maintain-board-index.js", [
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
      if (catalogResult.reason.result) report.Steps.push(catalogResult.reason.result);
    }

    if (!dryRun) report.Steps.push(await runNode("index-batches.js"));
    report.Steps.push(await runNode("report-board-freshness.js"));
    report.Steps.push(await runNode("report-ats-anomalies.js"));
    report.Status = report.Warnings.length ? "complete_with_warnings" : "complete";
  } catch (error) {
    report.Status = "failed";
    report.Warnings.push(error.message);
    throw error;
  } finally {
    report.CompletedAt = new Date().toISOString();
    await writeRunReport(report);
    await fs.rm(lockPath, { force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { acquireLock, main, processIsRunning };
