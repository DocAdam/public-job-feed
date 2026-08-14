const fs = require("fs/promises");
const path = require("path");
const { nullableNumber } = require("../lib/number");
const { parseCsvRecords } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

const packageRoot = fromRoot("data", "jobs", "gsheet-package");
const reportsDir = fromRoot("data", "jobs", "reports");
const defaultPackageDir = path.join(packageRoot, "latest");
const jobCsvName = "01_good_documentation_jobs.csv";
const companyCoverageCsvName = "02_company_coverage.csv";
const startHereCsvName = "00_start_here.csv";
const manifestName = "gsheet-package-manifest.json";
const timestampPattern = /^\d{8}-\d{4}$/;
const sampleLimit = 10;

const requiredJobHeaders = [
  "Title",
  "Company",
  "Location",
  "Apply Link",
  "Writer Fit Score",
  "Fit Tier",
  "Why It Matched",
  "Role Type",
  "Work Arrangement",
  "Salary",
  "Posted Date",
  "Age (Days)",
  "Last Checked",
  "Source",
];

const requiredCompanyCoverageHeaders = [
  "Company",
  "ATS",
  "Coverage Status",
  "Jobs Found",
  "Good Matches Found",
  "Last Checked",
  "Last Fetch Status",
  "Fetch Notes",
  "Career Site / ATS URL",
];

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parsePercent(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function readCsvIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return {
      exists: false,
      headers: [],
      rows: [],
      error: "",
    };
  }

  try {
    const parsed = parseCsvRecords(await fs.readFile(filePath, "utf8"));
    return {
      exists: true,
      headers: parsed.headers,
      rows: parsed.rows,
      error: "",
    };
  } catch (error) {
    return {
      exists: true,
      headers: [],
      rows: [],
      error: error.message,
    };
  }
}

async function getPreviousPackageDir(packageDir, explicitPrevious) {
  if (explicitPrevious) {
    return path.resolve(fromRoot(), explicitPrevious);
  }

  if (!(await pathExists(packageRoot))) {
    return "";
  }

  const resolvedPackageDir = path.resolve(packageDir);
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  const timestampedDirs = entries
    .filter((entry) => entry.isDirectory() && timestampPattern.test(entry.name))
    .map((entry) => path.join(packageRoot, entry.name))
    .filter((entryPath) => path.resolve(entryPath) !== resolvedPackageDir)
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));

  return timestampedDirs[0] || "";
}

function addFailure(result, message) {
  result.Failures.push(message);
}

function addWarning(result, message) {
  result.Warnings.push(message);
}

