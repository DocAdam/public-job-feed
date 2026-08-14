const { categorizeTitle } = require("./title-category");

const SIMPLE_PUBLIC_HEADERS = [
  "Title",
  "Company",
  "Location",
  "Apply Link",
  "Additional Apply Links",
  "Writer Fit Score",
  "Fit Tier",
  "Why It Matched",
  "Role Type",
  "Work Arrangement",
  "Salary",
  "Posted Date",
  "Age (Days)",
  "Last Checked",
  "Source",
];

const SIMPLE_FORMULA_HEADERS = [
  "Title",
  "Company",
  "Location",
  "Apply",
  "Additional Apply Links",
  "Writer Fit Score",
  "Fit Tier",
  "Why It Matched",
  "Role Type",
  "Work Arrangement",
  "Salary",
  "Posted Date",
  "Age (Days)",
  "Last Checked",
  "Source",
];

const START_HERE_HEADERS = [
  "Report Run Date",
  "Good Documentation Jobs Count",
  "Coverage Percent",
  "Last Checked Range",
  "Recommended File",
  "Recommended Tabs",
  "Notes",
];

const SIMPLE_COMPANY_COVERAGE_HEADERS = [
  "Company",
  "ATS",
  "Coverage Status",
  "Jobs Found",
  "Good Matches Found",
  "Last Checked",
  "Last Fetch Status",
  "Fetch Notes",
  "Career Site / ATS URL",
];

