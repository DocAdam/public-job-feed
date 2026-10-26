const { normalizeTitle } = require("./job-titles");
const { strongTokens, weakTokens } = require("./title-match");

const domainSignalPhrases = [
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
  "publications",
  "publishing",
  "enablement",
  "product education",
  "information architecture",
  "information experience",
  "dita",
  "docs-as-code",
  "docops",
];

const adjacentSignalTokens = new Set([
  "content",
  "knowledge",
  "education",
  "ux",
  "enablement",
  "publishing",
  "publications",
  "information",
  "documentation",
  "docs",
  "technical",
]);

const senioritySignals = [
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "head",
  "director",
  "vp",
  "vice president",
  "manager",
];

const leadershipSignals = ["manager", "director", "head", "vp", "vice president", "lead"];

const icSignals = [
  "writer",
  "author",
  "editor",
  "engineer",
  "specialist",
  "developer",
  "architect",
  "communicator",
  "toolsmith",
  "designer",
];

const relevantRoleTokens = new Set([
  ...leadershipSignals,
  ...icSignals,
  "writing",
  "documentation",
  "docs",
  "publications",
  "publishing",
]);

const pairedOnlyTokens = new Set(["content", "technical", "writer", "writing"]);

const bucketPriority = {
  STRONG_MATCH: 1,
  POSSIBLE_MATCH: 2,
  ADJACENT: 3,
  LOW_SIGNAL: 4,
  IGNORE_FOR_NOW: 5,
};

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getTokens(title) {
  return unique(normalizeTitle(title).split(" ").filter(Boolean));
}

function includesPhrase(normalizedTitle, phrase) {
  const normalizedPhrase = normalizeTitle(phrase);
  return normalizedTitle === normalizedPhrase || normalizedTitle.includes(normalizedPhrase);
}

function getPhraseSignals(title, phrases) {
  const normalized = normalizeTitle(title);
  return phrases.filter((phrase) => includesPhrase(normalized, phrase));
}

function hasTokenOrPhrase(title, value) {
  const normalized = normalizeTitle(title);
  const normalizedValue = normalizeTitle(value);
  const tokens = getTokens(title);

  if (normalizedValue.includes(" ")) {
    return normalized.includes(normalizedValue);
  }

  return tokens.includes(normalizedValue);
}

function getUsefulStrongTokens(tokens) {
  const foundStrongTokens = tokens.filter((token) => strongTokens.has(token));
  const nonPairedOnlyTokens = foundStrongTokens.filter((token) => !pairedOnlyTokens.has(token));

  if (nonPairedOnlyTokens.length > 0) {
    return foundStrongTokens;
  }

  if (foundStrongTokens.length >= 2) {
    return foundStrongTokens;
  }

  return [];
}

function getTitleReview(title, titleMatch) {
  const tokens = getTokens(title);
  const domainSignals = getPhraseSignals(title, domainSignalPhrases);
  const seniorityFound = senioritySignals.filter((signal) => hasTokenOrPhrase(title, signal));
  const leadershipFound = leadershipSignals.filter((signal) => hasTokenOrPhrase(title, signal));
  const icFound = icSignals.filter((signal) => hasTokenOrPhrase(title, signal));
  const adjacentSignals = tokens.filter((token) => adjacentSignalTokens.has(token));
  const usefulStrongTokens = getUsefulStrongTokens(tokens);
  const relevantRoleFound = tokens.filter((token) => relevantRoleTokens.has(token));
  const sharedStrongTokens = Array.isArray(titleMatch.SharedStrongTokens)
    ? titleMatch.SharedStrongTokens
    : [];
  const weakOnlyTokens = tokens.filter((token) => weakTokens.has(token));
  const bestCandidateScore = Number(titleMatch.BestCandidateScore) || 0;
  const titleMatchScore = Number(titleMatch.TitleMatchScore) || 0;

  let bucket = "IGNORE_FOR_NOW";
  let reason = "No meaningful title signal";

  if (
    ["exact", "contains"].includes(titleMatch.TitleMatchType) ||
    (titleMatch.TitleMatchType === "token" && titleMatchScore >= 75 && sharedStrongTokens.length >= 2)
  ) {
    bucket = "STRONG_MATCH";
    reason = "Strict title match or strong token match";
  } else if (
    titleMatchScore >= 60 ||
    (usefulStrongTokens.length >= 1 && relevantRoleFound.length >= 1)
  ) {
    bucket = "POSSIBLE_MATCH";
    reason = "Useful domain signal plus role signal";
  } else if (domainSignals.length > 0 || adjacentSignals.length > 0) {
    bucket = "ADJACENT";
    reason = "Adjacent docs/content/title signal present";
  } else if (weakOnlyTokens.length > 0 || bestCandidateScore > 0) {
    bucket = "LOW_SIGNAL";
    reason = "Weak generic title signal only";
  }

  return {
    TitleReviewBucket: bucket,
    TitleReviewPriority: bucketPriority[bucket],
    TitleReviewReason: reason,
    TitleDomainSignal: unique(domainSignals).join(" | "),
    TitleSenioritySignal: unique(seniorityFound).join(" | "),
    TitleLeadershipSignal: leadershipFound.length > 0,
    TitleICSignal: icFound.length > 0,
  };
}

module.exports = {
  bucketPriority,
  getTitleReview,
};
