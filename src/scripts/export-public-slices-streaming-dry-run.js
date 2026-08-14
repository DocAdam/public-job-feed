const fs = require("fs/promises");
const path = require("path");
const { getDedupeKeys } = require("../adapters/exports/export-dedupe");
const {
  getDedupedSliceNames,
  getRawSliceNames,
  toMembership,
} = require("../adapters/exports/streaming-slice-definitions");
const { ExportRunStore } = require("../adapters/storage/export-run-store");
const {
  ensureDir,
  fromRoot,
  getAvailableBytes,
  iterateStrictLineJsonArrayFile,
  writeJsonFile,
} = require("../lib/files");

const defaultInputPath = fromRoot("data", "jobs", "public", "public-job-feed-latest.json");
const defaultStagingRoot = fromRoot("data", "jobs", "public", ".staging");
const safetyReserveBytes = 5 * 1024 * 1024 * 1024;

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptions() {
  const profile = String(getArgValue("--profile", "daily")).trim().toLowerCase();
  if (!["daily", "full"].includes(profile)) {
    throw new Error(`Unsupported --profile value: ${profile}. Use daily or full.`);
  }

  return {
    profile,
    writeFullSlices: profile === "full",
    inputPath: path.resolve(getArgValue("--input", defaultInputPath)),
    stagingRoot: path.resolve(getArgValue("--staging-root", defaultStagingRoot)),
    batchSize: parsePositiveInteger(getArgValue("--batch-size", "100"), 100),
  };
}

function requiredBytes(inputBytes) {
  return inputBytes * 4 + safetyReserveBytes;
}

function createRunDirectory(stagingRoot) {
  return path.join(stagingRoot, `export-slices-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
}

async function getDirectoryBytes(directoryPath) {
  let total = 0;
  for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) total += await getDirectoryBytes(entryPath);
    else if (entry.isFile()) total += (await fs.stat(entryPath)).size;
  }
  return total;
}

function getMaxRssBytes() {
  return process.resourceUsage().maxRSS * 1024;
}

async function main() {
  const options = parseOptions();
  const inputStat = await fs.stat(options.inputPath);
  if (!inputStat.isFile()) throw new Error(`Input is not a file: ${options.inputPath}`);

  await ensureDir(options.stagingRoot);
  const availableBytes = await getAvailableBytes(options.stagingRoot);
  const minimumBytes = requiredBytes(inputStat.size);
  if (availableBytes < minimumBytes) {
    throw new Error(
      `Insufficient free disk space: need ${minimumBytes} bytes, found ${availableBytes} bytes at ${options.stagingRoot}`
    );
  }

  const runDir = createRunDirectory(options.stagingRoot);
  await ensureDir(runDir);
  const manifestPath = path.join(runDir, "manifest.json");
  const manifest = {
    Status: "RUNNING",
    Implementation: "streaming-phase-1-dry-run",
    Profile: options.profile,
    InputPath: options.inputPath,
    InputBytes: inputStat.size,
    InputModifiedAt: inputStat.mtime.toISOString(),
    AvailableBytesAtStart: availableBytes,
    RequiredBytesAtStart: minimumBytes,
    BatchSize: options.batchSize,
    StartedAt: new Date().toISOString(),
    PublishedOutputsChanged: false,
  };
  await writeJsonFile(manifestPath, manifest);

  let store;
  let rowsRead = 0;
  let firstHeaders = [];
  let batch = [];
  try {
    store = await ExportRunStore.open({ dbPath: path.join(runDir, "run-store.sqlite") });
    for await (const { lineNumber, row } of iterateStrictLineJsonArrayFile(options.inputPath)) {
      rowsRead += 1;
      if (rowsRead === 1) firstHeaders = Object.keys(row);
      const rawSlices = getRawSliceNames(row, options.writeFullSlices);
      const dedupedSlices = getDedupedSliceNames(row, options.writeFullSlices);
      batch.push({
        sequence: rowsRead,
        rowJson: JSON.stringify(row),
        memberships: rawSlices.map((sliceName) => toMembership(sliceName, rowsRead, row)),
        dedupeKeys: dedupedSlices.map((sliceName) => ({
          sliceName,
          sequence: rowsRead,
          keys: getDedupeKeys(row, rowsRead - 1),
        })),
        lineNumber,
      });

      if (batch.length >= options.batchSize) {
        await store.insertBatch(batch, { lastCommittedSequence: rowsRead });
        batch = [];
      }
    }
    if (batch.length) await store.insertBatch(batch, { lastCommittedSequence: rowsRead });

    const dedupeSummary = await store.resolveDedupe();
    const summary = await store.getSummary();
    await store.close();
    store = undefined;
    Object.assign(manifest, {
      Status: "PHASE_2_COMPLETE",
      CompletedAt: new Date().toISOString(),
      RowsRead: rowsRead,
      Headers: firstHeaders,
      Summary: summary,
      DedupeSummary: dedupeSummary,
      FinalRssBytes: process.memoryUsage().rss,
      MaxRssBytes: getMaxRssBytes(),
      StagingBytesAtCompletion: await getDirectoryBytes(runDir),
      AvailableBytesAtCompletion: await getAvailableBytes(options.stagingRoot),
    });
    await writeJsonFile(manifestPath, manifest);
    console.log(`Phase 2 dry run complete: ${rowsRead} rows staged and dedupe resolved.`);
    console.log(`Run directory: ${runDir}`);
  } catch (error) {
    Object.assign(manifest, {
      Status: "FAILED",
      FailedAt: new Date().toISOString(),
      RowsRead: rowsRead,
      Error: error.message,
    });
    await writeJsonFile(manifestPath, manifest);
    console.error(`Phase 1 dry run failed. Staging retained: ${runDir}`);
    throw error;
  } finally {
    if (store) await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
