const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile, writeTextFile } = require("../lib/files");
const { categorizeTitle } = require("../lib/title-category");

const inputPath = fromRoot("data", "jobs", "gsheet-package", "latest", "01_good_documentation_jobs.csv");
const reportsDir = fromRoot("data", "jobs", "reports");

function reviewBucket(title) {
  const text = String(title || "").toLowerCase();
  if (/writer|editor|content|document|publication|author|curriculum|courseware/.test(text)) return "POSSIBLE_CLASSIFICATION_GAP";
  if (/developer|engineer|architect|technical|product|support|information/.test(text)) return "ADJACENT_TECH_REVIEW";
  return "MANUAL_REVIEW";
}

async function main() {
  const rows = parseCsvRecords(await fs.readFile(inputPath, "utf8")).rows;
  const unknown = rows.filter((row) => categorizeTitle(row.Title) === "Unknown").map((row) => ({
    Title: row.Title,
    Company: row.Company,
    WriterFitScore: row["Writer Fit Score"],
    FitTier: row["Fit Tier"],
    ReviewBucket: reviewBucket(row.Title),
    ApplyLink: row["Apply Link"],
  }));
  const bucketCounts = Object.entries(unknown.reduce((counts, row) => {
    counts[row.ReviewBucket] = (counts[row.ReviewBucket] || 0) + 1;
    return counts;
  }, {})).map(([ReviewBucket, Rows]) => ({ ReviewBucket, Rows }));
  const report = {
    GeneratedAt: new Date().toISOString(),
    InputRows: rows.length,
    UnknownRows: unknown.length,
    UnknownPercent: rows.length ? Number(((unknown.length / rows.length) * 100).toFixed(2)) : 0,
    ReviewBuckets: bucketCounts,
    Rows: unknown,
  };
  const markdown = [
    "# Unknown Title Category Analysis",
    "",
    `Generated: ${report.GeneratedAt}`,
    `Input jobs: ${report.InputRows}`,
    `Unknown jobs: ${report.UnknownRows} (${report.UnknownPercent}%)`,
    "",
    "## Review Buckets",
    "",
    ...bucketCounts.map((row) => `- ${row.ReviewBucket}: ${row.Rows}`),
    "",
    "## Remaining Unknown Titles",
    "",
    ...unknown.map((row) => `- ${row.Title} — ${row.Company} (${row.ReviewBucket})`),
    "",
  ].join("\n");
  await ensureDir(reportsDir);
  await Promise.all([
    writeJsonFile(path.join(reportsDir, "unknown-title-category-analysis.json"), report),
    writeTextFile(path.join(reportsDir, "unknown-title-category-analysis.csv"), rowsToCsv(["Title", "Company", "WriterFitScore", "FitTier", "ReviewBucket", "ApplyLink"], unknown)),
    writeTextFile(path.join(reportsDir, "unknown-title-category-analysis.md"), markdown),
  ]);
  console.log(`Unknown title-category analysis: ${unknown.length}/${rows.length} (${report.UnknownPercent}%).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, reviewBucket };
