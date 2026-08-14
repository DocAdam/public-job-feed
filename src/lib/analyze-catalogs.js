const { getCompanyKey, getPreferredCompanyNameSeed, titleCaseCompany } = require("./company-key");

const atsFieldNames = {
  ashby: "Ashby",
  bamboohr: "BambooHR",
  greenhouse: "Greenhouse",
  icims: "ICIMS",
  lever: "Lever",
  workday: "Workday",
};

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeCatalogValue(value) {
  return cleanText(value).toLowerCase();
}

function addUnique(list, value) {
  const text = cleanText(value);
  if (text && !list.includes(text)) {
    list.push(text);
  }
}

function toPipeList(values) {
  return values.join(" | ");
}

function getSortedValues(set) {
  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function isSuspiciousBoardUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return false;
  }

  if (/\s/.test(text)) {
    return true;
  }

  try {
    const url = new URL(text);
    return !["http:", "https:"].includes(url.protocol) || !url.hostname;
  } catch (error) {
    return true;
  }
}

function getMalformedReason(row) {
  const reasons = [];

  if (!cleanText(row.ATS)) {
    reasons.push("Missing ATS");
  }

  if (!cleanText(row.CatalogValue)) {
    reasons.push("Missing CatalogValue");
  }

  if (!cleanText(row.CatalogSlug)) {
    reasons.push("Missing CatalogSlug");
  }

  if (isSuspiciousBoardUrl(row.BoardURL)) {
    reasons.push("Suspicious BoardURL");
  }

  return reasons.join(" | ");
}

function createGroup() {
  return {
    rows: [],
    ats: new Set(),
    catalogValues: new Set(),
    catalogCompanies: new Set(),
    boardUrls: new Set(),
  };
}

function pushGroupRow(group, row) {
  group.rows.push(row);
  group.ats.add(cleanText(row.ATS));
  group.catalogValues.add(cleanText(row.CatalogValue));
  group.catalogCompanies.add(cleanText(row.CatalogCompany));
  group.boardUrls.add(cleanText(row.BoardURL));
}

function createAtsBreakdownRow(ats) {
  return {
    ATS: ats,
    Rows: 0,
    catalogValues: new Set(),
    companyKeys: new Set(),
    RowsWithBoardURL: 0,
    RowsWithoutBoardURL: 0,
    MalformedRows: 0,
  };
}

function getAtsBreakdownCsvRows(atsBreakdown) {
  return Array.from(atsBreakdown.values())
    .sort((a, b) => a.ATS.localeCompare(b.ATS))
    .map((item) => ({
      ATS: item.ATS,
      Rows: item.Rows,
      UniqueCatalogValues: item.catalogValues.size,
      UniqueCompanyKeys: item.companyKeys.size,
      RowsWithBoardURL: item.RowsWithBoardURL,
      RowsWithoutBoardURL: item.RowsWithoutBoardURL,
      MalformedRows: item.MalformedRows,
    }));
}

function getDuplicateCatalogValueRows(groups) {
  return Array.from(groups.entries())
    .filter(([, group]) => group.rows.length > 1)
    .map(([normalizedValue, group]) => ({
      NormalizedCatalogValue: normalizedValue,
      Count: group.rows.length,
      ATSList: toPipeList(getSortedValues(group.ats)),
      RawValues: toPipeList(getSortedValues(group.catalogValues)),
      BoardURLs: toPipeList(getSortedValues(group.boardUrls)),
    }))
    .sort((a, b) => b.Count - a.Count || a.NormalizedCatalogValue.localeCompare(b.NormalizedCatalogValue));
}

