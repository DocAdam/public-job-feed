const tierOrder = ["A", "B", "C", "D", "F"];

const titleBucketScores = {
  STRONG_MATCH: { score: 50, reason: "Strong title match" },
  POSSIBLE_MATCH: { score: 30, reason: "Possible title match" },
  ADJACENT: { score: 15, reason: "Adjacent title signal" },
  LOW_SIGNAL: { score: 5, reason: "Low title signal" },
  IGNORE_FOR_NOW: { score: 0, reason: "" },
};

const domainScoreSignals = [
  "documentation",
  "docs",
  "technical writing",
  "technical writer",
  "developer documentation",
  "api",
  "knowledge",
  "knowledge base",
  "content design",
  "ux writing",
  "technical publications",
  "information architecture",
  "product education",
  "enablement",
  "dita",
  "docops",
];

const strongNonWriterTitleSignals = [
  "software engineer",
  "backend engineer",
  "frontend engineer",
  "full stack engineer",
  "full-stack engineer",
  "data engineer",
  "infrastructure engineer",
  "security engineer",
  "cloud engineer",
  "devops engineer",
  "platform engineer",
  "product engineer",
  "mobile developer",
  "backend developer",
  "frontend developer",
  "full stack developer",
  "software developer",
  "web developer",
  "wordpress developer",
  "rpa developer",
  "member of technical staff",
  "technical support engineer",
  "support engineer",
  "solutions architect",
  "solution architect",
  "cloud architect",
  "data architect",
  "ai architect",
  "infrastructure architect",
  "systems architect",
  "enterprise architect",
  "customer success architect",
  "business systems architect",
  "therapist",
  "nurse",
  "clinical",
  "video editor",
  "film editor",
  "motion graphics",
  "game developer",
  "game designer",
  "product designer",
  "ux designer",
];

const strongWriterDocSignals = [
  "technical writer",
  "technical writing",
  "documentation",
  "docs",
  "docops",
  "documentation engineer",
  "developer documentation",
  "api documentation",
  "content writer",
  "technical content",
  "content designer",
  "ux writer",
  "information architect",
  "information architecture",
  "knowledge manager",
  "knowledge base",
  "technical publications",
  "product education",
  "enablement content",
  "developer advocate",
  "developer relations",
  "devrel",
];

const devrelTitleSignals = [
  "developer advocate",
  "developer relations",
  "devrel",
  "developer marketing",
  "developer content",
];

const devrelEvidenceSignals = [
  "content",
  "docs",
  "documentation",
  "writing",
  "community",
  "education",
  "tutorials",
  "guides",
  "examples",
  "enablement",
];

const docsContentDevrelEvidenceSignals = [
  "documentation",
  "docs",
  "technical writing",
  "writing",
  "content",
  "enablement",
  "education",
  "knowledge base",
  "tutorials",
  "guides",
  "developer relations",
  "developer advocacy",
  "developer advocate",
  "devrel",
];

const writerTitleExceptionSignals = [
  "documentation engineer",
  "product documentation engineer",
  "technical content engineer",
  "documentation specialist",
  "technical documentation specialist",
  "technical writer",
  "staff technical writer",
  "ux writer",
  "content writer",
  "content designer",
  "developer documentation",
  "api documentation",
  "developer advocate",
  "developer relations",
  "devrel",
];

const strongWriterTitleFloorSignals = [
  "technical writer",
  "technical writing",
  "staff technical writer",
  "documentation engineer",
  "product documentation engineer",
  "documentation specialist",
  "technical documentation specialist",
  "developer documentation",
  "api documentation",
  "content writer",
  "technical content",
  "content designer",
  "ux writer",
  "knowledge manager",
  "technical publications",
];

const severeNonWriterTitleSignals = [
  "therapist",
  "nurse",
  "clinical",
  "software engineer",
  "backend engineer",
  "frontend engineer",
  "full stack engineer",
  "full-stack engineer",
  "data engineer",
  "security engineer",
  "devops engineer",
  "platform engineer",
  "product engineer",
  "member of technical staff",
];

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_/.,;:()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text, phrase) {
  const normalizedText = normalizeSearchText(text);
  const normalizedPhrase = normalizeSearchText(phrase);
  return normalizedText.includes(normalizedPhrase);
}

function hasAnyPhrase(text, phrases) {
  return phrases.some((phrase) => hasPhrase(text, phrase));
}

