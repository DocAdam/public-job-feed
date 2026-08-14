/**
 * Core job feed pipeline engine
 *
 * Orchestrates the full ETL pipeline from raw ATS ingestion to CSV export.
 */

const { detectSalary } = require("../deduplication/salary-detect");
const { detectWorkArrangement } = require("../classification/work-arrangement");
const { matchTitle } = require("../classification/title-match");
const { getTitleReview } = require("../classification/title-review");
const { createEmptyCanonicalRecord } = require("../models/job-record");
const { groupJobsByDedupeKey, selectCanonicalJob, getCompanyKeyMap } = require("../deduplication/job-dedupe");

/**
 * Enrich a single job record with all classification engines.
 *
 * @param {Object} rawJob - Raw job record from ATS
 * @param {Object} context - Processing context (ats, company, etc.)
 * @param {Object} options - Engine options including titleRecords for matching
 * @returns {Object} Enriched canonical job record
 */
function enrichJobRecord(rawJob, context, options = {}) {
  const enriched = createEmptyCanonicalRecord();

  // Set basic fields from context
  enriched.Source = "public-job-feed";
  enriched.ATS = context.ats || "";
  enriched.Company = context.company || "";
  enriched.CompanyKey = context.companyKey || "";
  enriched.CatalogSlug = context.catalogSlug || "";
  enriched.BoardURL = context.boardUrl || "";
  enriched.FetchURL = context.fetchUrl || "";
  enriched.FetchedAt = context.fetchedAt || new Date().toISOString();

  // Set raw fields
  enriched.RawJobId = rawJob.RawJobId || "";
  enriched.RawJobURL = rawJob.RawJobURL || rawJob.URL || "";
  enriched.RawLocation = rawJob.Location || rawJob.RawLocation || "";
  enriched.RawDepartment = rawJob.Department || "";

  // Set normalized fields with defaults
  enriched.Title = rawJob.Title || "";
  enriched.Location = rawJob.Location || "Unknown";
  enriched.Description = rawJob.Description || "";
  enriched.URL = rawJob.URL || "";
  enriched.DatePosted = rawJob.DatePosted || "";
  enriched.Salary = rawJob.Salary || rawJob.Compensation || "";
  enriched.Department = rawJob.Department || "";

  // Run salary detection
  const salaryResult = detectSalary(rawJob);
  Object.assign(enriched, salaryResult);

  // Run work arrangement detection
  const workArrangement = detectWorkArrangement(rawJob);
  Object.assign(enriched, workArrangement);

  // Run title matching if watchlist provided
  if (options.titleRecords && options.titleRecords.length > 0) {
    const titleMatchResult = matchTitle(enriched.Title, options.titleRecords);
    Object.assign(enriched, titleMatchResult);

    // Run title review classification
    const titleReviewResult = getTitleReview(enriched.Title, titleMatchResult);
    Object.assign(enriched, titleReviewResult);
  }

  return enriched;
}

/**
 * Process a batch of jobs through the full enrichment pipeline.
 *
 * @param {Array<Object>} rawJobs - Array of raw job records from ATS
 * @param {Object} context - Processing context for all jobs in batch
 * @param {Object} options - Pipeline options including titleRecords and dedup settings
 * @returns {Object[]} Array of enriched canonical job records
 */
function processJobBatch(rawJobs, context, options = {}) {
  const results = [];

  // Enrich each job individually
  for (const rawJob of rawJobs) {
    if (!rawJob.RawJobId && !rawJob.JobKey) continue;

    const enriched = enrichJobRecord(rawJob, context, options);
    results.push(enriched);
  }

  // Run cross-company deduplication if enabled
  if (options.deduplicate !== false) {
    return applyCrossCompanyDedupe(results);
  }

  return results;
}

/**
 * Apply cross-company deduplication to a set of enriched records.
 *
 * @param {Object[]} jobs - Array of enriched job records
 * @returns {Object[]} Deduplicated array of enriched records
 */
function applyCrossCompanyDedupe(jobs) {
  const dedupeGroups = groupJobsByDedupeKey(jobs);
  const canonicalRecords = [];

  for (const [key, group] of dedupeGroups) {
    const canonical = selectCanonicalJob(group);
    if (canonical) {
      canonical.DuplicateGroupKey = key;
      canonicalRecords.push(canonical);
    }
  }

  return canonicalRecords;
}

/**
 * Build the complete job feed from raw catalog data.
 *
 * @param {Object[]} rawCatalog - Parsed ATS catalog records
 * @param {Object} options - Full pipeline configuration options
 * @returns {Object[]} Final canonical job records ready for export
 */
function buildJobFeed(rawCatalog, options = {}) {
  const pipelineContext = options.context || {};

  // Group jobs by company for batch processing
  const companyMap = new Map();

  for (const rawJob of rawCatalog) {
    const companyKey = rawJob.Company || "unknown";

    if (!companyMap.has(companyKey)) {
      companyMap.set(companyKey, []);
    }

    // Add context to each job
    const enrichedJob = {
      ...rawJob,
      _context: options.context || {},
    };

    companyMap.get(companyKey).push(enrichedJob);
  }

  // Process each company batch
  const allResults = [];

  for (const [company, jobs] of companyMap) {
    if (jobs.length === 0) continue;

    const context = {
      ats: pipelineContext.ats || "",
      company: company,
      companyKey: options.companyKeyMap?.get(company) || company.toLowerCase(),
      catalogSlug: pipelineContext.catalogSlug || "",
      boardUrl: pipelineContext.boardUrl || "",
      fetchUrl: pipelineContext.fetchUrl || "",
    };

    const batchResults = processJobBatch(jobs, context, {
      titleRecords: options.titleRecords,
      deduplicate: options.deduplicate !== false,
    });

    allResults.push(...batchResults);
  }

  return allResults;
}

module.exports = {
  enrichJobRecord,
  processJobBatch,
  applyCrossCompanyDedupe,
  buildJobFeed,
};
