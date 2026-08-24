const { buildJobExportArtifacts } = require("../lib/job-export");
const { loadCuratedSubmissionRows } = require("../lib/curated-submissions");
const { readJobTitles } = require("../lib/job-titles");
const { buildSimplePublicRow } = require("../lib/simple-public-export");
const { fromRoot } = require("../lib/files");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const generatedAt = new Date().toISOString();
  const titles = await readJobTitles(fromRoot("data", "config", "job-titles.md"));
  const curated = await loadCuratedSubmissionRows(titles, generatedAt);
  const netapp = curated.rows.find((row) => row.CuratedSubmissionId === "netapp-technical-writer-98852323856");
  assert(netapp, "approved NetApp submission was not included");
  assert(netapp.ApplyURL.startsWith("https://jobs.netapp.com/job/"), "direct application URL was not extracted");
  const artifacts = buildJobExportArtifacts([netapp], [], titles, generatedAt);
  const scored = artifacts.jobRows[0];
  const simple = buildSimplePublicRow(scored, generatedAt);
  assert(scored.WriterFitTier === "A", `expected A tier, got ${scored.WriterFitTier}`);
  assert(scored.ExportQualityFlag === "OK", `expected export quality OK, got ${scored.ExportQualityFlag}`);
  assert(simple["Apply Link"] === netapp.ApplyURL, "public export did not prefer the direct application URL");
  console.log("Curated submission integration: PASS");
}

main().catch((error) => {
  console.error(`Curated submission integration: FAIL: ${error.message}`);
  process.exitCode = 1;
});
