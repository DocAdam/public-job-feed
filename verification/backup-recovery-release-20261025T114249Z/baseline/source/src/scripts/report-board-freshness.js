const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const statePath = fromRoot("data", "jobs", "state", "board-state.json");
const manifestPath = fromRoot("data", "catalogs", "catalog-manifest.json");
const boardCatalogPath = fromRoot("data", "catalogs", "crawl", "board-catalog.json");
const reportsDir = fromRoot("data", "jobs", "reports");

const headers = [
  "ATS",
  "ActiveBoards",
  "FetchEligibleBoards",
  "AttemptedBoards",
  "NeverAttemptedBoards",
  "Checked24Hours",
  "Checked7Days",
  "Checked30Days",
  "SuccessfulSnapshots7Days",
  "SuccessfulSnapshot7DayPercent",
  "FailedBoardPercent",
  "DueBoards",
  "GoodMatchBoards",
  "JobsFoundBoards",
  "EmptyBoards",
  "FailedBoards",
  "RetryDelayedFailedBoards",
  "DueFailedBoards",
  "NotAttemptedStatusBoards",
  "OtherStatusBoards",
  "AttemptCoveragePercent",
  "Fresh7DayPercent",
];

function parseTime(value) {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 100;
}

function summarize(ats, boards, nowMs) {
  const active = boards.filter((row) => row.Active && (!ats || row.ATS === ats));
  const eligible = active.filter((row) => row.FetchEligible);
  const attempted = eligible.filter((row) => parseTime(row.LastAttemptAt) > 0);
  const checkedWithin = (days) => attempted.filter((row) => nowMs - parseTime(row.LastAttemptAt) <= days * 86400000).length;
  const statusCount = (status) => eligible.filter((row) => row.CoverageStatus === status).length;
  const due = eligible.filter((row) => parseTime(row.NextCheckAt) <= nowMs).length;
  const failed = eligible.filter((row) => row.CoverageStatus === "FETCH_FAILED");
  const retryDelayed = failed.filter((row) => parseTime(row.NextCheckAt) > nowMs).length;
  const knownStatuses = new Set(["GOOD_MATCHES_FOUND", "JOBS_FOUND", "FETCHED_EMPTY", "FETCH_FAILED", "NOT_ATTEMPTED"]);
  const checked7 = checkedWithin(7);
  const successful7 = eligible.filter((row) => {
    const time = parseTime(row.LastSuccessAt);
    return time > 0 && time <= nowMs && nowMs - time <= 7 * 86400000;
  }).length;
  return {
    ATS: ats || "all",
    ActiveBoards: active.length,
    FetchEligibleBoards: eligible.length,
    AttemptedBoards: attempted.length,
    NeverAttemptedBoards: eligible.length - attempted.length,
    Checked24Hours: checkedWithin(1),
    Checked7Days: checked7,
    Checked30Days: checkedWithin(30),
    SuccessfulSnapshots7Days: successful7,
    SuccessfulSnapshot7DayPercent: percent(successful7, eligible.length),
    FailedBoardPercent: percent(failed.length, eligible.length),
    DueBoards: due,
    GoodMatchBoards: statusCount("GOOD_MATCHES_FOUND"),
    JobsFoundBoards: statusCount("JOBS_FOUND"),
    EmptyBoards: statusCount("FETCHED_EMPTY"),
    FailedBoards: failed.length,
    RetryDelayedFailedBoards: retryDelayed,
    DueFailedBoards: failed.length - retryDelayed,
    NotAttemptedStatusBoards: statusCount("NOT_ATTEMPTED"),
    OtherStatusBoards: eligible.filter((row) => !knownStatuses.has(row.CoverageStatus)).length,
    AttemptCoveragePercent: percent(attempted.length, eligible.length),
    Fresh7DayPercent: percent(checked7, eligible.length),
  };
}

