const { normalizeTitle } = require("../../core/models/job-titles");

function isTrue(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function isWriterFocus(row) {
  return (
    ["A", "B", "C"].includes(row.WriterFitTier) ||
    ["STRONG_MATCH", "POSSIBLE_MATCH", "ADJACENT"].includes(row.TitleReviewBucket)
  );
}

function isStrongMatch(row) {
  return ["A", "B"].includes(row.WriterFitTier) || row.TitleReviewBucket === "STRONG_MATCH";
}

function isRemoteUsLikely(row) {
  return isTrue(row.USRemoteEligible) && row.RemoteStatus === "Remote";
}

function metricFlags(row) {
  return {
    writerFitA: Number(row.WriterFitTier === "A"),
    writerFitB: Number(row.WriterFitTier === "B"),
    writerFitC: Number(row.WriterFitTier === "C"),
    remote: Number(row.RemoteStatus === "Remote"),
    usRemoteEligible: Number(isTrue(row.USRemoteEligible)),
    salaryDetected: Number(isTrue(row.SalaryDetected)),
    review: Number(row.ExportQualityFlag === "REVIEW"),
    duplicate: Number(isTrue(row.PossibleDuplicate) || isTrue(row.CrossATSDuplicate)),
    guardrail: Number(isTrue(row.WriterFitGuardrailApplied)),
    penalty: Number(Boolean(row.WriterFitPenaltySignals)),
    demoted: Number(
      (isTrue(row.WriterFitGuardrailApplied) || row.WriterFitPenaltySignals) &&
      (Number(row.WriterFitBaseScore) || 0) >= 75
    ),
  };
}

function getRawSliceNames(row, writeFullSlices) {
  const names = [];
  if (writeFullSlices) {
    names.push("firehose");
    if (isWriterFocus(row)) names.push("writer-focus");
    if (isStrongMatch(row)) names.push("strong-matches");
    if (isRemoteUsLikely(row)) names.push("remote-us-likely");
    if (isRemoteUsLikely(row) && isWriterFocus(row)) names.push("remote-writer-focus");
    if (isTrue(row.SalaryDetected)) names.push("salary-detected");
    if (row.ExportQualityFlag === "REVIEW" || isTrue(row.PossibleDuplicate) || isTrue(row.CrossATSDuplicate)) {
      names.push("review-needed");
    }
    if ((isTrue(row.WriterFitGuardrailApplied) || row.WriterFitPenaltySignals) &&
      (Number(row.WriterFitBaseScore) || 0) >= 75) names.push("demoted-high-score");
  }
  if (isStrongMatch(row)) names.push("top");
  return names;
}

function getDedupedSliceNames(row, writeFullSlices) {
  const names = [];
  if (writeFullSlices) {
    names.push("deduped-firehose");
    if (isWriterFocus(row)) names.push("deduped-writer-focus");
    if (isStrongMatch(row)) names.push("deduped-strong-matches");
    if (isRemoteUsLikely(row) && isWriterFocus(row)) names.push("deduped-remote-writer-focus");
  }
  if (isStrongMatch(row)) names.push("deduped-top");
  return names;
}

function toMembership(sliceName, sequence, row) {
  return {
    sliceName,
    sequence,
    metrics: metricFlags(row),
    companyKey: String(row.CompanyKey || row.Company || "").trim(),
    normalizedTitle: normalizeTitle(row.Title),
  };
}

module.exports = {
  getDedupedSliceNames,
  getRawSliceNames,
  toMembership,
};
