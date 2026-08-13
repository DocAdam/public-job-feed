const fs = require("fs/promises");
const path = require("path");
const catalogSources = require("../config/catalog-sources");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");
const { normalizeCatalog } = require("../lib/normalize-catalog");

const rawDir = fromRoot("data", "catalogs", "raw");
const normalizedDir = fromRoot("data", "catalogs", "normalized");
const csvPath = path.join(normalizedDir, "ats-catalog-normalized.csv");
const jsonPath = path.join(normalizedDir, "ats-catalog-normalized.json");

const headers = [
  "Source",
  "ATS",
  "CatalogSlug",
  "CatalogCompany",
  "CatalogValue",
  "BoardURL",
  "RawCatalogFile",
  "FetchedAt",
];

function findSourceForFile(filename) {
  const source = catalogSources.find((item) => item.filename === filename);

  if (source) {
    return source;
  }

  const ats = filename.replace(/_companies\.json$/i, "").replace(/\.json$/i, "");
  return {
    ats,
    filename,
    url: "",
  };
}

async function normalizeFile(filename, fetchedAt) {
  const rawPath = path.join(rawDir, filename);
  const source = findSourceForFile(filename);

  console.log(`\n${source.ats}`);
  console.log(`  Input: ${rawPath}`);

  const entries = await readJsonFile(rawPath);
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${source.ats} raw catalog must be a non-empty array: ${rawPath}`);
  }

  const rows = normalizeCatalog(entries, {
    ats: source.ats,
    sourceUrl: source.url,
    rawCatalogFile: filename,
    fetchedAt,
  });
  if (rows.length === 0) {
    throw new Error(`${source.ats} normalized to zero rows: ${rawPath}`);
  }

  console.log(`  Count: ${rows.length}`);
  return rows;
}

async function main() {
  await ensureDir(rawDir);
  await ensureDir(normalizedDir);

  const files = catalogSources.map((source) => source.filename);
  const fetchedAt = new Date().toISOString();
  const rows = [];

  console.log("Normalizing raw ATS catalog files...");

  const normalizedByFile = await Promise.all(files.map((filename) => normalizeFile(filename, fetchedAt)));
  rows.push(...normalizedByFile.flat());

  await writeTextFile(csvPath, rowsToCsv(headers, rows));
  await writeJsonFile(jsonPath, rows);

  console.log("\nNormalize run complete.");
  console.log(`  CSV: ${csvPath}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Total rows: ${rows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
