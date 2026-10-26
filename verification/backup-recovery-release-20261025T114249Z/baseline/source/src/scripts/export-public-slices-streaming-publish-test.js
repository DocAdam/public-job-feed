const path = require("path");
const { publishAtomically } = require("../adapters/exports/atomic-publisher");

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

async function main() {
  const runDirArg = getArgValue("--run-dir", "");
  const runDir = runDirArg ? path.resolve(runDirArg) : "";
  const outputDir = path.resolve(getArgValue("--output-dir", runDir ? path.join(runDir, "outputs") : ""));
  const publishRoot = path.resolve(getArgValue("--publish-root", runDir ? path.join(path.dirname(runDir), `publish-test-${path.basename(runDir)}`) : ""));
  if (!outputDir || !publishRoot) throw new Error("Provide --output-dir and --publish-root.");
  const result = await publishAtomically({
    outputDir,
    publishRoot,
    requiredFiles: [
      "public-job-feed-top.csv",
      "public-job-feed-top.json",
      "public-job-feed-deduped-top.csv",
      "public-job-feed-deduped-top.json",
      "output-manifest.json",
    ],
  });
  console.log("Test publication complete: " + result.latestLink);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
