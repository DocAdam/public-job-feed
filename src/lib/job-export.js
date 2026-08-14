const { addExportValidationFields, getQualitySummaryRows } = require("./export-validation");
const { addDedupeFields, getDuplicateSummary } = require("./job-dedupe");
const { normalizeTitle } = require("./job-titles");
const { matchTitle } = require("./title-match");
const { bucketPriority, getTitleReview } = require("./title-review");
const { addWriterFitFields, getWriterFitSummaryRows } = require("./writer-fit-score");

const jobHeaders = [
  "Source",
  "ATS",
  "Company",
  "CompanyKey",
  "Title",
  "JobKey",
  "CompanyTitleLocationKey",
  "CanonicalURLKey",
  "PossibleDuplicate",
  "DuplicateGroupKey",
  "DuplicateReason",
  "ExportQualityFlag",
  "ExportQualityIssues",
  "MissingRequiredFields",
  "DescriptionLength",
  "URLValid",
  "ApplyURLHost",
  "Location",
  "Description",
  "URL",
  "DatePosted",
  "Salary",
  "Department",
  "RemoteStatus",
  "RemoteSignal",
  "RemoteConfidence",
  "LocationCountrySignal",
  "USRemoteEligible",
  "LocationRisk",
  "LocationReviewReason",
  "SalaryDetected",
  "SalaryMin",
  "SalaryMax",
  "SalaryCurrency",
  "SalaryPeriod",
  "SalaryText",
  "SalaryReviewReason",
  "CatalogSlug",
  "BoardURL",
  "FetchURL",
  "FetchedAt",
  "TitleMatchType",
  "TitleMatchCategory",
  "MatchedWatchlistTitle",
  "TitleMatchScore",
  "TitleConfidence",
  "TitleReviewBucket",
  "TitleReviewPriority",
  "TitleReviewReason",
  "TitleDomainSignal",
  "TitleSenioritySignal",
  "TitleLeadershipSignal",
  "TitleICSignal",
  "WriterFitVersion",
  "WriterFitBaseScore",
  "WriterFitScore",
  "WriterFitTier",
  "WriterFitReasons",
  "WriterFitPositiveSignals",
  "WriterFitNegativeSignals",
  "WriterFitPenaltySignals",
  "WriterFitDemotionReason",
  "WriterFitGuardrailApplied",
  "RawJobId",
  "RawJobURL",
  "RawLocation",
  "RawDepartment",
];

const summaryHeaders = [
  "GeneratedAt",
  "BoardsAttempted",
  "BoardsSucceeded",
  "BoardsFailed",
  "BoardsEmpty",
  "JobsFetched",
  "JobsWithTitleMatch",
  "JobsExactTitleMatch",
  "JobsContainsTitleMatch",
  "JobsTokenTitleMatch",
  "JobsNoTitleMatch",
  "UniqueJobTitles",
  "MatchedUniqueJobTitles",
  "UnmatchedUniqueJobTitles",
  "AverageBestCandidateScore",
  "TopUnmatchedTitleCount",
  "StrongMatchCount",
  "PossibleMatchCount",
  "AdjacentCount",
  "LowSignalCount",
  "IgnoreForNowCount",
  "RemoteCount",
  "HybridCount",
  "OnsiteCount",
  "UnknownRemoteStatusCount",
  "USRemoteEligibleTrueCount",
  "USRemoteEligibleFalseCount",
  "USRemoteEligibleUnknownCount",
  "SalaryDetectedCount",
  "ExportOKCount",
  "ExportReviewCount",
  "ExportBadRowCount",
  "PossibleDuplicateCount",
  "DuplicateGroupCount",
  "WriterFitACount",
  "WriterFitBCount",
  "WriterFitCCount",
  "WriterFitDCount",
  "WriterFitFCount",
  "AverageWriterFitScore",
  "MaxWriterFitScore",
  "WriterFitGuardrailAppliedCount",
  "WriterFitPenaltyAppliedCount",
  "DemotedHighScoreCount",
];

