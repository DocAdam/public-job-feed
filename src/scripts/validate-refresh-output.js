const fs = require("fs/promises");
const path = require("path");
const { fromRoot, writeJsonFile } = require("../lib/files");
const { packageIdentity } = require("../lib/package-status");
function validateOutputs(data) {
  const failures = [];
  const same = (label, actual, expected) => { if (!actual || actual !== expected) failures.push(`${label}: expected ${expected}, found ${actual || "missing"}`); };
  same("US report package", data.us?.CurrentSnapshot, data.packageRun);
  same("International report package", data.international?.CurrentSnapshot, data.packageRun);
  same("Combined report package", data.combined?.match(/Packages: (\d{8}-\d{4}) \(current\)/)?.[1], data.packageRun);
  same("Trend package", data.trends?.CurrentSnapshot, data.packageRun);
  same("Consumer source date", data.consumer?.source?.feedGeneratedAt, data.feed?.GeneratedAt);
  if (data.consumer?.summary?.scannedRows !== data.feed?.TotalRows) failures.push("Consumer scanned-row count differs from the feed summary.");
  for (const [label, value] of [["US", data.us?.GeneratedAt], ["International", data.international?.GeneratedAt], ["Trends", data.trends?.GeneratedAt], ["Combined", data.combined?.match(/^Generated: (.+)$/m)?.[1]]]) {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time) || time < Date.parse(data.packageTime)) failures.push(`${label} report predates the package or has no valid generation time.`);
  }
  return failures;
}
async function main() {
  const reports = fromRoot("data", "jobs", "reports");
  const latest = fromRoot("data", "jobs", "gsheet-package", "latest");
  const { readPackageTimestamp } = require("../lib/package-time");
  const read = async (file) => fs.readFile(file, "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  let packageRun = null;
  let failures;
  try {
    packageRun = await packageIdentity(latest);
    const data = { packageRun, packageTime: (await readPackageTimestamp(latest)).toISOString(),
      us: await read(path.join(reports, "us-remote-daily-report.json")),
      international: await read(path.join(reports, "international-remote-daily-report.json")),
      trends: await read(fromRoot("data/jobs/trends/latest/trend-manifest.json")),
      consumer: await read(fromRoot("data/jobs/consumers/job-finder/latest.json")),
      feed: await read(fromRoot("data/jobs/public/public-job-feed-latest-summary.json")),
      combined: await fs.readFile(path.join(reports, "all-remote-daily-report.md"), "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; }),
    };
    failures = validateOutputs(data);
  } catch (error) {
    failures = [`Refresh output validation could not read its inputs: ${error.message}`];
  }
  await writeJsonFile(path.join(reports, "refresh-output-validation.json"), { GeneratedAt: new Date().toISOString(), PackageRun: packageRun, Status: failures.length ? "FAIL" : "PASS", Failures: failures });
  console.log(failures.length ? failures.join("\n") : "Refresh output validation: PASS");
  if (failures.length) process.exitCode = 1;
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { validateOutputs };
