const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv, writeLargeCsvFile } = require("../lib/csv");
const { selectDedupedRows } = require("../lib/dedupe-select");
const {
  ensureDir,
  fromRoot,
  readLargeJsonArrayFile,
  writeJsonFile,
  writeTextFile,
  writeLargeJsonArrayFile,
} = require("../lib/files");
const { normalizeTitle } = require("../lib/job-titles");

const inputPath = path.resolve(getArgValue("--input", fromRoot("data", "jobs", "public", "public-job-feed-latest.json")));
const publicDir = path.resolve(getArgValue("--output-dir", fromRoot("data", "jobs", "public")));
const slicesDir = path.join(publicDir, "slices");
const dedupedSlicesDir = path.join(slicesDir, "deduped");

const summaryHeaders = [
  "SliceName",
  "Rows",
  "UniqueCompanies",
  "UniqueTitles",
  "WriterFitACount",
  "WriterFitBCount",
  "WriterFitCCount",
  "RemoteCount",
  "USRemoteEligibleTrueCount",
  "SalaryDetectedCount",
  "ReviewCount",
  "DuplicateCount",
  "WriterFitGuardrailAppliedCount",
  "WriterFitPenaltyAppliedCount",
  "DemotedHighScoreCount",
  "GeneratedAt",
];

const dedupeSummaryHeaders = [
  "SliceName",
  "InputRows",
  "OutputRows",
  "RemovedDuplicateRows",
  "DuplicateGroupsResolved",
  "GeneratedAt",
];

const dedupeDecisionHeaders = [
  "SliceName",
  "DuplicateGroupKey",
  "DedupeGroupSize",
  "SelectedCompany",
  "SelectedTitle",
  "SelectedATS",
  "SelectedURL",
  "SelectedWriterFitScore",
  "SelectedWriterFitTier",
  "SelectionReason",
  "RejectedRowsSummary",
];