const titleDiagnosticsHeaders = [
  "Title",
  "NormalizedTitle",
  "Company",
  "ATS",
  "URL",
  "BestCandidateTitle",
  "BestCandidateCategory",
  "BestCandidateScore",
  "BestCandidateTokens",
  "JobTitleTokens",
  "SharedStrongTokens",
  "SharedWeakTokens",
  "MissingStrongTokens",
  "TitleMatchType",
  "TitleConfidence",
  "MatchedWatchlistTitle",
  "Reason",
  "TitleReviewBucket",
  "TitleReviewPriority",
  "TitleReviewReason",
  "TitleDomainSignal",
  "TitleSenioritySignal",
  "TitleLeadershipSignal",
  "TitleICSignal",
  "RemoteStatus",
  "RemoteSignal",
  "RemoteConfidence",
  "LocationCountrySignal",
  "USRemoteEligible",
  "LocationRisk",
  "LocationReviewReason",
  "SalaryDetected",
  "SalaryMin",
  "SalaryMax",
  "SalaryCurrency",
  "SalaryPeriod",
  "SalaryText",
  "SalaryReviewReason",
];

const bucketSummaryHeaders = ["TitleReviewBucket", "Count", "UniqueTitles", "ExampleTitles"];

const unmatchedTitleHeaders = [
  "Title",
  "NormalizedTitle",
  "Count",
  "Companies",
  "BestCandidateTitle",
  "BestCandidateScore",
  "Reason",
];

const publicFeedHeaders = [
  "Source",
  "ATS",
  "Company",
  "CompanyKey",
  "Title",
  "ExportQualityFlag",
  "ExportQualityIssues",
  "PossibleDuplicate",
  "DuplicateReason",
  "JobKey",
  "CompanyTitleLocationKey",
  "CanonicalURLKey",
  "DuplicateGroupKey",
  "TitleReviewBucket",
  "TitleReviewPriority",
  "TitleReviewReason",
  "TitleDomainSignal",
  "TitleSenioritySignal",
  "TitleLeadershipSignal",
  "TitleICSignal",
  "WriterFitVersion",
  "WriterFitBaseScore",
  "WriterFitScore",
  "WriterFitTier",
  "WriterFitReasons",
  "WriterFitPositiveSignals",
  "WriterFitNegativeSignals",
  "WriterFitPenaltySignals",
  "WriterFitDemotionReason",
  "WriterFitGuardrailApplied",
  "TitleMatchType",
  "TitleMatchCategory",
  "MatchedWatchlistTitle",
  "TitleMatchScore",
  "TitleConfidence",
  "Location",
  "RemoteStatus",
  "RemoteSignal",
  "RemoteConfidence",
  "USRemoteEligible",
  "LocationRisk",
  "LocationReviewReason",
  "SalaryDetected",
  "SalaryMin",
  "SalaryMax",
  "SalaryCurrency",
  "SalaryPeriod",
  "SalaryText",
  "Department",
  "DatePosted",
  "URL",
  "Description",
  "CatalogSlug",
  "BoardURL",
  "FetchURL",
  "FetchedAt",
  "RawJobId",
  "RawJobURL",
  "RawLocation",
  "RawDepartment",
];

const remoteSummaryHeaders = [
  "RemoteStatus",
  "Count",
  "USRemoteEligibleTrue",
  "USRemoteEligibleFalse",
  "USRemoteEligibleUnknown",
];

const salarySummaryHeaders = ["SalaryDetected", "Count", "MinSalaryDetected", "MaxSalaryDetected"];
const qualitySummaryHeaders = ["ExportQualityFlag", "Count"];
const writerFitSummaryHeaders = ["WriterFitTier", "Count", "MinScore", "MaxScore", "AverageScore", "ExampleTitles"];

const duplicateSummaryHeaders = [
  "TotalRows",
  "PossibleDuplicateCount",
  "DuplicateGroupCount",
  "CanonicalURLDuplicateCount",
  "CompanyTitleLocationDuplicateCount",
];