function lowerText(value) {
  return String(value || "").toLowerCase();
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(value) {
  const date = parseDate(value);
  if (!date) {
    return "";
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatUtcDateTime(value) {
  const date = parseDate(value);
  if (!date) {
    return "";
  }

  return `${formatUtcDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function getAgeDays(postedDateValue, reportRunDateValue) {
  const postedDate = parseDate(postedDateValue);
  const reportRunDate = parseDate(reportRunDateValue);
  if (!postedDate || !reportRunDate) {
    return "";
  }

  const postedDay = Date.UTC(postedDate.getUTCFullYear(), postedDate.getUTCMonth(), postedDate.getUTCDate());
  const reportDay = Date.UTC(reportRunDate.getUTCFullYear(), reportRunDate.getUTCMonth(), reportRunDate.getUTCDate());
  const days = Math.floor((reportDay - postedDay) / (24 * 60 * 60 * 1000));

  return Math.max(0, days);
}

function getLastCheckedRange(rows) {
  const dates = rows
    .map((row) => parseDate(row.FetchedAt))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return "";
  }

  const first = formatUtcDateTime(dates[0]);
  const last = formatUtcDateTime(dates[dates.length - 1]);

  return first === last ? first : `${first} to ${last}`;
}

function buildWhyItMatched(row) {
  if (row.MatchedWatchlistTitle) {
    return `Matched watchlist title: ${row.MatchedWatchlistTitle}`;
  }

  const title = lowerText(row.Title);
  const domainSignal = lowerText(row.TitleDomainSignal);
  const reasons = lowerText(row.WriterFitReasons);
  const combined = `${title} ${domainSignal} ${reasons}`;

  if (hasAny(combined, ["documentation", "docs"])) {
    return "Documentation/docs signal";
  }

  if (hasAny(combined, ["technical content", "technical writing", "technical writer"])) {
    return "Technical writing/content match";
  }

  if (hasAny(combined, ["ux writing", "ux writer", "content design", "content designer"])) {
    return "UX/content design signal";
  }

  if (hasAny(combined, ["developer advocate", "developer relations", "devrel", "developer documentation", "api"])) {
    return "Developer documentation/devrel signal";
  }

  if (hasAny(combined, ["knowledge", "knowledge base"])) {
    return "Knowledge/documentation systems match";
  }

  return "High writer-fit score";
}

function buildRoleType(row) {
  const category = categorizeTitle(row.Title);
  if (category === "Adjacent Roles" || category === "Unknown") return "Adjacent / Transferable";
  return category;
}

function buildHyperlinkFormula(url) {
  if (!url) {
    return "";
  }

  const escapedUrl = String(url).replace(/"/g, '""');
  return `=HYPERLINK("${escapedUrl}","Apply")`;
}

function buildSimplePublicRow(row, reportRunDate) {
  return {
    Title: row.Title || "",
    Company: row.Company || "",
    Location: row.Location || "",
    "Apply Link": row.URL || "",
    "Additional Apply Links": "",
    "Writer Fit Score": row.WriterFitScore || "",
    "Fit Tier": row.WriterFitTier || "",
    "Why It Matched": buildWhyItMatched(row),
    "Role Type": buildRoleType(row),
    "Work Arrangement": row.RemoteStatus || "",
    Salary: row.SalaryText || "",
    "Posted Date": formatUtcDate(row.DatePosted),
    "Age (Days)": getAgeDays(row.DatePosted, reportRunDate),
    "Last Checked": formatUtcDateTime(row.FetchedAt),
    Source: row.ATS || "",
  };
}

function buildSimpleFormulaRow(row, reportRunDate) {
  const simpleRow = buildSimplePublicRow(row, reportRunDate);

  return {
    Title: simpleRow.Title,
    Company: simpleRow.Company,
    Location: simpleRow.Location,
    Apply: buildHyperlinkFormula(row.URL),
    "Additional Apply Links": "",
    "Writer Fit Score": simpleRow["Writer Fit Score"],
    "Fit Tier": simpleRow["Fit Tier"],
    "Why It Matched": simpleRow["Why It Matched"],
    "Role Type": simpleRow["Role Type"],
    "Work Arrangement": simpleRow["Work Arrangement"],
    Salary: simpleRow.Salary,
    "Posted Date": simpleRow["Posted Date"],
    "Age (Days)": simpleRow["Age (Days)"],
    "Last Checked": simpleRow["Last Checked"],
    Source: simpleRow.Source,
    // Not written as a formula-export column. It lets multi-location grouping
    // retain raw alternate URLs while the visible Apply column stays a formula.
    "Apply Link": simpleRow["Apply Link"],
  };
}

function buildStartHereRow(reportRunDate, recommendedFile, totalTopMatches, coveragePercent, lastCheckedRange) {
  return {
    "Report Run Date": formatUtcDateTime(reportRunDate),
    "Good Documentation Jobs Count": totalTopMatches,
    "Coverage Percent": coveragePercent === null || coveragePercent === undefined ? "" : coveragePercent,
    "Last Checked Range": lastCheckedRange || "",
    "Recommended File": recommendedFile,
    "Recommended Tabs": "Good Documentation Jobs | Remote Jobs",
    Notes:
      "Job age is based on Posted Date and Report Run Date; blank age means the ATS supplied no posting date. Last Checked shows when the board result was verified. Coverage percent means catalog entries accounted for, not boards checked recently. Always click Apply Link to confirm the job is still open.",
  };
}

function buildSimpleCompanyCoverageRow(row) {
  return {
    Company: row.Company || "",
    ATS: row.ATS || "",
    "Coverage Status": row.CoverageStatus || "",
    "Jobs Found": row.JobsFound || 0,
    "Good Matches Found": row.GoodMatchesFound || 0,
    "Last Checked": row.LastChecked || "",
    "Last Fetch Status": row.LastFetchStatus || "",
    "Fetch Notes": row.LastFetchError || row.FetchSupportReason || "",
    "Career Site / ATS URL": row.CareerSiteURL || row.EstimatedFetchURL || "",
  };
}

module.exports = {
  SIMPLE_COMPANY_COVERAGE_HEADERS,
  SIMPLE_PUBLIC_HEADERS,
  SIMPLE_FORMULA_HEADERS,
  START_HERE_HEADERS,
  buildSimpleCompanyCoverageRow,
  buildSimpleFormulaRow,
  buildSimplePublicRow,
  buildRoleType,
  buildStartHereRow,
  formatUtcDateTime,
  getLastCheckedRange,
};
