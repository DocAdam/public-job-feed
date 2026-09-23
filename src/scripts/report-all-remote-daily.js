const fs = require("fs/promises");
const path = require("path");
const { readJobCsv, resolveSnapshots } = require("../lib/us-remote-daily-report");
const { parseCsvRecords } = require("../lib/csv");
const { buildSnapshot, parseOptions, reportFilename, help } = require("../lib/jobs-snapshot");
const { buildSnapshotWithRemote } = require("../lib/all-remote-daily-report");
const { execFileSync } = require("child_process");
const { fromRoot, writeTextFile } = require("../lib/files");

const { readPackageTimestamp } = require("../lib/package-time");

const reportsDir = fromRoot("data", "jobs", "reports");
async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(help); return; }
  const outputPath = path.join(reportsDir, reportFilename(options));
  const packageRoot = fromRoot("data", "jobs", "gsheet-package");
  const snapshots = await resolveSnapshots(packageRoot);
  const usReport = { CurrentSnapshot: path.basename(snapshots.current), PreviousSnapshot: path.basename(snapshots.previous) };
  const currentDir = path.join(packageRoot, usReport.CurrentSnapshot);
  const previousDir = path.join(packageRoot, usReport.PreviousSnapshot);
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  const names = entries.filter(entry => entry.isDirectory() && /^\d{8}-\d{4}$/.test(entry.name))
    .map(entry => entry.name).filter(name => name <= usReport.CurrentSnapshot).sort();
  const dated = await Promise.all(names.map(async name => ({ name, date: await readPackageTimestamp(path.join(packageRoot, name)) })));
  dated.sort((a, b) => a.date - b.date);
  const cutoff = (await readPackageTimestamp(currentDir)).getTime() - 7 * 86400000;
  const baselineSnapshot = (dated.find(item => item.date.getTime() >= cutoff) || dated[0]).name;
  const readDetails = async directory => {
    try { return parseCsvRecords(await fs.readFile(path.join(directory, "03_top_matches_full.csv"), "utf8")).rows; }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const [current, previous, baseline, details, previousDetails, baselineDetails] = await Promise.all([
    readJobCsv(currentDir), readJobCsv(previousDir), readJobCsv(path.join(packageRoot, baselineSnapshot)),
    readDetails(currentDir), readDetails(previousDir), readDetails(path.join(packageRoot, baselineSnapshot)),
  ]);
  const review = { currentRows: current.rows, previousRows: previous.rows,
    baselineRows: baseline.rows, baselineSnapshot, details, previousDetails, baselineDetails };
  const generatedAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const input = { ...review, generatedAt, currentSnapshot: usReport.CurrentSnapshot, previousSnapshot: usReport.PreviousSnapshot };
  const markdown = options.focused ? buildSnapshot(input, options) : buildSnapshotWithRemote(input);
  await writeTextFile(outputPath, markdown, "utf8");

  console.log("Daily Jobs Review complete.");
  console.log(`Current package: ${usReport.CurrentSnapshot}`);
  console.log(`Full current package rows: ${current.rows.length}`);
  console.log(`Lines: ${markdown.split("\n").length}`);
  console.log(`Report: ${outputPath}`);
  if (options.open) execFileSync("open", [outputPath]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
