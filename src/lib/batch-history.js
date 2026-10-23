const { writeFetchHistory, recoverFetchHistory, mergeEvent } = require("./batch-history-ledger");

const schemaVersion = 1;

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
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

function isLiveFetch(row) {
  return ["success", "empty"].includes(cleanText(row.Status).toLowerCase());
}

function getLatestLiveFetchByBoard(fetchLogRows) {
  const latest = new Map();

  for (const row of fetchLogRows) {
    if (!isLiveFetch(row)) continue;
    const key = getBoardKey(row);
    if (!key) continue;

    const current = latest.get(key);
    if (!current || parseDateTime(row.FetchedAt) >= parseDateTime(current.FetchedAt)) {
      latest.set(key, row);
    }
  }

  return latest;
}

function toBoardStateRow(row) {
  return {
    BoardKey: getBoardKey(row),
    ATS: cleanText(row.ATS).toLowerCase(),
    CatalogSlug: cleanText(row.CatalogSlug),
    Status: cleanText(row.Status).toLowerCase(),
    FetchedAt: cleanText(row.FetchedAt),
    SourceBatch: cleanText(row.SourceBatch),
    JobCount: Number(row.JobCount) || 0,
  };
}

function getHistoryMonth(value) {
  const timestamp = parseDateTime(value);
  if (!timestamp) return "unknown";
  return new Date(timestamp).toISOString().slice(0, 7);
}

function toHistoryEvent(row) {
  const sourceBatch = cleanText(row.SourceBatch);
  const boardKey = getBoardKey(row);
  const fetchedAt = cleanText(row.FetchedAt);
  return {
    EventId: [sourceBatch, boardKey, fetchedAt, cleanText(row.Status).toLowerCase()].join("|"),
    SourceBatch: sourceBatch,
    BoardKey: boardKey,
    ATS: cleanText(row.ATS).toLowerCase(),
    CatalogSlug: cleanText(row.CatalogSlug),
    Status: cleanText(row.Status).toLowerCase(),
    HttpStatus: row.HttpStatus === undefined || row.HttpStatus === null ? "" : row.HttpStatus,
    JobCount: Number(row.JobCount) || 0,
    ErrorClass: cleanText(row.ErrorClass),
    ...(row.Diagnostic ? { Diagnostic: row.Diagnostic } : {}),
    FetchedAt: fetchedAt,
  };
}

function validateHistoryEvent(event, month) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid history event");
  for (const key of ["EventId", "SourceBatch", "BoardKey", "ATS", "CatalogSlug", "Status", "FetchedAt"]) {
    if (typeof event[key] !== "string") throw new Error("Invalid history identity: " + key);
  }
  const expected = toHistoryEvent(event);
  if (!event.BoardKey || !event.FetchedAt || event.BoardKey !== expected.BoardKey ||
      event.EventId !== expected.EventId || getHistoryMonth(event.FetchedAt) !== month) {
    throw new Error("Invalid history event identity or month: " + event.EventId);
  }
}

async function writeDerivedBatchHistory({ outputDir, generatedAt, sourceBatchCount, fetchLogRows, onHistoryPhase }) {
  const latest = getLatestLiveFetchByBoard(fetchLogRows);
  const boardRows = Array.from(latest.values(), toBoardStateRow).sort((left, right) =>
    left.BoardKey.localeCompare(right.BoardKey)
  );
  const state = {
    SchemaVersion: schemaVersion,
    GeneratedAt: generatedAt,
    SourceBatchCount: sourceBatchCount,
    BoardCount: boardRows.length,
    Boards: boardRows,
  };

  const byMonth = new Map();
  for (const row of fetchLogRows) {
    const event = toHistoryEvent(row);
    if (!event.BoardKey || !event.FetchedAt) continue;
    const month = getHistoryMonth(event.FetchedAt);
    if (!byMonth.has(month)) byMonth.set(month, new Map());
    mergeEvent(byMonth.get(month), event);
  }

  const history = await writeFetchHistory({
    outputDir, byMonth, state, validate: validateHistoryEvent, onPhase: onHistoryPhase,
  });
  return { boardCount: boardRows.length, ...history };
}

function isUsableBoardState(value, sourceBatchCount) {
  return Boolean(
    value &&
      value.SchemaVersion === schemaVersion &&
      Number(value.SourceBatchCount) === Number(sourceBatchCount) &&
      Array.isArray(value.Boards)
  );
}

module.exports = {
  cleanText,
  getBoardKey,
  getLatestLiveFetchByBoard,
  isLiveFetch,
  isUsableBoardState,
  parseDateTime,
  writeDerivedBatchHistory,
  recoverFetchHistory,
  toHistoryEvent,
  toBoardStateRow,
  getHistoryMonth,
  validateHistoryEvent,
};
