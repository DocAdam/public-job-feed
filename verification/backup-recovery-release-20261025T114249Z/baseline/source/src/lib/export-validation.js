function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getUrlDetails(value) {
  const text = cleanText(value);
  if (!text) {
    return {
      valid: false,
      host: "",
    };
  }

  try {
    const url = new URL(text);
    return {
      valid: ["http:", "https:"].includes(url.protocol),
      host: url.hostname,
    };
  } catch (error) {
    return {
      valid: false,
      host: "",
    };
  }
}

function getMissingRequiredFields(row) {
  return ["Company", "Title", "URL", "ATS"].filter((field) => !cleanText(row[field]));
}

function validateExportRow(row) {
  const missingRequiredFields = getMissingRequiredFields(row);
  const urlDetails = getUrlDetails(row.URL);
  const descriptionLength = cleanText(row.Description).length;
  const issues = [];
  let flag = "OK";

  if (!cleanText(row.Title)) issues.push("Missing Title");
  if (!cleanText(row.URL)) issues.push("Missing URL");
  if (cleanText(row.URL) && !urlDetails.valid) issues.push("Invalid URL");

  if (issues.length > 0) {
    flag = "BAD_ROW";
  } else {
    if (!cleanText(row.Company)) issues.push("Missing Company");
    if (!cleanText(row.Description)) issues.push("Missing Description");
    if (descriptionLength > 0 && descriptionLength < 100) issues.push("Description under 100 characters");
    if (row.RemoteStatus === "Unknown") issues.push("RemoteStatus Unknown");
    if (row.PossibleDuplicate) issues.push("Possible duplicate");

    if (issues.length > 0) {
      flag = "REVIEW";
    }
  }

  return {
    ExportQualityFlag: flag,
    ExportQualityIssues: issues.join(" | "),
    MissingRequiredFields: missingRequiredFields.join(" | "),
    DescriptionLength: descriptionLength,
    URLValid: urlDetails.valid,
    ApplyURLHost: urlDetails.host,
  };
}

function addExportValidationFields(rows) {
  return rows.map((row) => ({
    ...row,
    ...validateExportRow(row),
  }));
}

function getQualitySummaryRows(rows) {
  return ["OK", "REVIEW", "BAD_ROW"].map((flag) => ({
    ExportQualityFlag: flag,
    Count: rows.filter((row) => row.ExportQualityFlag === flag).length,
  }));
}

module.exports = {
  addExportValidationFields,
  getQualitySummaryRows,
  validateExportRow,
};
