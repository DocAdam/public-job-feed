const { matchTitle } = require("./title-match");
const { getTitleReview } = require("./title-review");
const { detectSalary } = require("./salary-detect");
const { detectWorkArrangement } = require("./work-arrangement");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function stripHtml(value) {
  return cleanText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocation(job) {
  const locations = [];

  if (cleanText(job.location)) {
    locations.push(cleanText(job.location));
  }

  if (Array.isArray(job.secondaryLocations)) {
    for (const location of job.secondaryLocations) {
      if (typeof location === "string") {
        locations.push(cleanText(location));
      } else if (location && typeof location === "object") {
        locations.push(cleanText(location.location || location.name));
      }
    }
  }

  return Array.from(new Set(locations.filter(Boolean))).join(" | ");
}

function getDepartment(job) {
  return cleanText(job.department) || cleanText(job.team);
}

function getSalary(job) {
  const compensation = job.compensation || job.salary || job.pay;

  if (!compensation) {
    return "";
  }

  if (typeof compensation === "string") {
    return cleanText(compensation);
  }

  if (typeof compensation === "object") {
    return cleanText(
      compensation.compensationTierSummary ||
        compensation.summary ||
        compensation.range ||
        compensation.value ||
        JSON.stringify(compensation)
    );
  }

  return cleanText(compensation);
}

function getFirstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function compactJoin(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean))).join(", ");
}

function getLocationParts(location) {
  if (!location || typeof location !== "object") {
    return cleanText(location);
  }

  return compactJoin([
    location.city,
    location.state,
    location.province,
    location.region,
    location.country,
    location.name,
    location.label,
  ]);
}

function getNestedText(object, path) {
  const value = path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : null), object);

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return getFirstText(item.name, item.label, item.value, item.title, getLocationParts(item));
        }

        return cleanText(item);
      })
      .filter(Boolean)
      .join(" | ");
  }

  if (value && typeof value === "object") {
    return getFirstText(value.name, value.label, value.value, value.title, getLocationParts(value));
  }

  return cleanText(value);
}

function normalizeGenericAtsJob(job, context, titleRecords, fields) {
  const title = cleanText(fields.title);
  const location = cleanText(fields.location);
  const department = cleanText(fields.department);
  const description = stripHtml(fields.description);
  const salary = cleanText(fields.salary);
  const titleMatch = matchTitle(title, titleRecords);
  const titleReview = getTitleReview(title, titleMatch);
  const baseJob = {
    Title: title,
    Location: location,
    RawLocation: location,
    Description: description,
    Salary: salary,
  };
  const workArrangement = detectWorkArrangement(baseJob);
  const salaryDetection = detectSalary(baseJob);

  return {
    Source: "public-job-feed",
    ATS: context.ats,
    Company: context.company,
    CompanyKey: context.companyKey,
    Title: title,
    Location: location,
    Description: description,
    URL: cleanText(fields.url),
    DatePosted: cleanText(fields.datePosted),
    Salary: salary,
    Department: department,
    RemoteStatus: workArrangement.RemoteStatus,
    RemoteSignal: workArrangement.RemoteSignal,
    RemoteConfidence: workArrangement.RemoteConfidence,
    LocationCountrySignal: workArrangement.LocationCountrySignal,
    USRemoteEligible: workArrangement.USRemoteEligible,
    LocationRisk: workArrangement.LocationRisk,
    LocationReviewReason: workArrangement.LocationReviewReason,
    SalaryDetected: salaryDetection.SalaryDetected,
    SalaryMin: salaryDetection.SalaryMin,
    SalaryMax: salaryDetection.SalaryMax,
    SalaryCurrency: salaryDetection.SalaryCurrency,
    SalaryPeriod: salaryDetection.SalaryPeriod,
    SalaryText: salaryDetection.SalaryText,
    SalaryReviewReason: salaryDetection.SalaryReviewReason,
    CatalogSlug: context.catalogSlug,
    BoardURL: context.boardUrl,
    FetchURL: context.fetchUrl,
    FetchedAt: context.fetchedAt,
    TitleMatchType: titleMatch.TitleMatchType,
    TitleMatchCategory: titleMatch.TitleMatchCategory,
    MatchedWatchlistTitle: titleMatch.MatchedWatchlistTitle,
    TitleMatchScore: titleMatch.TitleMatchScore,
    TitleConfidence: titleMatch.TitleConfidence,
    TitleReviewBucket: titleReview.TitleReviewBucket,
    TitleReviewPriority: titleReview.TitleReviewPriority,
    TitleReviewReason: titleReview.TitleReviewReason,
    TitleDomainSignal: titleReview.TitleDomainSignal,
    TitleSenioritySignal: titleReview.TitleSenioritySignal,
    TitleLeadershipSignal: titleReview.TitleLeadershipSignal,
    TitleICSignal: titleReview.TitleICSignal,
    RawJobId: cleanText(fields.rawJobId),
    RawJobURL: cleanText(fields.url),
    RawLocation: location,
    RawDepartment: department,
  };
}

