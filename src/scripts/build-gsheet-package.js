const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { rowsToCsv, writeLargeCsvFile } = require("../lib/csv");
const {
  SIMPLE_COMPANY_COVERAGE_HEADERS,
  SIMPLE_FORMULA_HEADERS,
  SIMPLE_PUBLIC_HEADERS,
  START_HERE_HEADERS,
  buildSimpleCompanyCoverageRow,
  buildSimpleFormulaRow,
  buildSimplePublicRow,
  buildStartHereRow,
  getLastCheckedRange,
} = require("../lib/simple-public-export");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require("../lib/files");

const publicDir = fromRoot("data", "jobs", "public");
const reportsDir = fromRoot("data", "jobs", "reports");
const packageRoot = fromRoot("data", "jobs", "gsheet-package");
const sourceSummaryPath = path.join(publicDir, "public-job-feed-summary.md");
const topMatchesCsvPath = path.join(publicDir, "public-job-feed-deduped-top.csv");
const topMatchesJsonPath = path.join(publicDir, "public-job-feed-deduped-top.json");
const companyCoverageJsonPath = path.join(reportsDir, "company-coverage.json");
const crawlCoverageSummaryPath = path.join(reportsDir, "crawl-coverage-summary.json");
const dataDictionaryCsvPath = path.join(publicDir, "public-job-feed-data-dictionary.csv");
const dataDictionaryMarkdownPath = path.join(publicDir, "public-job-feed-data-dictionary.md");

const manifestHeaders = [
  "FileName",
  "SourcePath",
  "OutputPath",
  "Exists",
  "SizeBytes",
  "RecommendedSheetTabName",
  "RecommendedPrimary",
  "RecommendedSecondary",
  "RecommendedUse",
  "Purpose",
  "Notes",
];

const packageFiles = [
  {
    sourcePath: topMatchesCsvPath,
    fileName: "03_top_matches_full.csv",
    tabName: "Top Matches",
    recommendedPrimary: false,
    recommendedUse: "Diagnostic/internal review",
    purpose: "Detailed high-signal deduped shortlist with diagnostic columns.",
    notes: "Use when you want scoring, dedupe, and source diagnostics. Start with the simple CSV for public-facing Sheets.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-deduped-remote-writer-focus.csv"),
    fileName: "04_remote_writer_focus.csv",
    tabName: "Remote Writer Focus",
    recommendedPrimary: false,
    recommendedUse: "Optional remote-only tab",
    purpose: "Remote-friendly writer-focused review set.",
    notes: "Use when you want remote-only browsing.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-deduped-writer-focus.csv"),
    fileName: "05_writer_focus.csv",
    tabName: "Writer Focus",
    recommendedPrimary: false,
    recommendedUse: "Broader exploration",
    purpose: "Broader deduped writer/docs/content review set.",
    notes: "Use when Top Matches is too narrow.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-latest.csv"),
    fileName: "06_full_firehose.csv",
    tabName: "Full Firehose",
    recommendedPrimary: false,
    recommendedUse: "Internal/debug only",
    purpose: "Complete latest CSV with all rows preserved.",
    notes: "Large file. Avoid unless debugging or auditing the full firehose.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-data-dictionary.csv"),
    fileName: "07_data_dictionary.csv",
    tabName: "Data Dictionary",
    recommendedPrimary: false,
    recommendedUse: "Reference tab",
    purpose: "Column reference for Sheet users and internal review.",
    notes: "Useful as a separate Google Sheets tab.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "slices", "public-job-feed-slice-summary.csv"),
    fileName: "08_slice_summary.csv",
    tabName: "Slice Summary",
    recommendedPrimary: false,
    recommendedUse: "Internal summary tab",
    purpose: "Counts and quick metrics for each generated slice.",
    notes: "Optional summary tab.",
    required: false,
  },
  {
    sourcePath: path.join(reportsDir, "ats-health-summary.csv"),
    fileName: "09_ats_health.csv",
    tabName: "ATS Health",
    recommendedPrimary: false,
    recommendedUse: "Internal health tab",
    purpose: "High-level ATS health and fetch status summary.",
    notes: "Optional operator context.",
    required: false,
  },
  {
    sourcePath: path.join(reportsDir, "ats-scale-recommendations.csv"),
    fileName: "10_ats_recommendations.csv",
    tabName: "ATS Recommendations",
    recommendedPrimary: false,
    recommendedUse: "Internal planning tab",
    purpose: "Current scale recommendations by ATS.",
    notes: "Optional operator context.",
    required: false,
  },
  {
    sourcePath: path.join(publicDir, "slices", "public-job-feed-demoted-high-score.csv"),
    fileName: "11_demoted_high_score.csv",
    tabName: "Demoted High Score",
    recommendedPrimary: false,
    recommendedUse: "Internal diagnostic tab",
    purpose: "Rows demoted by Writer Fit v3 penalties or A/B tier guardrails.",
    notes: "Optional diagnostic tab for reviewing false-positive score reductions.",
    required: false,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-summary.md"),
    fileName: "SOURCE_SUMMARY.md",
    tabName: "",
    recommendedPrimary: false,
    recommendedUse: "Internal notes",
    purpose: "Internal release/source summary copied beside package CSVs.",
    notes: "Markdown file, not a Sheet tab.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "OPERATOR_NOTES.md"),
    fileName: "OPERATOR_NOTES.md",
    tabName: "",
    recommendedPrimary: false,
    recommendedUse: "Internal notes",
    purpose: "Internal operator notes for sanity checks and file choice.",
    notes: "Internal-only Markdown.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "PUBLISHING_PREP.md"),
    fileName: "PUBLISHING_PREP.md",
    tabName: "",
    recommendedPrimary: false,
    recommendedUse: "Internal notes",
    purpose: "Internal publishing prep notes for manual Google Sheets handoff.",
    notes: "Internal-only Markdown.",
    required: true,
  },
  {
    sourcePath: path.join(reportsDir, "project-status-dashboard.md"),
    fileName: "PROJECT_STATUS_DASHBOARD.md",
    tabName: "",
    recommendedPrimary: false,
    recommendedUse: "Internal status",
    purpose: "Internal project status dashboard at package time.",
    notes: "Optional Markdown status context.",
    required: false,
  },
];

