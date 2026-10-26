const catalogSources = require("../config/catalog-sources");
const { refreshCatalogSources } = require("../lib/catalog-refresh");
const { fromRoot } = require("../lib/files");

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() !== "false";
}

async function main() {
  console.log("Safely refreshing ATS catalog sources in parallel...");
  const manifest = await refreshCatalogSources({
    sources: catalogSources,
    rawDir: fromRoot("data", "catalogs", "raw"),
    manifestPath: fromRoot("data", "catalogs", "catalog-manifest.json"),
    fetchImpl: fetch,
    timeoutMs: Number(getArgValue("--timeout-ms", "30000")) || 30000,
    maximumDropRatio: Number(getArgValue("--maximum-drop-ratio", "0.20")),
    allowLargeDrop: parseBoolean(getArgValue("--allow-large-drop", "false")),
    force: parseBoolean(getArgValue("--force", "false")),
    strict: parseBoolean(getArgValue("--strict", "false")),
  });

  for (const source of manifest.Sources) {
    const suffix = source.Error ? `; ${source.Error}` : "";
    console.log(`${source.ATS}: ${source.Status}, ${source.RowCount} rows${suffix}`);
  }
  console.log(`Catalog source refresh: ${manifest.RefreshStatus}; ${manifest.TotalRows} total rows.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
