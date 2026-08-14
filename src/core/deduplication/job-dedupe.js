/**
 * Core job deduplication engine
 *
 * Handles cross-company de-duplication and normalization of job records,
 * including company key generation and canonical URL resolution.
 */

const { normalizeTitle } = require("../models/job-titles");

function normalizeCompany(company) {
  if (!company) return "";
  return String(company).trim().toLowerCase();
}

function generateCompanyKey(company) {
  const normalized = normalizeCompany(company);
  return (
    normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || company || "unknown"
  );
}

function generateJobKey(job) {
  const companyKey = generateCompanyKey(job.Company);
  const normalizedTitle = normalizeTitle(job.Title);
  return `${companyKey}-${normalizedTitle}`;
}

function groupJobsByDedupeKey(jobs) {
  const groups = new Map();

  for (const job of jobs) {
    const key = generateJobKey(job);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(job);
  }

  return groups;
}

function selectCanonicalJob(group) {
  // Select the job with the most complete data as canonical
  const sorted = [...group].sort((a, b) => {
    // Prefer jobs with more populated fields
    const scoreA = Object.values(a).filter(Boolean).length;
    const scoreB = Object.values(b).filter(Boolean).length;
    return scoreB - scoreA;
  });

  return sorted[0] || null;
}

function getCompanyKeyMap(jobs) {
  const map = new Map();

  for (const job of jobs) {
    if (!job.CompanyKey && job.Company) {
      map.set(job.Company, generateCompanyKey(job.Company));
    }
  }

  return map;
}

module.exports = {
  normalizeCompany,
  generateCompanyKey,
  generateJobKey,
  groupJobsByDedupeKey,
  selectCanonicalJob,
  getCompanyKeyMap,
};
