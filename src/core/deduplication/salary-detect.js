/**
 * Core salary detection engine
 *
 * Extracts and normalizes compensation ranges from job text fields.
 */

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function visibleText(value) {
  return cleanText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "\u2013")
    .replace(/&mdash;|&#8212;/gi, "\u2014")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyValue(value, suffix) {
  const numeric = Number(String(value).replace(/,/g, ""));

  if (!Number.isFinite(numeric)) {
    return "";
  }

  if (suffix && suffix.toLowerCase() === "k") {
    return Math.round(numeric * 1000);
  }

  return Math.round(numeric);
}

function getSalaryPeriod(min, max) {
  if ((Number(min) || 0) > 20000 || (Number(max) || 0) > 20000) {
    return "annual";
  }
  return "";
}

function findSalaryMatch(text) {
  const patterns = [
    /(\$)\s*([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{2,3})(k?)\s*(?:-|–|—|to)\s*\$?\s*([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{2,3})(k?)/i,
    /(\$)\s*([0-9]+)(k)\s*(?:-|–|—|to)\s*\$?\s*([0-9]+)(k)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Detect salary information from job fields.
 *
 * @param {Object} job - Job record with Salary, Compensation, PayRange, Description fields
 * @returns {Object} SalaryDetectionResult object
 */
function detectSalary(job) {
  const text = [job.Salary, job.Compensation, job.PayRange, job.Description]
    .map(visibleText)
    .filter(Boolean)
    .join(" ");

  const match = findSalaryMatch(text);

  if (!match) {
    return {
      SalaryDetected: false,
      SalaryMin: "",
      SalaryMax: "",
      SalaryCurrency: "",
      SalaryPeriod: "",
      SalaryText: "",
      SalaryReviewReason: "No salary range detected",
    };
  }

  const min = parseMoneyValue(match[2], match[3]);
  const max = parseMoneyValue(match[4], match[5]);

  return {
    SalaryDetected: true,
    SalaryMin: String(min),
    SalaryMax: String(max),
    SalaryCurrency: match[1] === "$" ? "USD" : "",
    SalaryPeriod: getSalaryPeriod(min, max),
    SalaryText: match[0],
    SalaryReviewReason: "Compensation range detected",
  };
}

module.exports = {
  detectSalary,
  visibleText,
};
