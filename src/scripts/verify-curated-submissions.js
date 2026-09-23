const { loadCuratedSubmissionRows } = require("../lib/curated-submissions");
const { readJobTitles } = require("../lib/job-titles");
const { fromRoot } = require("../lib/files");
async function main() {
  const titles = await readJobTitles(fromRoot("data", "config", "job-titles.md"));
  const result = await loadCuratedSubmissionRows(titles);
  console.log(JSON.stringify(result.health, null, 2));
  console.log("Source check complete. Cache and health report updated. Final feed inclusion requires a release build and export check.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
