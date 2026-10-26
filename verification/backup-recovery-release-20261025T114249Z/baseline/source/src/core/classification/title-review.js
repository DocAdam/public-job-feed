/**
 * Core title review classification engine
 *
 * Classifies jobs into priority buckets for manual review based on
 * domain signals (seniority, IC/leadership, role type).
 */

const { strongTokens, weakTokens } = require("./title-match");

const LEADERSHIP_KEYWORDS = new Set([
  "head of",
  "vp of",
  "director of",
  "vice president",
  "chief",
  "executive",
  "principal",
  "senior director",
  "distinguished",
  "fellows",
]);

const IC_KEYWORDS = new Set([
  "lead",
  "senior",
  "principal",
  "staff",
  "engineer",
  "writer",
  "editor",
  "architect",
  "consultant",
  "specialist",
]);

const SNIORITY_KEYWORDS = new Set([
  "lead",
  "senior",
  "principal",
  "staff",
  "director",
  "vp",
  "chief",
  "executive",
  "distinguished",
]);

/**
 * Extract seniority signal from a title.
 *
 * @param {string} title - Job title
 * @returns {string} Seniority signal string
 */
function extractSenioritySignal(title) {
  if (!title) return "";

  const normalized = title.toLowerCase();

  for (const keyword of SNIORITY_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }

  return "";
}

/**
 * Check if a title indicates leadership role.
 *
 * @param {string} title - Job title
 * @returns {boolean} Whether the role is likely leadership
 */
function isLeadershipRole(title) {
  if (!title) return false;

  const normalized = title.toLowerCase();

  for (const keyword of LEADERSHIP_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a title indicates IC (Individual Contributor) role.
 *
 * @param {string} title - Job title
 * @returns {boolean} Whether the role is likely IC
 */
function isICRole(title) {
  if (!title) return false;

  const normalized = title.toLowerCase();

  for (const keyword of IC_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Classify a job title into a review bucket with priority.
 *
 * @param {string} title - Job title to classify
 * @param {Object} titleMatchResult - Match result from watchlist matching
 * @returns {Object} Classification result with bucket, priority, and signals
 */
function getTitleReview(title, titleMatchResult = {}) {
  const hasTitleSignal = titleMatchResult && titleMatchResult.TitleMatchScore > 0;
  const matchScore = titleMatchResult?.TitleMatchScore || 0;

  const senioritySignal = extractSenioritySignal(title);
  const isLeadership = isLeadershipRole(title);
  const isIC = isICRole(title);

  // Determine domain signal
  let domainSignal = "";
  if (title) {
    const normalized = title.toLowerCase();

    if (normalized.includes("writer") || normalized.includes("writing")) {
      domainSignal = "Documentation/Content";
    } else if (normalized.includes("developer advocate") || normalized.includes("devrel")) {
      domainSignal = "Developer Relations";
    } else if (normalized.includes("education") || normalized.includes("enablement")) {
      domainSignal = "Developer Education";
    } else if (normalized.includes("knowledge") || normalized.includes("publishing")) {
      domainSignal = "Knowledge Management";
    }
  }

  // Determine bucket and priority based on signals
  let bucket;
  let priority;
  let reason;

  if (hasTitleSignal && matchScore >= 80) {
    bucket = "HIGH_PRIORITY_MATCH";
    priority = 1;
    reason = `High confidence watchlist match (${matchScore}%)`;
  } else if (hasTitleSignal && matchScore >= 60) {
    bucket = "POTENTIAL_MATCH";
    priority = 2;
    reason = `Medium confidence watchlist match (${matchScore}%)`;
  } else if (senioritySignal && domainSignal) {
    bucket = "SENIOR_IN_DOMAIN";
    priority = isLeadership ? 1 : 3;
    reason = `Senior role in domain with ${senioritySignal} signal`;
  } else if (isLeadership && domainSignal) {
    bucket = "LEADERSHIP_ROLE";
    priority = 1;
    reason = "Leadership position in relevant domain";
  } else if (isIC && domainSignal) {
    bucket = "IC_IN_DOMAIN";
    priority = 3;
    reason = "Individual contributor in relevant domain";
  } else if (domainSignal) {
    bucket = "IN_DOMAIN";
    priority = 4;
    reason = `Domain signal detected: ${domainSignal}`;
  } else if (senioritySignal) {
    bucket = "SENIOR_ROLE";
    priority = 5;
    reason = `Senior role with ${senioritySignal} but no domain signal`;
  } else {
    bucket = "IGNORE_FOR_NOW";
    priority = 5;
    reason = "No meaningful title signal";
  }

  return {
    TitleReviewBucket: bucket,
    TitleReviewPriority: priority,
    TitleReviewReason: reason,
    TitleDomainSignal: domainSignal,
    TitleSenioritySignal: senioritySignal,
    TitleLeadershipSignal: isLeadership,
    TitleICSignal: isIC,
  };
}

module.exports = {
  extractSenioritySignal,
  getTitleReview,
  isICRole,
  isLeadershipRole,
};
