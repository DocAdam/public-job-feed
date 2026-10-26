const { normalizeTitle } = require("./job-titles");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeKeyPart(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[!"#$%&'()*+,.:;<=>?@[\\\]^`{|}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");
}

function getCanonicalURLKey(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const pathname = url.pathname.replace(/\/+$/g, "");
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${pathname}`;
  } catch (error) {
    return "";
  }
}

function getCompanyTitleLocationKey(row) {
  const company = normalizeKeyPart(row.CompanyKey || row.Company);
  const title = normalizeKeyPart(normalizeTitle(row.Title));
  const location = normalizeKeyPart(row.Location || row.RawLocation);

  return [company, title, location].filter(Boolean).join(":");
}

function getJobKey(row) {
  const ats = normalizeKeyPart(row.ATS);

  if (cleanText(row.RawJobId)) {
    return [ats, normalizeKeyPart(row.RawJobId)].filter(Boolean).join(":");
  }

  return [ats, getCompanyTitleLocationKey(row)].filter(Boolean).join(":");
}

function groupCounts(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const key = cleanText(row[field]);
    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}

function addDedupeFields(rows) {
  const keyedRows = rows.map((row) => ({
    ...row,
    JobKey: getJobKey(row),
    CompanyTitleLocationKey: getCompanyTitleLocationKey(row),
    CanonicalURLKey: getCanonicalURLKey(row.URL || row.RawJobURL),
  }));
  const urlCounts = groupCounts(keyedRows, "CanonicalURLKey");
  const companyTitleLocationCounts = groupCounts(keyedRows, "CompanyTitleLocationKey");

  return keyedRows.map((row) => {
    const duplicateByUrl = row.CanonicalURLKey && urlCounts.get(row.CanonicalURLKey) > 1;
    const duplicateByCompanyTitleLocation =
      row.CompanyTitleLocationKey && companyTitleLocationCounts.get(row.CompanyTitleLocationKey) > 1;
    let duplicateReason = "";
    let duplicateGroupKey = "";

    if (duplicateByUrl && duplicateByCompanyTitleLocation) {
      duplicateReason = "Both canonical URL and company/title/location";
      duplicateGroupKey = `${row.CanonicalURLKey} | ${row.CompanyTitleLocationKey}`;
    } else if (duplicateByUrl) {
      duplicateReason = "Same canonical URL";
      duplicateGroupKey = row.CanonicalURLKey;
    } else if (duplicateByCompanyTitleLocation) {
      duplicateReason = "Same company/title/location";
      duplicateGroupKey = row.CompanyTitleLocationKey;
    }

    return {
      ...row,
      PossibleDuplicate: Boolean(duplicateReason),
      DuplicateGroupKey: duplicateGroupKey,
      DuplicateReason: duplicateReason,
    };
  });
}

function getDuplicateSummary(rows) {
  const duplicateRows = rows.filter((row) => row.PossibleDuplicate);
  const duplicateGroups = new Set(duplicateRows.map((row) => row.DuplicateGroupKey).filter(Boolean));

  return {
    TotalRows: rows.length,
    PossibleDuplicateCount: duplicateRows.length,
    DuplicateGroupCount: duplicateGroups.size,
    CanonicalURLDuplicateCount: duplicateRows.filter((row) =>
      ["Same canonical URL", "Both canonical URL and company/title/location"].includes(row.DuplicateReason)
    ).length,
    CompanyTitleLocationDuplicateCount: duplicateRows.filter((row) =>
      ["Same company/title/location", "Both canonical URL and company/title/location"].includes(row.DuplicateReason)
    ).length,
  };
}

module.exports = {
  addDedupeFields,
  getCanonicalURLKey,
  getCompanyTitleLocationKey,
  getDuplicateSummary,
  getJobKey,
};
