const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

const reportsDir = fromRoot("data", "jobs", "reports");
const releasesDir = fromRoot("data", "jobs", "public", "releases");
const mergedDir = fromRoot("data", "jobs", "merged");

const archiveHeaders = [
  "Path",
  "ArchivePath",
  "Type",
  "SizeBytes",
  "LastModified",
  "Action",
  "Reason",
  "ArchiveExists",
  "ArchiveSizeBytes",
  "ArchiveVerified",
  "ArchiveElapsedMs",
  "ArchiveError",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function getPathSize(filePath) {
  const stats = await fs.stat(filePath);

  if (!stats.isDirectory()) {
    return stats.size;
  }

  const entries = await fs.readdir(filePath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    total += await getPathSize(path.join(filePath, entry.name));
  }

  return total;
}

async function listFolders(dirPath) {
  if (!(await fileExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dirPath, entry.name));
}

function sortNewestFirst(rows) {
  return [...rows].sort((a, b) => {
    const dateDiff = Date.parse(b.LastModified) - Date.parse(a.LastModified);
    if (dateDiff !== 0) return dateDiff;
    return a.Path.localeCompare(b.Path);
  });
}

function sortArchiveCandidates(rows) {
  return [...rows].sort((a, b) => {
    const dateDiff = Date.parse(a.LastModified) - Date.parse(b.LastModified);
    if (dateDiff !== 0) return dateDiff;

    const sizeDiff = (Number(a.SizeBytes) || 0) - (Number(b.SizeBytes) || 0);
    if (sizeDiff !== 0) return sizeDiff;

    return a.Path.localeCompare(b.Path);
  });
}

function timestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

async function getArchivePath(folderPath, archiveDir) {
  const folderName = path.basename(folderPath);
  const directPath = path.join(archiveDir, `${folderName}.zip`);

  if (!(await fileExists(directPath))) {
    return directPath;
  }

  return path.join(archiveDir, `${folderName}-${timestampForFilename()}.zip`);
}

async function buildRowsForFolderType(dirPath, type, keepCount, archiveDir) {
  const folderPaths = await listFolders(dirPath);
  const rows = [];

  for (const folderPath of folderPaths) {
    const stats = await fs.stat(folderPath);
    rows.push({
      Path: folderPath,
      ArchivePath: await getArchivePath(folderPath, archiveDir),
      Type: type,
      SizeBytes: await getPathSize(folderPath),
      LastModified: stats.mtime.toISOString(),
      Action: "KEEP",
      Reason: "",
      ArchiveExists: false,
      ArchiveSizeBytes: 0,
      ArchiveVerified: false,
      ArchiveElapsedMs: 0,
      ArchiveError: "",
    });
  }

  return sortNewestFirst(rows).map((row, index) => ({
    ...row,
    Action: index < keepCount ? "KEEP" : "ARCHIVE_CANDIDATE",
    Reason:
      index < keepCount
        ? `Protected as one of the latest ${keepCount} ${type} folders.`
        : `Old ${type} beyond keep limit ${keepCount}.`,
  }));
}

async function createZipArchive(sourceFolder, archivePath) {
  await ensureDir(path.dirname(archivePath));

  await new Promise((resolve, reject) => {
    const parentDir = path.dirname(sourceFolder);
    const folderName = path.basename(sourceFolder);
    const child = spawn("zip", ["-qry", archivePath, folderName], {
      cwd: parentDir,
      shell: false,
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zip exited with code ${code}`));
      }
    });
  });

  const stats = await fs.stat(archivePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error("archive verification failed");
  }
}

async function getArchiveVerification(archivePath) {
  if (!(await fileExists(archivePath))) {
    return {
      ArchiveExists: false,
      ArchiveSizeBytes: 0,
      ArchiveVerified: false,
    };
  }

  const stats = await fs.stat(archivePath);
  return {
    ArchiveExists: stats.isFile(),
    ArchiveSizeBytes: stats.size,
    ArchiveVerified: stats.isFile() && stats.size > 0,
  };
}

function resolveArchiveDir(value) {
  const text = String(value || "").trim();
  if (path.isAbsolute(text)) {
    return text;
  }

  return fromRoot(...text.split(/[\\/]+/).filter(Boolean));
}

function formatMb(bytes) {
  return ((Number(bytes) || 0) / (1024 * 1024)).toFixed(2);
}

function filterOnlyRows(rows, only) {
  if (only === "releases") {
    return rows.filter((row) => row.Type === "release-folder");
  }

  if (only === "merged") {
    return rows.filter((row) => row.Type === "merged-folder");
  }

  return rows;
}

function applyCandidateFilters(rows, options) {
  const minSizeBytes = options.minSizeMb * 1024 * 1024;
  const keepRows = rows.filter((row) => row.Action !== "ARCHIVE_CANDIDATE");
  const candidates = sortArchiveCandidates(rows.filter((row) => row.Action === "ARCHIVE_CANDIDATE"));
  const selected = [];
  const skipped = [];

  for (const row of candidates) {
    if ((Number(row.SizeBytes) || 0) < minSizeBytes) {
      skipped.push({
        ...row,
        Action: "SKIPPED",
        Reason: `${row.Reason} Excluded by min-size-mb ${options.minSizeMb}.`,
      });
      continue;
    }

    if (options.maxCandidates !== null && selected.length >= options.maxCandidates) {
      skipped.push({
        ...row,
        Action: "SKIPPED",
        Reason: `${row.Reason} Excluded by max-candidates.`,
      });
      continue;
    }

    selected.push(row);
  }

  return [...keepRows, ...selected, ...skipped];
}

async function archiveCandidate(row, deleteAfterArchive, progress) {
  const startedAt = Date.now();
  if (progress && progress.verbose) {
    console.log(`\nArchive candidate ${progress.index} / ${progress.total}`);
    console.log(`Path: ${row.Path}`);
    console.log(`Size MB: ${formatMb(row.SizeBytes)}`);
    console.log(`Archive output: ${row.ArchivePath}`);
  }

  try {
    await createZipArchive(row.Path, row.ArchivePath);
    const elapsedMs = Date.now() - startedAt;
    const verification = await getArchiveVerification(row.ArchivePath);

    if (progress && progress.verbose) {
      console.log(`Success: ${verification.ArchiveVerified}`);
      console.log(`Archive size MB: ${formatMb(verification.ArchiveSizeBytes)}`);
      console.log(`Elapsed seconds: ${(elapsedMs / 1000).toFixed(2)}`);
    }

    if (deleteAfterArchive) {
      await fs.rm(row.Path, { recursive: true, force: true });
      return {
        ...row,
        Action: "DELETED_AFTER_ARCHIVE",
        Reason: `${row.Reason} Archive verified and source folder deleted.`,
        ...verification,
        ArchiveElapsedMs: elapsedMs,
        ArchiveError: "",
      };
    }

    return {
      ...row,
      Action: "ARCHIVED",
      Reason: `${row.Reason} Archive verified; source folder retained.`,
      ...verification,
      ArchiveElapsedMs: elapsedMs,
      ArchiveError: "",
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const verification = await getArchiveVerification(row.ArchivePath);

    if (progress && progress.verbose) {
      console.log(`Failure: ${error.message}`);
      console.log(`Archive size MB: ${formatMb(verification.ArchiveSizeBytes)}`);
      console.log(`Elapsed seconds: ${(elapsedMs / 1000).toFixed(2)}`);
    }

    return {
      ...row,
      Action: "SKIPPED",
      Reason: `${row.Reason} Archive failed: ${error.message}`,
      ...verification,
      ArchiveElapsedMs: elapsedMs,
      ArchiveError: error.message,
    };
  }
}

function buildSummaryMarkdown(rows, options) {
  const counts = rows.reduce((acc, row) => {
    acc[row.Action] = (acc[row.Action] || 0) + 1;
    return acc;
  }, {});
  const candidateSize = rows
    .filter((row) => ["ARCHIVE_CANDIDATE", "ARCHIVED", "DELETED_AFTER_ARCHIVE"].includes(row.Action))
    .reduce((sum, row) => sum + (Number(row.SizeBytes) || 0), 0);

  return [
    "# Archive Summary",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Options",
    "",
    `- Dry run: ${options.dryRun}`,
    `- Keep releases: ${options.keepReleases}`,
    `- Keep merged: ${options.keepMerged}`,
    `- Max candidates: ${options.maxCandidates === null ? "no limit" : options.maxCandidates}`,
    `- Only: ${options.only}`,
    `- Min size MB: ${options.minSizeMb}`,
    `- Verbose: ${options.verbose}`,
    `- Archive dir: ${options.archiveDir}`,
    `- Delete after archive: ${options.deleteAfterArchive}`,
    "",
    "## Results",
    "",
    `- KEEP: ${counts.KEEP || 0}`,
    `- ARCHIVE_CANDIDATE: ${counts.ARCHIVE_CANDIDATE || 0}`,
    `- ARCHIVED: ${counts.ARCHIVED || 0}`,
    `- DELETED_AFTER_ARCHIVE: ${counts.DELETED_AFTER_ARCHIVE || 0}`,
    `- SKIPPED: ${counts.SKIPPED || 0}`,
    `- Candidate/archived size bytes: ${candidateSize}`,
    "",
    "## Protected Areas",
    "",
    "- current latest public exports",
    "- batch folders and logs",
    "- catalogs, config, source code, README, and package metadata",
    "",
    "Dry run is the default. Use `--dry-run false` to create archives. Use `--delete-after-archive true` only after archive verification and manual review.",
    "",
  ].join("\n");
}

async function writeOutputs(rows, options) {
  await ensureDir(reportsDir);
  await fs.writeFile(path.join(reportsDir, "archive-plan.csv"), rowsToCsv(archiveHeaders, rows), "utf8");
  await writeJsonFile(path.join(reportsDir, "archive-plan.json"), rows);
  await fs.writeFile(path.join(reportsDir, "archive-summary.md"), buildSummaryMarkdown(rows, options), "utf8");
}

async function main() {
  const options = {
    dryRun: parseBoolean(getArgValue("--dry-run", "true"), true),
    keepReleases: parseInteger(getArgValue("--keep-releases", "3"), 3),
    keepMerged: parseInteger(getArgValue("--keep-merged", "3"), 3),
    maxCandidates: parseInteger(getArgValue("--max-candidates", ""), null),
    only: String(getArgValue("--only", "all")).toLowerCase(),
    minSizeMb: parseNumber(getArgValue("--min-size-mb", "0"), 0),
    verbose: parseBoolean(getArgValue("--verbose", "true"), true),
    archiveDir: resolveArchiveDir(getArgValue("--archive-dir", "data/jobs/archives")),
    deleteAfterArchive: parseBoolean(getArgValue("--delete-after-archive", "false"), false),
  };

  if (!["releases", "merged", "all"].includes(options.only)) {
    throw new Error("--only must be one of: releases, merged, all");
  }

  if (!options.dryRun) {
    await ensureDir(options.archiveDir);
  }

  let rows = filterOnlyRows([
    ...(await buildRowsForFolderType(releasesDir, "release-folder", options.keepReleases, options.archiveDir)),
    ...(await buildRowsForFolderType(mergedDir, "merged-folder", options.keepMerged, options.archiveDir)),
  ], options.only);

  rows = applyCandidateFilters(rows, options);

  if (!options.dryRun) {
    const updatedRows = [];
    const candidatesToArchive = rows.filter((row) => row.Action === "ARCHIVE_CANDIDATE");
    let archiveIndex = 0;

    for (const row of rows) {
      if (row.Action === "ARCHIVE_CANDIDATE") {
        archiveIndex += 1;
        updatedRows.push(
          await archiveCandidate(row, options.deleteAfterArchive, {
            index: archiveIndex,
            total: candidatesToArchive.length,
            verbose: options.verbose,
          })
        );
      } else {
        updatedRows.push(row);
      }
    }
    rows = updatedRows;
  }

  await writeOutputs(rows, options);

  const candidateRows = rows.filter((row) => row.Action === "ARCHIVE_CANDIDATE");
  const archivedRows = rows.filter((row) => row.Action === "ARCHIVED");
  const deletedRows = rows.filter((row) => row.Action === "DELETED_AFTER_ARCHIVE");
  const totalCandidateSize = rows
    .filter((row) => ["ARCHIVE_CANDIDATE", "ARCHIVED", "DELETED_AFTER_ARCHIVE"].includes(row.Action))
    .reduce((sum, row) => sum + (Number(row.SizeBytes) || 0), 0);

  console.log("Archive plan complete.");
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Candidate count: ${candidateRows.length + archivedRows.length + deletedRows.length}`);
  console.log(`Total candidate size bytes: ${totalCandidateSize}`);
  console.log(`Archive dir: ${options.archiveDir}`);
  console.log(`Archive files created: ${archivedRows.length + deletedRows.length}`);
  console.log(`Deleted folders count: ${deletedRows.length}`);
  console.log("Report paths:");
  console.log(path.join(reportsDir, "archive-plan.csv"));
  console.log(path.join(reportsDir, "archive-plan.json"));
  console.log(path.join(reportsDir, "archive-summary.md"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
