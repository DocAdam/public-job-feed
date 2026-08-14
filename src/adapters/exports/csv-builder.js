/**
 * CSV export adapter for canonical job records
 *
 * Handles converting normalized job records to CSV format with proper escaping.
 */

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function formatRow(headers, record) {
  return headers.map((header) => escapeCsvValue(record[header])).join(",");
}

/**
 * Convert an array of job records to CSV string.
 *
 * @param {Array<Object>} records - Array of job records
 * @param {string[]} columns - Column headers to include in output
 * @returns {string} CSV formatted string with header row and data rows
 */
function toCsvString(records, columns) {
  if (!records || records.length === 0) return "";

  const headerRow = columns.join(",");
  const dataRows = records.map((record) => formatRow(columns, record));

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Convert an array of job records to CSV string with BOM for Excel compatibility.
 *
 * @param {Array<Object>} records - Array of job records
 * @param {string[]} columns - Column headers to include in output
 * @returns {string} CSV formatted string with UTF-8 BOM
 */
function toCsvWithBom(records, columns) {
  const csv = toCsvString(records, columns);
  return "\uFEFF" + csv; // UTF-8 BOM
}

module.exports = {
  escapeCsvValue,
  formatRow,
  toCsvString,
  toCsvWithBom,
};