function getCompanyKeyOverlapRows(groups) {
  return Array.from(groups.entries())
    .filter(([companyKey, group]) => {
      if (!companyKey) {
        return false;
      }

      return getSortedValues(group.ats).length > 1 || getSortedValues(group.catalogValues).length > 1;
    })
    .map(([companyKey, group]) => {
      const atsList = getSortedValues(group.ats);

      return {
        CompanyKey: companyKey,
        Count: group.rows.length,
        ATSCount: atsList.length,
        ATSList: toPipeList(atsList),
        CatalogValues: toPipeList(getSortedValues(group.catalogValues)),
        CatalogCompanies: toPipeList(getSortedValues(group.catalogCompanies)),
        BoardURLs: toPipeList(getSortedValues(group.boardUrls)),
      };
    })
    .sort(
      (a, b) =>
        b.ATSCount - a.ATSCount ||
        b.Count - a.Count ||
        a.CompanyKey.localeCompare(b.CompanyKey)
    );
}

function getPreferredCompanyName(group) {
  const companyName = group.rows.map((row) => cleanText(row.CatalogCompany)).find(Boolean);
  if (companyName) {
    return companyName;
  }

  const seed = group.rows.map(getPreferredCompanyNameSeed).find(Boolean);
  return titleCaseCompany(seed);
}

function getFirstByAts(rows, ats, field) {
  const match = rows.find((row) => cleanText(row.ATS).toLowerCase() === ats && cleanText(row[field]));
  return match ? cleanText(match[field]) : "";
}

function createRegistryCandidate(companyKey, group) {
  const atsList = getSortedValues(group.ats);
  const catalogValues = getSortedValues(group.catalogValues);
  const catalogCompanies = getSortedValues(group.catalogCompanies);
  const sourceRowDetails = group.rows.map((row) => ({
    Source: row.Source || "",
    ATS: row.ATS || "",
    CatalogSlug: row.CatalogSlug || "",
    CatalogCompany: row.CatalogCompany || "",
    CatalogValue: row.CatalogValue || "",
    BoardURL: row.BoardURL || "",
    RawCatalogFile: row.RawCatalogFile || "",
  }));

  const candidate = {
    CompanyKey: companyKey,
    PreferredCompanyName: getPreferredCompanyName(group),
    ATSCount: atsList.length,
    ATSList: atsList,
    CatalogValues: catalogValues,
    CatalogCompanies: catalogCompanies,
    SourceRows: group.rows.length,
    SourceRowDetails: sourceRowDetails,
  };

  for (const [ats, fieldName] of Object.entries(atsFieldNames)) {
    candidate[`${fieldName}Slug`] = getFirstByAts(group.rows, ats, "CatalogSlug");
    candidate[`${fieldName}URL`] = getFirstByAts(group.rows, ats, "BoardURL");
  }

  return candidate;
}

function getRegistryCandidates(groups) {
  return Array.from(groups.entries())
    .filter(([companyKey]) => companyKey)
    .map(([companyKey, group]) => createRegistryCandidate(companyKey, group))
    .sort(
      (a, b) =>
        b.ATSCount - a.ATSCount ||
        b.SourceRows - a.SourceRows ||
        a.CompanyKey.localeCompare(b.CompanyKey)
    );
}

function getRegistryCandidateCsvRows(candidates) {
  return candidates.map((candidate) => ({
    CompanyKey: candidate.CompanyKey,
    PreferredCompanyName: candidate.PreferredCompanyName,
    ATSCount: candidate.ATSCount,
    ATSList: toPipeList(candidate.ATSList),
    AshbySlug: candidate.AshbySlug,
    BambooHRSlug: candidate.BambooHRSlug,
    GreenhouseSlug: candidate.GreenhouseSlug,
    ICIMSSlug: candidate.ICIMSSlug,
    LeverSlug: candidate.LeverSlug,
    WorkdaySlug: candidate.WorkdaySlug,
    AshbyURL: candidate.AshbyURL,
    BambooHRURL: candidate.BambooHRURL,
    GreenhouseURL: candidate.GreenhouseURL,
    ICIMSURL: candidate.ICIMSURL,
    LeverURL: candidate.LeverURL,
    WorkdayURL: candidate.WorkdayURL,
    CatalogValues: toPipeList(candidate.CatalogValues),
    CatalogCompanies: toPipeList(candidate.CatalogCompanies),
    SourceRows: candidate.SourceRows,
  }));
}