function isTrue(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function splitSignals(value) {
  return cleanText(value)
    .split("|")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function addSignal(state, points, reason) {
  if (!reason) {
    return;
  }

  state.score += points;
  state.reasons.push(reason);

  if (points > 0) {
    state.positiveSignals.push(reason);
  } else if (points < 0) {
    state.negativeSignals.push(reason);
  }
}

function getTier(score) {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

function getDomainSignals(row) {
  const rowSignals = splitSignals(row.TitleDomainSignal);

  return domainScoreSignals.filter((signal) => rowSignals.includes(signal));
}

function getWriterSignalText(row) {
  return normalizeSearchText(
    [row.Title, row.MatchedWatchlistTitle, row.TitleDomainSignal, row.Description].map(cleanText).join(" ")
  );
}

function getTitleAndDescriptionText(row) {
  return normalizeSearchText([row.Title, row.Description].map(cleanText).join(" "));
}

function getTitleText(row) {
  return normalizeSearchText(row.Title);
}

function hasDevrelException(row) {
  const titleText = getTitleText(row);
  const combinedText = getWriterSignalText(row);

  return hasAnyPhrase(titleText, devrelTitleSignals) && hasAnyPhrase(combinedText, devrelEvidenceSignals);
}

function hasStrongWriterDocSignal(row) {
  const combinedText = getWriterSignalText(row);

  return strongWriterDocSignals.some((signal) => {
    if (["developer advocate", "developer relations", "devrel"].includes(signal)) {
      return hasPhrase(combinedText, signal) && hasDevrelException(row);
    }

    return hasPhrase(combinedText, signal);
  });
}

function hasDocsContentDevrelEvidence(row) {
  return hasAnyPhrase(getWriterSignalText(row), docsContentDevrelEvidenceSignals);
}

function hasWriterTitleException(row) {
  return hasAnyPhrase(getWriterSignalText(row), writerTitleExceptionSignals);
}

function hasSevereNonWriterTitleSignal(row) {
  const titleText = getTitleText(row);
  return severeNonWriterTitleSignals.some((signal) => hasPhrase(titleText, signal));
}

function addPenalty(state, points, reason) {
  addSignal(state, points, reason);
  state.penaltySignals.push(reason);
}

function applyV3Penalties(row, state) {
  const titleText = getTitleText(row);
  const combinedText = getTitleAndDescriptionText(row);
  const hasDocsEvidence = hasDocsContentDevrelEvidence(row);
  const hasStrongWriterEvidence = hasStrongWriterDocSignal(row);
  const hasWriterException = hasWriterTitleException(row);
  const hasDevrel = hasDevrelException(row);
  const hasDevrelTitle = hasAnyPhrase(titleText, devrelTitleSignals);
  const matchedNonWriterSignals = strongNonWriterTitleSignals.filter((signal) => hasPhrase(titleText, signal));

  if (matchedNonWriterSignals.length > 0) {
    addPenalty(state, -35, `Strong non-writer title signal: ${matchedNonWriterSignals.slice(0, 3).join(", ")}`);
  }

  if (hasPhrase(titleText, "architect") && !hasDocsEvidence && !hasWriterException) {
    addPenalty(state, -40, "Architect title without documentation/content/writing/devrel signal");
  }

  if (
    (hasPhrase(titleText, "developer") || hasPhrase(titleText, "engineer")) &&
    !hasWriterException &&
    ((!hasDevrelTitle && !hasDocsEvidence) || (hasDevrelTitle && !hasDevrel))
  ) {
    addPenalty(state, -35, "Developer/engineer title without documentation/content/writing/devrel signal");
  }

  if ((hasPhrase(titleText, "therapist") || hasPhrase(titleText, "nurse") || hasPhrase(combinedText, "clinical")) && !hasStrongWriterEvidence) {
    addPenalty(state, -50, "Therapist/nurse/clinical role without documentation writer signal");
  }

  if (
    (hasPhrase(titleText, "video editor") ||
      hasPhrase(titleText, "film editor") ||
      hasPhrase(titleText, "motion graphics") ||
      (hasPhrase(titleText, "editor") && (hasPhrase(combinedText, "ai trainer") || hasPhrase(combinedText, "trainer")))) &&
    !(hasPhrase(combinedText, "technical writing") || hasPhrase(combinedText, "content strategy"))
  ) {
    addPenalty(state, -35, "Video/film/editor AI trainer role without technical writing/content strategy signal");
  }

  if (
    (hasPhrase(titleText, "product designer") || hasPhrase(titleText, "ux designer")) &&
    !(hasPhrase(titleText, "ux writer") || hasPhrase(titleText, "content designer"))
  ) {
    addPenalty(state, -30, "Product/UX designer role without UX Writer or Content Designer exact phrase");
  }

  if (
    (hasPhrase(titleText, "support engineer") || hasPhrase(titleText, "technical support engineer") || hasPhrase(titleText, "support specialist")) &&
    !(hasPhrase(combinedText, "knowledge base") || hasPhrase(combinedText, "docs") || hasPhrase(combinedText, "documentation") || hasPhrase(combinedText, "content"))
  ) {
    addPenalty(state, -25, "Support engineer/specialist role without knowledge base/docs/content signal");
  }
}

function hasWatchlistStrongTitleMatch(row) {
  return (
    row.TitleReviewBucket === "STRONG_MATCH" &&
    ["exact", "contains", "token"].includes(row.TitleMatchType) &&
    Boolean(cleanText(row.MatchedWatchlistTitle)) &&
    hasStrongWriterDocSignal(row)
  );
}

function hasStrongWriterTitleFloorSignal(row) {
  const titleText = getTitleText(row);
  return hasAnyPhrase(titleText, strongWriterTitleFloorSignals) && hasStrongWriterDocSignal(row);
}

function applyTitleMatchFloor(row, state, currentScore) {
  if (hasSevereNonWriterTitleSignal(row) || currentScore >= 85) {
    return currentScore;
  }

  if (hasWatchlistStrongTitleMatch(row)) {
    state.reasons.push("Watchlist strong title match floor");
    state.positiveSignals.push("Watchlist strong title match");
    return 85;
  }

  if (hasStrongWriterTitleFloorSignal(row)) {
    state.reasons.push("Strong writer/docs title signal floor");
    state.positiveSignals.push("Strong writer/docs title signal");
    return 85;
  }

  return currentScore;
}

function scoreWriterFit(row) {
  const state = {
    score: 0,
    reasons: [],
    positiveSignals: [],
    negativeSignals: [],
    penaltySignals: [],
  };
  const bucket = titleBucketScores[row.TitleReviewBucket] || titleBucketScores.IGNORE_FOR_NOW;

  addSignal(state, bucket.score, bucket.reason);

  if (isTrue(row.SalaryDetected)) addSignal(state, 5, "Salary detected");
  if (isTrue(row.TitleLeadershipSignal)) addSignal(state, 10, "Leadership title signal");
  if (isTrue(row.TitleICSignal)) addSignal(state, 10, "IC title signal");

  for (const signal of getDomainSignals(row).slice(0, 5)) {
    addSignal(state, 5, `${signal} domain signal`);
  }

  if (row.ExportQualityFlag === "OK") addSignal(state, 5, "Export quality OK");
  if (row.ExportQualityFlag === "REVIEW") addSignal(state, -5, "Export quality review penalty");
  if (row.ExportQualityFlag === "BAD_ROW") addSignal(state, -50, "Bad row penalty");
  if (isTrue(row.PossibleDuplicate)) addSignal(state, -5, "Possible duplicate penalty");

  const baseScore = Math.max(0, Math.min(100, state.score));

  applyV3Penalties(row, state);

  let clampedScore = Math.max(0, Math.min(100, state.score));
  let guardrailApplied = false;
  let demotionReason = "";

  clampedScore = applyTitleMatchFloor(row, state, clampedScore);

  if (clampedScore >= 60 && !hasStrongWriterDocSignal(row)) {
    clampedScore = Math.min(clampedScore, 59);
    guardrailApplied = true;
    demotionReason = "Missing strong writer/docs signal for A/B tier";
    state.reasons.push(demotionReason);
    state.negativeSignals.push(demotionReason);
  }

  return {
    WriterFitVersion: "v3",
    WriterFitBaseScore: baseScore,
    WriterFitScore: clampedScore,
    WriterFitTier: getTier(clampedScore),
    WriterFitReasons: state.reasons.join(" | "),
    WriterFitPositiveSignals: state.positiveSignals.join(" | "),
    WriterFitNegativeSignals: state.negativeSignals.join(" | "),
    WriterFitPenaltySignals: state.penaltySignals.join(" | "),
    WriterFitDemotionReason: demotionReason,
    WriterFitGuardrailApplied: guardrailApplied,
  };
}

function addWriterFitFields(rows) {
  return rows.map((row) => ({
    ...row,
    ...scoreWriterFit(row),
  }));
}

function average(values) {
  if (values.length === 0) {
    return "";
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

function getWriterFitSummaryRows(rows) {
  return tierOrder.map((tier) => {
    const tierRows = rows.filter((row) => row.WriterFitTier === tier);
    const scores = tierRows.map((row) => Number(row.WriterFitScore)).filter((score) => Number.isFinite(score));
    const exampleTitles = Array.from(new Set(tierRows.map((row) => row.Title).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 10);

    return {
      WriterFitTier: tier,
      Count: tierRows.length,
      MinScore: minValue(scores),
      MaxScore: maxValue(scores),
      AverageScore: average(scores),
      ExampleTitles: exampleTitles.join(" | "),
    };
  });
}

module.exports = {
  addWriterFitFields,
  getWriterFitSummaryRows,
  scoreWriterFit,
  tierOrder,
};