function failureBreakdown(boards, nowMs) {
  const groups = new Map();
  for (const row of boards.filter((item) => item.Active && item.FetchEligible && item.CoverageStatus === "FETCH_FAILED")) {
    const key = `${row.ATS}|${row.LastErrorClass || "UNCLASSIFIED"}`;
    if (!groups.has(key)) groups.set(key, { ATS: row.ATS, ErrorClass: row.LastErrorClass || "UNCLASSIFIED", Boards: 0,
      Due: 0, LastAttemptOlder7Days: 0, LastSuccessOlder7Days: 0, LastSuccessUnknown: 0, Samples: [] });
    const group = groups.get(key);
    group.Boards += 1;
    if (parseTime(row.NextCheckAt) <= nowMs) group.Due += 1;
    if (nowMs - parseTime(row.LastAttemptAt) > 7 * 86400000) group.LastAttemptOlder7Days += 1;
    if (!parseTime(row.LastSuccessAt)) group.LastSuccessUnknown += 1;
    else if (nowMs - parseTime(row.LastSuccessAt) > 7 * 86400000) group.LastSuccessOlder7Days += 1;
    if (group.Samples.length < 5) group.Samples.push({ BoardKey: row.BoardKey, LastAttemptAt: row.LastAttemptAt,
      LastSuccessAt: row.LastSuccessAt, LastError: row.LastError });
  }
  return [...groups.values()].sort((a, b) => b.Boards - a.Boards);
}

function validateFreshnessSummary(summary) {
  const issues = [];
  const equal = (actual, expected, label) => {
    if (actual !== expected) issues.push(`${label}: expected ${expected}, found ${actual}`);
  };
  if (summary.FetchEligibleBoards > summary.ActiveBoards) issues.push("FetchEligibleBoards exceeds ActiveBoards");
  equal(summary.AttemptedBoards + summary.NeverAttemptedBoards, summary.FetchEligibleBoards, "attempt accounting");
  if (summary.Checked24Hours > summary.Checked7Days || summary.Checked7Days > summary.Checked30Days) {
    issues.push("freshness windows are not monotonic");
  }
  if (summary.Checked30Days > summary.AttemptedBoards) issues.push("Checked30Days exceeds AttemptedBoards");
  if (summary.DueBoards > summary.FetchEligibleBoards) issues.push("DueBoards exceeds FetchEligibleBoards");
  equal(
    summary.GoodMatchBoards + summary.JobsFoundBoards + summary.EmptyBoards + summary.FailedBoards +
      summary.NotAttemptedStatusBoards + summary.OtherStatusBoards,
    summary.FetchEligibleBoards,
    "coverage-status accounting"
  );
  equal(summary.RetryDelayedFailedBoards + summary.DueFailedBoards, summary.FailedBoards, "failed-board retry accounting");
  return issues;
}

