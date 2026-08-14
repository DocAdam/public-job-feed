const path = require("path");
const { ensureDir, fromRoot, writeJsonFile, writeTextFile } = require("../lib/files");
const {
  buildMarkdown,
  compareRows,
  readJobCsv,
  resolveSnapshots,
} = require("../lib/us-remote-daily-report");

const packageRoot = fromRoot("data", "jobs", "gsheet-package");
const reportsDir = fromRoot("data", "jobs", "reports");

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  if (!argv[index + 1]) throw new Error(`${name} requires a folder path.`);
  return argv[index + 1];
}

function relativePath(value) {
  return path.relative(fromRoot(), value) || ".";
}

async function main() {
  const argv = process.argv.slice(2);
  const currentArg = optionValue(argv, "--current");
  const previousArg = optionValue(argv, "--previous");
  const { current, previous } = await resolveSnapshots(packageRoot, currentArg, previousArg);
  const [currentCsv, previousCsv] = await Promise.all([readJobCsv(current), readJobCsv(previous)]);
  const comparison = compareRows(currentCsv.rows, previousCsv.rows);
  const generatedAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const output = {
    GeneratedAt: generatedAt,
    CurrentSnapshot: path.basename(current),
    PreviousSnapshot: path.basename(previous),
    CurrentCsv: relativePath(currentCsv.filePath),
    PreviousCsv: relativePath(previousCsv.filePath),
    Filter: "Work Arrangement exactly Remote plus explicit US, U.S., USA, or United States location marker.",
    Counts: {
      Current: comparison.current.length,
      Previous: comparison.previous.length,
      Added: comparison.added.length,
      Removed: comparison.removed.length,
      Continuing: comparison.continuing.length,
    },
    Added: comparison.added,
    Removed: comparison.removed,
    Current: comparison.current,
  };
  await ensureDir(reportsDir);
  const markdownPath = path.join(reportsDir, "us-remote-daily-report.md");
  const jsonPath = path.join(reportsDir, "us-remote-daily-report.json");
  await writeTextFile(markdownPath, buildMarkdown({
    generatedAt,
    currentSnapshot: output.CurrentSnapshot,
    previousSnapshot: output.PreviousSnapshot,
    comparison,
    currentPath: output.CurrentCsv,
    previousPath: output.PreviousCsv,
  }), "utf8");
  await writeJsonFile(jsonPath, output);

  console.log("Confirmed US-remote daily report complete.");
  console.log(`Current package: ${output.CurrentSnapshot}`);
  console.log(`Previous package: ${output.PreviousSnapshot}`);
  console.log(`Current jobs: ${output.Counts.Current}`);
  console.log(`Added: ${output.Counts.Added}`);
  console.log(`Removed: ${output.Counts.Removed}`);
  console.log(`Report: ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
