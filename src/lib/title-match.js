const { normalizeTitle } = require("./job-titles");

const strongTokens = new Set([
  "documentation",
  "docs",
  "developer",
  "api",
  "knowledge",
  "ux",
  "information",
  "publications",
  "publishing",
  "education",
  "enablement",
  "dita",
  "content",
  "technical",
  "writing",
  "writer",
  "editor",
  "author",
  "architect",
  "communicator",
  "toolsmith",
]);

const weakTokens = new Set([
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "head",
  "vp",
  "vice",
  "president",
  "specialist",
  "analyst",
  "coordinator",
  "experienced",
]);

const pairedOnlyTokens = new Set(["content", "technical", "writer", "writing"]);

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function unique(values) {
  return Array.from(new Set(values));
}

function getTokens(value) {
  return unique(normalizeTitle(value).split(" ").filter(Boolean));
}

function getIntersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function getMissing(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function classifyTokens(tokens) {
  return {
    strong: tokens.filter((token) => strongTokens.has(token)),
    weak: tokens.filter((token) => weakTokens.has(token)),
  };
}

function hasUsableStrongOverlap(sharedStrongTokens) {
  const nonPairedOnlyStrong = sharedStrongTokens.filter((token) => !pairedOnlyTokens.has(token));

  if (nonPairedOnlyStrong.length > 0 && sharedStrongTokens.length >= 2) {
    return true;
  }

  if (nonPairedOnlyStrong.length >= 2) {
    return true;
  }

  return false;
}

function getReasonForCandidate(candidate) {
  if (!candidate) {
    return "No watchlist candidate";
  }

  if (candidate.exact) {
    return "Exact normalized title match";
  }

  if (candidate.watchlistContainedInTitle) {
    return "Watchlist phrase contained in title";
  }

  if (candidate.titleContainedInWatchlist) {
    return "Title contained in watchlist phrase";
  }

  if (candidate.sharedStrongTokens.length === 0 && candidate.sharedWeakTokens.length > 0) {
    return "Only weak generic tokens shared";
  }

  if (candidate.sharedStrongTokens.length === 0) {
    return "No strong domain tokens shared";
  }

  if (!hasUsableStrongOverlap(candidate.sharedStrongTokens)) {
    return "Strong token overlap below threshold";
  }

  if (candidate.score < 50) {
    return "Strong token overlap below threshold";
  }

  return "Strong token overlap candidate";
}

function scoreCandidate(jobTitle, record) {
  const normalizedJobTitle = normalizeTitle(jobTitle);
  const normalizedWatchTitle = cleanText(record.NormalizedTitle) || normalizeTitle(record.Title);
  const jobTokens = getTokens(jobTitle);
  const watchTokens = Array.isArray(record.TokenList) ? record.TokenList : getTokens(normalizedWatchTitle);
  const jobClasses = classifyTokens(jobTokens);
  const watchClasses = classifyTokens(watchTokens);
  const sharedStrongTokens = getIntersection(jobClasses.strong, watchClasses.strong);
  const sharedWeakTokens = getIntersection(jobClasses.weak, watchClasses.weak);
  const missingStrongTokens = getMissing(watchClasses.strong, jobClasses.strong);
  const exact = Boolean(normalizedJobTitle && normalizedJobTitle === normalizedWatchTitle);
  const watchlistContainedInTitle = Boolean(
    normalizedJobTitle && normalizedWatchTitle && normalizedJobTitle.includes(normalizedWatchTitle)
  );
  const titleContainedInWatchlist = Boolean(
    normalizedJobTitle && normalizedWatchTitle && normalizedWatchTitle.includes(normalizedJobTitle)
  );

  let score = 0;
  if (exact) {
    score = 100;
  } else if (watchlistContainedInTitle) {
    score = 90;
  } else if (titleContainedInWatchlist) {
    score = 80;
  } else if (hasUsableStrongOverlap(sharedStrongTokens)) {
    const denominator = Math.max(1, Math.min(jobClasses.strong.length, watchClasses.strong.length));
    const ratio = sharedStrongTokens.length / denominator;
    score = ratio >= 0.6 || sharedStrongTokens.length >= 2 ? 75 : 50;
  } else if (sharedStrongTokens.length > 0) {
    score = 25;
  } else if (sharedWeakTokens.length > 0) {
    score = 10;
  }

  const candidate = {
    record,
    normalizedJobTitle,
    normalizedWatchTitle,
    jobTokens,
    watchTokens,
    sharedStrongTokens,
    sharedWeakTokens,
    missingStrongTokens,
    exact,
    watchlistContainedInTitle,
    titleContainedInWatchlist,
    score,
  };
  candidate.reason = getReasonForCandidate(candidate);

  return candidate;
}

function compareCandidates(left, right) {
  if (!left) {
    return right;
  }

  if (right.score !== left.score) {
    return right.score > left.score ? right : left;
  }

  if (right.sharedStrongTokens.length !== left.sharedStrongTokens.length) {
    return right.sharedStrongTokens.length > left.sharedStrongTokens.length ? right : left;
  }

  if (right.sharedWeakTokens.length !== left.sharedWeakTokens.length) {
    return right.sharedWeakTokens.length > left.sharedWeakTokens.length ? right : left;
  }

  return right.normalizedWatchTitle.length > left.normalizedWatchTitle.length ? right : left;
}

function getBestTitleCandidate(jobTitle, titleRecords) {
  let bestCandidate = null;

  for (const record of titleRecords) {
    const candidate = scoreCandidate(jobTitle, record);
    bestCandidate = compareCandidates(bestCandidate, candidate);
  }

  return bestCandidate;
}

function toNoneMatch(candidate) {
  return {
    TitleMatchType: "none",
    TitleMatchCategory: "",
    MatchedWatchlistTitle: "",
    TitleMatchScore: 0,
    TitleConfidence: "none",
    BestCandidateTitle: candidate ? candidate.record.Title || "" : "",
    BestCandidateCategory: candidate ? candidate.record.Category || "" : "",
    BestCandidateScore: candidate ? candidate.score : 0,
    BestCandidateTokens: candidate ? candidate.watchTokens : [],
    JobTitleTokens: candidate ? candidate.jobTokens : [],
    SharedStrongTokens: candidate ? candidate.sharedStrongTokens : [],
    SharedWeakTokens: candidate ? candidate.sharedWeakTokens : [],
    MissingStrongTokens: candidate ? candidate.missingStrongTokens : [],
    Reason: candidate ? candidate.reason : "No watchlist candidate",
    NormalizedTitle: candidate ? candidate.normalizedJobTitle : "",
  };
}

function withDiagnostics(match, candidate) {
  return {
    ...match,
    BestCandidateTitle: candidate ? candidate.record.Title || "" : "",
    BestCandidateCategory: candidate ? candidate.record.Category || "" : "",
    BestCandidateScore: candidate ? candidate.score : match.TitleMatchScore,
    BestCandidateTokens: candidate ? candidate.watchTokens : [],
    JobTitleTokens: candidate ? candidate.jobTokens : [],
    SharedStrongTokens: candidate ? candidate.sharedStrongTokens : [],
    SharedWeakTokens: candidate ? candidate.sharedWeakTokens : [],
    MissingStrongTokens: candidate ? candidate.missingStrongTokens : [],
    Reason: candidate ? candidate.reason : "",
    NormalizedTitle: candidate ? candidate.normalizedJobTitle : "",
  };
}

function matchTitle(jobTitle, titleRecords) {
  const candidate = getBestTitleCandidate(jobTitle, titleRecords);
  const normalizedJobTitle = candidate ? candidate.normalizedJobTitle : normalizeTitle(jobTitle);

  if (!normalizedJobTitle || !candidate) {
    return toNoneMatch(candidate);
  }

  if (candidate.exact) {
    return withDiagnostics(
      {
        TitleMatchType: "exact",
        TitleMatchCategory: candidate.record.Category || "",
        MatchedWatchlistTitle: candidate.record.Title || "",
        TitleMatchScore: 100,
        TitleConfidence: "high",
      },
      candidate
    );
  }

  if (candidate.watchlistContainedInTitle) {
    return withDiagnostics(
      {
        TitleMatchType: "contains",
        TitleMatchCategory: candidate.record.Category || "",
        MatchedWatchlistTitle: candidate.record.Title || "",
        TitleMatchScore: 90,
        TitleConfidence: "high",
      },
      candidate
    );
  }

  if (candidate.score >= 50 && hasUsableStrongOverlap(candidate.sharedStrongTokens)) {
    return withDiagnostics(
      {
        TitleMatchType: "token",
        TitleMatchCategory: candidate.record.Category || "",
        MatchedWatchlistTitle: candidate.record.Title || "",
        TitleMatchScore: candidate.score >= 75 ? 75 : 50,
        TitleConfidence: candidate.score >= 75 ? "medium" : "low",
      },
      candidate
    );
  }

  return toNoneMatch(candidate);
}

module.exports = {
  classifyTokens,
  getBestTitleCandidate,
  getTokens,
  matchTitle,
  strongTokens,
  weakTokens,
};
