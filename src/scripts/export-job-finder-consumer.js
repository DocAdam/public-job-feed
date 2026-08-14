const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { iterateLargeJsonArrayFile, fromRoot, writeJsonObjectFile } = require("../lib/files");
const { readJobTitles } = require("../lib/job-titles");
const { createJobFinderConsumerSelector, schemaVersion } = require("../lib/job-finder-consumer");

const defaultInputPath = fromRoot("data", "jobs", "public", "public-job-feed-latest.json");
const defaultTitlesPath = path.resolve(fromRoot(".."), "job-finder", "job-titles.md");
const defaultOutputPath = fromRoot("data", "jobs", "consumers", "job-finder", "latest.json");

async function main() {
  const inputPath = path.resolve(argValue("--input", defaultInputPath));
  const titlesPath = path.resolve(argValue("--titles", process.env.JOB_FINDER_TITLES_PATH || defaultTitlesPath));
  const outputPath = path.resolve(argValue("--output", defaultOutputPath));
  const titleRecords = await readJobTitles(titlesPath);
  const titleText = await fs.readFile(titlesPath, "utf8");
  const selector = createJobFinderConsumerSelector(titleRecords);
  let scannedRows = 0;

  console.log(`Reading public feed: ${inputPath}`);
  console.log(`Using personal title policy: ${titlesPath}`);
  for await (const row of iterateLargeJsonArrayFile(inputPath)) {
    selector.add(row);
    scannedRows += 1;
    if (scannedRows % 50000 === 0) console.log(`Scanned ${scannedRows} rows...`);
  }

  const selected = selector.finish();
  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion,
    generatedAt,
    source: {
      name: "public-job-feed",
      inputPath,
      titlePolicyPath: titlesPath,
      titlePolicySha256: crypto.createHash("sha256").update(titleText).digest("hex"),
      titleCount: titleRecords.length,
    },
    summary: {
      ...selected.summary,
      scannedRows,
    },
    jobs: selected.jobs,
  };

  await writeJsonObjectFile(outputPath, payload);
  console.log(`Job Finder consumer slice written: ${outputPath}`);
  console.log(JSON.stringify(payload.summary, null, 2));
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
