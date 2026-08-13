const atsPriority = [
  { key: "ashby", label: "Ashby", slugField: "AshbySlug", urlField: "AshbyURL" },
  { key: "greenhouse", label: "Greenhouse", slugField: "GreenhouseSlug", urlField: "GreenhouseURL" },
  { key: "lever", label: "Lever", slugField: "LeverSlug", urlField: "LeverURL" },
  { key: "workday", label: "Workday", slugField: "WorkdaySlug", urlField: "WorkdayURL" },
  { key: "bamboohr", label: "BambooHR", slugField: "BambooHRSlug", urlField: "BambooHRURL" },
  { key: "icims", label: "ICIMS", slugField: "ICIMSSlug", urlField: "ICIMSURL" },
];

const priorityOrder = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  SKIP: 4,
};

const catalogOnlyAtsKeys = new Set(["workday", "bamboohr", "icims"]);
const supportedAtsKeys = new Set(["ashby", "greenhouse", "lever"]);
const bestEffortAtsKeys = new Set(["workday", "bamboohr", "icims"]);

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function boolText(value) {
  return value ? "TRUE" : "FALSE";
}

function normalizeAtsList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }

  return cleanText(value)
    .split("|")
    .map(cleanText)
    .filter(Boolean);
}

function hasOriginalAts(atsList, atsKey) {
  return atsList.some((ats) => ats.toLowerCase() === atsKey);
}

function getAtsData(candidate, atsList, ats) {
  const slug = cleanText(candidate[ats.slugField]);
  const url = cleanText(candidate[ats.urlField]);
  const presentInOriginalList = hasOriginalAts(atsList, ats.key);
  const estimatedFetchUrl = getEstimatedFetchUrl(ats.key, slug, url);

  return {
    ...ats,
    slug,
    url,
    estimatedFetchUrl,
    hasData: Boolean(slug || url || presentInOriginalList),
    hasUrl: Boolean(url || estimatedFetchUrl),
    catalogOnly: Boolean((slug || presentInOriginalList) && !url && !estimatedFetchUrl),
  };
}

function getWorkdayFetchUrlFromSlug(slug) {
  const parts = cleanText(slug).split("|").map(cleanText).filter(Boolean);
  if (parts.length < 3) {
    return "";
  }

  const tenant = parts[0];
  const hostSegment = parts[1];
  const site = parts[2];

  if (!/^wd\d+$/i.test(hostSegment)) {
    return "";
  }

  return `https://${tenant}.${hostSegment}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
}

function getEstimatedFetchUrl(atsKey, slug, url) {
  if (url) {
    return url;
  }

  if (atsKey === "ashby" && slug) {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
  }

  if (atsKey === "greenhouse" && slug) {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  }

  if (atsKey === "lever" && slug) {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  }

  if (atsKey === "workday") {
    return getWorkdayFetchUrlFromSlug(slug);
  }

  if (atsKey === "bamboohr" && slug) {
    return `https://${slug}.bamboohr.com/careers/list`;
  }

  return "";
}

function getAtsDataList(candidate, atsList) {
  return atsPriority.map((ats) => getAtsData(candidate, atsList, ats));
}

function getBestAts(candidate) {
  for (const ats of atsPriority) {
    if (cleanText(candidate[ats.slugField]) || cleanText(candidate[ats.urlField])) {
      return ats;
    }
  }

  return null;
}

function getBestAtsFromData(atsDataList) {
  return atsDataList.find((ats) => ats.hasData) || null;
}

function getReadyReason(candidate, bestAts, bestFetchUrl) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return "Malformed registry record";
  }

  if (!cleanText(candidate.CompanyKey)) {
    return "Missing company key";
  }

  if (!cleanText(candidate.PreferredCompanyName)) {
    return "Missing preferred company name";
  }

  if (!bestFetchUrl) {
    return "No usable URL";
  }

  return `${bestAts.label} board available`;
}

function getFetchSupportStatus(bestAts, estimatedFetchUrl) {
  if (!bestAts) {
    return "UNSUPPORTED";
  }

  if (supportedAtsKeys.has(bestAts.key)) {
    return "SUPPORTED";
  }

  if (bestEffortAtsKeys.has(bestAts.key)) {
    return estimatedFetchUrl ? "BEST_EFFORT" : "CATALOG_ONLY";
  }

  return "UNSUPPORTED";
}

function getFetchSupportReason(bestAts, estimatedFetchUrl) {
  if (!bestAts) {
    return "No ATS data available";
  }

  if (supportedAtsKeys.has(bestAts.key)) {
    return `${bestAts.label} public API supported`;
  }

  if (bestEffortAtsKeys.has(bestAts.key) && estimatedFetchUrl) {
    return `${bestAts.label} best-effort fetch URL estimated`;
  }

  if (bestEffortAtsKeys.has(bestAts.key)) {
    return `${bestAts.label} catalog-only; no usable fetch URL estimated`;
  }

  return `${bestAts.label} unsupported`;
}

