/**
 * Core canonical job record factory
 *
 * Defines the canonical output schema for the public job feed system.
 */

const defaultEmptyRecord = {
  Source: "public-job-feed",
  ATS: "",
  Company: "",
  CompanyKey: "",
  CatalogSlug: "",
  BoardURL: "",
  FetchURL: "",
  FetchedAt: "",

  RawJobId: "",
  RawJobURL: "",
  RawLocation: "",
  RawDepartment: "",

  Title: "",
  Location: "Unknown",
  Description: "",
  URL: "",
  DatePosted: "",
  Salary: "",
  Department: "",

  SalaryDetected: false,
  SalaryMin: "",
  SalaryMax: "",
  SalaryCurrency: "",
  SalaryPeriod: "",
  SalaryText: "",
  SalaryReviewReason: "No salary range detected",

  RemoteStatus: "Unknown",
  RemoteSignal: "",
  RemoteConfidence: "none",
  LocationCountrySignal: "",
  USRemoteEligible: "unknown",
  LocationRisk: "UNKNOWN",
  LocationReviewReason: "Insufficient location/work arrangement signal",

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
  Reason: "No watchlist candidate",

  TitleReviewBucket: "IGNORE_FOR_NOW",
  TitleReviewPriority: 5,
  TitleReviewReason: "No meaningful title signal",
  TitleDomainSignal: "",
  TitleSenioritySignal: "",
  TitleLeadershipSignal: false,
  TitleICSignal: false,

  DuplicateGroupKey: "",
};

function createEmptyCanonicalRecord() {
  return { ...defaultEmptyRecord };
}

module.exports = {
  defaultEmptyRecord,
  createEmptyCanonicalRecord,
};