const demotedHighScoreHeaders = [
  "Title",
  "Company",
  "Location",
  "URL",
  "WriterFitBaseScore",
  "WriterFitScore",
  "WriterFitTier",
  "WriterFitPenaltySignals",
  "WriterFitDemotionReason",
  "WriterFitGuardrailApplied",
  "WriterFitReasons",
  "TitleDomainSignal",
  "TitleReviewBucket",
  "RemoteStatus",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseOptions() {
  const profile = String(getArgValue("--profile", "full")).trim().toLowerCase();
  if (!["daily", "full"].includes(profile)) {
    throw new Error(`Unsupported --profile value: ${profile}. Use daily or full.`);
  }

  return {
    profile,
    writeFullSlices: profile === "full",
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function isTrue(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}

function isWriterFocus(row) {
  return (
    ["A", "B", "C"].includes(row.WriterFitTier) ||
    ["STRONG_MATCH", "POSSIBLE_MATCH", "ADJACENT"].includes(row.TitleReviewBucket)
  );
}

function isStrongMatch(row) {
  return ["A", "B"].includes(row.WriterFitTier) || row.TitleReviewBucket === "STRONG_MATCH";
}

function isRemoteUsLikely(row) {
  return isTrue(row.USRemoteEligible) && row.RemoteStatus === "Remote";
}

function sortTopRows(rows) {
  function compareText(a, b) {
    const left = String(a || "").toLowerCase();
    const right = String(b || "").toLowerCase();

    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  return [...rows].sort((a, b) => {
    const scoreDiff = (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0);
    if (scoreDiff !== 0) return scoreDiff;

    const priorityDiff = (Number(a.TitleReviewPriority) || 999) - (Number(b.TitleReviewPriority) || 999);
    if (priorityDiff !== 0) return priorityDiff;

    const remoteDiff = Number(isTrue(b.USRemoteEligible)) - Number(isTrue(a.USRemoteEligible));
    if (remoteDiff !== 0) return remoteDiff;

    const salaryDiff = Number(isTrue(b.SalaryDetected)) - Number(isTrue(a.SalaryDetected));
    if (salaryDiff !== 0) return salaryDiff;

    const companyDiff = compareText(a.Company, b.Company);
    if (companyDiff !== 0) return companyDiff;

    return compareText(a.Title, b.Title);
  });
}

function getUniqueCount(rows, field, normalizer) {
  return new Set(
    rows
      .map((row) => (normalizer ? normalizer(row[field]) : row[field]))
      .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
      .filter(Boolean)
  ).size;
}

function createSummaryRow(sliceName, rows, generatedAt) {
  return {
    SliceName: sliceName,
    Rows: rows.length,
    UniqueCompanies: getUniqueCount(rows, "CompanyKey") || getUniqueCount(rows, "Company"),
    UniqueTitles: getUniqueCount(rows, "Title", normalizeTitle),
    WriterFitACount: rows.filter((row) => row.WriterFitTier === "A").length,
    WriterFitBCount: rows.filter((row) => row.WriterFitTier === "B").length,
    WriterFitCCount: rows.filter((row) => row.WriterFitTier === "C").length,
    RemoteCount: rows.filter((row) => row.RemoteStatus === "Remote").length,
    USRemoteEligibleTrueCount: rows.filter((row) => isTrue(row.USRemoteEligible)).length,
    SalaryDetectedCount: rows.filter((row) => isTrue(row.SalaryDetected)).length,
    ReviewCount: rows.filter((row) => row.ExportQualityFlag === "REVIEW").length,
    DuplicateCount: rows.filter((row) => isTrue(row.PossibleDuplicate) || isTrue(row.CrossATSDuplicate)).length,
    WriterFitGuardrailAppliedCount: rows.filter((row) => isTrue(row.WriterFitGuardrailApplied)).length,
    WriterFitPenaltyAppliedCount: rows.filter((row) => row.WriterFitPenaltySignals).length,
    DemotedHighScoreCount: rows.filter(
      (row) =>
        (isTrue(row.WriterFitGuardrailApplied) || row.WriterFitPenaltySignals) &&
        (Number(row.WriterFitBaseScore) || 0) >= 75
    ).length,
    GeneratedAt: generatedAt,
  };
}

async function writeRows(baseDir, baseName, headers, rows) {
  await writeLargeCsvFile(path.join(baseDir, `${baseName}.csv`), rows, headers);
  await writeLargeJsonArrayFile(path.join(baseDir, `${baseName}.json`), rows);
}

function getSlices(rows) {
  return [
    {
      name: "firehose",
      baseName: "public-job-feed-firehose",
      rows: rows,
    },
    {
      name: "writer-focus",
      baseName: "public-job-feed-writer-focus",
      rows: rows.filter(isWriterFocus),
    },
    {
      name: "strong-matches",
      baseName: "public-job-feed-strong-matches",
      rows: rows.filter(isStrongMatch),
    },
    {
      name: "remote-us-likely",
      baseName: "public-job-feed-remote-us-likely",
      rows: rows.filter(isRemoteUsLikely),
    },
    {
      name: "remote-writer-focus",
      baseName: "public-job-feed-remote-writer-focus",
      rows: rows.filter((row) => isRemoteUsLikely(row) && isWriterFocus(row)),
    },
    {
      name: "salary-detected",
      baseName: "public-job-feed-salary-detected",
      rows: rows.filter((row) => isTrue(row.SalaryDetected)),
    },
    {
      name: "review-needed",
      baseName: "public-job-feed-review-needed",
      rows: rows.filter(
        (row) =>
          row.ExportQualityFlag === "REVIEW" || isTrue(row.PossibleDuplicate) || isTrue(row.CrossATSDuplicate)
      ),
    },
  ];
}

function getDedupedSliceInputs(slices, topRows, options) {
  const topOnly = {
    name: "deduped-top",
    baseName: "public-job-feed-deduped-top",
    rows: topRows,
    latestCopy: true,
    sortTop: true,
  };

  if (!options.writeFullSlices) {
    return [topOnly];
  }

  return [
    {
      name: "deduped-firehose",
      baseName: "public-job-feed-deduped-firehose",
      rows: slices.find((slice) => slice.name === "firehose").rows,
    },
    {
      name: "deduped-writer-focus",
      baseName: "public-job-feed-deduped-writer-focus",
      rows: slices.find((slice) => slice.name === "writer-focus").rows,
      latestCopy: true,
    },
    {
      name: "deduped-strong-matches",
      baseName: "public-job-feed-deduped-strong-matches",
      rows: slices.find((slice) => slice.name === "strong-matches").rows,
    },
    {
      name: "deduped-remote-writer-focus",
      baseName: "public-job-feed-deduped-remote-writer-focus",
      rows: slices.find((slice) => slice.name === "remote-writer-focus").rows,
      latestCopy: true,
    },
    {
      name: "deduped-top",
      baseName: "public-job-feed-deduped-top",
      rows: topRows,
      latestCopy: true,
      sortTop: true,
    },
  ];
}

function getDemotedHighScoreRows(rows) {
  return rows
    .filter(
      (row) =>
        (isTrue(row.WriterFitGuardrailApplied) || row.WriterFitPenaltySignals) &&
        (Number(row.WriterFitBaseScore) || 0) >= 75
    )
    .map((row) => ({
      Title: row.Title,
      Company: row.Company,
      Location: row.Location,
      URL: row.URL,
      WriterFitBaseScore: row.WriterFitBaseScore,
      WriterFitScore: row.WriterFitScore,
      WriterFitTier: row.WriterFitTier,
      WriterFitPenaltySignals: row.WriterFitPenaltySignals,
      WriterFitDemotionReason: row.WriterFitDemotionReason,
      WriterFitGuardrailApplied: row.WriterFitGuardrailApplied,
      WriterFitReasons: row.WriterFitReasons,
      TitleDomainSignal: row.TitleDomainSignal,
      TitleReviewBucket: row.TitleReviewBucket,
      RemoteStatus: row.RemoteStatus,
    }))
    .sort(
      (a, b) =>
        (Number(b.WriterFitBaseScore) || 0) - (Number(a.WriterFitBaseScore) || 0) ||
        (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) ||
        String(a.Title || "").localeCompare(String(b.Title || ""))
    );
}

async function main() {
  const options = parseOptions();

  if (!(await fileExists(inputPath))) {
    console.log("Public latest feed is missing.");
    console.log(`Expected: ${inputPath}`);
    console.log("Run:");
    console.log("  npm run jobs:merge-batches -- --ats all --output-name public-feed-merged-test");
    return;
  }

  console.log(`Reading latest public feed: ${inputPath}`);
  console.log(`Export profile: ${options.profile}`);
  const rows = await readLargeJsonArrayFile(inputPath);
  console.log(`Rows loaded: ${rows.length}`);
  const headers = Object.keys(rows[0] || {});
  const dedupedHeaders = [...headers, "DedupeSelected", "DedupeSelectionReason", "DedupeGroupSize"];
  const generatedAt = new Date().toISOString();
  const slices = getSlices(rows);
  const demotedHighScoreRows = getDemotedHighScoreRows(rows);
  const strongMatchRows = sortTopRows(slices.find((slice) => slice.name === "strong-matches").rows);
  const dedupedSliceInputs = getDedupedSliceInputs(slices, strongMatchRows, options);
  const dedupeSummaryRows = [];
  const dedupeDecisionRows = [];

  await ensureDir(slicesDir);
  await ensureDir(dedupedSlicesDir);

  if (options.writeFullSlices) {
    for (const slice of slices) {
      console.log(`Writing slice ${slice.name}: ${slice.rows.length} rows`);
      await writeRows(slicesDir, slice.baseName, headers, slice.rows);
    }
  } else {
    console.log("Skipping full slice row outputs in daily profile.");
  }

  if (options.writeFullSlices) {
    console.log(`Writing demoted-high-score: ${demotedHighScoreRows.length} rows`);
    await writeRows(slicesDir, "public-job-feed-demoted-high-score", demotedHighScoreHeaders, demotedHighScoreRows);
  } else {
    console.log(`Skipping demoted-high-score row output in daily profile: ${demotedHighScoreRows.length} rows`);
  }

  console.log(`Writing top: ${strongMatchRows.length} rows`);
  await writeRows(publicDir, "public-job-feed-top", headers, strongMatchRows);

  const dedupedOutputs = [];
  for (const slice of dedupedSliceInputs) {
    const deduped = selectDedupedRows(slice.rows, slice.name);
    const dedupedRows = slice.sortTop ? sortTopRows(deduped.rows) : deduped.rows;
    const summary = {
      ...deduped.summary,
      GeneratedAt: generatedAt,
    };

    dedupeSummaryRows.push(summary);
    dedupeDecisionRows.push(...deduped.decisions);
    dedupedOutputs.push({
      ...slice,
      rows: dedupedRows,
      summary,
    });

    console.log(`Writing ${slice.name}: ${dedupedRows.length} rows`);
    await writeRows(dedupedSlicesDir, slice.baseName, dedupedHeaders, dedupedRows);

    if (slice.latestCopy) {
      console.log(`Writing latest copy ${slice.name}: ${dedupedRows.length} rows`);
      await writeRows(publicDir, slice.baseName, dedupedHeaders, dedupedRows);
    }
  }

  const summaryRows = [
    ...slices.map((slice) => createSummaryRow(slice.name, slice.rows, generatedAt)),
    createSummaryRow("top", strongMatchRows, generatedAt),
    createSummaryRow("demoted-high-score", demotedHighScoreRows, generatedAt),
  ];

  await writeTextFile(
    path.join(slicesDir, "public-job-feed-slice-summary.csv"),
    rowsToCsv(summaryHeaders, summaryRows)
  );
  await writeJsonFile(path.join(slicesDir, "public-job-feed-slice-summary.json"), summaryRows);
  await writeTextFile(
    path.join(dedupedSlicesDir, "public-job-feed-dedupe-summary.csv"),
    rowsToCsv(dedupeSummaryHeaders, dedupeSummaryRows)
  );
  await writeJsonFile(path.join(dedupedSlicesDir, "public-job-feed-dedupe-summary.json"), dedupeSummaryRows);
  await writeLargeCsvFile(
    path.join(dedupedSlicesDir, "public-job-feed-dedupe-decisions.csv"),
    dedupeDecisionRows,
    dedupeDecisionHeaders
  );
  await writeLargeJsonArrayFile(
    path.join(dedupedSlicesDir, "public-job-feed-dedupe-decisions.json"),
    dedupeDecisionRows
  );

  console.log("Legacy baseline slice export complete.");
  console.log(`Input rows: ${rows.length}`);
  for (const slice of slices) {
    console.log(`${slice.name}: ${slice.rows.length}`);
  }
  console.log(`top: ${strongMatchRows.length}`);
  console.log(`demoted-high-score: ${demotedHighScoreRows.length}`);
  for (const slice of dedupedOutputs) {
    console.log(`${slice.name}: ${slice.summary.OutputRows} (${slice.summary.RemovedDuplicateRows} removed)`);
  }
  console.log("Output folder:");
  console.log(slicesDir);
}

main().catch((error) => {
  if (error instanceof RangeError || /invalid string length/i.test(error.message || "")) {
    console.error("Large file operation failed. Use streaming support for large exports.");
  }
  console.error(error);
  process.exitCode = 1;
});
