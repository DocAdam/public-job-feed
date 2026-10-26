const { getCompanyKey, getPreferredCompanyNameSeed, titleCaseCompany } = require("./company-key");

const ATS_CONFIG = [
  { key: "ashby", slugField: "AshbySlug", urlField: "AshbyURL", hasField: "HasAshby", strictBest: true },
  {
    key: "greenhouse",
    slugField: "GreenhouseSlug",
    urlField: "GreenhouseURL",
    hasField: "HasGreenhouse",
    strictBest: true,
  },
  { key: "lever", slugField: "LeverSlug", urlField: "LeverURL", hasField: "HasLever", strictBest: true },
  { key: "workday", slugField: "WorkdaySlug", urlField: "WorkdayURL", hasField: "HasWorkday", strictBest: false },
  {
    key: "bamboohr",
    slugField: "BambooHRSlug",
    urlField: "BambooHRURL",
    hasField: "HasBambooHR",
    strictBest: false,
  },
  { key: "icims", slugField: "ICIMSSlug", urlField: "ICIMSURL", hasField: "HasICIMS", strictBest: false },
];

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return cleanText(value).toLowerCase() === "true";
}

function boardKey(ats, slug) {
  const normalizedAts = cleanText(ats).toLowerCase();
  const normalizedSlug = cleanText(slug).toLowerCase();
  return normalizedAts && normalizedSlug ? `${normalizedAts}|${normalizedSlug}` : "";
}

function atsPresent(row, config) {
  if (asBoolean(row[config.hasField]) || cleanText(row[config.slugField])) return true;
  const values = Array.isArray(row.ATSList)
    ? row.ATSList
    : cleanText(row.ATSList || row.OriginalATSList).split("|");
  return values.map((value) => cleanText(value).toLowerCase()).includes(config.key);
}

function isFetchEligible(row, config) {
  if (!cleanText(row[config.slugField])) return false;
  if (config.strictBest) {
    return cleanText(row.BestATS).toLowerCase() === config.key && asBoolean(row.CrawlReady);
  }
  return atsPresent(row, config);
}

function enumerateBoardEntries(queueRows, options = {}) {
  const includeIneligible = options.includeIneligible === true;
  const entries = [];

  for (const row of queueRows) {
    for (const config of ATS_CONFIG) {
      if (!atsPresent(row, config)) continue;
      const slug = cleanText(row[config.slugField]);
      const key = boardKey(config.key, slug);
      if (!key) continue;
      const fetchEligible = isFetchEligible(row, config);
      if (!fetchEligible && !includeIneligible) continue;

      entries.push({
        BoardKey: key,
        ATS: config.key,
        CatalogSlug: slug,
        Company: cleanText(row.PreferredCompanyName),
        CompanyKey: cleanText(row.CompanyKey),
        BoardURL: cleanText(row[config.urlField]),
        FetchEligible: fetchEligible,
        CrawlPriority: cleanText(row.CrawlPriority),
        QueueRow: row,
      });
    }
  }

  return entries;
}

function toBoardEntries(rows, options = {}) {
  if (Array.isArray(rows) && rows.every((row) => row && row.BoardKey && row.ATS && row.CatalogSlug)) {
    return options.includeIneligible === true ? rows : rows.filter((row) => row.FetchEligible);
  }
  return enumerateBoardEntries(rows, options);
}

function buildBoardCatalog(normalizedRows, queueRows, generatedAt = new Date().toISOString()) {
  const queueByCompany = new Map(queueRows.map((row) => [cleanText(row.CompanyKey), row]));
  const byKey = new Map();
  const priorityByAts = {
    ashby: "HIGH",
    greenhouse: "HIGH",
    lever: "HIGH",
    bamboohr: "LOW",
    workday: "MEDIUM",
    icims: "MEDIUM",
  };

  for (const row of normalizedRows) {
    const ats = cleanText(row.ATS).toLowerCase();
    const slug = cleanText(row.CatalogSlug);
    const key = boardKey(ats, slug);
    if (!key || !ATS_CONFIG.some((config) => config.key === ats)) continue;
    const companyKey = getCompanyKey(row);
    const queueRow = queueByCompany.get(companyKey) || {};
    const company =
      cleanText(row.CatalogCompany) ||
      cleanText(queueRow.PreferredCompanyName) ||
      titleCaseCompany(getPreferredCompanyNameSeed(row));
    const entry = {
      BoardKey: key,
      ATS: ats,
      CatalogSlug: slug,
      Company: company,
      CompanyKey: companyKey,
      BoardURL: cleanText(row.BoardURL),
      FetchEligible: true,
      CrawlPriority: cleanText(queueRow.CrawlPriority) || priorityByAts[ats] || "MEDIUM",
      FetchSupportStatus: ["workday", "bamboohr", "icims"].includes(ats) ? "BEST_EFFORT" : "SUPPORTED",
      CatalogSource: cleanText(row.Source),
      GeneratedAt: generatedAt,
    };
    if (!byKey.has(key)) byKey.set(key, entry);
  }

  return Array.from(byKey.values()).sort((a, b) => a.BoardKey.localeCompare(b.BoardKey));
}

function toFetchQueueRow(entry) {
  const config = ATS_CONFIG.find((item) => item.key === entry.ATS);
  if (!config) return null;
  return {
    PreferredCompanyName: entry.Company,
    CompanyKey: entry.CompanyKey,
    BestATS: entry.ATS,
    CrawlReady: entry.FetchEligible,
    CrawlPriority: entry.CrawlPriority,
    [config.hasField]: true,
    [config.slugField]: entry.CatalogSlug,
    [config.urlField]: entry.BoardURL,
  };
}

function diffBoardEntries(previousRows, nextRows) {
  const previous = new Map(toBoardEntries(previousRows, { includeIneligible: true }).map((row) => [row.BoardKey, row]));
  const next = new Map(toBoardEntries(nextRows, { includeIneligible: true }).map((row) => [row.BoardKey, row]));

  return {
    AddedBoards: Array.from(next.values()).filter((row) => !previous.has(row.BoardKey)),
    RemovedBoards: Array.from(previous.values()).filter((row) => !next.has(row.BoardKey)),
    RetainedBoardCount: Array.from(next.keys()).filter((key) => previous.has(key)).length,
  };
}

module.exports = {
  ATS_CONFIG,
  boardKey,
  buildBoardCatalog,
  diffBoardEntries,
  enumerateBoardEntries,
  toBoardEntries,
  toFetchQueueRow,
};