function getCrawlStatus(candidate, crawlReady, hasAnyAtsData) {
  if (crawlReady) {
    return "READY";
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return "SKIP";
  }

  if (hasAnyAtsData) {
    return "NOT_READY";
  }

  return "SKIP";
}

function getCrawlPriority(bestAts, crawlReady) {
  if (!crawlReady) {
    return "SKIP";
  }

  if (["ashby", "greenhouse", "lever"].includes(bestAts.key)) {
    return "HIGH";
  }

  if (bestAts.key === "workday") {
    return "MEDIUM";
  }

  if (["bamboohr", "icims"].includes(bestAts.key)) {
    return "LOW";
  }

  return "SKIP";
}

function createQueueRecord(candidate, generatedAt) {
  const registryCandidate =
    candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  const atsList = normalizeAtsList(registryCandidate.ATSList);
  const atsDataList = getAtsDataList(registryCandidate, atsList);
  const bestAts = getBestAtsFromData(atsDataList) || getBestAts(registryCandidate);
  const bestAtsData = bestAts ? atsDataList.find((ats) => ats.key === bestAts.key) : null;
  const estimatedFetchUrl = bestAtsData ? cleanText(bestAtsData.estimatedFetchUrl) : "";
  const bestFetchUrl = bestAts ? cleanText(registryCandidate[bestAts.urlField]) || estimatedFetchUrl : "";
  const hasCompanyKey = Boolean(cleanText(registryCandidate.CompanyKey));
  const hasPreferredName = Boolean(cleanText(registryCandidate.PreferredCompanyName));
  const crawlReady = Boolean(bestFetchUrl && hasCompanyKey && hasPreferredName);
  const crawlPriority = getCrawlPriority(bestAts, crawlReady);
  const reason = getReadyReason(candidate, bestAts, bestFetchUrl);
  const availableAtsList = atsDataList.filter((ats) => ats.hasUrl).map((ats) => ats.label);
  const unavailableAtsList = atsDataList.filter((ats) => ats.hasData && !ats.hasUrl).map((ats) => ats.label);
  const hasAnyAtsData = atsDataList.some((ats) => ats.hasData);
  const crawlStatus = getCrawlStatus(candidate, crawlReady, hasAnyAtsData);
  const messyButExportable = atsDataList.some(
    (ats) => catalogOnlyAtsKeys.has(ats.key) && ats.catalogOnly
  );
  const fetchSupportStatus = getFetchSupportStatus(bestAts, estimatedFetchUrl);
  const fetchSupportReason = getFetchSupportReason(bestAts, estimatedFetchUrl);

  return {
    CompanyKey: cleanText(registryCandidate.CompanyKey),
    PreferredCompanyName: cleanText(registryCandidate.PreferredCompanyName),
    ATSCount: Number(registryCandidate.ATSCount) || atsList.length || 0,
    ATSList: atsList,
    HasAshby: Boolean(cleanText(registryCandidate.AshbySlug) || cleanText(registryCandidate.AshbyURL)),
    HasGreenhouse: Boolean(
      cleanText(registryCandidate.GreenhouseSlug) || cleanText(registryCandidate.GreenhouseURL)
    ),
    HasLever: Boolean(cleanText(registryCandidate.LeverSlug) || cleanText(registryCandidate.LeverURL)),
    HasWorkday: Boolean(cleanText(registryCandidate.WorkdaySlug) || cleanText(registryCandidate.WorkdayURL)),
    HasBambooHR: Boolean(cleanText(registryCandidate.BambooHRSlug) || cleanText(registryCandidate.BambooHRURL)),
    HasICIMS: Boolean(cleanText(registryCandidate.ICIMSSlug) || cleanText(registryCandidate.ICIMSURL)),
    AshbySlug: cleanText(registryCandidate.AshbySlug),
    GreenhouseSlug: cleanText(registryCandidate.GreenhouseSlug),
    LeverSlug: cleanText(registryCandidate.LeverSlug),
    WorkdaySlug: cleanText(registryCandidate.WorkdaySlug),
    BambooHRSlug: cleanText(registryCandidate.BambooHRSlug),
    ICIMSSlug: cleanText(registryCandidate.ICIMSSlug),
    AshbyURL: cleanText(registryCandidate.AshbyURL),
    GreenhouseURL: cleanText(registryCandidate.GreenhouseURL),
    LeverURL: cleanText(registryCandidate.LeverURL),
    WorkdayURL: cleanText(registryCandidate.WorkdayURL),
    BambooHRURL: cleanText(registryCandidate.BambooHRURL),
    ICIMSURL: cleanText(registryCandidate.ICIMSURL),
    BestATS: bestAts ? bestAts.label : "",
    BestFetchURL: bestFetchUrl,
    FetchSupportStatus: fetchSupportStatus,
    FetchSupportReason: fetchSupportReason,
    EstimatedFetchURL: estimatedFetchUrl,
    CrawlReady: crawlReady,
    CrawlStatus: crawlStatus,
    CrawlPriority: crawlPriority,
    Reason: reason,
    SkipReason: crawlReady ? "" : reason,
    MessyButExportable: messyButExportable,
    OriginalATSList: atsList,
    UnavailableATSList: unavailableAtsList,
    AvailableATSList: availableAtsList,
    SourceRows: Number(registryCandidate.SourceRows) || 0,
    GeneratedAt: generatedAt,
  };
}

