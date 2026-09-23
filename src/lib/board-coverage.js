const { boardKey } = require("./board-registry");
function boardCoverage(catalog, logs) {
  const boards = new Map();
  for (const board of catalog) {
    const key = boardKey(board.ATS, board.CatalogSlug);
    if (!key || boards.has(key)) throw new Error(`Missing or duplicate catalog board key: ${key}`);
    boards.set(key, board);
  }
  const latest = new Map();
  for (const log of logs) {
    const key = boardKey(log.ATS, log.CatalogSlug);
    if (!boards.has(key) || !Number.isFinite(Date.parse(log.FetchedAt))) continue;
    if (!latest.has(key) || Date.parse(log.FetchedAt) > Date.parse(latest.get(key).FetchedAt)) latest.set(key, log);
  }
  const remaining = [...boards.entries()].filter(([key, board]) => board.FetchEligible && !latest.has(key)).map(([key, board]) => ({
    ...board, BoardKey: key, BestATS: board.ATS, BestFetchURL: board.BoardURL, EstimatedFetchURL: board.BoardURL,
    FetchSupportReason: "No recorded attempt for this catalog board key.", SuggestedBatchCommand: "npm run jobs:maintain-index -- --dry-run false",
  }));
  const byAts = [...new Set(catalog.map(board => board.ATS))].sort().map(ats => {
    const entries = [...boards.entries()].filter(([, board]) => board.ATS === ats);
    const eligible = entries.filter(([, board]) => board.FetchEligible);
    const attempts = eligible.flatMap(([key]) => latest.has(key) ? [latest.get(key)] : []);
    const count = status => attempts.filter(log => String(log.Status).toLowerCase() === status).length;
    const catalogOnly = entries.length - eligible.length;
    const remainingCount = eligible.length - attempts.length;
    return { ATS: ats, CatalogRows: entries.length, CrawlReadyRows: eligible.length, FetchSupportedRows: eligible.length,
      AttemptedRows: attempts.length, SuccessRows: count("success"), EmptyRows: count("empty"), FailedRows: count("failed"), SkippedRows: count("skipped"),
      CatalogOnlyRows: catalogOnly, RemainingRows: remainingCount,
      CoveragePercent: entries.length ? Number(((attempts.length + catalogOnly) / entries.length * 100).toFixed(2)) : 100,
      CompletionStatus: eligible.length ? remainingCount === 0 ? "COMPLETE" : attempts.length ? "IN_PROGRESS" : "NOT_STARTED" : "CATALOG_ONLY" };
  });
  return { byAts, remaining, attempted: [...latest.entries()].filter(([key]) => boards.get(key).FetchEligible).map(([, log]) => log) };
}
module.exports = { boardCoverage };
