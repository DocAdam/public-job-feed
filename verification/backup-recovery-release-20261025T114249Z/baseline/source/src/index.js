/**
 * Public Job Feed - Main Entry Point
 *
 * Provides the public API for the job feed pipeline.
 */

// Core modules
const { buildJobFeed, processJobBatch, enrichJobRecord } = require("./core/pipeline/engine");
const { detectWorkArrangement } = require("./core/classification/work-arrangement");
const { detectSalary } = require("./core/deduplication/salary-detect");
const { matchTitle, getBestTitleCandidate } = require("./core/classification/title-match");
const { getTitleReview } = require("./core/classification/title-review");
const {
  createEmptyCanonicalRecord,
  defaultEmptyRecord
} = require("./core/models/job-record");
const { parseJobTitlesMarkdown, getJobTitleSummary } = require("./core/models/job-titles");
const {
  normalizeCompany,
  generateCompanyKey,
  generateJobKey,
  groupJobsByDedupeKey,
  selectCanonicalJob,
  getCompanyKeyMap
} = require("./core/deduplication/job-dedupe");
const { evaluateAnomalies } = require("./core/deduplication/ats-anomaly");

// Adapter modules
const { toCsvString, toCsvWithBom } = require("./adapters/exports/csv-builder");
const { isAtsSupported, getSupportedProviders } = require("./adapters/ingestion");

// Loaders
const { loadWatchlist, loadSettings, readJobTitles } = require("./lib/config-loader");

/**
 * Main pipeline entry point for processing raw catalog data.
 *
 * @param {Array<Object>} rawCatalog - Parsed ATS catalog records
 * @param {Object} options - Pipeline configuration options
 * @returns {Promise<Array<Object>>} Final canonical job records
 */
async function processCatalog(rawCatalog, options = {}) {
  // Load watchlist if needed
  let titleRecords = [];
  if (options.loadWatchlist !== false) {
    titleRecords = await loadWatchlist();
  } else if (options.titleRecords) {
    titleRecords = options.titleRecords;
  }

  // Process through pipeline
  return buildJobFeed(rawCatalog, {
    ...options,
    titleRecords: titleRecords.length > 0 ? titleRecords : undefined,
    deduplicate: options.deduplicate !== false,
  });
}

/**
 * Get the canonical output schema for job records.
 *
 * @returns {Object} Empty canonical record template
 */
function getCanonicalSchema() {
  return createEmptyCanonicalRecord();
}

/**
 * Export jobs to CSV format.
 *
 * @param {Array<Object>} jobs - Job records to export
 * @param {string[]} columns - Column headers for output
 * @param {boolean} withBom - Include UTF-8 BOM
 * @returns {string} CSV formatted string
 */
function exportToCsv(jobs, columns, withBom = false) {
  return withBom ? toCsvWithBom(jobs, columns) : toCsvString(jobs, columns);
}

module.exports = {
  // Pipeline
  processCatalog,
  buildJobFeed,
  processJobBatch,
  enrichJobRecord,

  // Classifiers
  detectWorkArrangement,
  detectSalary,
  matchTitle,
  getBestTitleCandidate,
  getTitleReview,

  // Models
  createEmptyCanonicalRecord,
  defaultEmptyRecord,
  parseJobTitlesMarkdown,
  readJobTitles,
  getJobTitleSummary,

  // Deduplication
  normalizeCompany,
  generateCompanyKey,
  generateJobKey,
  groupJobsByDedupeKey,
  selectCanonicalJob,
  getCompanyKeyMap,
  evaluateAnomalies,

  // Adapters
  exportToCsv,
  toCsvString,
  toCsvWithBom,
  isAtsSupported,
  getSupportedProviders,

  // Config
  loadWatchlist,
  loadSettings,

  // Schema
  getCanonicalSchema,
};