function normalizeAshbyJob(job, context, titleRecords) {
  const title = cleanText(job.title);
  const description = stripHtml(job.descriptionHtml || job.description);
  const titleMatch = matchTitle(title, titleRecords);
  const titleReview = getTitleReview(title, titleMatch);
  const baseJob = {
    Title: title,
    Location: getLocation(job),
    RawLocation: cleanText(job.location),
    Description: description,
    Salary: getSalary(job),
  };
  const workArrangement = detectWorkArrangement(baseJob);
  const salaryDetection = detectSalary(baseJob);

  return {
    Source: "Ashby posting API",
    ATS: "ashby",
    Company: context.company,
    CompanyKey: context.companyKey,
    Title: title,
    Location: baseJob.Location,
    Description: description,
    URL: cleanText(job.jobUrl) || cleanText(job.applyUrl),
    DatePosted: cleanText(job.publishedAt),
    Salary: baseJob.Salary,
    Department: getDepartment(job),
    RemoteStatus: workArrangement.RemoteStatus,
    RemoteSignal: workArrangement.RemoteSignal,
    RemoteConfidence: workArrangement.RemoteConfidence,
    LocationCountrySignal: workArrangement.LocationCountrySignal,
    USRemoteEligible: workArrangement.USRemoteEligible,
    LocationRisk: workArrangement.LocationRisk,
    LocationReviewReason: workArrangement.LocationReviewReason,
    SalaryDetected: salaryDetection.SalaryDetected,
    SalaryMin: salaryDetection.SalaryMin,
    SalaryMax: salaryDetection.SalaryMax,
    SalaryCurrency: salaryDetection.SalaryCurrency,
    SalaryPeriod: salaryDetection.SalaryPeriod,
    SalaryText: salaryDetection.SalaryText,
    SalaryReviewReason: salaryDetection.SalaryReviewReason,
    CatalogSlug: context.catalogSlug,
    BoardURL: context.boardUrl,
    FetchURL: context.fetchUrl,
    FetchedAt: context.fetchedAt,
    TitleMatchType: titleMatch.TitleMatchType,
    TitleMatchCategory: titleMatch.TitleMatchCategory,
    MatchedWatchlistTitle: titleMatch.MatchedWatchlistTitle,
    TitleMatchScore: titleMatch.TitleMatchScore,
    TitleConfidence: titleMatch.TitleConfidence,
    TitleReviewBucket: titleReview.TitleReviewBucket,
    TitleReviewPriority: titleReview.TitleReviewPriority,
    TitleReviewReason: titleReview.TitleReviewReason,
    TitleDomainSignal: titleReview.TitleDomainSignal,
    TitleSenioritySignal: titleReview.TitleSenioritySignal,
    TitleLeadershipSignal: titleReview.TitleLeadershipSignal,
    TitleICSignal: titleReview.TitleICSignal,
    RawJobId: cleanText(job.id),
    RawJobURL: cleanText(job.jobUrl),
    RawLocation: cleanText(job.location),
    RawDepartment: cleanText(job.department),
  };
}