const duplicatesHeaders = [
  "DuplicateGroupKey",
  "DuplicateReason",
  "Company",
  "Title",
  "Location",
  "URL",
  "ATS",
  "RawJobId",
];

const badRowsHeaders = [
  "ExportQualityFlag",
  "ExportQualityIssues",
  "Company",
  "Title",
  "URL",
  "ATS",
  "DescriptionLength",
];

function uniqueNonEmpty(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toCsvRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.keys(row).map((column) => [column, formatCsvValue(row, column)])));
}

function formatCsvValue(row, column) {
  if (
    [
      "TitleLeadershipSignal",
      "TitleICSignal",
      "SalaryDetected",
      "PossibleDuplicate",
      "CrossATSDuplicate",
      "WriterFitGuardrailApplied",
      "URLValid",
    ].includes(column)
  ) {
    return row[column] ? "TRUE" : "FALSE";
  }

  return row[column];
}

function toCsvTitleDiagnostics(rows) {
  return toCsvRows(
    rows.map((row) => ({
      ...row,
      BestCandidateTokens: row.BestCandidateTokens.join(" | "),
      JobTitleTokens: row.JobTitleTokens.join(" | "),
      SharedStrongTokens: row.SharedStrongTokens.join(" | "),
      SharedWeakTokens: row.SharedWeakTokens.join(" | "),
      MissingStrongTokens: row.MissingStrongTokens.join(" | "),
    }))
  );
}

function selectRows(headers, rows) {
  return rows.map((row) => {
    const selected = {};

    for (const header of headers) {
      selected[header] = row[header];
    }

    return selected;
  });
}

function createTitleDiagnostics(jobRows, titleRecords) {
  return jobRows.map((job) => {
    const titleMatch = matchTitle(job.Title, titleRecords);
    const titleReview = getTitleReview(job.Title, titleMatch);

    return {
      Title: job.Title,
      NormalizedTitle: titleMatch.NormalizedTitle || normalizeTitle(job.Title),
      Company: job.Company,
      ATS: job.ATS,
      URL: job.URL,
      BestCandidateTitle: titleMatch.BestCandidateTitle,
      BestCandidateCategory: titleMatch.BestCandidateCategory,
      BestCandidateScore: titleMatch.BestCandidateScore,
      BestCandidateTokens: titleMatch.BestCandidateTokens,
      JobTitleTokens: titleMatch.JobTitleTokens,
      SharedStrongTokens: titleMatch.SharedStrongTokens,
      SharedWeakTokens: titleMatch.SharedWeakTokens,
      MissingStrongTokens: titleMatch.MissingStrongTokens,
      TitleMatchType: titleMatch.TitleMatchType,
      TitleConfidence: titleMatch.TitleConfidence,
      MatchedWatchlistTitle: titleMatch.MatchedWatchlistTitle,
      Reason: titleMatch.Reason,
      TitleReviewBucket: titleReview.TitleReviewBucket,
      TitleReviewPriority: titleReview.TitleReviewPriority,
      TitleReviewReason: titleReview.TitleReviewReason,
      TitleDomainSignal: titleReview.TitleDomainSignal,
      TitleSenioritySignal: titleReview.TitleSenioritySignal,
      TitleLeadershipSignal: titleReview.TitleLeadershipSignal,
      TitleICSignal: titleReview.TitleICSignal,
      RemoteStatus: job.RemoteStatus,
      RemoteSignal: job.RemoteSignal,
      RemoteConfidence: job.RemoteConfidence,
      LocationCountrySignal: job.LocationCountrySignal,
      USRemoteEligible: job.USRemoteEligible,
      LocationRisk: job.LocationRisk,
      LocationReviewReason: job.LocationReviewReason,
      SalaryDetected: job.SalaryDetected,
      SalaryMin: job.SalaryMin,
      SalaryMax: job.SalaryMax,
      SalaryCurrency: job.SalaryCurrency,
      SalaryPeriod: job.SalaryPeriod,
      SalaryText: job.SalaryText,
      SalaryReviewReason: job.SalaryReviewReason,
    };
  });
}

