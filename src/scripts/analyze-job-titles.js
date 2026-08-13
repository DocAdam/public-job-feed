const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");
const { getJobTitleSummary, readJobTitles, toCsvTitleRows } = require("../lib/job-titles");

const jobTitlesPath = fromRoot("data", "config", "job-titles.md");
const analysisDir = fromRoot("data", "config", "analysis");

const outputPaths = {
  normalizedCsv: path.join(analysisDir, "job-titles-normalized.csv"),
  normalizedJson: path.join(analysisDir, "job-titles-normalized.json"),
  summaryCsv: path.join(analysisDir, "job-titles-summary.csv"),
  summaryJson: path.join(analysisDir, "job-titles-summary.json"),
};

const titleHeaders = ["Category", "Title", "NormalizedTitle", "TokenList"];

async function writeCsv(filePath, headers, rows) {
  await fs.writeFile(filePath, rowsToCsv(headers, rows), "utf8");
}

async function main() {
  await ensureDir(analysisDir);

  const records = await readJobTitles(jobTitlesPath);
  const generatedAt = new Date().toISOString();
  const summary = getJobTitleSummary(records, generatedAt);
  const summaryHeaders = Object.keys(summary);

  await writeCsv(outputPaths.normalizedCsv, titleHeaders, toCsvTitleRows(records));
  await writeJsonFile(outputPaths.normalizedJson, records);
  await writeCsv(outputPaths.summaryCsv, summaryHeaders, [summary]);
  await writeJsonFile(outputPaths.summaryJson, summary);

  console.log("Job title analysis complete.");
  console.log(`Total titles: ${summary.TotalTitles}`);
  console.log(`Unique categories: ${summary.UniqueCategories}`);
  console.log(`Unique normalized titles: ${summary.UniqueNormalizedTitles}`);
  console.log("Output folder:");
  console.log(analysisDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
