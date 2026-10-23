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
  for (const report of data.publication || []) {
    same(`${report.label} package`, report.markdown.match(/Packages: (\d{8}-\d{4}) \(current\)/)?.[1], data.packageRun);
    same(`${report.label} previous package`, report.markdown.match(/; (\d{8}-\d{4}) \(previous\)/)?.[1], data.us?.PreviousSnapshot);
    if (!report.markdown.includes(`Snapshot: ${report.date}\n`)) failures.push(`${report.label} snapshot date differs from the package date.`);
    if (/Week of|New this week/.test(report.markdown)) failures.push(`${report.label} labels daily changes as weekly changes.`);
    for (const expected of report.statistics) {
      const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`(?:^|[^0-9])${escaped}(?=$|[^0-9])`, "m").test(report.markdown)) {
        failures.push(`${report.label} statistics differ from saved records: ${expected}`);
      }
    }
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
    await require("../lib/refresh-output-paths").urlFailurePath(fromRoot("data/jobs/gsheet-package"));
    const data = { packageRun, packageTime: (await readPackageTimestamp(latest)).toISOString(),
      us: await read(path.join(reports, "us-remote-daily-report.json")),
      international: await read(path.join(reports, "international-remote-daily-report.json")),
      trends: await read(fromRoot("data/jobs/trends/latest/trend-manifest.json")),
      consumer: await read(fromRoot("data/jobs/consumers/job-finder/latest.json")),
      feed: await read(fromRoot("data/jobs/public/public-job-feed-latest-summary.json")),
      combined: await fs.readFile(path.join(reports, "all-remote-daily-report.md"), "utf8").catch((error) => { if (error.code === "ENOENT") return ""; throw error; }),
    };
    if (process.argv.includes("--publication")) {
      const { readJobCsv, jobKey } = require("../lib/us-remote-daily-report");
      const { parseCsvRecords } = require("../lib/csv");
      const { packageEligibility } = require("../lib/public-package-eligibility");
      const { canonicalJobKey } = require("../lib/substack-full-report");
      const { remoteSummary } = require("../lib/all-remote-daily-report");
      const root = path.dirname(latest);
      const currentDir = path.join(root, packageRun);
      const previousDir = path.join(root, data.us.PreviousSnapshot);
      const detailRows = async dir => packageEligibility(parseCsvRecords(await fs.readFile(path.join(dir, "03_top_matches_full.csv"), "utf8")).rows).included;
      const current = await detailRows(currentDir), previous = await detailRows(previousDir);
      const before = new Set(previous.map(canonicalJobKey)), now = new Set(current.map(canonicalJobKey));
      const added = current.filter(row => !before.has(canonicalJobKey(row))).length;
      const removed = previous.filter(row => !now.has(canonicalJobKey(row))).length;
      const arrangements = ["remote", "hybrid", "onsite"].map(name => current.filter(row => String(row.RemoteStatus || "").toLowerCase() === name).length);
      const unknown = current.length - arrangements.reduce((sum, count) => sum + count, 0);
      const rows = (await readJobCsv(currentDir)).rows, previousRows = (await readJobCsv(previousDir)).rows;
      const us = require("../lib/us-remote-daily-report").compareRows(rows, previousRows);
      const international = require("../lib/international-remote-daily-report").compareRows(rows, previousRows);
      const remote = remoteSummary(us.current, international.current);
      const remoteAdded = new Set([...us.added, ...international.added].map(jobKey)).size;
      const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(new Date(data.packageTime));
      data.publication = [
        { label: "Full Substack report", date, markdown: await fs.readFile(path.join(reports, "substack-full-report.md"), "utf8"), statistics: [
          `${current.length} current jobs · ${arrangements[0]} remote · ${arrangements[1]} hybrid · ${arrangements[2]} onsite · ${unknown} unknown`,
          `${added} added · ${removed} removed · ${current.length - added} continuing since the previous package.`,
        ] },
        { label: "Remote Substack report", date, markdown: await fs.readFile(path.join(reports, "substack-remote-jobs.md"), "utf8"), statistics: [
          `${remote.unique} unique remote jobs · ${remote.us} U.S. remote · ${remote.international} international remote`,
          `${remote.overlap.length} jobs appear in both regional lists`,
          `${remoteAdded} unique remote jobs added since the previous package.`,
        ] },
      ];
    }
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