function createBucketSummaryRows(jobRows) {
  return Object.keys(bucketPriority)
    .sort((a, b) => bucketPriority[a] - bucketPriority[b])
    .map((bucket) => {
      const rows = jobRows.filter((row) => row.TitleReviewBucket === bucket);
      const uniqueTitles = uniqueNonEmpty(rows.map((row) => normalizeTitle(row.Title)));
      const exampleTitles = uniqueNonEmpty(rows.map((row) => row.Title))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 10);

      return {
        TitleReviewBucket: bucket,
        Count: rows.length,
        UniqueTitles: uniqueTitles.length,
        ExampleTitles: exampleTitles.join(" | "),
      };
    });
}

function createUnmatchedTitleRows(titleDiagnosticsRows) {
  const groups = new Map();

  for (const row of titleDiagnosticsRows.filter((item) => item.TitleMatchType === "none")) {
    const key = row.NormalizedTitle;
    if (!groups.has(key)) {
      groups.set(key, {
        Title: row.Title,
        NormalizedTitle: row.NormalizedTitle,
        Count: 0,
        Companies: new Set(),
        BestCandidateTitle: row.BestCandidateTitle,
        BestCandidateScore: row.BestCandidateScore,
        Reason: row.Reason,
      });
    }

    const group = groups.get(key);
    group.Count += 1;
    group.Companies.add(row.Company);
    if (row.BestCandidateScore > group.BestCandidateScore) {
      group.BestCandidateTitle = row.BestCandidateTitle;
      group.BestCandidateScore = row.BestCandidateScore;
      group.Reason = row.Reason;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      Companies: uniqueNonEmpty(Array.from(group.Companies)).sort((a, b) => a.localeCompare(b)).join(" | "),
    }))
    .sort((a, b) => b.Count - a.Count || a.Title.localeCompare(b.Title));
}

function createRemoteSummaryRows(jobRows) {
  return ["Remote", "Hybrid", "Onsite", "Unknown"].map((status) => {
    const rows = jobRows.filter((row) => row.RemoteStatus === status);

    return {
      RemoteStatus: status,
      Count: rows.length,
      USRemoteEligibleTrue: rows.filter((row) => row.USRemoteEligible === true).length,
      USRemoteEligibleFalse: rows.filter((row) => row.USRemoteEligible === false).length,
      USRemoteEligibleUnknown: rows.filter((row) => row.USRemoteEligible === "unknown").length,
    };
  });
}

function createSalarySummaryRows(jobRows) {
  const rowsByDetected = [
    { SalaryDetected: "TRUE", rows: jobRows.filter((row) => row.SalaryDetected) },
    { SalaryDetected: "FALSE", rows: jobRows.filter((row) => !row.SalaryDetected) },
  ];

  return rowsByDetected.map((group) => {
    const salaries = group.rows
      .flatMap((row) => [Number(row.SalaryMin), Number(row.SalaryMax)])
      .filter((value) => Number.isFinite(value) && value > 0);

    return {
      SalaryDetected: group.SalaryDetected,
      Count: group.rows.length,
      MinSalaryDetected: minValue(salaries),
      MaxSalaryDetected: maxValue(salaries),
    };
  });
}

function createDuplicateRows(jobRows) {
  return jobRows
    .filter((row) => row.PossibleDuplicate)
    .map((row) => ({
      DuplicateGroupKey: row.DuplicateGroupKey,
      DuplicateReason: row.DuplicateReason,
      Company: row.Company,
      Title: row.Title,
      Location: row.Location,
      URL: row.URL,
      ATS: row.ATS,
      RawJobId: row.RawJobId,
    }))
    .sort(
      (a, b) =>
        a.DuplicateGroupKey.localeCompare(b.DuplicateGroupKey) ||
        a.Company.localeCompare(b.Company) ||
        a.Title.localeCompare(b.Title)
    );
}

