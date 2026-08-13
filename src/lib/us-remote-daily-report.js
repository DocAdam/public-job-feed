const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords } = require("./csv");

const timestampPattern = /^\d{8}-\d{4}$/;
const jobCsvName = "01_good_documentation_jobs.csv";
const requiredHeaders = ["Title", "Company", "Location", "Apply Link", "Work Arrangement"];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  return cleanText(value).toLowerCase().replace(/\/+$/, "");
}

function jobKey(row) {
  const url = normalizeUrl(row["Apply Link"]);
  return url || [row.Company, row.Title, row.Location].map(cleanText).join("|").toLowerCase();
}

function hasExplicitUsLocation(value) {
  const location = cleanText(value);
  return /\bunited\s+states\b/i.test(location)
    || /\busa\b/i.test(location)
    || /(?:^|[\s,;|(/-])u\.?\s*s\.?(?=$|[\s,;|)/-])/i.test(location);
}

function isConfirmedUsRemote(row) {
  return cleanText(row["Work Arrangement"]).toLowerCase() === "remote"
    && hasExplicitUsLocation(row.Location);
}

function filterConfirmedUsRemote(rows) {
  return rows.filter(isConfirmedUsRemote);
}

function missingRequiredHeaders(headers) {
  const actual = new Set(headers);
  return requiredHeaders.filter((header) => !actual.has(header));
}

async function readJobCsv(packageDir) {
  const filePath = path.join(packageDir, jobCsvName);
  const parsed = parseCsvRecords(await fs.readFile(filePath, "utf8"));
  const missing = missingRequiredHeaders(parsed.headers);
  if (missing.length) {
    throw new Error(`${filePath} is missing required columns: ${missing.join(", ")}`);
  }
  return { filePath, rows: parsed.rows };
}

async function listTimestampedPackageDirs(packageRoot) {
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && timestampPattern.test(entry.name))
    .map((entry) => path.join(packageRoot, entry.name))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
}

async function resolveSnapshots(packageRoot, currentDir = "", previousDir = "") {
  const snapshots = await listTimestampedPackageDirs(packageRoot);
  const current = currentDir ? path.resolve(currentDir) : snapshots[0];
  if (!current) throw new Error(`No timestamped package folders found in ${packageRoot}.`);

  const previous = previousDir
    ? path.resolve(previousDir)
    : snapshots.find((snapshot) => path.resolve(snapshot) !== path.resolve(current));
  if (!previous) throw new Error("At least two timestamped package folders are required.");

  return { current, previous };
}

function compareRows(currentRows, previousRows) {
  const current = filterConfirmedUsRemote(currentRows);
  const previous = filterConfirmedUsRemote(previousRows);
  const currentByKey = new Map(current.map((row) => [jobKey(row), row]));
  const previousByKey = new Map(previous.map((row) => [jobKey(row), row]));
  const added = current.filter((row) => !previousByKey.has(jobKey(row)));
  const removed = previous.filter((row) => !currentByKey.has(jobKey(row)));
  const continuing = current.filter((row) => previousByKey.has(jobKey(row)));

  return { current, previous, added, removed, continuing };
}

function markdownLink(row) {
  const title = cleanText(row.Title) || "Untitled role";
  const company = cleanText(row.Company);
  const location = cleanText(row.Location);
  const label = [title, company].filter(Boolean).join(" — ").replace(/[\[\]]/g, "");
  const url = cleanText(row["Apply Link"]);
  return `- [${label}](${url})${location ? ` — ${location}` : ""}`;
}

function buildMarkdown({ generatedAt, currentSnapshot, previousSnapshot, comparison, currentPath, previousPath }) {
  const section = (heading, rows, emptyText) => [
    `## ${heading}`,
    "",
    ...(rows.length ? rows.map(markdownLink) : [emptyText]),
    "",
  ];
  return [
    "# Confirmed US Remote Jobs — Daily Comparison",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Current package: \`${currentSnapshot}\``,
    `Previous package: \`${previousSnapshot}\``,
    `Source CSVs: \`${currentPath}\` and \`${previousPath}\``,
    "",
    "## Filter",
    "",
    "Includes only rows with `Work Arrangement` exactly `Remote` and an explicit US location marker: `US`, `U.S.`, `USA`, or `United States`. Hybrid, onsite, unknown, generic remote, and city/state-only listings are excluded.",
    "",
    "## Summary",
    "",
    `- Current confirmed US-remote jobs: ${comparison.current.length}`,
    `- Added since previous package: ${comparison.added.length}`,
    `- Removed since previous package: ${comparison.removed.length}`,
    `- Continuing: ${comparison.continuing.length}`,
    `- Net change: ${comparison.current.length - comparison.previous.length >= 0 ? "+" : ""}${comparison.current.length - comparison.previous.length}`,
    "",
    ...section("Added", comparison.added, "None."),
    ...section("Removed", comparison.removed, "None."),
    ...section("Current jobs", comparison.current, "None."),
  ].join("\n");
}

module.exports = {
  buildMarkdown,
  compareRows,
  filterConfirmedUsRemote,
  hasExplicitUsLocation,
  jobCsvName,
  readJobCsv,
  resolveSnapshots,
};
