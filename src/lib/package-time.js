const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords } = require("./csv");
function parseRecordedTime(value) {
  const text = String(value || "").trim();
  const normalized = text.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?) UTC$/, "$1T$2Z");
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) return null;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
async function readPackageTimestamp(dir) {
  const read = async name => fs.readFile(path.join(dir, name), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
  const readme = await read("README_GSHEET_PACKAGE.md");
  const exact = parseRecordedTime(readme.match(/^Generated:\s*(.+)$/m)?.[1]);
  if (exact) return exact;
  const csv = await read("00_start_here.csv");
  const date = parseRecordedTime(csv ? parseCsvRecords(csv).rows[0]?.["Report Run Date"] : "");
  if (!date) throw new Error(`Package has no recorded UTC timestamp: ${dir}`);
  return date;
}
module.exports = { parseRecordedTime, readPackageTimestamp };