function createBadRows(jobRows) {
  return jobRows
    .filter((row) => row.ExportQualityFlag === "BAD_ROW")
    .map((row) => ({
      ExportQualityFlag: row.ExportQualityFlag,
      ExportQualityIssues: row.ExportQualityIssues,
      Company: row.Company,
      Title: row.Title,
      URL: row.URL,
      ATS: row.ATS,
      DescriptionLength: row.DescriptionLength,
    }));
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function minValue(values, fallback = "") {
  let min = Infinity;

  for (const value of values) {
    if (value < min) {
      min = value;
    }
  }

  return min === Infinity ? fallback : min;
}

function maxValue(values, fallback = "") {
  let max = -Infinity;

  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }

  return max === -Infinity ? fallback : max;
}

function createSummary(fetchLogRows, jobRows, titleDiagnosticsRows, unmatchedTitleRows, duplicateSummary, generatedAt) {
  const uniqueJobTitles = uniqueNonEmpty(jobRows.map((row) => normalizeTitle(row.Title)));
  const matchedUniqueJobTitles = uniqueNonEmpty(
    titleDiagnosticsRows.filter((row) => row.TitleMatchType !== "none").map((row) => row.NormalizedTitle)
  );
  const unmatchedUniqueJobTitles = uniqueNonEmpty(
    titleDiagnosticsRows.filter((row) => row.TitleMatchType === "none").map((row) => row.NormalizedTitle)
  );

  return {
    GeneratedAt: generatedAt,
    BoardsAttempted: fetchLogRows.length,
    BoardsSucceeded: fetchLogRows.filter((row) => row.Status === "success").length,
    BoardsFailed: fetchLogRows.filter((row) => row.Status === "failed").length,
    BoardsEmpty: fetchLogRows.filter((row) => row.Status === "empty").length,
    JobsFetched: jobRows.length,
    JobsWithTitleMatch: jobRows.filter((row) => row.TitleMatchType !== "none").length,
    JobsExactTitleMatch: jobRows.filter((row) => row.TitleMatchType === "exact").length,
    JobsContainsTitleMatch: jobRows.filter((row) => row.TitleMatchType === "contains").length,
    JobsTokenTitleMatch: jobRows.filter((row) => row.TitleMatchType === "token").length,
    JobsNoTitleMatch: jobRows.filter((row) => row.TitleMatchType === "none").length,
    UniqueJobTitles: uniqueJobTitles.length,
    MatchedUniqueJobTitles: matchedUniqueJobTitles.length,
    UnmatchedUniqueJobTitles: unmatchedUniqueJobTitles.length,
    AverageBestCandidateScore: average(titleDiagnosticsRows.map((row) => Number(row.BestCandidateScore) || 0)),
    TopUnmatchedTitleCount: unmatchedTitleRows.length > 0 ? unmatchedTitleRows[0].Count : 0,
    StrongMatchCount: jobRows.filter((row) => row.TitleReviewBucket === "STRONG_MATCH").length,
    PossibleMatchCount: jobRows.filter((row) => row.TitleReviewBucket === "POSSIBLE_MATCH").length,
    AdjacentCount: jobRows.filter((row) => row.TitleReviewBucket === "ADJACENT").length,
    LowSignalCount: jobRows.filter((row) => row.TitleReviewBucket === "LOW_SIGNAL").length,
    IgnoreForNowCount: jobRows.filter((row) => row.TitleReviewBucket === "IGNORE_FOR_NOW").length,
    RemoteCount: jobRows.filter((row) => row.RemoteStatus === "Remote").length,
    HybridCount: jobRows.filter((row) => row.RemoteStatus === "Hybrid").length,
    OnsiteCount: jobRows.filter((row) => row.RemoteStatus === "Onsite").length,
    UnknownRemoteStatusCount: jobRows.filter((row) => row.RemoteStatus === "Unknown").length,
    USRemoteEligibleTrueCount: jobRows.filter((row) => row.USRemoteEligible === true).length,
    USRemoteEligibleFalseCount: jobRows.filter((row) => row.USRemoteEligible === false).length,
    USRemoteEligibleUnknownCount: jobRows.filter((row) => row.USRemoteEligible === "unknown").length,
    SalaryDetectedCount: jobRows.filter((row) => row.SalaryDetected).length,
    ExportOKCount: jobRows.filter((row) => row.ExportQualityFlag === "OK").length,
    ExportReviewCount: jobRows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
    ExportBadRowCount: jobRows.filter((row) => row.ExportQualityFlag === "BAD_ROW").length,
    PossibleDuplicateCount: duplicateSummary.PossibleDuplicateCount,
    DuplicateGroupCount: duplicateSummary.DuplicateGroupCount,
    WriterFitACount: jobRows.filter((row) => row.WriterFitTier === "A").length,
    WriterFitBCount: jobRows.filter((row) => row.WriterFitTier === "B").length,
    WriterFitCCount: jobRows.filter((row) => row.WriterFitTier === "C").length,
    WriterFitDCount: jobRows.filter((row) => row.WriterFitTier === "D").length,
    WriterFitFCount: jobRows.filter((row) => row.WriterFitTier === "F").length,
    AverageWriterFitScore: average(jobRows.map((row) => Number(row.WriterFitScore) || 0)),
    MaxWriterFitScore: maxValue(jobRows.map((row) => Number(row.WriterFitScore) || 0), 0),
    WriterFitGuardrailAppliedCount: jobRows.filter((row) => row.WriterFitGuardrailApplied).length,
    WriterFitPenaltyAppliedCount: jobRows.filter((row) => row.WriterFitPenaltySignals).length,
    DemotedHighScoreCount: jobRows.filter(
      (row) =>
        (row.WriterFitGuardrailApplied || row.WriterFitPenaltySignals) && (Number(row.WriterFitBaseScore) || 0) >= 75
    ).length,
  };
}