async function main() {
  const [state, manifest, boardCatalog] = await Promise.all([
    readJsonFile(statePath),
    readJsonFile(manifestPath).catch(() => ({})),
    readJsonFile(boardCatalogPath),
  ]);
  if (!Array.isArray(state.Boards)) throw new Error("board state is missing or invalid");
  if (!Array.isArray(boardCatalog)) throw new Error("board catalog is missing or invalid");
  const generatedAt = new Date().toISOString();
  const nowMs = Date.now();
  const atsValues = Array.from(new Set(state.Boards.filter((row) => row.Active).map((row) => row.ATS))).sort();
  const rows = [summarize("", state.Boards, nowMs), ...atsValues.map((ats) => summarize(ats, state.Boards, nowMs))];
  const overall = rows[0];
  const consistencyIssues = rows.flatMap((row) => validateFreshnessSummary(row).map((issue) => `${row.ATS}: ${issue}`));
  if (Number(state.ActiveBoardCount) !== overall.ActiveBoards) consistencyIssues.push("state ActiveBoardCount does not match active rows");
  if (Number(state.FetchEligibleBoardCount) !== overall.FetchEligibleBoards) consistencyIssues.push("state FetchEligibleBoardCount does not match eligible rows");
  const catalogFetchEligible = boardCatalog.filter((row) => row.FetchEligible).length;
  if (boardCatalog.length !== overall.ActiveBoards) consistencyIssues.push("catalog board count does not match active state rows");
  if (catalogFetchEligible !== overall.FetchEligibleBoards) consistencyIssues.push("catalog fetch-eligible count does not match state rows");
  const report = {
    GeneratedAt: generatedAt,
    StateGeneratedAt: state.GeneratedAt || null,
    FailureBreakdown: failureBreakdown(state.Boards, nowMs),
    CatalogPipelineStatus: manifest.PipelineStatus || "unknown",
    CatalogPipelineCompletedAt: manifest.PipelineCompletedAt || "",
    CatalogRefreshStatus: manifest.RefreshStatus || "unknown",
    Overall: overall,
    ByATS: rows.slice(1),
    CatalogSources: manifest.Sources || [],
    CatalogBoardCount: boardCatalog.length,
    CatalogFetchEligibleBoardCount: catalogFetchEligible,
    ConsistencyStatus: consistencyIssues.length ? "FAIL" : "PASS",
    ConsistencyIssues: consistencyIssues,
  };
  const markdown = [
    "# Board Snapshot Freshness",
    "",
    `Generated: ${generatedAt}`,
    `Catalog pipeline: ${report.CatalogPipelineStatus}`,
    `Catalog completed: ${report.CatalogPipelineCompletedAt || "unknown"}`,
    "",
    "These figures separate catalog presence from actual board checks.",
    "",
    `- Fetch-eligible boards: ${overall.FetchEligibleBoards}`,
    `- Catalog boards: ${report.CatalogBoardCount}`,
    `- Attempted at least once: ${overall.AttemptedBoards} (${overall.AttemptCoveragePercent}%)`,
    `- Attempts in the last 7 days: ${overall.Checked7Days} (${overall.Fresh7DayPercent}%)`,
    `- Successful snapshots in the last 7 days: ${overall.SuccessfulSnapshots7Days} (${overall.SuccessfulSnapshot7DayPercent}%)`,
    `- Current failed boards: ${overall.FailedBoards} (${overall.FailedBoardPercent}%)`,
    `- Board state generated: ${report.StateGeneratedAt || "Unknown"}`,
    "- A successful empty result counts as a successful snapshot. A failed attempt does not.",
    `- Currently due: ${overall.DueBoards}`,
    `- Never attempted: ${overall.NeverAttemptedBoards}`,
    `- Failed boards waiting for retry: ${overall.RetryDelayedFailedBoards}`,
    `- Failed boards currently due: ${overall.DueFailedBoards}`,
    `- Consistency check: ${report.ConsistencyStatus}`,
    ...(consistencyIssues.length ? consistencyIssues.map((issue) => `- Consistency issue: ${issue}`) : []),
    "",
    "| ATS | Eligible | Attempted | Last 24h | Attempts 7d | Due | Failed | Retry delayed | Successful snapshots 7d |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.slice(1).map(
      (row) =>
        `| ${row.ATS} | ${row.FetchEligibleBoards} | ${row.AttemptedBoards} | ${row.Checked24Hours} | ` +
        `${row.Checked7Days} | ${row.DueBoards} | ${row.FailedBoards} | ${row.RetryDelayedFailedBoards} | ${row.SuccessfulSnapshots7Days} |`
    ),
    "",
    "## Failed boards by cause", "",
    "| ATS | Cause | Boards | Due | Last success older than 7 days | Last success unknown |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...report.FailureBreakdown.map((row) => `| ${row.ATS} | ${row.ErrorClass} | ${row.Boards} | ${row.Due} | ${row.LastSuccessOlder7Days} | ${row.LastSuccessUnknown} |`), "",
  ].join("\n");
  await ensureDir(reportsDir);
  await Promise.all([
    writeJsonFile(path.join(reportsDir, "board-freshness-report.json"), report),
    writeTextFile(path.join(reportsDir, "board-freshness-by-ats.csv"), rowsToCsv(headers, rows)),
    writeTextFile(path.join(reportsDir, "board-freshness-report.md"), markdown),
  ]);
  console.log(
    `Board freshness report: ${overall.AttemptedBoards}/${overall.FetchEligibleBoards} attempted; ` +
      `${overall.Checked7Days} checked in 7 days; ${overall.DueBoards} due.`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, summarize, validateFreshnessSummary, failureBreakdown };
