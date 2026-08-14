const fs = require("fs/promises");
const path = require("path");
const { analyzeCatalogRows } = require("../lib/analyze-catalogs");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const normalizedJsonPath = fromRoot("data", "catalogs", "normalized", "ats-catalog-normalized.json");
const analysisDir = fromRoot("data", "catalogs", "analysis");

const outputPaths = {
  summaryJson: path.join(analysisDir, "catalog-summary.json"),
  summaryCsv: path.join(analysisDir, "catalog-summary.csv"),
  atsBreakdownCsv: path.join(analysisDir, "ats-breakdown.csv"),
  duplicateCatalogValuesCsv: path.join(analysisDir, "duplicate-catalog-values.csv"),
  companyKeyOverlapCsv: path.join(analysisDir, "company-key-overlap.csv"),
  malformedRowsCsv: path.join(analysisDir, "malformed-rows.csv"),
  registryCandidatesCsv: path.join(analysisDir, "company-registry-candidates.csv"),
  registryCandidatesJson: path.join(analysisDir, "company-registry-candidates.json"),
};

const summaryHeaders = [
  "GeneratedAt",
  "TotalRows",
  "UniqueATS",
  "UniqueCatalogValues",
  "UniqueCompanyKeys",
  "RowsWithBoardURL",
  "RowsWithoutBoardURL",
  "MalformedRows",
  "DuplicateCatalogValueGroups",
  "CompanyKeyOverlapGroups",
];

const atsBreakdownHeaders = [
  "ATS",
  "Rows",
  "UniqueCatalogValues",
  "UniqueCompanyKeys",
  "RowsWithBoardURL",
  "RowsWithoutBoardURL",
  "MalformedRows",
];

const duplicateCatalogValueHeaders = [
  "NormalizedCatalogValue",
  "Count",
  "ATSList",
  "RawValues",
  "BoardURLs",
];

const companyKeyOverlapHeaders = [
  "CompanyKey",
  "Count",
  "ATSCount",
  "ATSList",
  "CatalogValues",
  "CatalogCompanies",
  "BoardURLs",
];

const malformedRowsHeaders = [
  "RowNumber",
  "Reason",
  "Source",
  "ATS",
  "CatalogSlug",
  "CatalogCompany",
  "CatalogValue",
  "BoardURL",
  "RawCatalogFile",
];

const registryCandidateHeaders = [
  "CompanyKey",
  "PreferredCompanyName",
  "ATSCount",
  "ATSList",
  "AshbySlug",
  "BambooHRSlug",
  "GreenhouseSlug",
  "ICIMSSlug",
  "LeverSlug",
  "WorkdaySlug",
  "AshbyURL",
  "BambooHRURL",
  "GreenhouseURL",
  "ICIMSURL",
  "LeverURL",
  "WorkdayURL",
  "CatalogValues",
  "CatalogCompanies",
  "SourceRows",
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function writeCsv(filePath, headers, rows) {
  await writeTextFile(filePath, rowsToCsv(headers, rows));
}

async function main() {
  if (!(await fileExists(normalizedJsonPath))) {
    console.log("Normalized catalog file is missing.");
    console.log(`Expected: ${normalizedJsonPath}`);
    console.log("Run this first:");
    console.log("  npm run catalogs:normalize");
    process.exitCode = 1;
    return;
  }

  await ensureDir(analysisDir);

  const rows = await readJsonFile(normalizedJsonPath);
  if (!Array.isArray(rows)) {
    throw new Error("Normalized catalog JSON must be an array.");
  }

  console.log("Analyzing normalized ATS catalog rows...");

  const results = analyzeCatalogRows(rows, new Date().toISOString());

  await writeJsonFile(outputPaths.summaryJson, results.summary);
  await writeCsv(outputPaths.summaryCsv, summaryHeaders, results.summaryRows);
  await writeCsv(outputPaths.atsBreakdownCsv, atsBreakdownHeaders, results.atsBreakdownRows);
  await writeCsv(
    outputPaths.duplicateCatalogValuesCsv,
    duplicateCatalogValueHeaders,
    results.duplicateCatalogValueRows
  );
  await writeCsv(outputPaths.companyKeyOverlapCsv, companyKeyOverlapHeaders, results.companyKeyOverlapRows);
  await writeCsv(outputPaths.malformedRowsCsv, malformedRowsHeaders, results.malformedRows);
  await writeCsv(
    outputPaths.registryCandidatesCsv,
    registryCandidateHeaders,
    results.registryCandidateCsvRows
  );
  await writeJsonFile(outputPaths.registryCandidatesJson, results.registryCandidates);

  console.log("\nAnalysis complete.");
  console.log(`  Total rows: ${results.summary.TotalRows}`);
  console.log(`  Unique company keys: ${results.summary.UniqueCompanyKeys}`);
  console.log(`  Duplicate catalog value groups: ${results.summary.DuplicateCatalogValueGroups}`);
  console.log(`  Company key overlap groups: ${results.summary.CompanyKeyOverlapGroups}`);
  console.log(`  Output folder: ${analysisDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