function buildJobExportArtifacts(rawJobRows, fetchLogRows, titleRecords, generatedAt, options = {}) {
  const includePublicFeedRows = options.includePublicFeedRows !== false;
  const jobRows = addWriterFitFields(addExportValidationFields(addDedupeFields(rawJobRows)));
  const titleDiagnosticsRows = createTitleDiagnostics(jobRows, titleRecords);
  const unmatchedTitleRows = createUnmatchedTitleRows(titleDiagnosticsRows);
  const bucketSummaryRows = createBucketSummaryRows(jobRows);
  const remoteSummaryRows = createRemoteSummaryRows(jobRows);
  const salarySummaryRows = createSalarySummaryRows(jobRows);
  const qualitySummaryRows = getQualitySummaryRows(jobRows);
  const writerFitSummaryRows = getWriterFitSummaryRows(jobRows);
  const duplicateSummary = getDuplicateSummary(jobRows);
  const duplicateRows = createDuplicateRows(jobRows);
  const badRows = createBadRows(jobRows);
  const publicFeedRows = includePublicFeedRows ? selectRows(publicFeedHeaders, jobRows) : [];
  const summary = createSummary(
    fetchLogRows,
    jobRows,
    titleDiagnosticsRows,
    unmatchedTitleRows,
    duplicateSummary,
    generatedAt
  );

  return {
    jobRows,
    publicFeedRows,
    titleDiagnosticsRows,
    unmatchedTitleRows,
    bucketSummaryRows,
    remoteSummaryRows,
    salarySummaryRows,
    qualitySummaryRows,
    writerFitSummaryRows,
    duplicateSummary,
    duplicateRows,
    badRows,
    summary,
  };
}

module.exports = {
  badRowsHeaders,
  bucketSummaryHeaders,
  buildJobExportArtifacts,
  duplicateSummaryHeaders,
  duplicatesHeaders,
  formatCsvValue,
  jobHeaders,
  publicFeedHeaders,
  qualitySummaryHeaders,
  remoteSummaryHeaders,
  salarySummaryHeaders,
  summaryHeaders,
  titleDiagnosticsHeaders,
  toCsvRows,
  toCsvTitleDiagnostics,
  unmatchedTitleHeaders,
  writerFitSummaryHeaders,
};
