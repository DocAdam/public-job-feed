const fs = require("fs/promises");
const nodeFs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { ensureDir, writeJsonObjectFile } = require("./files");

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
    FetchedAt: fetchedAt,
  };
}

async function writeGzipJsonLines(filePath, rows) {
  await ensureDir(path.dirname(filePath));
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const body = rows.map((row) => `${JSON.stringify(row)}\n`).join("");

  try {
    await pipeline(
      require("stream").Readable.from([body]),
      zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
      nodeFs.createWriteStream(tempPath)
    );
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function writeDerivedBatchHistory({ outputDir, generatedAt, sourceBatchCount, fetchLogRows }) {
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
  await writeJsonObjectFile(path.join(outputDir, "board-latest-fetch.json"), state);

  const byMonth = new Map();
  for (const row of fetchLogRows) {
    const event = toHistoryEvent(row);
    if (!event.BoardKey || !event.FetchedAt) continue;
    const month = getHistoryMonth(event.FetchedAt);
    if (!byMonth.has(month)) byMonth.set(month, new Map());
    byMonth.get(month).set(event.EventId, event);
  }

  const historyRoot = path.join(outputDir, "history", "fetch-events");
  for (const [month, events] of byMonth) {
    const rows = Array.from(events.values()).sort((left, right) => left.EventId.localeCompare(right.EventId));
    await writeGzipJsonLines(path.join(historyRoot, `${month}.jsonl.gz`), rows);
  }

  return {
    boardCount: boardRows.length,
    eventCount: Array.from(byMonth.values()).reduce((sum, events) => sum + events.size, 0),
    months: Array.from(byMonth.keys()).sort(),
  };
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
};