function sortQueueRecords(rows) {
  return rows.sort((a, b) => {
    const priorityDiff = priorityOrder[a.CrawlPriority] - priorityOrder[b.CrawlPriority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const atsCountDiff = b.ATSCount - a.ATSCount;
    if (atsCountDiff !== 0) {
      return atsCountDiff;
    }

    return a.PreferredCompanyName.localeCompare(b.PreferredCompanyName);
  });
}

function getSummary(queueRows, totalRegistryCompanies, generatedAt) {
  const summary = {
    GeneratedAt: generatedAt,
    TotalRegistryCompanies: totalRegistryCompanies,
    CrawlReadyCount: queueRows.filter((row) => row.CrawlReady).length,
    SkipCount: queueRows.filter((row) => row.CrawlPriority === "SKIP").length,
    HighPriorityCount: queueRows.filter((row) => row.CrawlPriority === "HIGH").length,
    MediumPriorityCount: queueRows.filter((row) => row.CrawlPriority === "MEDIUM").length,
    LowPriorityCount: queueRows.filter((row) => row.CrawlPriority === "LOW").length,
    AshbyCount: queueRows.filter((row) => row.BestATS === "Ashby").length,
    GreenhouseCount: queueRows.filter((row) => row.BestATS === "Greenhouse").length,
    LeverCount: queueRows.filter((row) => row.BestATS === "Lever").length,
    WorkdayCount: queueRows.filter((row) => row.BestATS === "Workday").length,
    BambooHRCount: queueRows.filter((row) => row.BestATS === "BambooHR").length,
    ICIMSCount: queueRows.filter((row) => row.BestATS === "ICIMS").length,
    AshbyReady: queueRows.filter((row) => row.CrawlReady && row.BestATS === "Ashby").length,
    GreenhouseReady: queueRows.filter((row) => row.CrawlReady && row.BestATS === "Greenhouse").length,
    LeverReady: queueRows.filter((row) => row.CrawlReady && row.BestATS === "Lever").length,
    WorkdayCatalogOnly: queueRows.filter((row) => row.UnavailableATSList.includes("Workday")).length,
    BambooHRCatalogOnly: queueRows.filter((row) => row.UnavailableATSList.includes("BambooHR")).length,
    ICIMSCatalogOnly: queueRows.filter((row) => row.UnavailableATSList.includes("ICIMS")).length,
    CatalogOnlyCount: queueRows.filter((row) => row.CrawlStatus === "NOT_READY").length,
    MessyButExportableCount: queueRows.filter((row) => row.MessyButExportable).length,
  };

  return summary;
}

function getPriorityBreakdown(queueRows) {
  return ["HIGH", "MEDIUM", "LOW", "SKIP"].map((priority) => ({
    Priority: priority,
    Count: queueRows.filter((row) => row.CrawlPriority === priority).length,
  }));
}

function toCsvQueueRows(queueRows) {
  return queueRows.map((row) => ({
    ...row,
    ATSList: row.ATSList.join(" | "),
    OriginalATSList: row.OriginalATSList.join(" | "),
    UnavailableATSList: row.UnavailableATSList.join(" | "),
    AvailableATSList: row.AvailableATSList.join(" | "),
    HasAshby: boolText(row.HasAshby),
    HasGreenhouse: boolText(row.HasGreenhouse),
    HasLever: boolText(row.HasLever),
    HasWorkday: boolText(row.HasWorkday),
    HasBambooHR: boolText(row.HasBambooHR),
    HasICIMS: boolText(row.HasICIMS),
    CrawlReady: boolText(row.CrawlReady),
    MessyButExportable: boolText(row.MessyButExportable),
  }));
}

function buildCrawlQueue(registryCandidates, generatedAt) {
  const queueRows = sortQueueRecords(
    registryCandidates.map((candidate) => createQueueRecord(candidate, generatedAt))
  );
  const summary = getSummary(queueRows, registryCandidates.length, generatedAt);

  return {
    queueRows,
    queueCsvRows: toCsvQueueRows(queueRows),
    summary,
    summaryRows: [summary],
    priorityBreakdownRows: getPriorityBreakdown(queueRows),
    highPrioritySampleRows: toCsvQueueRows(queueRows.filter((row) => row.CrawlPriority === "HIGH").slice(0, 100)),
    mediumPrioritySampleRows: toCsvQueueRows(
      queueRows.filter((row) => row.CrawlPriority === "MEDIUM").slice(0, 100)
    ),
    lowPrioritySampleRows: toCsvQueueRows(queueRows.filter((row) => row.CrawlPriority === "LOW").slice(0, 100)),
  };
}

module.exports = {
  buildCrawlQueue,
  createQueueRecord,
  priorityOrder,
};
