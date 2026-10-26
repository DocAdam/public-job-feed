const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

const defaultPackageDir = fromRoot("data", "jobs", "gsheet-package", "latest");
const reportsDir = fromRoot("data", "jobs", "reports");
const reportJsonPath = path.join(reportsDir, "gsheet-url-artifact-cleanup.json");
const reportMarkdownPath = path.join(reportsDir, "gsheet-url-artifact-cleanup.md");
const finalCsvName = "01_good_documentation_jobs.csv";
const backupCsvName = "01_good_documentation_jobs-before-url-prune.csv";
const summaryJsonName = "01_good_documentation_jobs-url-check-summary.json";
const artifactNames = [
  backupCsvName,
  summaryJsonName,
  "01_good_documentation_jobs-url-check-summary.md",
  "01_good_documentation_jobs-url-failures.csv",
  "01_good_documentation_jobs-url-review.csv",
];

function parseArgs(args) {
  const options = {
    packageDir: defaultPackageDir,
    apply: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--package-dir") {
      options.packageDir = path.resolve(fromRoot(), args[++index]);
    } else if (arg === "--apply") {
      options.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  npm run jobs:gsheet-clean-url-artifacts
  npm run jobs:gsheet-clean-url-artifacts -- --apply
  npm run jobs:gsheet-clean-url-artifacts -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM
  npm run jobs:gsheet-clean-url-artifacts -- --package-dir data/jobs/gsheet-package/YYYYMMDD-HHMM --apply

Options:
  --package-dir  Package folder to inspect. Defaults to data/jobs/gsheet-package/latest.
  --apply        Delete URL-check artifacts after safety checks pass. Without this, dry run only.`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (error) {
    return false;
  }
}

async function countCsvDataRows(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return parseCsvRecords(text).rows.length;
}

async function readSummary(summaryPath) {
  if (!(await pathExists(summaryPath))) {
    return {
      exists: false,
      parsed: null,
      refusalReason: "",
    };
  }

  try {
    const parsed = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    if (parsed && parsed.Applied === true) {
      if ((Number(parsed.KeptAmbiguousFailureRows) || 0) > 0) {
        return {
          exists: true,
          parsed,
          refusalReason: "URL check summary indicates safe pruning kept ambiguous failed rows for review.",
        };
      }

      return {
        exists: true,
        parsed,
        refusalReason: "",
      };
    }

    if (parsed && parsed.Applied === false) {
      return {
        exists: true,
        parsed,
        refusalReason: "URL check summary indicates pruning was not applied.",
      };
    }

    return {
      exists: true,
      parsed,
      refusalReason: "URL check summary format is uncertain; review manually before cleanup.",
    };
  } catch (error) {
    return {
      exists: true,
      parsed: null,
      refusalReason: `URL check summary could not be parsed; review manually before cleanup: ${error.message}`,
    };
  }
}

async function inspectPackage(options) {
  const packageDir = path.resolve(options.packageDir);
  const finalCsvPath = path.join(packageDir, finalCsvName);
  const backupCsvPath = path.join(packageDir, backupCsvName);
  const summaryPath = path.join(packageDir, summaryJsonName);
  const refusalReasons = [];
  const filesWouldDelete = [];
  const filesNotFound = [];
  let finalCsvRows = null;
  let backupCsvRows = null;
  let rowsRemoved = null;

  if (!(await directoryExists(packageDir))) {
    refusalReasons.push("Package directory does not exist.");
  }

  if (!(await pathExists(finalCsvPath))) {
    refusalReasons.push(`${finalCsvName} is missing.`);
  } else {
    try {
      finalCsvRows = await countCsvDataRows(finalCsvPath);
      if (finalCsvRows < 10) {
        refusalReasons.push("Final CSV has fewer than 10 data rows; stop and review manually.");
      }
    } catch (error) {
      refusalReasons.push(`Final CSV row count could not be performed: ${error.message}`);
    }
  }

  const backupExists = await pathExists(backupCsvPath);
  if (backupExists) {
    try {
      backupCsvRows = await countCsvDataRows(backupCsvPath);
      if (finalCsvRows !== null && backupCsvRows !== null) {
        rowsRemoved = backupCsvRows - finalCsvRows;
        if (finalCsvRows > backupCsvRows) {
          refusalReasons.push("Final CSV row count is greater than backup CSV row count.");
        }
      } else {
        refusalReasons.push("Backup exists but row count comparison could not be performed.");
      }
    } catch (error) {
      refusalReasons.push(`Backup exists but row count comparison could not be performed: ${error.message}`);
    }
  }

  const summary = await readSummary(summaryPath);
  if (summary.refusalReason) {
    refusalReasons.push(summary.refusalReason);
  }

  for (const artifactName of artifactNames) {
    const artifactPath = path.join(packageDir, artifactName);
    if (await pathExists(artifactPath)) {
      filesWouldDelete.push(artifactPath);
    } else {
      filesNotFound.push(artifactPath);
    }
  }

  return {
    packageDir,
    finalCsvPath,
    backupCsvPath,
    summaryPath,
    finalCsvRows,
    backupCsvRows,
    rowsRemoved,
    filesWouldDelete,
    filesNotFound,
    refusalReasons,
    safetyStatus: refusalReasons.length === 0 ? "PASS" : "REFUSED",
  };
}

async function deleteArtifacts(filesWouldDelete) {
  const deleted = [];
  for (const filePath of filesWouldDelete) {
    await fs.rm(filePath, { force: true });
    deleted.push(filePath);
  }
  return deleted;
}

function relativeToRoot(filePath) {
  return path.relative(fromRoot(), filePath) || ".";
}

function buildReport({ options, inspection, filesDeleted }) {
  const apply = Boolean(options.apply);
  return {
    GeneratedAt: new Date().toISOString(),
    PackageDir: inspection.packageDir,
    Apply: apply,
    SafetyStatus: inspection.safetyStatus,
    FinalCsvRows: inspection.finalCsvRows,
    BackupCsvRows: inspection.backupCsvRows,
    RowsRemoved: inspection.rowsRemoved,
    FilesDeleted: filesDeleted,
    FilesWouldDelete: apply && filesDeleted.length > 0 ? [] : inspection.filesWouldDelete,
    FilesNotFound: inspection.filesNotFound,
    RefusalReasons: inspection.refusalReasons,
  };
}

function buildMarkdownReport(report) {
  const lines = [
    "# Google Sheets URL Artifact Cleanup",
    "",
    `Generated: ${report.GeneratedAt}`,
    "",
    `- Package directory: \`${report.PackageDir}\``,
    `- Mode: ${report.Apply ? "apply" : "dry run"}`,
    `- Safety status: ${report.SafetyStatus}`,
    `- Final CSV data rows: ${report.FinalCsvRows === null ? "unknown" : report.FinalCsvRows}`,
    `- Backup CSV data rows: ${report.BackupCsvRows === null ? "not present/unknown" : report.BackupCsvRows}`,
    `- Rows removed: ${report.RowsRemoved === null ? "not calculable" : report.RowsRemoved}`,
    "",
    "## Files Deleted",
    "",
    ...(report.FilesDeleted.length ? report.FilesDeleted.map((filePath) => `- \`${filePath}\``) : ["None."]),
    "",
    "## Files That Would Be Deleted",
    "",
    ...(report.FilesWouldDelete.length ? report.FilesWouldDelete.map((filePath) => `- \`${filePath}\``) : ["None."]),
    "",
    "## Files Not Found",
    "",
    ...(report.FilesNotFound.length ? report.FilesNotFound.map((filePath) => `- \`${filePath}\``) : ["None."]),
    "",
    "## Refusal Reasons",
    "",
    ...(report.RefusalReasons.length ? report.RefusalReasons.map((reason) => `- ${reason}`) : ["None."]),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function printResult({ options, inspection, filesDeleted }) {
  const mode = options.apply ? "apply" : "dry run";
  console.log("Google Sheets URL artifact cleanup");
  console.log(`Package directory: ${inspection.packageDir}`);
  console.log(`Mode: ${mode}`);
  console.log(`Final CSV data rows: ${inspection.finalCsvRows === null ? "unknown" : inspection.finalCsvRows}`);
  console.log(`Backup CSV data rows: ${inspection.backupCsvRows === null ? "not present/unknown" : inspection.backupCsvRows}`);
  console.log(`Rows removed: ${inspection.rowsRemoved === null ? "not calculable" : inspection.rowsRemoved}`);
  console.log(`Safety result: ${inspection.safetyStatus}`);

  if (inspection.refusalReasons.length) {
    console.log("Refusal reasons:");
    for (const reason of inspection.refusalReasons) console.log(`- ${reason}`);
  }

  if (filesDeleted.length) {
    console.log("Files deleted:");
    for (const filePath of filesDeleted) console.log(`- ${relativeToRoot(filePath)}`);
  }

  console.log("Files that would be deleted:");
  if (options.apply && filesDeleted.length > 0) {
    console.log("- None");
  } else if (inspection.filesWouldDelete.length) {
    for (const filePath of inspection.filesWouldDelete) console.log(`- ${relativeToRoot(filePath)}`);
  } else {
    console.log("- None");
  }

  console.log("Files not found:");
  if (inspection.filesNotFound.length) {
    for (const filePath of inspection.filesNotFound) console.log(`- ${relativeToRoot(filePath)}`);
  } else {
    console.log("- None");
  }
}

async function writeReports(report) {
  await ensureDir(reportsDir);
  await writeJsonFile(reportJsonPath, report);
  await fs.writeFile(reportMarkdownPath, buildMarkdownReport(report), "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const inspection = await inspectPackage(options);
  const filesDeleted = options.apply && inspection.safetyStatus === "PASS"
    ? await deleteArtifacts(inspection.filesWouldDelete)
    : [];
  const report = buildReport({ options, inspection, filesDeleted });
  await writeReports(report);
  printResult({ options, inspection, filesDeleted });
  console.log(`Report JSON: ${relativeToRoot(reportJsonPath)}`);
  console.log(`Report Markdown: ${relativeToRoot(reportMarkdownPath)}`);

  if (options.apply && inspection.safetyStatus !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