function missingHeaders(actualHeaders, requiredHeaders) {
  const actual = new Set(actualHeaders);
  return requiredHeaders.filter((header) => !actual.has(header));
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseNumber(value) {
  return nullableNumber(value);
}

function parseDateOnly(value) {
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function parseFriendlyUtcDateTime(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+UTC$/i);
  if (match) {
    return new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5])
    ));
  }

  const timestamp = Date.parse(text.replace(/ UTC$/i, "Z").replace(" ", "T"));
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function dayStartUtc(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysBetween(leftDate, rightDate) {
  const leftDay = dayStartUtc(leftDate);
  const rightDay = dayStartUtc(rightDate);
  if (leftDay === null || rightDay === null) {
    return null;
  }

  return Math.floor((rightDay - leftDay) / (24 * 60 * 60 * 1000));
}

function formatDateOnly(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

async function readReportRunDate(packageDir) {
  const startHerePath = path.join(packageDir, startHereCsvName);
  const startHereCsv = await readCsvIfExists(startHerePath);
  if (!startHereCsv.exists || startHereCsv.error || startHereCsv.rows.length === 0) {
    return {
      path: startHerePath,
      value: "",
      date: null,
    };
  }

  const value = cleanText(startHereCsv.rows[0]["Report Run Date"]);
  return {
    path: startHerePath,
    value,
    date: parseFriendlyUtcDateTime(value),
  };
}

function countDuplicateValues(rows, field) {
  const counts = new Map();

  for (const row of rows) {
    const value = cleanText(row[field]);
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function percentChange(current, previous) {
  if (!previous) {
    return null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function parseLastChecked(value) {
  const text = cleanText(value);
  if (!text) {
    return 0;
  }

  const timestamp = Date.parse(text.replace(/ UTC$/, "Z").replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function countRowsOlderThan(rows, field, days, nowMs) {
  if (!days) {
    return 0;
  }

  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const timestamp = parseLastChecked(row[field]);
    return timestamp > 0 && nowMs - timestamp > maxAgeMs;
  }).length;
}

function getOldestLastChecked(rows) {
  const timestamps = rows.map((row) => parseLastChecked(row["Last Checked"])).filter((timestamp) => timestamp > 0);
  if (timestamps.length === 0) {
    return "";
  }

  return new Date(Math.min(...timestamps)).toISOString();
}

function jobComparisonKey(row) {
  const applyLink = cleanText(row["Apply Link"]).toLowerCase().replace(/\/+$/, "");
  if (applyLink) {
    return `url:${applyLink}`;
  }

  return `fallback:${[row.Company, row.Title, row.Location].map((value) => cleanText(value).toLowerCase()).join("|")}`;
}

function sampleFreshnessRow(currentRow, previousRow, extra) {
  return {
    Company: currentRow.Company || previousRow.Company || "",
    Title: currentRow.Title || previousRow.Title || "",
    Source: currentRow.Source || previousRow.Source || "",
    ApplyLink: currentRow["Apply Link"] || previousRow["Apply Link"] || "",
    PreviousPostedDate: previousRow["Posted Date"] || "",
    CurrentPostedDate: currentRow["Posted Date"] || "",
    PreviousAgeDays: previousRow["Age (Days)"] || "",
    CurrentAgeDays: currentRow["Age (Days)"] || "",
    ...extra,
  };
}

function buildRowsByKey(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = jobComparisonKey(row);
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, row);
  }
  return byKey;
}

function summarizeBySource(rows) {
  const counts = new Map();
  for (const row of rows) {
    const source = cleanText(row.Source) || "unknown";
    counts.set(source, (counts.get(source) || 0) + 1);
  }

  return Object.fromEntries(Array.from(counts.entries()).sort((left, right) => right[1] - left[1]));
}

function getPostedDateMovedForwardRows(currentRows, previousRows, minForwardDays) {
  const previousByKey = buildRowsByKey(previousRows);
  const movedRows = [];

  for (const currentRow of currentRows) {
    const previousRow = previousByKey.get(jobComparisonKey(currentRow));
    if (!previousRow) {
      continue;
    }

    const previousDate = parseDateOnly(previousRow["Posted Date"]);
    const currentDate = parseDateOnly(currentRow["Posted Date"]);
    const deltaDays = daysBetween(previousDate, currentDate);
    if (deltaDays !== null && deltaDays > minForwardDays) {
      movedRows.push(sampleFreshnessRow(currentRow, previousRow, { PostedDateDeltaDays: deltaDays }));
    }
  }

  return movedRows;
}

function getAgeDecreasedRows(currentRows, previousRows) {
  const previousByKey = buildRowsByKey(previousRows);
  const decreasedRows = [];

  for (const currentRow of currentRows) {
    const previousRow = previousByKey.get(jobComparisonKey(currentRow));
    if (!previousRow) {
      continue;
    }

    const previousAge = parseNumber(previousRow["Age (Days)"]);
    const currentAge = parseNumber(currentRow["Age (Days)"]);
    if (previousAge !== null && currentAge !== null && currentAge < previousAge) {
      decreasedRows.push(sampleFreshnessRow(currentRow, previousRow, {
        AgeDeltaDays: Number((currentAge - previousAge).toFixed(2)),
      }));
    }
  }

  return decreasedRows;
}

function getSameDayPostedDateSpikes(rows, reportRunDate, minCount, minPercent) {
  if (!reportRunDate) {
    return [];
  }

  const reportRunDay = formatDateOnly(reportRunDate);
  const bySource = new Map();
  for (const row of rows) {
    const source = cleanText(row.Source) || "unknown";
    if (!bySource.has(source)) {
      bySource.set(source, {
        Source: source,
        TotalRows: 0,
        SameDayRows: 0,
        SameDayPercent: 0,
        SampleRows: [],
      });
    }

    const entry = bySource.get(source);
    entry.TotalRows += 1;
    if (cleanText(row["Posted Date"]) === reportRunDay) {
      entry.SameDayRows += 1;
      if (entry.SampleRows.length < sampleLimit) {
        entry.SampleRows.push({
          Company: row.Company || "",
          Title: row.Title || "",
          Source: source,
          PostedDate: row["Posted Date"] || "",
          AgeDays: row["Age (Days)"] || "",
          ApplyLink: row["Apply Link"] || "",
        });
      }
    }
  }

  return Array.from(bySource.values())
    .map((entry) => ({
      ...entry,
      SameDayPercent: entry.TotalRows ? Number(((entry.SameDayRows / entry.TotalRows) * 100).toFixed(2)) : 0,
    }))
    .filter((entry) => entry.SameDayRows > 0 && (entry.SameDayRows >= minCount || entry.SameDayPercent >= minPercent))
    .sort((left, right) => right.SameDayRows - left.SameDayRows);
}

function formatSourceSummary(summary) {
  const entries = Object.entries(summary);
  return entries.length ? entries.map(([source, count]) => `${source}: ${count}`).join(", ") : "none";
}

function formatSampleRows(rows) {
  return rows.slice(0, sampleLimit).map((row) => {
    const pieces = [
      `${row.Company || "Unknown company"} - ${row.Title || "Unknown title"}`,
      `source ${row.Source || "unknown"}`,
    ];

    if (row.PostedDateDeltaDays !== undefined) {
      pieces.push(`posted ${row.PreviousPostedDate || "blank"} -> ${row.CurrentPostedDate || "blank"} (${row.PostedDateDeltaDays}d)`);
    }
    if (row.AgeDeltaDays !== undefined) {
      pieces.push(`age ${row.PreviousAgeDays || "blank"} -> ${row.CurrentAgeDays || "blank"} (${row.AgeDeltaDays}d)`);
    }
    if (row.PostedDate !== undefined) {
      pieces.push(`posted ${row.PostedDate || "blank"}`);
      pieces.push(`age ${row.AgeDays || "blank"}`);
    }

    return `- ${pieces.join("; ")}`;
  });
}

function buildMarkdown(result) {
  return [
    "# Google Sheets Package Validation",
    "",
    `Generated: ${result.GeneratedAt}`,
    "",
    `Status: ${result.Status}`,
    "",
    "## Package",
    "",
    `- Package directory: ${result.PackageDir}`,
    `- Previous package directory: ${result.PreviousPackageDir || "not found"}`,
    "",
    "## Counts",
    "",
    `- Good Documentation Jobs rows: ${result.GoodDocumentationJobsRows}`,
    `- Previous Good Documentation Jobs rows: ${result.PreviousGoodDocumentationJobsRows}`,
    `- Row change: ${result.RowChange}`,
    `- Row change percent: ${result.RowChangePercent === null ? "n/a" : `${result.RowChangePercent}%`}`,
    `- Company Coverage rows: ${result.CompanyCoverageRows}`,
    `- Duplicate Apply Link rows: ${result.DuplicateApplyLinkRows}`,
    `- Missing Apply Link rows: ${result.MissingApplyLinkRows}`,
    `- Blank Title rows: ${result.BlankTitleRows}`,
    `- Blank Company rows: ${result.BlankCompanyRows}`,
    `- Oldest Last Checked: ${result.OldestLastChecked || "n/a"}`,
    `- Rows older than ${result.WarnStaleDays} days: ${result.RowsOlderThanWarnStaleDays}`,
    `- Rows older than ${result.StrongWarnStaleDays} days: ${result.RowsOlderThanStrongWarnStaleDays}`,
    `- Rows older than ${result.FailStaleDays || "disabled"} days: ${
      result.FailStaleDays ? result.RowsOlderThanFailStaleDays : "n/a"
    }`,
    "",
    "## Freshness Diagnostics",
    "",
    `- Report Run Date: ${result.ReportRunDate || "n/a"}`,
    `- Posted Date moved forward rows: ${result.PostedDateMovedForwardRows}`,
    `- Posted Date moved forward by source: ${formatSourceSummary(result.PostedDateMovedForwardBySource)}`,
    `- Age decreased rows: ${result.AgeDecreasedRows}`,
    `- Age decreased by source: ${formatSourceSummary(result.AgeDecreasedBySource)}`,
    `- Same-day Posted Date spike sources: ${result.SameDayPostedDateSpikes.length}`,
    "",
    "### Posted Date Moved Forward Samples",
    "",
    ...(result.PostedDateMovedForwardSamples.length ? formatSampleRows(result.PostedDateMovedForwardSamples) : ["None"]),
    "",
    "### Age Decreased Samples",
    "",
    ...(result.AgeDecreasedSamples.length ? formatSampleRows(result.AgeDecreasedSamples) : ["None"]),
    "",
    "### Same-Day Posted Date Spike Samples",
    "",
    ...(result.SameDayPostedDateSpikes.length
      ? result.SameDayPostedDateSpikes.flatMap((spike) => [
        `- ${spike.Source}: ${spike.SameDayRows}/${spike.TotalRows} rows (${spike.SameDayPercent}%)`,
        ...formatSampleRows(spike.SampleRows),
      ])
      : ["None"]),
    "",
    "## Failures",
    "",
    ...(result.Failures.length ? result.Failures.map((item) => `- ${item}`) : ["None"]),
    "",
    "## Warnings",
    "",
    ...(result.Warnings.length ? result.Warnings.map((item) => `- ${item}`) : ["None"]),
    "",
  ].join("\n");
}

async function validateManifest(result, packageDir) {
  const manifestPath = path.join(packageDir, manifestName);
  result.ManifestPath = manifestPath;
  result.ManifestExists = await pathExists(manifestPath);

  if (!result.ManifestExists) {
    addWarning(result, `Package manifest is missing: ${manifestPath}`);
  }
}

async function main() {
  const packageDir = path.resolve(fromRoot(), getArgValue("--package-dir", defaultPackageDir));
  const previousPackageDir = await getPreviousPackageDir(packageDir, getArgValue("--previous-package-dir", ""));
  const minRows = parsePositiveInteger(getArgValue("--min-rows", "25"), 25);
  const maxDropPercent = parsePercent(getArgValue("--max-drop-percent", "80"), 80);
  const warnStaleDays = parsePositiveInteger(getArgValue("--warn-stale-days", "7"), 7);
  const strongWarnStaleDays = parsePositiveInteger(getArgValue("--strong-warn-stale-days", "14"), 14);
  const postedDateForwardWarnDays = parsePositiveInteger(getArgValue("--posted-date-forward-warn-days", "1"), 1);
  const sameDayPostedDateWarnCount = parsePositiveInteger(getArgValue("--same-day-posted-date-warn-count", "10"), 10);
  const sameDayPostedDateWarnPercent = parsePercent(getArgValue("--same-day-posted-date-warn-percent", "10"), 10);
  const failStaleDays = Number.parseInt(getArgValue("--fail-stale-days", "0"), 10);
  const safeFailStaleDays = Number.isFinite(failStaleDays) && failStaleDays > 0 ? failStaleDays : 0;
  const jobCsvPath = path.join(packageDir, jobCsvName);
  const companyCoverageCsvPath = path.join(packageDir, companyCoverageCsvName);
  const previousJobCsvPath = previousPackageDir ? path.join(previousPackageDir, jobCsvName) : "";
  const result = {
    GeneratedAt: new Date().toISOString(),
    Status: "PASS",
    PackageDir: packageDir,
    JobCsvPath: jobCsvPath,
    CompanyCoverageCsvPath: companyCoverageCsvPath,
    PreviousPackageDir: previousPackageDir,
    PreviousJobCsvPath: previousJobCsvPath,
    GoodDocumentationJobsRows: 0,
    PreviousGoodDocumentationJobsRows: 0,
    RowChange: null,
    RowChangePercent: null,
    CompanyCoverageRows: 0,
    DuplicateApplyLinkRows: 0,
    MissingApplyLinkRows: 0,
    BlankTitleRows: 0,
    BlankCompanyRows: 0,
    OldestLastChecked: "",
    WarnStaleDays: warnStaleDays,
    StrongWarnStaleDays: strongWarnStaleDays,
    FailStaleDays: safeFailStaleDays,
    RowsOlderThanWarnStaleDays: 0,
    RowsOlderThanStrongWarnStaleDays: 0,
    RowsOlderThanFailStaleDays: 0,
    ReportRunDate: "",
    ReportRunDatePath: "",
    PostedDateForwardWarnDays: postedDateForwardWarnDays,
    PostedDateMovedForwardRows: 0,
    PostedDateMovedForwardBySource: {},
    PostedDateMovedForwardSamples: [],
    AgeDecreasedRows: 0,
    AgeDecreasedBySource: {},
    AgeDecreasedSamples: [],
    SameDayPostedDateWarnCount: sameDayPostedDateWarnCount,
    SameDayPostedDateWarnPercent: sameDayPostedDateWarnPercent,
    SameDayPostedDateSpikes: [],
    Failures: [],
    Warnings: [],
  };

  await ensureDir(reportsDir);
  await validateManifest(result, packageDir);
  const reportRunDate = await readReportRunDate(packageDir);
  result.ReportRunDate = reportRunDate.value;
  result.ReportRunDatePath = reportRunDate.path;

  const jobCsv = await readCsvIfExists(jobCsvPath);
  if (!jobCsv.exists) {
    addFailure(result, `Missing required upload CSV: ${jobCsvPath}`);
  } else if (jobCsv.error) {
    addFailure(result, `Could not parse upload CSV: ${jobCsv.error}`);
  } else {
    result.GoodDocumentationJobsRows = jobCsv.rows.length;

    const missing = missingHeaders(jobCsv.headers, requiredJobHeaders);
    if (missing.length > 0) {
      addFailure(result, `Upload CSV is missing required columns: ${missing.join(", ")}`);
    }

    if (jobCsv.rows.length < minRows) {
      addFailure(result, `Upload CSV has ${jobCsv.rows.length} rows, below minimum ${minRows}.`);
    }

    result.MissingApplyLinkRows = jobCsv.rows.filter((row) => !cleanText(row["Apply Link"])).length;
    result.BlankTitleRows = jobCsv.rows.filter((row) => !cleanText(row.Title)).length;
    result.BlankCompanyRows = jobCsv.rows.filter((row) => !cleanText(row.Company)).length;
    result.DuplicateApplyLinkRows = countDuplicateValues(jobCsv.rows, "Apply Link");
    result.OldestLastChecked = getOldestLastChecked(jobCsv.rows);
    result.RowsOlderThanWarnStaleDays = countRowsOlderThan(jobCsv.rows, "Last Checked", warnStaleDays, Date.now());
    result.RowsOlderThanStrongWarnStaleDays = countRowsOlderThan(
      jobCsv.rows,
      "Last Checked",
      strongWarnStaleDays,
      Date.now()
    );
    result.RowsOlderThanFailStaleDays = safeFailStaleDays
      ? countRowsOlderThan(jobCsv.rows, "Last Checked", safeFailStaleDays, Date.now())
      : 0;

    if (result.MissingApplyLinkRows > 0) {
      addWarning(result, `${result.MissingApplyLinkRows} rows have a blank Apply Link.`);
    }
    if (result.BlankTitleRows > 0) {
      addWarning(result, `${result.BlankTitleRows} rows have a blank Title.`);
    }
    if (result.BlankCompanyRows > 0) {
      addWarning(result, `${result.BlankCompanyRows} rows have a blank Company.`);
    }
    if (result.DuplicateApplyLinkRows > 0) {
      addFailure(result, `${result.DuplicateApplyLinkRows} duplicate Apply Link rows found.`);
    }
    if (result.RowsOlderThanWarnStaleDays > 0) {
      addWarning(result, `${result.RowsOlderThanWarnStaleDays} rows have Last Checked older than ${warnStaleDays} days.`);
    }
    if (result.RowsOlderThanStrongWarnStaleDays > 0) {
      addWarning(
        result,
        `${result.RowsOlderThanStrongWarnStaleDays} rows have Last Checked older than ${strongWarnStaleDays} days.`
      );
    }
    if (safeFailStaleDays && result.RowsOlderThanFailStaleDays > 0) {
      addFailure(
        result,
        `${result.RowsOlderThanFailStaleDays} rows have Last Checked older than failure threshold ${safeFailStaleDays} days.`
      );
    }

    result.SameDayPostedDateSpikes = getSameDayPostedDateSpikes(
      jobCsv.rows,
      reportRunDate.date,
      sameDayPostedDateWarnCount,
      sameDayPostedDateWarnPercent
    );
    for (const spike of result.SameDayPostedDateSpikes) {
      addWarning(
        result,
        `${spike.Source} has ${spike.SameDayRows}/${spike.TotalRows} rows (${spike.SameDayPercent}%) with Posted Date equal to the package Report Run Date.`
      );
    }
  }

  if (previousJobCsvPath) {
    const previousJobCsv = await readCsvIfExists(previousJobCsvPath);
    if (!previousJobCsv.exists) {
      addWarning(result, `Previous package upload CSV is missing: ${previousJobCsvPath}`);
    } else if (previousJobCsv.error) {
      addWarning(result, `Could not parse previous package upload CSV: ${previousJobCsv.error}`);
    } else {
      result.PreviousGoodDocumentationJobsRows = previousJobCsv.rows.length;
      result.RowChange = result.GoodDocumentationJobsRows - result.PreviousGoodDocumentationJobsRows;
      result.RowChangePercent = percentChange(result.GoodDocumentationJobsRows, result.PreviousGoodDocumentationJobsRows);

      const postedDateMovedForwardRows = getPostedDateMovedForwardRows(
        jobCsv.rows,
        previousJobCsv.rows,
        postedDateForwardWarnDays
      );
      result.PostedDateMovedForwardRows = postedDateMovedForwardRows.length;
      result.PostedDateMovedForwardBySource = summarizeBySource(postedDateMovedForwardRows);
      result.PostedDateMovedForwardSamples = postedDateMovedForwardRows.slice(0, sampleLimit);

      const ageDecreasedRows = getAgeDecreasedRows(jobCsv.rows, previousJobCsv.rows);
      result.AgeDecreasedRows = ageDecreasedRows.length;
      result.AgeDecreasedBySource = summarizeBySource(ageDecreasedRows);
      result.AgeDecreasedSamples = ageDecreasedRows.slice(0, sampleLimit);

      if (result.PostedDateMovedForwardRows > 0) {
        addWarning(
          result,
          `${result.PostedDateMovedForwardRows} continuing rows moved Posted Date forward by more than ${postedDateForwardWarnDays} day(s): ${formatSourceSummary(result.PostedDateMovedForwardBySource)}.`
        );
      }
      if (result.AgeDecreasedRows > 0) {
        addWarning(
          result,
          `${result.AgeDecreasedRows} continuing rows have lower Age (Days) than the previous package: ${formatSourceSummary(result.AgeDecreasedBySource)}.`
        );
      }

      if (
        result.RowChangePercent !== null &&
        result.RowChangePercent < 0 &&
        Math.abs(result.RowChangePercent) >= maxDropPercent
      ) {
        addFailure(
          result,
          `Upload CSV row count dropped ${Math.abs(result.RowChangePercent)}%, meeting failure threshold ${maxDropPercent}%.`
        );
      } else if (result.RowChangePercent !== null && Math.abs(result.RowChangePercent) >= 25) {
        addWarning(result, `Upload CSV row count changed ${result.RowChangePercent}% versus previous package.`);
      }
    }
  } else {
    addWarning(result, "No previous timestamped package found for row-count comparison.");
  }

  const companyCoverageCsv = await readCsvIfExists(companyCoverageCsvPath);
  if (!companyCoverageCsv.exists) {
    addWarning(result, `Company Coverage CSV is missing: ${companyCoverageCsvPath}`);
  } else if (companyCoverageCsv.error) {
    addWarning(result, `Could not parse Company Coverage CSV: ${companyCoverageCsv.error}`);
  } else {
    result.CompanyCoverageRows = companyCoverageCsv.rows.length;
    const missing = missingHeaders(companyCoverageCsv.headers, requiredCompanyCoverageHeaders);
    if (missing.length > 0) {
      addWarning(result, `Company Coverage CSV is missing columns: ${missing.join(", ")}`);
    }
    if (companyCoverageCsv.rows.length === 0) {
      addWarning(result, "Company Coverage CSV has 0 rows.");
    }
  }

  result.Status = result.Failures.length > 0 ? "FAIL" : result.Warnings.length > 0 ? "WARN" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-gsheet-package-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-gsheet-package-results.md"), buildMarkdown(result), "utf8");

  console.log(`Google Sheets package validation: ${result.Status}`);
  console.log(`Package: ${result.PackageDir}`);
  console.log(`Good Documentation Jobs rows: ${result.GoodDocumentationJobsRows}`);
  console.log(`Previous rows: ${result.PreviousGoodDocumentationJobsRows}`);
  console.log(`Row change: ${result.RowChange === null ? "n/a" : result.RowChange}`);
  console.log(`Company Coverage rows: ${result.CompanyCoverageRows}`);
  console.log(`Failures: ${result.Failures.length}`);
  console.log(`Warnings: ${result.Warnings.length}`);

  if (result.Failures.length > 0) {
    for (const failure of result.Failures) {
      console.error(`FAIL: ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
