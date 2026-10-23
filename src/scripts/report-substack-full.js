const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords } = require("../lib/csv");
const { fromRoot, iterateLargeJsonArrayFile, readJsonFile, writeTextFile } = require("../lib/files");
const { packageEligibility } = require("../lib/public-package-eligibility");
const { previousPackage, packageIdentity } = require("../lib/package-status");
const { readPackageTimestamp } = require("../lib/package-time");
const { buildSubstackFullReport, canonicalJobKey } = require("../lib/substack-full-report");

const FULL_FEED_PATH = fromRoot("data", "jobs", "public", "public-job-feed-latest.json");
const CURRENT_SELECTION_PATH = fromRoot("data", "jobs", "public", "public-job-feed-deduped-top.json");
const LATEST_PACKAGE_DIR = fromRoot("data", "jobs", "gsheet-package", "latest");
const OUTPUT_PATH = fromRoot("data", "jobs", "reports", "substack-full-report.md");
const COMPARISON_FILE = "03_top_matches_full.csv";

async function loadSelectedCurrentRows(feedPath = FULL_FEED_PATH, selectionPath = CURRENT_SELECTION_PATH, savedSelection) {
  const selection = savedSelection || await readJsonFile(selectionPath);
  if (!Array.isArray(selection)) throw new Error(`${selectionPath} must contain a JSON array.`);
  const selectedKeys = new Set(selection.map(canonicalJobKey));
  const rowsByKey = new Map();
  for await (const row of iterateLargeJsonArrayFile(feedPath)) {
    const key = canonicalJobKey(row);
    if (selectedKeys.has(key)) rowsByKey.set(key, row);
    if (rowsByKey.size === selectedKeys.size) break;
  }
  const missing = [...selectedKeys].filter((key) => !rowsByKey.has(key));
  if (missing.length) throw new Error(`The canonical current feed is missing ${missing.length} selected job records.`);
  // Keep the saved package values if the canonical feed has since changed.
  // The canonical join checks source identity; the package defines this snapshot.
  return packageEligibility(selection.map((row) => ({ ...rowsByKey.get(canonicalJobKey(row)), ...row }))).included;
}

async function readComparisonRows(packageDir) {
  const filePath = path.join(packageDir, COMPARISON_FILE);
  const parsed = parseCsvRecords(await fs.readFile(filePath, "utf8"));
  return parsed.rows;
}

async function main() {
  const currentSnapshot = await packageIdentity(LATEST_PACKAGE_DIR);
  const currentDir = path.join(path.dirname(LATEST_PACKAGE_DIR), currentSnapshot);
  const selection = await readComparisonRows(currentDir);
  const currentRows = await loadSelectedCurrentRows(FULL_FEED_PATH, CURRENT_SELECTION_PATH, selection);
  const previousDir = await previousPackage(LATEST_PACKAGE_DIR);
  const previousRows = previousDir ? packageEligibility(await readComparisonRows(previousDir)).included : [];
  const summary = await readJsonFile(fromRoot("data/jobs/public/public-job-feed-latest-summary.json"));
  const markdown = buildSubstackFullReport({
    generatedAt: new Date().toISOString(),
    reportDate: (await readPackageTimestamp(currentDir)).toISOString(),
    currentSnapshot,
    previousSnapshot: previousDir ? path.basename(previousDir) : "",
    sourceGeneratedAt: summary.GeneratedAt,
    currentRows,
    previousRows,
  });
  await writeTextFile(OUTPUT_PATH, markdown);
  console.log(`Substack full report: ${OUTPUT_PATH}`);
  console.log(`Current jobs: ${currentRows.length}`);
  console.log(`Previous package: ${previousDir || "not available"}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  COMPARISON_FILE,
  CURRENT_SELECTION_PATH,
  FULL_FEED_PATH,
  OUTPUT_PATH,
  loadSelectedCurrentRows,
  main,
  readComparisonRows,
};
