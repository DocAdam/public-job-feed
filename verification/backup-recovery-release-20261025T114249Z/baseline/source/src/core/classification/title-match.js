/**
 * Core title matching engine
 *
 * Implements weighted token analysis for matching job titles against a watchlist.
 */

// Strong domain signal tokens that should have higher weight
const strongTokens = new Set([
  "writer",
  "writing",
  "editor",
  "edit",
  "docs",
  "doc",
  "docusaurus",
  "documentation",
  "technical",
  "technical-writing",
]);

// Weak or ambiguous tokens that should have lower weight
const weakTokens = new Set([
  "developer",
  "devops",
  "content",
  "author",
  "product",
  "engineering",
  "program",
  "manager",
  "specialist",
]);

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Calculate token-based similarity score between a title and a watchlist entry.
 *
 * @param {string} title - Job title to evaluate
 * @param {Array<Object>} records - Watchlist entries with NormalizedTitle and TokenList
 * @returns {Object} Match result with scoring details
 */
function matchTitle(title, records) {
  if (!title || !records || records.length === 0) {
    return {
      TitleMatchType: "none",
      TitleMatchCategory: "",
      MatchedWatchlistTitle: "",
      TitleMatchScore: 0,
      TitleConfidence: "none",
      BestCandidateTitle: "",
      BestCandidateCategory: "",
      BestCandidateScore: 0,
      BestCandidateTokens: [],
      JobTitleTokens: [],
      SharedStrongTokens: [],
      SharedWeakTokens: [],
      MissingStrongTokens: [],
      Reason: "No watchlist or title provided",
    };
  }

  const normalizedTitle = normalizeText(title);
  const jobTitleTokens = new Set(
    normalizedTitle.split(" ").filter(Boolean)
  );

  let bestMatch = null;
  let bestScore = 0;

  for (const record of records) {
    if (!record.NormalizedTitle || !record.TokenList) continue;

    const watchlistTokens = new Set(record.TokenList);
    const strongTokensSet = new Set(Array.from(strongTokens));
    const weakTokensSet = new Set(Array.from(weakTokens));

    // Calculate token overlaps
    let strongMatchCount = 0;
    let weakMatchCount = 0;
    const sharedStrongTokens = [];
    const sharedWeakTokens = [];
    const missingStrongTokens = [];

    for (const token of watchlistTokens) {
      if (jobTitleTokens.has(token)) {
        if (strongTokensSet.has(token)) {
          strongMatchCount++;
          sharedStrongTokens.push(token);
        } else if (weakTokensSet.has(token)) {
          weakMatchCount++;
          sharedWeakTokens.push(token);
        }
      } else {
        if (strongTokensSet.has(token)) {
          missingStrongTokens.push(token);
        }
      }
    }

    // Calculate score with weighted tokens
    const totalWatchlistTokens = watchlistTokens.size;
    const weightedScore =
      strongMatchCount * 10 + weakMatchCount * 2;

    let matchScore = 0;

    if (totalWatchlistTokens > 0) {
      matchScore = Math.min(
        (weightedScore / totalWatchlistTokens) * 100,
        100
      );
    }

    // Apply boosts for strong matches
    if (strongMatchCount >= 2) {
      matchScore = Math.min(matchScore + 25, 100);
    } else if (strongMatchCount === 1) {
      matchScore = Math.min(matchScore + 10, 100);
    }

    // Check for exact or contains matches
    let titleMatchType = "none";
    if (normalizedTitle === record.NormalizedTitle) {
      titleMatchType = "exact";
      matchScore = Math.max(matchScore, 100);
    } else if (normalizedTitle.includes(record.NormalizedTitle)) {
      titleMatchType = "contains";
      matchScore = Math.max(matchScore, 95);
    }

    // Determine confidence level
    let confidence = "none";
    if (matchScore >= 80) confidence = "high";
    else if (matchScore >= 60) confidence = "medium";
    else if (matchScore > 0) confidence = "low";

    const matchResult = {
      record,
      score: matchScore,
      confidence,
      titleMatchType,
      sharedStrongTokens,
      sharedWeakTokens,
      missingStrongTokens,
    };

    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestMatch = matchResult;
    }
  }

  // Build the result object
  if (!bestMatch || bestScore === 0) {
    return {
      TitleMatchType: "none",
      TitleMatchCategory: "",
      MatchedWatchlistTitle: "",
      TitleMatchScore: 0,
      TitleConfidence: "none",
      BestCandidateTitle: "",
      BestCandidateCategory: "",
      BestCandidateScore: 0,
      BestCandidateTokens: [],
      JobTitleTokens: Array.from(jobTitleTokens),
      SharedStrongTokens: [],
      SharedWeakTokens: [],
      MissingStrongTokens: Array.from(strongTokens).filter((t) => jobTitleTokens.has(t)),
      Reason: "No watchlist candidate",
    };
  }

  const matchedRecord = bestMatch.record;

  return {
    TitleMatchType: bestMatch.titleMatchType,
    TitleMatchCategory: matchedRecord.Category || "",
    MatchedWatchlistTitle: matchedRecord.Title || "",
    TitleMatchScore: Math.round(bestScore),
    TitleConfidence: bestMatch.confidence,
    BestCandidateTitle: matchedRecord.Title || "",
    BestCandidateCategory: matchedRecord.Category || "",
    BestCandidateScore: Math.round(bestScore),
    BestCandidateTokens: Array.isArray(matchedRecord.TokenList) ? matchedRecord.TokenList : [],
    JobTitleTokens: Array.from(jobTitleTokens),
    SharedStrongTokens: bestMatch.sharedStrongTokens,
    SharedWeakTokens: bestMatch.sharedWeakTokens,
    MissingStrongTokens: bestMatch.missingStrongTokens,
    Reason: `Best match: ${matchedRecord.Title} (${Math.round(bestScore)}%)`,
  };
}

/**
 * Find the single best matching record from a watchlist.
 *
 * @param {string} title - Job title to evaluate
 * @param {Array<Object>} records - Watchlist entries
 * @returns {Object|null} Best matching record or null
 */
function getBestTitleCandidate(title, records) {
  if (!title || !records || records.length === 0) return null;

  const matchResult = matchTitle(title, records);

  if (matchResult.TitleMatchScore === 0) return null;

  // Find the record that generated this result
  for (const record of records) {
    if (record.Title === matchResult.MatchedWatchlistTitle) {
      return record;
    }
  }

  return null;
}

module.exports = {
  strongTokens,
  weakTokens,
  matchTitle,
  getBestTitleCandidate,
};
