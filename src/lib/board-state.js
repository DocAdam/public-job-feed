const { enumerateBoardEntries } = require("./board-registry");
const { getAshbySlugFromUrl } = require("./ats/ashby");
const { getBambooHRSlugFromUrl } = require("./ats/bamboohr");
const { getGreenhouseSlugFromUrl } = require("./ats/greenhouse");
const { getICIMSSlugFromUrl } = require("./ats/icims");
const { getLeverSlugFromUrl } = require("./ats/lever");
const { getWorkdaySlugFromUrl } = require("./ats/workday");

const STATUS_INTERVAL_HOURS = {
  GOOD_MATCHES_FOUND: 24,
  JOBS_FOUND: 5 * 24,
  FETCHED_EMPTY: 10 * 24,
  FETCH_FAILED: 24,
  NOT_ATTEMPTED: 0,
  UNSUPPORTED: null,
  CATALOG_ONLY: null,
};

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseTime(value) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isoAfter(timestamp, hours) {
  if (hours === null) return "";
  const base = timestamp || Date.now();
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

function getIntervalHours(status, consecutiveFailures = 0) {
  if (status === "FETCH_FAILED") {
    return Math.min(24 * 7, 24 * 2 ** Math.max(0, consecutiveFailures - 1));
  }
  return Object.prototype.hasOwnProperty.call(STATUS_INTERVAL_HOURS, status)
    ? STATUS_INTERVAL_HOURS[status]
    : 7 * 24;
}

function nextCheckAt(status, lastAttemptAt, consecutiveFailures) {
  const hours = getIntervalHours(status, consecutiveFailures);
  if (hours === null) return "";
  if (hours === 0) return new Date(0).toISOString();
  return isoAfter(parseTime(lastAttemptAt), hours);
}

function coverageKey(ats, companyKey) {
  return `${cleanText(ats).toLowerCase()}|${cleanText(companyKey).toLowerCase()}`;
}

function buildCoverageLookup(rows) {
  const byCompany = new Map();
  const byBoard = new Map();
  const slugReaders = {
    ashby: getAshbySlugFromUrl,
    bamboohr: getBambooHRSlugFromUrl,
    greenhouse: getGreenhouseSlugFromUrl,
    icims: getICIMSSlugFromUrl,
    lever: getLeverSlugFromUrl,
    workday: getWorkdaySlugFromUrl,
  };
  for (const row of rows || []) {
    const key = coverageKey(row.ATS, row.CompanyKey);
    const current = byCompany.get(key);
    if (!current || parseTime(row.LastChecked) >= parseTime(current.LastChecked)) byCompany.set(key, row);
    const ats = cleanText(row.ATS).toLowerCase();
    const reader = slugReaders[ats];
    const slug = reader ? reader(row.CareerSiteURL || row.EstimatedFetchURL || "") : "";
    const exactKey = slug ? `${ats}|${cleanText(slug).toLowerCase()}` : "";
    const exactCurrent = exactKey ? byBoard.get(exactKey) : null;
    if (exactKey && (!exactCurrent || parseTime(row.LastChecked) >= parseTime(exactCurrent.LastChecked))) {
      byBoard.set(exactKey, row);
    }
  }
  return { byBoard, byCompany };
}

function statusFromCoverage(row, fetchEligible) {
  if (!fetchEligible) return "UNSUPPORTED";
  const status = cleanText(row && row.CoverageStatus).toUpperCase();
  return status || "NOT_ATTEMPTED";
}

function newRecord(entry, coverage, now) {
  const status = statusFromCoverage(coverage, entry.FetchEligible);
  const lastAttemptAt = cleanText(coverage && coverage.LastChecked);
  const fetchStatus = cleanText(coverage && coverage.LastFetchStatus).toLowerCase();
  const failures = status === "FETCH_FAILED" ? 1 : 0;
  return {
    BoardKey: entry.BoardKey,
    ATS: entry.ATS,
    CatalogSlug: entry.CatalogSlug,
    Company: entry.Company,
    CompanyKey: entry.CompanyKey,
    BoardURL: entry.BoardURL,
    CrawlPriority: entry.CrawlPriority,
    Active: true,
    FetchEligible: entry.FetchEligible,
    FirstSeenAt: now,
    LastCatalogSeenAt: now,
    CoverageStatus: status,
    LastFetchStatus: fetchStatus,
    LastAttemptAt: lastAttemptAt,
    LastSuccessAt: ["success", "empty"].includes(fetchStatus) ? lastAttemptAt : "",
    LastError: cleanText(coverage && coverage.LastFetchError),
    LastErrorClass: cleanText(coverage && coverage.LastErrorClass),
    JobCount: Number(coverage && coverage.JobsFound) || 0,
    GoodMatchCount: Number(coverage && coverage.GoodMatchesFound) || 0,
    AttemptCount: lastAttemptAt ? 1 : 0,
    ConsecutiveFailures: failures,
    NextCheckAt: nextCheckAt(status, lastAttemptAt, failures),
  };
}

function mergeCoverage(record, coverage) {
  if (!coverage || parseTime(coverage.LastChecked) <= parseTime(record.LastAttemptAt)) return record;
  const status = statusFromCoverage(coverage, record.FetchEligible);
  const fetchStatus = cleanText(coverage.LastFetchStatus).toLowerCase();
  const failures = status === "FETCH_FAILED" ? Math.max(1, record.ConsecutiveFailures || 0) : 0;
  return {
    ...record,
    CoverageStatus: status,
    LastFetchStatus: fetchStatus,
    LastAttemptAt: cleanText(coverage.LastChecked),
    LastSuccessAt: ["success", "empty"].includes(fetchStatus)
      ? cleanText(coverage.LastChecked)
      : record.LastSuccessAt,
    LastError: cleanText(coverage.LastFetchError),
    LastErrorClass: cleanText(coverage.LastErrorClass) || record.LastErrorClass,
    JobCount: Number(coverage.JobsFound) || 0,
    GoodMatchCount: Number(coverage.GoodMatchesFound) || 0,
    ConsecutiveFailures: failures,
    NextCheckAt: nextCheckAt(status, coverage.LastChecked, failures),
  };
}

function syncBoardStateFromEntries(entries, previousState, coverageRows, now = new Date().toISOString()) {
  const previousBoards = Array.isArray(previousState && previousState.Boards) ? previousState.Boards : [];
  const previousByKey = new Map(previousBoards.map((row) => [row.BoardKey, row]));
  const coverage = buildCoverageLookup(coverageRows);
  const activeKeys = new Set(entries.map((entry) => entry.BoardKey));
  const boards = [];

  for (const entry of entries) {
    const coverageRow =
      coverage.byBoard.get(entry.BoardKey) ||
      (!["workday", "icims"].includes(entry.ATS)
        ? coverage.byCompany.get(coverageKey(entry.ATS, entry.CompanyKey))
        : null);
    const previous = previousByKey.get(entry.BoardKey);
    let record = previous ? { ...previous } : newRecord(entry, coverageRow, now);
    record = {
      ...record,
      ATS: entry.ATS,
      CatalogSlug: entry.CatalogSlug,
      Company: entry.Company,
      CompanyKey: entry.CompanyKey,
      BoardURL: entry.BoardURL,
      CrawlPriority: entry.CrawlPriority,
      Active: true,
      FetchEligible: entry.FetchEligible,
      LastCatalogSeenAt: now,
    };
    if (!entry.FetchEligible) {
      record.CoverageStatus = "UNSUPPORTED";
      record.NextCheckAt = "";
    } else {
      record = mergeCoverage(record, coverageRow);
      if (!record.NextCheckAt) {
        record.NextCheckAt = nextCheckAt(record.CoverageStatus, record.LastAttemptAt, record.ConsecutiveFailures);
      }
    }
    boards.push(record);
  }

  for (const record of previousBoards) {
    if (!activeKeys.has(record.BoardKey)) boards.push({ ...record, Active: false, FetchEligible: false, NextCheckAt: "" });
  }

  boards.sort((a, b) => a.BoardKey.localeCompare(b.BoardKey));
  return {
    Version: 1,
    GeneratedAt: now,
    ActiveBoardCount: boards.filter((row) => row.Active).length,
    FetchEligibleBoardCount: boards.filter((row) => row.Active && row.FetchEligible).length,
    Boards: boards,
  };
}

function syncBoardState(queueRows, previousState, coverageRows, now = new Date().toISOString()) {
  return syncBoardStateFromEntries(
    enumerateBoardEntries(queueRows, { includeIneligible: true }),
    previousState,
    coverageRows,
    now
  );
}

function statusRank(status) {
  const ranks = {
    GOOD_MATCHES_FOUND: 0,
    JOBS_FOUND: 1,
    FETCH_FAILED: 2,
    FETCHED_EMPTY: 3,
    NOT_ATTEMPTED: 4,
  };
  return Object.prototype.hasOwnProperty.call(ranks, status) ? ranks[status] : 9;
}

function selectBoards(state, options = {}) {
  const nowMs = parseTime(options.now || new Date().toISOString());
  const requestedKeys = options.keys ? new Set(options.keys) : null;
  const keysUnattemptedOnly = options.keysUnattemptedOnly === true;
  const includeKnownGood = options.includeKnownGood === true;
  const maxTotal = Number(options.maxTotal) > 0 ? Number(options.maxTotal) : 250;
  const perAtsLimits = options.perAtsLimits || {};
  const candidates = state.Boards.filter((row) => {
    if (!row.Active || !row.FetchEligible) return false;
    if (requestedKeys) {
      return requestedKeys.has(row.BoardKey) && (!keysUnattemptedOnly || Number(row.AttemptCount || 0) === 0);
    }
    if (includeKnownGood && row.CoverageStatus === "GOOD_MATCHES_FOUND") return true;
    return parseTime(row.NextCheckAt) <= nowMs;
  }).sort((a, b) => {
    return (
      statusRank(a.CoverageStatus) - statusRank(b.CoverageStatus) ||
      parseTime(a.NextCheckAt) - parseTime(b.NextCheckAt) ||
      a.BoardKey.localeCompare(b.BoardKey)
    );
  });

  const groups = new Map();
  for (const row of candidates) {
    if (!groups.has(row.ATS)) groups.set(row.ATS, []);
    groups.get(row.ATS).push(row);
  }
  const atsOrder = Array.from(groups.keys()).sort();
  const selected = [];
  const selectedByAts = new Map();
  let madeProgress = true;

  while (selected.length < maxTotal && madeProgress) {
    madeProgress = false;
    for (const ats of atsOrder) {
      if (selected.length >= maxTotal) break;
      const count = selectedByAts.get(ats) || 0;
      const cap = Number(perAtsLimits[ats]) > 0 ? Number(perAtsLimits[ats]) : maxTotal;
      const group = groups.get(ats);
      if (count >= cap || group.length === 0) continue;
      selected.push(group.shift());
      selectedByAts.set(ats, count + 1);
      madeProgress = true;
    }
  }

  return selected;
}

function updateBoardState(state, fetchLogRows, jobRows, now = new Date().toISOString()) {
  const goodCounts = new Map();
  for (const row of jobRows || []) {
    const key = `${cleanText(row.ATS).toLowerCase()}|${cleanText(row.CatalogSlug).toLowerCase()}`;
    if (!key || key.endsWith("|")) continue;
    const current = goodCounts.get(key) || { jobs: 0, good: 0 };
    current.jobs += 1;
    if (row.WriterFitTier === "A" || row.WriterFitTier === "B") current.good += 1;
    goodCounts.set(key, current);
  }

  const byKey = new Map(state.Boards.map((row) => [row.BoardKey, row]));
  for (const log of fetchLogRows || []) {
    const key = `${cleanText(log.ATS).toLowerCase()}|${cleanText(log.CatalogSlug).toLowerCase()}`;
    const record = byKey.get(key);
    if (!record) continue;
    const status = cleanText(log.Status).toLowerCase();
    const counts = goodCounts.get(key) || { jobs: Number(log.JobCount) || 0, good: 0 };
    let coverageStatus = record.CoverageStatus;
    if (status === "success") coverageStatus = counts.good > 0 ? "GOOD_MATCHES_FOUND" : "JOBS_FOUND";
    if (status === "empty") coverageStatus = "FETCHED_EMPTY";
    if (status === "failed") coverageStatus = "FETCH_FAILED";
    if (status === "skipped") coverageStatus = "UNSUPPORTED";
    const failures = status === "failed" ? Number(record.ConsecutiveFailures || 0) + 1 : 0;
    const fetchedAt = cleanText(log.FetchedAt) || now;
    Object.assign(record, {
      CoverageStatus: coverageStatus,
      LastFetchStatus: status,
      LastAttemptAt: fetchedAt,
      LastSuccessAt: ["success", "empty"].includes(status) ? fetchedAt : record.LastSuccessAt,
      LastError: cleanText(log.Error),
      LastErrorClass: cleanText(log.ErrorClass),
      JobCount: counts.jobs,
      GoodMatchCount: counts.good,
      AttemptCount: Number(record.AttemptCount || 0) + 1,
      ConsecutiveFailures: failures,
      NextCheckAt: nextCheckAt(coverageStatus, fetchedAt, failures),
    });
  }
  state.GeneratedAt = now;
  return state;
}

module.exports = {
  STATUS_INTERVAL_HOURS,
  getIntervalHours,
  nextCheckAt,
  selectBoards,
  syncBoardState,
  syncBoardStateFromEntries,
  updateBoardState,
};
