const fs = require("fs/promises");
const path = require("path");
const { evaluateAtsAnomalies } = require("../lib/ats-anomaly");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const batchesDir = fromRoot("data", "jobs", "batches");
const reportsDir = fromRoot("data", "jobs", "reports");

async function findLogs(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findLogs(target)));
    else if (entry.name === "jobs-batch-fetch-log.json") found.push(target);
  }
  return found;
}

function attemptKey(row) {
  return [row.ATS, row.CatalogSlug, row.FetchedAt, row.Status].map((value) => String(value || "").toLowerCase()).join("|");
}

function boardKey(row) {
  return [row.ATS, row.CatalogSlug].map((value) => String(value || "").toLowerCase()).join("|");
}

function latestByBoard(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = boardKey(row);
    const previous = latest.get(key);
    if (!previous || Date.parse(row.FetchedAt) > Date.parse(previous.FetchedAt)) latest.set(key, row);
  }
  return latest;
}

async function readAttempts() {
  const logs = await findLogs(batchesDir);
  const unique = new Map();
  for (const logPath of logs) {
    const rows = await readJsonFile(logPath).catch(() => []);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (Date.parse(row.FetchedAt) && row.ATS) unique.set(attemptKey(row), row);
    }
  }
  return Array.from(unique.values());
}

async function main() {
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const recentStart = now - 24 * 60 * 60 * 1000;
  const baselineStart = recentStart - 7 * 24 * 60 * 60 * 1000;
  const attempts = await readAttempts();
  const atsValues = Array.from(new Set(attempts.map((row) => String(row.ATS).toLowerCase()))).sort();
  const byAts = atsValues.map((ats) => {
    const atsRows = attempts.filter((row) => String(row.ATS).toLowerCase() === ats);
    const recentAll = atsRows.filter((row) => Date.parse(row.FetchedAt) >= recentStart && Date.parse(row.FetchedAt) <= now);
    const baselineAll = atsRows.filter((row) => Date.parse(row.FetchedAt) >= baselineStart && Date.parse(row.FetchedAt) < recentStart);
    const recentByBoard = latestByBoard(recentAll);
    const baselineByBoard = latestByBoard(baselineAll);
    const matchedKeys = Array.from(recentByBoard.keys()).filter((key) => baselineByBoard.has(key));
    const result = evaluateAtsAnomalies(
      ats,
      matchedKeys.map((key) => recentByBoard.get(key)),
      matchedKeys.map((key) => baselineByBoard.get(key))
    );
    return {
      ...result,
      RecentBoards: recentByBoard.size,
      BaselineBoards: baselineByBoard.size,
      MatchedBoards: matchedKeys.length,
      NewRecentBoards: recentByBoard.size - matchedKeys.length,
    };
  });
  const alerts = byAts.flatMap((row) => row.Alerts.map((alert) => ({ ATS: row.ATS, ...alert })));
  const report = {
    GeneratedAt: generatedAt,
    RecentWindowHours: 24,
    BaselineWindowDays: 7,
    RecentWindowStart: new Date(recentStart).toISOString(),
    BaselineWindowStart: new Date(baselineStart).toISOString(),
    Status: alerts.some((row) => row.Severity === "HIGH") ? "HIGH" : alerts.length ? "WARN" : "OK",
    AlertCount: alerts.length,
    Alerts: alerts,
    ByATS: byAts,
  };
  const markdown = [
    "# ATS Anomaly Alert",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${report.Status}`,
    "",
    "Compares the latest result for boards checked in both the most recent 24 hours and the preceding seven-day baseline. Matching the same boards avoids treating a one-time catalog expansion as an ATS regression. An alert requires at least 20 recent and 50 baseline matched attempts, a 10 percentage-point increase, and a 1.5x increase.",
    "",
    "| ATS | Status | Recent boards | Matched boards | New boards | HTTP failure | Empty | Zero job |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...byAts.map((row) => `| ${row.ATS} | ${row.Status} | ${row.RecentBoards} | ${row.MatchedBoards} | ${row.NewRecentBoards} | ${row.Recent.HTTPFailureRate}% | ${row.Recent.EmptyRate}% | ${row.Recent.ZeroJobRate}% |`),
    "",
    "## Alerts",
    "",
    ...(alerts.length ? alerts.map((row) => `- ${row.Severity}: ${row.ATS} ${row.Metric} rose from ${row.BaselineRate}% to ${row.RecentRate}% (+${row.PointIncrease} points).`) : ["None."]),
    "",
  ].join("\n");
  await ensureDir(reportsDir);
  await Promise.all([
    writeJsonFile(path.join(reportsDir, "ats-anomaly-alert.json"), report),
    writeTextFile(path.join(reportsDir, "ats-anomaly-alert.md"), markdown),
  ]);
  console.log(`ATS anomaly alert: ${report.Status}; ${report.AlertCount} alert(s).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, readAttempts };
