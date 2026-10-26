const { selectDedupedRows } = require("./dedupe-select");
const { normalizeTitle } = require("./job-titles");

const schemaVersion = 1;

function normalizeVariant(value) {
  return normalizeTitle(value)
    .split(" ")
    .map((token) => {
      if (token === "sr") return "senior";
      if (token === "tech") return "technical";
      return token;
    })
    .join(" ");
}

function matchPersonalTitle(title, records = []) {
  const normalizedTitle = normalizeTitle(title);
  const variantTitle = normalizeVariant(title);
  if (!normalizedTitle) return null;

  const exact = records.find((record) => normalizeTitle(record.Title) === normalizedTitle);
  if (exact) return matchFor(exact, "exact", "exact normalized title match");

  const variant = records.find((record) => normalizeVariant(record.Title) === variantTitle);
  if (variant) return matchFor(variant, "variant", "Sr/Senior or Tech/Technical title variant match");

  const contained = records
    .filter((record) => {
      const watchTitle = normalizeVariant(record.Title);
      return containsPhrase(variantTitle, watchTitle) && !isContainedTitleCollision(variantTitle, watchTitle);
    })
    .sort((left, right) => normalizeVariant(right.Title).length - normalizeVariant(left.Title).length)[0];

  return contained
    ? matchFor(contained, "contains", "watchlist title phrase contained in posting title")
    : null;
}

function selectJobFinderConsumerRows(rows = [], titleRecords = []) {
  const selector = createJobFinderConsumerSelector(titleRecords);
  for (const row of rows) selector.add(row);
  return selector.finish();
}

function createJobFinderConsumerSelector(titleRecords = []) {
  const matched = [];
  let scannedRows = 0;
  let titleMatchCount = 0;
  let excludedWorkArrangementCount = 0;

  function add(row) {
    scannedRows += 1;
    const titleMatch = matchPersonalTitle(row.Title, titleRecords);
    if (!titleMatch) return;
    titleMatchCount += 1;

    if (!["Remote", "Unknown"].includes(String(row.RemoteStatus || ""))) {
      excludedWorkArrangementCount += 1;
      return;
    }

    matched.push({
      ...row,
      ConsumerTitleMatchType: titleMatch.matchType,
      ConsumerTitleMatchCategory: titleMatch.category,
      ConsumerMatchedTitle: titleMatch.label,
      ConsumerTitleMatchReason: titleMatch.reason,
    });
  }

  function finish() {
    const deduped = selectDedupedRows(matched, "job-finder-consumer");
    return {
      jobs: deduped.rows.map(toConsumerJob),
      summary: {
        scannedRows,
        titleMatches: titleMatchCount,
        excludedWorkArrangement: excludedWorkArrangementCount,
        eligibleBeforeDedupe: matched.length,
        jobs: deduped.rows.length,
        duplicatesRemoved: deduped.summary.RemovedDuplicateRows,
      },
    };
  }

  return { add, finish };
}

function toConsumerJob(row) {
  return {
    sourceId: `public-job-feed:${clean(row.ATS)}:${clean(row.CatalogSlug || row.CompanyKey)}`.toLowerCase(),
    source: "Public Job Feed",
    ats: clean(row.ATS).toLowerCase(),
    company: clean(row.Company),
    title: clean(row.Title),
    location: clean(row.Location),
    description: clean(row.Description),
    url: clean(row.URL),
    datePosted: clean(row.DatePosted),
    salary: clean(row.Salary || row.SalaryText),
    department: clean(row.Department),
    remoteStatus: clean(row.RemoteStatus) || "Unknown",
    remoteSignal: clean(row.RemoteSignal),
    remoteConfidence: clean(row.RemoteConfidence),
    usRemoteEligible: normalizeTriState(row.USRemoteEligible),
    locationRisk: clean(row.LocationRisk),
    locationReviewReason: clean(row.LocationReviewReason),
    rawJobId: clean(row.RawJobId),
    jobKey: clean(row.JobKey),
    canonicalUrlKey: clean(row.CanonicalURLKey),
    catalogSlug: clean(row.CatalogSlug),
    fetchedAt: clean(row.FetchedAt),
    writerFitScore: numberOrNull(row.WriterFitScore),
    writerFitTier: clean(row.WriterFitTier),
    writerFitReasons: clean(row.WriterFitReasons),
    titleMatchType: clean(row.ConsumerTitleMatchType),
    titleMatchCategory: clean(row.ConsumerTitleMatchCategory),
    matchedTitle: clean(row.ConsumerMatchedTitle),
    titleMatchReason: clean(row.ConsumerTitleMatchReason),
  };
}

function containsPhrase(jobTitle, watchTitle) {
  return Boolean(jobTitle && watchTitle && ` ${jobTitle} `.includes(` ${watchTitle} `));
}

function isContainedTitleCollision(jobTitle, watchTitle) {
  const marketingModifiers = [
    "content marketing",
    "demand generation",
    "growth marketing",
    "marketing content",
    "product marketing",
    "social media",
  ];
  return marketingModifiers.some((term) => jobTitle.includes(term))
    && !marketingModifiers.some((term) => watchTitle.includes(term));
}

function matchFor(record, matchType, reason) {
  return {
    label: clean(record.Title),
    category: clean(record.Category),
    matchType,
    reason: `Always Review: ${reason} for ${clean(record.Category)} title "${clean(record.Title)}".`,
  };
}

function normalizeTriState(value) {
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  return "unknown";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

module.exports = {
  createJobFinderConsumerSelector,
  matchPersonalTitle,
  schemaVersion,
  selectJobFinderConsumerRows,
  toConsumerJob,
};