function analyzeCatalogRows(rows, generatedAt) {
  const uniqueAts = new Set();
  const uniqueCatalogValues = new Set();
  const uniqueCompanyKeys = new Set();
  const atsBreakdown = new Map();
  const duplicateCatalogValueGroups = new Map();
  const companyKeyGroups = new Map();
  const malformedRows = [];
  let rowsWithBoardUrl = 0;
  let rowsWithoutBoardUrl = 0;

  rows.forEach((row, index) => {
    const ats = cleanText(row.ATS);
    const catalogValue = cleanText(row.CatalogValue);
    const normalizedCatalogValue = normalizeCatalogValue(catalogValue);
    const companyKey = getCompanyKey(row);
    const boardUrl = cleanText(row.BoardURL);
    const malformedReason = getMalformedReason(row);

    uniqueAts.add(ats);
    if (normalizedCatalogValue) {
      uniqueCatalogValues.add(normalizedCatalogValue);
    }

    if (companyKey) {
      uniqueCompanyKeys.add(companyKey);
    }

    if (!atsBreakdown.has(ats)) {
      atsBreakdown.set(ats, createAtsBreakdownRow(ats));
    }

    const atsRow = atsBreakdown.get(ats);
    atsRow.Rows += 1;
    if (normalizedCatalogValue) {
      atsRow.catalogValues.add(normalizedCatalogValue);
    }
    if (companyKey) {
      atsRow.companyKeys.add(companyKey);
    }
    if (boardUrl) {
      rowsWithBoardUrl += 1;
      atsRow.RowsWithBoardURL += 1;
    } else {
      rowsWithoutBoardUrl += 1;
      atsRow.RowsWithoutBoardURL += 1;
    }
    if (malformedReason) {
      atsRow.MalformedRows += 1;
      malformedRows.push({
        RowNumber: index + 1,
        Reason: malformedReason,
        Source: row.Source || "",
        ATS: row.ATS || "",
        CatalogSlug: row.CatalogSlug || "",
        CatalogCompany: row.CatalogCompany || "",
        CatalogValue: row.CatalogValue || "",
        BoardURL: row.BoardURL || "",
        RawCatalogFile: row.RawCatalogFile || "",
      });
    }

    if (normalizedCatalogValue) {
      if (!duplicateCatalogValueGroups.has(normalizedCatalogValue)) {
        duplicateCatalogValueGroups.set(normalizedCatalogValue, createGroup());
      }
      pushGroupRow(duplicateCatalogValueGroups.get(normalizedCatalogValue), row);
    }

    if (companyKey) {
      if (!companyKeyGroups.has(companyKey)) {
        companyKeyGroups.set(companyKey, createGroup());
      }
      pushGroupRow(companyKeyGroups.get(companyKey), row);
    }
  });

  const duplicateCatalogValueRows = getDuplicateCatalogValueRows(duplicateCatalogValueGroups);
  const companyKeyOverlapRows = getCompanyKeyOverlapRows(companyKeyGroups);
  const registryCandidates = getRegistryCandidates(companyKeyGroups);

  const summary = {
    GeneratedAt: generatedAt,
    TotalRows: rows.length,
    UniqueATS: getSortedValues(uniqueAts).length,
    UniqueCatalogValues: uniqueCatalogValues.size,
    UniqueCompanyKeys: uniqueCompanyKeys.size,
    RowsWithBoardURL: rowsWithBoardUrl,
    RowsWithoutBoardURL: rowsWithoutBoardUrl,
    MalformedRows: malformedRows.length,
    DuplicateCatalogValueGroups: duplicateCatalogValueRows.length,
    CompanyKeyOverlapGroups: companyKeyOverlapRows.length,
  };

  return {
    summary,
    summaryRows: [summary],
    atsBreakdownRows: getAtsBreakdownCsvRows(atsBreakdown),
    duplicateCatalogValueRows,
    companyKeyOverlapRows,
    malformedRows,
    registryCandidates,
    registryCandidateCsvRows: getRegistryCandidateCsvRows(registryCandidates),
  };
}

module.exports = {
  analyzeCatalogRows,
  isSuspiciousBoardUrl,
  normalizeCatalogValue,
};