function getGreenhouseLocation(job) {
  if (job.location && typeof job.location === "object") {
    return cleanText(job.location.name);
  }

  return cleanText(job.location);
}

function getGreenhouseDepartment(job) {
  if (Array.isArray(job.departments) && job.departments.length > 0) {
    return cleanText(job.departments[0] && job.departments[0].name);
  }

  return cleanText(job.department);
}

function getGreenhouseDatePosted(job) {
  return (
    cleanText(job.first_published)
    || cleanText(job.published_at)
    || cleanText(job.created_at)
    || cleanText(job.updated_at)
  );
}

function normalizeGreenhouseJob(job, context, titleRecords) {
  const title = cleanText(job.title);
  const description = stripHtml(job.content || job.description);
  const location = getGreenhouseLocation(job);
  const department = getGreenhouseDepartment(job);
  const titleMatch = matchTitle(title, titleRecords);
  const titleReview = getTitleReview(title, titleMatch);
  const baseJob = {
    Title: title,
    Location: location,
    RawLocation: location,
    Description: description,
    Salary: "",
  };
  const workArrangement = detectWorkArrangement(baseJob);
  const salaryDetection = detectSalary(baseJob);

  return {
    Source: "public-job-feed",
    ATS: "greenhouse",
    Company: context.company,
    CompanyKey: context.companyKey,
    Title: title,
    Location: location,
    Description: description,
    URL: cleanText(job.absolute_url),
    DatePosted: getGreenhouseDatePosted(job),
    Salary: "",
    Department: department,
    RemoteStatus: workArrangement.RemoteStatus,
    RemoteSignal: workArrangement.RemoteSignal,
    RemoteConfidence: workArrangement.RemoteConfidence,
    LocationCountrySignal: workArrangement.LocationCountrySignal,
    USRemoteEligible: workArrangement.USRemoteEligible,
    LocationRisk: workArrangement.LocationRisk,
    LocationReviewReason: workArrangement.LocationReviewReason,
    SalaryDetected: salaryDetection.SalaryDetected,
    SalaryMin: salaryDetection.SalaryMin,
    SalaryMax: salaryDetection.SalaryMax,
    SalaryCurrency: salaryDetection.SalaryCurrency,
    SalaryPeriod: salaryDetection.SalaryPeriod,
    SalaryText: salaryDetection.SalaryText,
    SalaryReviewReason: salaryDetection.SalaryReviewReason,
    CatalogSlug: context.catalogSlug,
    BoardURL: context.boardUrl,
    FetchURL: context.fetchUrl,
    FetchedAt: context.fetchedAt,
    TitleMatchType: titleMatch.TitleMatchType,
    TitleMatchCategory: titleMatch.TitleMatchCategory,
    MatchedWatchlistTitle: titleMatch.MatchedWatchlistTitle,
    TitleMatchScore: titleMatch.TitleMatchScore,
    TitleConfidence: titleMatch.TitleConfidence,
    TitleReviewBucket: titleReview.TitleReviewBucket,
    TitleReviewPriority: titleReview.TitleReviewPriority,
    TitleReviewReason: titleReview.TitleReviewReason,
    TitleDomainSignal: titleReview.TitleDomainSignal,
    TitleSenioritySignal: titleReview.TitleSenioritySignal,
    TitleLeadershipSignal: titleReview.TitleLeadershipSignal,
    TitleICSignal: titleReview.TitleICSignal,
    RawJobId: cleanText(job.id),
    RawJobURL: cleanText(job.absolute_url),
    RawLocation: location,
    RawDepartment: department,
  };
}

