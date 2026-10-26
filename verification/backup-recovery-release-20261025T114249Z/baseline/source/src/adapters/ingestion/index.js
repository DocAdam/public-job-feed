/**
 * Ingestion adapter entry point
 *
 * Provides interface for fetching and parsing job data from ATS providers.
 */

const { evaluateAtsAnomalies } = require("../../core/deduplication/ats-anomaly");

// Map of supported ATS provider slugs
const SUPPORTED_ATS_PROVIDERS = new Set([
  "ashby",
  "bamboohr",
  "greenhouse",
  "icims",
  "lever",
  "workday",
]);

/**
 * Check if an ATS provider is supported by this adapter.
 *
 * @param {string} ats - Provider slug
 * @returns {boolean} Whether the provider is supported
 */
function isAtsSupported(ats) {
  return SUPPORTED_ATS_PROVIDERS.has(String(ats).toLowerCase().trim());
}

/**
 * Get list of all supported ATS providers.
 *
 * @returns {string[]} List of supported provider slugs
 */
function getSupportedProviders() {
  return Array.from(SUPPORTED_ATS_PROVIDERS);
}

/**
 * Evaluate anomaly metrics for an ATS provider.
 *
 * @param {string} ats - Provider slug
 * @param {Array<Object>} recentRows - Recent fetch attempt records
 * @param {Array<Object>} baselineRows - Baseline fetch attempt records
 * @param {Object} options - Anomaly evaluation options
 * @returns {Object} Evaluation result with alerts and status
 */
function evaluateAnomalies(ats, recentRows, baselineRows, options = {}) {
  return evaluateAtsAnomalies(ats, recentRows, baselineRows, options);
}

module.exports = {
  isAtsSupported,
  getSupportedProviders,
  evaluateAnomalies,
  SUPPORTED_ATS_PROVIDERS,
};