const fullFirehoseFileName = "06_full_firehose.csv";
const fullFirehosePackageFile = packageFiles.find((fileConfig) => fileConfig.fileName === fullFirehoseFileName);
const timestampedPackageFiles = packageFiles.filter((fileConfig) => fileConfig.fileName !== fullFirehoseFileName);
const dailyPackageFileNames = new Set([
  "03_top_matches_full.csv",
  "07_data_dictionary.csv",
  "09_ats_health.csv",
  "10_ats_recommendations.csv",
  "SOURCE_SUMMARY.md",
  "OPERATOR_NOTES.md",
  "PUBLISHING_PREP.md",
  "PROJECT_STATUS_DASHBOARD.md",
]);
const dailyPackageFiles = packageFiles.filter((fileConfig) => dailyPackageFileNames.has(fileConfig.fileName));

function sortableNumber(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function sortSimpleJobRowsForUpload(rows) {
  return [...rows].sort((left, right) => {
    const leftAge = sortableNumber(left["Age (Days)"], Number.POSITIVE_INFINITY);
    const rightAge = sortableNumber(right["Age (Days)"], Number.POSITIVE_INFINITY);
    const leftScore = sortableNumber(left["Writer Fit Score"], Number.NEGATIVE_INFINITY);
    const rightScore = sortableNumber(right["Writer Fit Score"], Number.NEGATIVE_INFINITY);

    return (
      leftAge - rightAge
      || rightScore - leftScore
      || String(left.Company || "").localeCompare(String(right.Company || ""))
      || String(left.Title || "").localeCompare(String(right.Title || ""))
      || String(left["Apply Link"] || left.Apply || "").localeCompare(String(right["Apply Link"] || right.Apply || ""))
    );
  });
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase();
}

function getApplyValue(row) {
  return row["Apply Link"] || row.Apply || "";
}

function getPublicSheetGroupingKey(row) {
  return [row.Company, row.Title].map(normalizedText).join("|");
}

function compareRepresentativeRows(left, right) {
  const leftAge = sortableNumber(left["Age (Days)"], Number.POSITIVE_INFINITY);
  const rightAge = sortableNumber(right["Age (Days)"], Number.POSITIVE_INFINITY);
  const leftScore = sortableNumber(left["Writer Fit Score"], Number.NEGATIVE_INFINITY);
  const rightScore = sortableNumber(right["Writer Fit Score"], Number.NEGATIVE_INFINITY);

  return (
    leftAge - rightAge
    || rightScore - leftScore
    || String(left.Location || "").localeCompare(String(right.Location || ""))
    || String(getApplyValue(left)).localeCompare(String(getApplyValue(right)))
  );
}

function buildGroupedLocationSummary(rows) {
  const locations = Array.from(
    new Set(rows.map((row) => String(row.Location || "").trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  const visibleLocations = locations.slice(0, 8).join("; ");
  const hiddenCount = locations.length - 8;
  const suffix = hiddenCount > 0 ? `; +${hiddenCount} more` : "";

  return `Multiple locations (${rows.length} postings): ${visibleLocations}${suffix}`;
}

function getGroupedWorkArrangement(rows) {
  const arrangements = new Set(rows.map((row) => normalizedText(row["Work Arrangement"])));
  // A combined listing must stay discoverable in the existing remote filter if
  // at least one location-specific posting is remote.
  if (arrangements.has("remote")) return "Remote";
  if (arrangements.has("hybrid")) return "Hybrid";
  if (arrangements.has("onsite")) return "Onsite";
  return rows[0]["Work Arrangement"] || "";
}

function getGroupedRepresentative(rows) {
  const arrangement = getGroupedWorkArrangement(rows);
  const preferredRows = rows.filter(
    (row) => normalizedText(row["Work Arrangement"]) === normalizedText(arrangement)
  );
  return [...(preferredRows.length ? preferredRows : rows)].sort(compareRepresentativeRows)[0];
}

function getAdditionalApplyLinks(rows, representative) {
  return Array.from(
    new Set(rows.map((row) => String(getApplyValue(row) || "").trim()).filter(Boolean))
  )
    .filter((url) => url !== getApplyValue(representative))
    .join(" | ");
}

function getEarliestPostedDate(rows) {
  const dates = rows.map((row) => String(row["Posted Date"] || "").trim()).filter(Boolean).sort();
  return dates[0] || "";
}

function getLargestAgeDays(rows) {
  const ages = rows
    .map((row) => sortableNumber(row["Age (Days)"], null))
    .filter((age) => age !== null)
    .sort((left, right) => right - left);

  return ages.length ? ages[0] : "";
}

function parseSimpleUtcDateTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+UTC$/i);
  if (!match) {
    return 0;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
}

function getNewestLastChecked(rows) {
  return [...rows]
    .sort((left, right) => parseSimpleUtcDateTime(right["Last Checked"]) - parseSimpleUtcDateTime(left["Last Checked"]))
    .map((row) => row["Last Checked"] || "")
    .find(Boolean) || "";
}

function groupPublicSheetCountryPostings(rows) {
  const groupedRows = [];
  const groups = new Map();

  for (const row of rows) {
    const key = getPublicSheetGroupingKey(row);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  for (const groupRows of groups.values()) {
    const distinctLocations = new Set(groupRows.map((row) => normalizedText(row.Location)).filter(Boolean));
    if (groupRows.length === 1 || distinctLocations.size < 2) {
      // Different ATS records can represent separate openings at one location.
      // Consolidation is deliberately limited to exact-title location variants.
      groupedRows.push(...groupRows);
      continue;
    }

    const representative = getGroupedRepresentative(groupRows);
    groupedRows.push({
      ...representative,
      Location: buildGroupedLocationSummary(groupRows),
      "Additional Apply Links": getAdditionalApplyLinks(groupRows, representative),
      "Work Arrangement": getGroupedWorkArrangement(groupRows),
      "Posted Date": getEarliestPostedDate(groupRows),
      "Age (Days)": getLargestAgeDays(groupRows),
      "Last Checked": getNewestLastChecked(groupRows),
    });
  }

  return groupedRows;
}

const latestCleanFiles = [
  {
    sourcePath: topMatchesCsvPath,
    fileName: "03_top_matches_full.csv",
    tabName: "Top Matches",
    recommendedPrimary: false,
    recommendedUse: "Diagnostic/internal review",
    purpose: "Detailed high-signal deduped shortlist with diagnostic columns.",
    notes: "Use only when you want diagnostics beyond the simple public sheet.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-data-dictionary.csv"),
    fileName: "04_data_dictionary.csv",
    tabName: "Data Dictionary",
    recommendedPrimary: false,
    recommendedUse: "Reference tab",
    purpose: "Column reference for Sheet users and internal review.",
    notes: "Useful as a separate Google Sheets tab.",
    required: true,
  },
  {
    sourcePath: path.join(reportsDir, "ats-health-summary.csv"),
    fileName: "05_ats_health.csv",
    tabName: "ATS Health",
    recommendedPrimary: false,
    recommendedUse: "Internal health tab",
    purpose: "High-level ATS health and fetch status summary.",
    notes: "Optional operator context.",
    required: false,
  },
  {
    sourcePath: path.join(reportsDir, "ats-scale-recommendations.csv"),
    fileName: "06_ats_recommendations.csv",
    tabName: "ATS Recommendations",
    recommendedPrimary: false,
    recommendedUse: "Internal planning tab",
    purpose: "Current scale recommendations by ATS.",
    notes: "Optional operator context.",
    required: false,
  },
  {
    sourcePath: path.join(publicDir, "slices", "public-job-feed-demoted-high-score.csv"),
    fileName: "09_demoted_high_score.csv",
    tabName: "Demoted High Score",
    recommendedPrimary: false,
    recommendedUse: "Internal diagnostic tab",
    purpose: "Rows demoted by Writer Fit v3 penalties or A/B tier guardrails.",
    notes: "Optional diagnostic tab for reviewing false-positive score reductions.",
    required: false,
  },
];

const topOnlyFiles = [
  {
    sourcePath: topMatchesCsvPath,
    fileName: "top_matches.csv",
    tabName: "Top Matches",
    recommendedPrimary: false,
    recommendedUse: "Diagnostic/internal review",
    purpose: "Detailed high-signal deduped shortlist with diagnostic columns.",
    notes: "Use only if you want scoring, duplicate, and source diagnostics.",
    required: true,
  },
  {
    sourcePath: path.join(publicDir, "public-job-feed-data-dictionary.csv"),
    fileName: "data_dictionary.csv",
    tabName: "Data Dictionary",
    recommendedPrimary: false,
    recommendedUse: "Reference tab",
    purpose: "Column reference for Sheet users and internal review.",
    notes: "Use as an optional Sheet tab.",
    required: true,
  },
];

function getTimestampParts(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return {
    folder: `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
      date.getMinutes()
    )}`,
    iso: date.toISOString(),
  };
}

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

function getProfile() {
  const profile = String(getArgValue("--profile", "full")).trim().toLowerCase();
  if (!["daily", "full"].includes(profile)) {
    throw new Error(`Unsupported --profile value: ${profile}. Use daily or full.`);
  }

  return profile;
}

async function fileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    return null;
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: fromRoot(),
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function runOptionalCommand(command, args, label) {
  try {
    await runCommand(command, args);
  } catch (error) {
    console.warn(`Warning: ${label} failed: ${error.message}`);
  }
}

async function copyPackageFile(fileConfig, outputDir) {
  const outputPath = path.join(outputDir, fileConfig.fileName);
  const stat = await fileStat(fileConfig.sourcePath);

  if (!stat || !stat.isFile()) {
    return {
      FileName: fileConfig.fileName,
      SourcePath: fileConfig.sourcePath,
      OutputPath: outputPath,
      Exists: false,
      SizeBytes: 0,
      RecommendedSheetTabName: fileConfig.tabName,
      RecommendedPrimary: Boolean(fileConfig.recommendedPrimary),
      RecommendedSecondary: Boolean(fileConfig.recommendedSecondary),
      RecommendedUse: fileConfig.recommendedUse || "",
      Purpose: fileConfig.purpose,
      Notes: `${fileConfig.required ? "Missing required source file." : "Missing optional source file."} ${
        fileConfig.notes
      }`.trim(),
    };
  }

  await ensureDir(path.dirname(outputPath));
  await fs.copyFile(fileConfig.sourcePath, outputPath);

  return {
    FileName: fileConfig.fileName,
    SourcePath: fileConfig.sourcePath,
    OutputPath: outputPath,
    Exists: true,
    SizeBytes: stat.size,
    RecommendedSheetTabName: fileConfig.tabName,
    RecommendedPrimary: Boolean(fileConfig.recommendedPrimary),
    RecommendedSecondary: Boolean(fileConfig.recommendedSecondary),
    RecommendedUse: fileConfig.recommendedUse || "",
    Purpose: fileConfig.purpose,
    Notes: fileConfig.notes,
  };
}

async function linkPackageFile(fileConfig, outputDir) {
  const outputPath = path.join(outputDir, fileConfig.fileName);
  const stat = await fileStat(fileConfig.sourcePath);

  if (!stat || !stat.isFile()) {
    return {
      FileName: fileConfig.fileName,
      SourcePath: fileConfig.sourcePath,
      OutputPath: outputPath,
      Exists: false,
      SizeBytes: 0,
      RecommendedSheetTabName: fileConfig.tabName,
      RecommendedPrimary: Boolean(fileConfig.recommendedPrimary),
      RecommendedSecondary: Boolean(fileConfig.recommendedSecondary),
      RecommendedUse: fileConfig.recommendedUse || "",
      Purpose: fileConfig.purpose,
      Notes: `${fileConfig.required ? "Missing required source file." : "Missing optional source file."} ${
        fileConfig.notes
      }`.trim(),
    };
  }

  await ensureDir(path.dirname(outputPath));
  await fs.rm(outputPath, { force: true });
  await fs.symlink(path.relative(path.dirname(outputPath), fileConfig.sourcePath), outputPath);

  return {
    FileName: fileConfig.fileName,
    SourcePath: fileConfig.sourcePath,
    OutputPath: outputPath,
    Exists: true,
    SizeBytes: stat.size,
    RecommendedSheetTabName: fileConfig.tabName,
    RecommendedPrimary: Boolean(fileConfig.recommendedPrimary),
    RecommendedSecondary: Boolean(fileConfig.recommendedSecondary),
    RecommendedUse: fileConfig.recommendedUse || "",
    Purpose: fileConfig.purpose,
    Notes: `${fileConfig.notes} Linked to the source firehose in daily mode to avoid duplicating multi-GB storage.`.trim(),
  };
}

function buildMissingGeneratedManifestRow(
  fileName,
  outputDir,
  sourcePath,
  tabName,
  recommendedPrimary,
  recommendedUse,
  purpose,
  notes,
  recommendedSecondary = false
) {
  return {
    FileName: fileName,
    SourcePath: sourcePath,
    OutputPath: path.join(outputDir, fileName),
    Exists: false,
    SizeBytes: 0,
    RecommendedSheetTabName: tabName,
    RecommendedPrimary: Boolean(recommendedPrimary),
    RecommendedSecondary: Boolean(recommendedSecondary),
    RecommendedUse: recommendedUse || "",
    Purpose: purpose,
    Notes: `Missing required source file. ${notes}`.trim(),
  };
}

async function writeGeneratedCsvFile(outputDir, fileName, sourcePath, headers, rows, manifestDetails) {
  const outputPath = path.join(outputDir, fileName);
  await writeLargeCsvFile(outputPath, rows, headers);
  const stat = await fs.stat(outputPath);

  return {
    FileName: fileName,
    SourcePath: sourcePath,
    OutputPath: outputPath,
    Exists: true,
    SizeBytes: stat.size,
    RecommendedSheetTabName: manifestDetails.tabName,
    RecommendedPrimary: Boolean(manifestDetails.recommendedPrimary),
    RecommendedSecondary: Boolean(manifestDetails.recommendedSecondary),
    RecommendedUse: manifestDetails.recommendedUse || "",
    Purpose: manifestDetails.purpose,
    Notes: manifestDetails.notes,
  };
}

async function loadTopMatchesRows() {
  const stat = await fileStat(topMatchesJsonPath);
  if (!stat || !stat.isFile()) {
    return {
      exists: false,
      rows: [],
      error: "Missing top matches JSON source.",
    };
  }

  const rows = await readJsonFile(topMatchesJsonPath);
  if (!Array.isArray(rows)) {
    return {
      exists: false,
      rows: [],
      error: "Top matches JSON source is not an array.",
    };
  }

  return {
    exists: true,
    rows,
    error: "",
  };
}

async function loadCompanyCoverageRows() {
  const stat = await fileStat(companyCoverageJsonPath);
  if (!stat || !stat.isFile()) {
    return {
      exists: false,
      rows: [],
      error: "Missing company coverage JSON source. Run npm run jobs:crawl-coverage.",
    };
  }

  const rows = await readJsonFile(companyCoverageJsonPath);
  if (!Array.isArray(rows)) {
    return {
      exists: false,
      rows: [],
      error: "Company coverage JSON source is not an array.",
    };
  }

  return {
    exists: true,
    rows,
    error: "",
  };
}

async function loadCoveragePercent() {
  const stat = await fileStat(crawlCoverageSummaryPath);
  if (!stat || !stat.isFile()) {
    return "";
  }

  const summary = await readJsonFile(crawlCoverageSummaryPath);
  return summary.CoveragePercentOverall === null || summary.CoveragePercentOverall === undefined
    ? ""
    : summary.CoveragePercentOverall;
}

async function updateDataDictionaryFreshnessNotes() {
  const rows = [
    {
      Field: "Posted Date",
      Category: "Freshness",
      Description: "Date supplied by the ATS if available. In simple public exports this is formatted YYYY-MM-DD.",
      SharingNote: "Public-friendly display field for Google Sheets.",
    },
    {
      Field: "Age (Days)",
      Category: "Freshness",
      Description: "Integer number of days between Posted Date and the report generation date.",
      SharingNote: "Blank when Posted Date is unavailable.",
    },
    {
      Field: "Last Checked",
      Category: "Freshness",
      Description: "When the system last saw the job in the ATS. In simple public exports this is formatted YYYY-MM-DD HH:MM UTC.",
      SharingNote: "A recently checked job is more likely to still be open, but users should always click through to verify.",
    },
    {
      Field: "Report Run Date",
      Category: "Freshness",
      Description: "Package/report generation time. Stored in 00_start_here.csv rather than repeated on every simple job row.",
      SharingNote: "Use this to understand when the Google Sheets package was generated.",
    },
    {
      Field: "Additional Apply Links",
      Category: "Display consolidation",
      Description: "Other application URLs for an exact company/title role grouped across multiple locations in the simple public export.",
      SharingNote: "The primary Apply Link remains a plain URL. This field is populated only for grouped multi-location listings.",
    },
  ];

  if (await fileStat(dataDictionaryCsvPath)) {
    const current = await fs.readFile(dataDictionaryCsvPath, "utf8");
    const missingRows = rows.filter((row) => !current.includes(`\n${row.Field},`) && !current.startsWith(`${row.Field},`));
    if (missingRows.length > 0) {
      const csv = rowsToCsv(["Field", "Category", "Description", "SharingNote"], missingRows)
        .split("\n")
        .slice(1)
        .join("\n");
      await fs.appendFile(dataDictionaryCsvPath, `${current.endsWith("\n") ? "" : "\n"}${csv}`, "utf8");
    }
  }

  if (await fileStat(dataDictionaryMarkdownPath)) {
    const current = await fs.readFile(dataDictionaryMarkdownPath, "utf8");
    const marker = "## Simple Export Freshness Fields";
    const section = [
      marker,
      "",
      "- `Posted Date`: Date supplied by the ATS if available, formatted `YYYY-MM-DD` in simple public exports.",
      "- `Age (Days)`: Integer number of days between Posted Date and the report generation date. Blank when Posted Date is unavailable.",
      "- `Last Checked`: When the system last saw the job in the ATS, formatted `YYYY-MM-DD HH:MM UTC` in simple public exports.",
      "- `Report Run Date`: Package/report generation time. Stored in `00_start_here.csv` rather than repeated on every simple job row.",
      "",
    ].join("\n");

    if (!current.includes(marker)) {
      await writeTextFile(dataDictionaryMarkdownPath, `${current.trim()}\n\n${section}`);
    }
  }
}

async function buildSimpleCompanyCoverageFiles(outputDir, companyCoverageResult, options) {
  const sourcePath = companyCoverageJsonPath;

  if (!companyCoverageResult.exists) {
    return [
      buildMissingGeneratedManifestRow(
        options.fileName,
        outputDir,
        sourcePath,
        "Company Coverage",
        false,
        "Secondary transparency tab",
        "Simple company/ATS coverage export.",
        companyCoverageResult.error,
        true
      ),
    ];
  }

  return [
    await writeGeneratedCsvFile(
      outputDir,
      options.fileName,
      sourcePath,
      SIMPLE_COMPANY_COVERAGE_HEADERS,
      companyCoverageResult.rows.map(buildSimpleCompanyCoverageRow),
      {
        tabName: "",
        recommendedPrimary: false,
        recommendedSecondary: false,
        recommendedUse: "Internal diagnostics",
        purpose: "Internal record of which companies/ATS sources were crawled, found jobs, failed, or remain catalog-only.",
        notes: "Keep locally for transparency and debugging; it is not part of the current public Google Sheet.",
      }
    ),
  ];
}

async function buildSimpleTopFiles(outputDir, generatedAt, topMatchesResult, options) {
  const manifestRows = [];
  const sourcePath = topMatchesJsonPath;

  if (!topMatchesResult.exists) {
    if (options.includeStartHere) {
      manifestRows.push(
        buildMissingGeneratedManifestRow(
          "00_start_here.csv",
          outputDir,
          sourcePath,
          "Start Here",
          false,
          "Package orientation",
          "One-row orientation file for the recommended upload path.",
          topMatchesResult.error
        )
      );
    }
    manifestRows.push(
      buildMissingGeneratedManifestRow(
        options.simpleFileName,
        outputDir,
        sourcePath,
        options.simpleTabName || "Top Matches",
        true,
        options.simpleRecommendedUse || "Simple public Sheet with freshness fields",
        "Minimal public-facing Top Matches export.",
        topMatchesResult.error
      )
    );
    if (options.formulaFileName) {
      manifestRows.push(
        buildMissingGeneratedManifestRow(
          options.formulaFileName,
          outputDir,
          sourcePath,
          `${options.simpleTabName || "Top Matches"} Formula`,
          false,
          "Optional Google Sheets formula version",
          "Minimal public-facing Top Matches export with HYPERLINK formulas.",
          topMatchesResult.error
        )
      );
    }
    return manifestRows;
  }

  const simpleRows = sortSimpleJobRowsForUpload(
    groupPublicSheetCountryPostings(topMatchesResult.rows.map((row) => buildSimplePublicRow(row, generatedAt)))
  );
  const formulaRows = options.formulaFileName
    ? sortSimpleJobRowsForUpload(
      groupPublicSheetCountryPostings(topMatchesResult.rows.map((row) => buildSimpleFormulaRow(row, generatedAt)))
    )
    : [];

  if (options.includeStartHere) {
    manifestRows.push(
      await writeGeneratedCsvFile(
        outputDir,
        "00_start_here.csv",
        sourcePath,
        START_HERE_HEADERS,
        [
          buildStartHereRow(
            generatedAt,
            options.simpleFileName,
            simpleRows.length,
            options.coveragePercent,
            getLastCheckedRange(topMatchesResult.rows)
          ),
        ],
        {
          tabName: "Start Here",
          recommendedPrimary: false,
          recommendedUse: "Package orientation",
          purpose: "One-row orientation file for the recommended upload path.",
          notes: "Freshness is based on Last Checked and Report Run Date. Always click Apply Link to confirm the job is still open.",
        }
      )
    );
  }

  manifestRows.push(
    await writeGeneratedCsvFile(
      outputDir,
      options.simpleFileName,
      sourcePath,
      SIMPLE_PUBLIC_HEADERS,
      simpleRows,
      {
        tabName: options.simpleTabName || "Top Matches",
        recommendedPrimary: true,
        recommendedUse: options.simpleRecommendedUse || "Simple public Sheet with freshness fields",
        purpose: "Minimal public-facing Top Matches export, sorted by newest jobs first and then highest Writer Fit Score.",
        notes: "Recommended public Google Sheet upload. Apply Link is a plain URL that Google Sheets usually auto-links. Known country-specific posting campaigns may be grouped for readability; full detail remains in Top Matches Full.",
      }
    )
  );

  if (options.formulaFileName) {
    manifestRows.push(
      await writeGeneratedCsvFile(
        outputDir,
        options.formulaFileName,
        sourcePath,
        SIMPLE_FORMULA_HEADERS,
        formulaRows,
        {
          tabName: `${options.simpleTabName || "Top Matches"} Formula`,
          recommendedPrimary: false,
          recommendedUse: "Optional Google Sheets formula version",
          purpose: "Minimal public-facing Top Matches export with HYPERLINK formulas, sorted like the plain URL file.",
          notes: "Use only if you want the Apply column prefilled with Google Sheets HYPERLINK formulas.",
        }
      )
    );
  }

  return manifestRows;
}

function buildPackageReadme(generatedAt, manifestRows) {
  const copiedCsvRows = manifestRows.filter((row) => row.Exists && row.FileName.endsWith(".csv"));
  const includesFullFirehose = copiedCsvRows.some((row) => row.FileName === fullFirehoseFileName);

  return [
    "# Google Sheets Handoff Package",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This folder is a local handoff package for manually uploading selected CSVs to Google Sheets. It does not upload anything, publish anything, or replace the source exports.",
    "",
    "## Current Public Google Sheet",
    "",
    "1. `01_good_documentation_jobs`: the main public jobs table, replaced from `01_good_documentation_jobs.csv`.",
    "2. `remote_jobs_pivot`: the existing filtered remote-jobs view derived from the main jobs table. Preserve this tab when replacing main-tab data.",
    "",
    "## Main Public File",
    "",
    "`01_good_documentation_jobs.csv` is the main tab for normal users. It is small, deduped, high-signal, and intentionally minimal.",
    "",
    "`02_company_coverage.csv` is retained locally for internal transparency and debugging. It is not part of the current public Sheet.",
    "",
    "The data is generated from ATS/company catalogs and may not be exhaustive for every employer.",
    "",
    "Use `03_top_matches_full.csv` only for internal diagnostic columns. The public remote tab is maintained in Google Sheets as a filtered view of the main table.",
    "",
    "`11_demoted_high_score.csv` is optional diagnostic evidence for roles that previously looked high-scoring but were demoted by Writer Fit v3.",
    "",
    "## Full Firehose Warning",
    "",
    includesFullFirehose
      ? "`06_full_firehose.csv` may be large. It is kept only in the `latest` package for debugging or auditing the full firehose."
      : "Timestamped packages intentionally omit `06_full_firehose.csv` to avoid duplicating multi-GB processing files. The firehose remains available in `data/jobs/gsheet-package/latest/`.",
    "",
    "## Freshness Fields",
    "",
    "- `Posted Date` = date supplied by the ATS if available.",
    "- `Age (Days)` = days between Posted Date and the report generation date.",
    "- `Last Checked` = when the system last saw the job in the ATS.",
    "- `Report Run Date` = package generation time, stored in `00_start_here.csv` instead of repeated on every job row.",
    "- A recently checked job is more likely to still be open, but users should always click through to verify.",
    "",
    "## Links",
    "",
    "The simple jobs CSV keeps `Apply Link` as a plain URL. Google Sheets usually auto-links URLs, or you can use Insert > Link if needed.",
    "When exact company/title postings are consolidated across locations, `Additional Apply Links` preserves the other location-specific application URLs.",
    "",
    "## Suggested First Filter",
    "",
    "- `01_good_documentation_jobs.csv` is sorted by `Age (Days)` ascending, then `Writer Fit Score` descending.",
    "- Use `Work Arrangement` as a filter, not a score.",
    "- Preserve the existing `remote_jobs_pivot` tab when replacing the main tab's values.",
    "",
    "## CSV Files Included",
    "",
    ...copiedCsvRows.map((row) => `- \`${row.FileName}\` -> ${row.RecommendedSheetTabName || "No tab"}`),
    "",
    "## Internal Notes",
    "",
    "`OPERATOR_NOTES.md`, `PUBLISHING_PREP.md`, `SOURCE_SUMMARY.md`, and `PROJECT_STATUS_DASHBOARD.md` are internal operator/publisher notes. They are not the final public presentation layer.",
    "",
  ].join("\n");
}

function buildTopMatchesReadme(generatedAt) {
  return [
    "# Top Matches Package",
    "",
    `Generated: ${generatedAt}`,
    "",
    "`top_matches_simple.csv` is the recommended upload file for the Google Sheets / Substack workflow.",
    "",
    "It is deduped, high-signal, and intentionally minimal. Use `top_matches.csv` only if you want diagnostic/internal review columns.",
    "",
    "The full firehose still exists internally under `data/jobs/public/public-job-feed-latest.csv` and in the broader package, but it is not part of this small top-only package.",
    "",
    "The score is a ranking aid, not a guarantee. Location and remote fields are filters, not part of Writer Fit v3 scoring.",
    "",
    "## Freshness Fields",
    "",
    "- `Posted Date` = date supplied by the ATS if available.",
    "- `Age (Days)` = days between Posted Date and the report generation date.",
    "- `Last Checked` = when the system last saw the job in the ATS.",
    "- `Report Run Date` = package generation time, stored in the package's Start Here file instead of repeated on every job row.",
    "- A recently checked job is more likely to still be open, but users should always click through to verify.",
    "",
    "## Links",
    "",
    "`top_matches_simple.csv` keeps Apply Link as a plain URL. Google Sheets usually auto-links URLs, or you can use Insert > Link if needed. `top_matches_simple_with_formula.csv` is also included if you want a prebuilt `Apply` hyperlink formula column.",
    "",
    "## Recommended Google Sheets Filters",
    "",
    "- `ExportQualityFlag` = `OK`",
    "- `PossibleDuplicate` = `FALSE` if you want a stricter first pass",
    "- Sort by newest jobs first, then highest writer-fit score",
    "- Use `RemoteStatus` and `USRemoteEligible` as filters, not score",
    "",
    "## Files",
    "",
    "- `top_matches_simple.csv`: primary clean public Sheet upload file",
    "- `top_matches_simple_with_formula.csv`: optional formula version with an `Apply` hyperlink column",
    "- `top_matches.csv`: detailed diagnostics/internal review file",
    "- `data_dictionary.csv`: optional reference tab",
    "",
  ].join("\n");
}

function buildCleanPackageReadme(generatedAt, manifestRows) {
  const copiedCsvRows = manifestRows.filter((row) => row.Exists && row.FileName.endsWith(".csv"));

  return [
    "# Clean Google Sheets Handoff Package",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This is the clean package for manual Google Sheets upload. It prioritizes Good Documentation Jobs, preserves the public remote-jobs view, and intentionally keeps Company Coverage and the full firehose internal by default.",
    "",
    "## Recommended Google Sheets Tab Order",
    "",
    "1. `01_good_documentation_jobs`",
    "2. `remote_jobs_pivot` (preserve the existing derived view)",
    "",
    "## Main Tabs",
    "",
    "`01_good_documentation_jobs.csv` is the main tab for normal users. It is small, deduped, high-signal, and intentionally minimal.",
    "",
    "`02_company_coverage.csv` is an internal diagnostic file. It shows which companies were crawled, which found jobs, which failed, and which are catalog-only; it does not need a public Sheet tab.",
    "",
    "The data is generated from ATS/company catalogs and may not be exhaustive for every employer.",
    "",
    "Use `03_top_matches_full.csv` only if you want diagnostics.",
    "",
    "Avoid the full firehose unless debugging. It remains available in `data/jobs/public/public-job-feed-latest.csv` and the broader `data/jobs/gsheet-package/latest/` package.",
    "",
    "## Freshness Fields",
    "",
    "- `Posted Date` = date supplied by the ATS if available.",
    "- `Age (Days)` = days between Posted Date and the report generation date.",
    "- `Last Checked` = when the system last saw the job in the ATS.",
    "- `Report Run Date` = package generation time, stored in `00_start_here.csv` instead of repeated on every job row.",
    "- A recently checked job is more likely to still be open, but users should always click through to verify.",
    "",
    "## Links",
    "",
    "The simple jobs CSV keeps `Apply Link` as a plain URL. Google Sheets usually auto-links URLs, or you can use Insert > Link if needed.",
    "",
    "## Suggested First Filter",
    "",
    "- `01_good_documentation_jobs.csv` is sorted by `Age (Days)` ascending, then `Writer Fit Score` descending.",
    "- Use `Work Arrangement` as a filter, not a score.",
    "- Preserve `remote_jobs_pivot` as the user-facing remote filter when replacing the main tab data.",
    "",
    "## CSV Files Included",
    "",
    ...copiedCsvRows.map((row) => `- \`${row.FileName}\` -> ${row.RecommendedSheetTabName || "No tab"}`),
    "",
  ].join("\n");
}

async function writeManifestFiles(outputDir, manifestRows) {
  const csvPath = path.join(outputDir, "gsheet-package-manifest.csv");
  const jsonPath = path.join(outputDir, "gsheet-package-manifest.json");

  await writeTextFile(csvPath, rowsToCsv(manifestHeaders, manifestRows));
  await writeJsonFile(jsonPath, manifestRows);
}

async function buildPackageFromConfig(outputDir, files, readmeName, readmeText, generatedRows = []) {
  await fs.rm(outputDir, { recursive: true, force: true });
  await ensureDir(outputDir);

  const manifestRows = typeof generatedRows === "function" ? await generatedRows(outputDir) : [...generatedRows];
  for (const fileConfig of files) {
    manifestRows.push(await copyPackageFile(fileConfig, outputDir));
  }

  if (readmeName && readmeText) {
    await writeTextFile(path.join(outputDir, readmeName), readmeText);
  }

  await writeManifestFiles(outputDir, manifestRows);
  return manifestRows;
}

async function updateSourceSummaryNote() {
  const stat = await fileStat(sourceSummaryPath);
  if (!stat || !stat.isFile()) {
    return;
  }

  const marker = "## Recommended Google Sheets Source";
  const current = await fs.readFile(sourceSummaryPath, "utf8");

  const note = [
    marker,
    "",
    "`data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`",
    "",
    "Use Good Documentation Jobs as the primary upload and preserve the existing `remote_jobs_pivot` derived view. `02_company_coverage.csv` and `03_top_matches_full.csv` remain available for internal diagnostics. The full firehose remains available internally for debugging and audit work.",
    "",
  ].join("\n");

  const insertBefore = "\n## Files\n";
  let updated = current;
  if (current.includes(marker) && current.includes(insertBefore)) {
    const start = current.indexOf(marker);
    const end = current.indexOf(insertBefore);
    updated = `${current.slice(0, start).trimEnd()}\n\n${note}${current.slice(end)}`;
  } else {
    updated = current.includes(insertBefore)
      ? current.replace(insertBefore, `\n${note}${insertBefore}`)
      : `${current.trim()}\n\n${note}`;
  }

  await writeTextFile(sourceSummaryPath, updated);
}

async function copyDirectoryContents(sourceDir, targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await ensureDir(targetDir);

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await ensureDir(path.dirname(targetPath));
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

async function getDirectorySize(dirPath) {
  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stat = await fs.stat(entryPath);
      total += stat.size;
    }
  }

  return total;
}

async function main() {
  const profile = getProfile();
  const legacyPackages = parseBoolean(getArgValue("--legacy-packages", profile === "full" ? "true" : "false"), profile === "full");
  const includeFirehose = parseBoolean(getArgValue("--include-firehose", "true"), true);
  const firehoseMode = String(getArgValue("--firehose-mode", profile === "daily" ? "link" : "copy")).trim().toLowerCase();
  const timestamp = getTimestampParts(new Date());
  const packageDir = path.join(packageRoot, timestamp.folder);
  const latestDir = path.join(packageRoot, "latest");
  const latestCleanDir = path.join(packageRoot, "latest-clean");
  const topOnlyDir = path.join(packageRoot, "top-matches-only");
  const activePackageFiles = profile === "daily" ? dailyPackageFiles : timestampedPackageFiles;

  if (!["copy", "link"].includes(firehoseMode)) {
    throw new Error(`Unsupported --firehose-mode value: ${firehoseMode}. Use copy or link.`);
  }

  await runOptionalCommand("npm", ["run", "jobs:crawl-coverage"], "crawl coverage report");

  const topMatchesResult = await loadTopMatchesRows();
  const companyCoverageResult = await loadCompanyCoverageRows();
  const coveragePercent = await loadCoveragePercent();

  await updateSourceSummaryNote();
  await updateDataDictionaryFreshnessNotes();

  const manifestRows = await buildPackageFromConfig(
    packageDir,
    activePackageFiles,
    "",
    "",
    (outputDir) =>
      Promise.all([
        buildSimpleTopFiles(outputDir, timestamp.iso, topMatchesResult, {
        includeStartHere: true,
          simpleFileName: "01_good_documentation_jobs.csv",
          formulaFileName: "",
          simpleTabName: "Good Documentation Jobs",
          simpleRecommendedUse: "Main public Google Sheet tab",
          coveragePercent,
        }),
        buildSimpleCompanyCoverageFiles(outputDir, companyCoverageResult, {
          fileName: "02_company_coverage.csv",
        }),
      ]).then((rows) => rows.flat())
  );
  await writeTextFile(path.join(packageDir, "README_GSHEET_PACKAGE.md"), buildPackageReadme(timestamp.iso, manifestRows));
  await writeManifestFiles(packageDir, manifestRows);
  await copyDirectoryContents(packageDir, latestDir);
  if (includeFirehose && fullFirehosePackageFile) {
    const firehoseManifestRow =
      firehoseMode === "link"
        ? await linkPackageFile(fullFirehosePackageFile, latestDir)
        : await copyPackageFile(fullFirehosePackageFile, latestDir);
    const latestManifestRows = [...manifestRows, firehoseManifestRow];
    await writeTextFile(
      path.join(latestDir, "README_GSHEET_PACKAGE.md"),
      buildPackageReadme(timestamp.iso, latestManifestRows)
    );
    await writeManifestFiles(latestDir, latestManifestRows);
  }
  let latestCleanRows = [];
  let topOnlyRows = [];
  if (legacyPackages) {
    latestCleanRows = await buildPackageFromConfig(
      latestCleanDir,
      latestCleanFiles,
      "",
      "",
      (outputDir) =>
        Promise.all([
          buildSimpleTopFiles(outputDir, timestamp.iso, topMatchesResult, {
          includeStartHere: true,
            simpleFileName: "01_good_documentation_jobs.csv",
            formulaFileName: "",
            simpleTabName: "Good Documentation Jobs",
            simpleRecommendedUse: "Main public Google Sheet tab",
            coveragePercent,
          }),
          buildSimpleCompanyCoverageFiles(outputDir, companyCoverageResult, {
            fileName: "02_company_coverage.csv",
          }),
        ]).then((rows) => rows.flat())
    );
    await writeTextFile(
      path.join(latestCleanDir, "README_GSHEET_PACKAGE.md"),
      buildCleanPackageReadme(timestamp.iso, latestCleanRows)
    );
    topOnlyRows = await buildPackageFromConfig(
      topOnlyDir,
      topOnlyFiles,
      "README_TOP_MATCHES.md",
      buildTopMatchesReadme(timestamp.iso),
      (outputDir) =>
        buildSimpleTopFiles(outputDir, timestamp.iso, topMatchesResult, {
          includeStartHere: true,
          simpleFileName: "top_matches_simple.csv",
          formulaFileName: "top_matches_simple_with_formula.csv",
          coveragePercent,
        })
    );
  }

  const filesCopied = manifestRows.filter((row) => row.Exists).length;
  const missingOptionalFiles = manifestRows.filter((row) => {
    if (row.Exists) {
      return false;
    }

    const fileConfig = packageFiles.find((file) => file.fileName === row.FileName);
    return !fileConfig || !fileConfig.required;
  });
  const packageSize = await getDirectorySize(packageDir);
  const latestCleanSize = legacyPackages ? await getDirectorySize(latestCleanDir) : 0;
  const topOnlySize = legacyPackages ? await getDirectorySize(topOnlyDir) : 0;

  console.log("Google Sheets handoff package complete.");
  console.log(`Profile: ${profile}`);
  console.log("Package folder:");
  console.log(packageDir);
  console.log("Latest folder:");
  console.log(latestDir);
  if (legacyPackages) {
    console.log("Latest clean folder:");
    console.log(latestCleanDir);
    console.log("Top matches only folder:");
    console.log(topOnlyDir);
  } else {
    console.log("Legacy latest-clean/top-matches-only packages skipped. Use --legacy-packages true to rebuild them.");
  }
  console.log(`Latest full firehose included: ${includeFirehose}`);
  if (includeFirehose) {
    console.log(`Latest full firehose mode: ${firehoseMode}`);
  }
  console.log(`Files copied/created: ${filesCopied}`);
  if (legacyPackages) {
    console.log(`Latest clean files copied: ${latestCleanRows.filter((row) => row.Exists).length}`);
    console.log(`Top matches only files copied: ${topOnlyRows.filter((row) => row.Exists).length}`);
  }
  console.log(`Missing optional files: ${missingOptionalFiles.length}`);
  for (const row of missingOptionalFiles) {
    console.log(`- ${row.FileName}`);
  }
  console.log(`Total package size bytes: ${packageSize}`);
  if (legacyPackages) {
    console.log(`Latest clean package size bytes: ${latestCleanSize}`);
    console.log(`Top matches only package size bytes: ${topOnlySize}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof RangeError || /invalid string length/i.test(error.message || "")) {
      console.error("Large CSV output failed. Use streaming CSV support or rerun with --skip-csv true.");
    }
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  groupPublicSheetCountryPostings,
};