function getLeverDescription(job) {
  const parts = [job.descriptionPlain || job.description];

  if (Array.isArray(job.lists)) {
    for (const list of job.lists) {
      if (!list) {
        continue;
      }

      parts.push(list.text);
      if (Array.isArray(list.content)) {
        parts.push(list.content.join(" "));
      } else {
        parts.push(list.content);
      }
    }
  }

  parts.push(job.additionalPlain || job.additional);

  return stripHtml(parts.map(cleanText).filter(Boolean).join(" "));
}

function getLeverDatePosted(job) {
  if (job.createdAt) {
    const date = new Date(Number(job.createdAt));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return cleanText(job.createdAt);
}

function normalizeLeverJob(job, context, titleRecords) {
  const title = cleanText(job.text);
  const location = cleanText(job.categories && job.categories.location);
  const department = cleanText(job.categories && job.categories.team);
  const description = getLeverDescription(job);
  const titleMatch = matchTitle(title, titleRecords);
  const titleReview = getTitleReview(title, titleMatch);
  const baseJob = {
    Title: title,
    Location: location,
    RawLocation: location,
    Description: description,
    Salary: "",
  };
  const workArrangement = detectWorkArrangement(baseJob);
  const salaryDetection = detectSalary(baseJob);

  return {
    Source: "public-job-feed",
    ATS: "lever",
    Company: context.company,
    CompanyKey: context.companyKey,
    Title: title,
    Location: location,
    Description: description,
    URL: cleanText(job.hostedUrl),
    DatePosted: getLeverDatePosted(job),
    Salary: "",
    Department: department,
    RemoteStatus: workArrangement.RemoteStatus,
    RemoteSignal: workArrangement.RemoteSignal,
    RemoteConfidence: workArrangement.RemoteConfidence,
    LocationCountrySignal: workArrangement.LocationCountrySignal,
    USRemoteEligible: workArrangement.USRemoteEligible,
    LocationRisk: workArrangement.LocationRisk,
    LocationReviewReason: workArrangement.LocationReviewReason,
    SalaryDetected: salaryDetection.SalaryDetected,
    SalaryMin: salaryDetection.SalaryMin,
    SalaryMax: salaryDetection.SalaryMax,
    SalaryCurrency: salaryDetection.SalaryCurrency,
    SalaryPeriod: salaryDetection.SalaryPeriod,
    SalaryText: salaryDetection.SalaryText,
    SalaryReviewReason: salaryDetection.SalaryReviewReason,
    CatalogSlug: context.catalogSlug,
    BoardURL: context.boardUrl,
    FetchURL: context.fetchUrl,
    FetchedAt: context.fetchedAt,
    TitleMatchType: titleMatch.TitleMatchType,
    TitleMatchCategory: titleMatch.TitleMatchCategory,
    MatchedWatchlistTitle: titleMatch.MatchedWatchlistTitle,
    TitleMatchScore: titleMatch.TitleMatchScore,
    TitleConfidence: titleMatch.TitleConfidence,
    TitleReviewBucket: titleReview.TitleReviewBucket,
    TitleReviewPriority: titleReview.TitleReviewPriority,
    TitleReviewReason: titleReview.TitleReviewReason,
    TitleDomainSignal: titleReview.TitleDomainSignal,
    TitleSenioritySignal: titleReview.TitleSenioritySignal,
    TitleLeadershipSignal: titleReview.TitleLeadershipSignal,
    TitleICSignal: titleReview.TitleICSignal,
    RawJobId: cleanText(job.id),
    RawJobURL: cleanText(job.hostedUrl),
    RawLocation: location,
    RawDepartment: department,
  };
}

function normalizeWorkdayJob(job, context, titleRecords) {
  const externalPath = cleanText(job.externalPath || job.externalUrl || job.url);
  const boardUrl = cleanText(context.boardUrl).replace(/\/+$/g, "");
  const url = externalPath.startsWith("http")
    ? externalPath
    : externalPath
      ? `${boardUrl}${externalPath.startsWith("/") ? "" : "/"}${externalPath}`
      : boardUrl;

  return normalizeGenericAtsJob(job, { ...context, ats: "workday" }, titleRecords, {
    title: getFirstText(job.title, job.jobTitle),
    location: getFirstText(job.locationsText, getNestedText(job, ["locations"]), getNestedText(job, ["location"])),
    department: getFirstText(job.jobFamily, job.department, getNestedText(job, ["jobFamilyGroup"])),
    description: getFirstText(job.jobDescription, job.description, job.title),
    salary: getFirstText(job.payRate, job.salary, job.compensation),
    datePosted: getFirstText(job.postedOn, job.startDate, job.updated),
    url,
    rawJobId: getFirstText(job.id, job.jobReqId, job.bulletFields && job.bulletFields[0], externalPath),
  });
}

function normalizeBambooHRJob(job, context, titleRecords) {
  const id = getFirstText(job.id, job.jobOpeningId, job.openingId);
  const boardUrl = cleanText(context.boardUrl).replace(/\/list\/?$/g, "");
  const url = getFirstText(
    job.applicationUrl,
    job.jobOpeningUrl,
    job.url,
    id && boardUrl ? `${boardUrl}/${id}` : ""
  );
  const location = getFirstText(
    getLocationParts(job.location),
    getLocationParts(job.atsLocation),
    job.locationName,
    job.locationLabel
  );
  const title = getFirstText(job.jobOpeningName, job.title, job.jobTitle, job.name);

  return normalizeGenericAtsJob(job, { ...context, ats: "bamboohr" }, titleRecords, {
    title,
    location,
    department: getFirstText(job.departmentLabel, getNestedText(job, ["department"]), job.departmentName),
    description: getFirstText(job.description, job.jobDescription, job.summary, title),
    salary: getFirstText(job.compensation, job.salary, job.pay),
    datePosted: getFirstText(job.postedDate, job.datePosted, job.createdDate),
    url,
    rawJobId: id,
  });
}

function normalizeICIMSJob(job, context, titleRecords) {
  const id = getFirstText(job.id, job.jobId, job.requisitionId, job.reqId);
  const url = getFirstText(job.url, job.applyUrl, job.externalUrl, job.portalUrl, job.jobUrl, context.boardUrl);

  return normalizeGenericAtsJob(job, { ...context, ats: "icims" }, titleRecords, {
    title: getFirstText(job.title, job.jobTitle, job.name),
    location: getFirstText(getNestedText(job, ["location"]), job.locationName, job.city, job.jobLocation),
    department: getFirstText(getNestedText(job, ["department"]), job.departmentName, job.category),
    description: getFirstText(job.description, job.jobDescription, job.overview),
    salary: getFirstText(job.compensation, job.salary, job.pay),
    datePosted: getFirstText(job.datePosted, job.postedDate, job.createdDate),
    url,
    rawJobId: id,
  });
}


// Core-pipeline compatibility helpers added during the architecture transition.
const { processJobBatch: processCoreJobBatch } = require("../core/pipeline/engine");

function normalizeJobRecord(rawJob, context, options = {}) {
  return processCoreJobBatch([rawJob], context, options)[0];
}

function normalizeJobBatch(rawJobs, context, options = {}) {
  return processCoreJobBatch(rawJobs, context, options);
}

function detectSalaryInRecord(rawJob) {
  return detectSalary(rawJob);
}

function detectWorkArrangementInRecord(rawJob) {
  return detectWorkArrangement(rawJob);
}

function matchTitleToWatchlist(title, records) {
  return matchTitle(title, records);
}

function getBestTitleCandidateMatch(title, records) {
  return getBestTitleCandidate(title, records);
}

module.exports = {
  normalizeAshbyJob,
  normalizeBambooHRJob,
  normalizeGenericAtsJob,
  normalizeGreenhouseJob,
  normalizeICIMSJob,
  normalizeLeverJob,
  normalizeWorkdayJob,
  normalizeJobRecord,
  normalizeJobBatch,
  detectSalaryInRecord,
  detectWorkArrangementInRecord,
  matchTitleToWatchlist,
  getBestTitleCandidateMatch,
};
