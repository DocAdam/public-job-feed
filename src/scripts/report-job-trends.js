const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");
const { categorizeTitle, titleCategories } = require("../lib/title-category");
const { nullableNumber } = require("../lib/number");

const packageRoot = fromRoot("data", "jobs", "gsheet-package");
const trendsRoot = fromRoot("data", "jobs", "trends");
const latestTrendDir = path.join(trendsRoot, "latest");
const publicSheetConfigPath = fromRoot("data", "config", "public-sheet.json");
const companyNormalizationConfigPath = fromRoot("data", "config", "company-normalization.json");
const packageTimestampPattern = /^\d{8}-\d{4}$/;
const dayMs = 24 * 60 * 60 * 1000;
const jobCsvName = "01_good_documentation_jobs.csv";
const companyCoverageCsvName = "02_company_coverage.csv";
const jobColumns = [
  "Title",
  "Company",
  "Location",
  "Apply Link",
  "Writer Fit Score",
  "Fit Tier",
  "Why It Matched",
  "Posted Date",
  "Age (Days)",
  "Last Checked",
  "Source",
];
const summaryColumns = [
  "CurrentSnapshot",
  "PreviousSnapshot",
  "CurrentJobCount",
  "PreviousJobCount",
  "NetChange",
  "NewJobs",
  "RemovedJobs",
  "ContinuingJobs",
  "CompaniesRepresented",
  "UniqueTitles",
  "AverageWriterFitScore",
  "ATierCount",
  "BTierCount",
  "CTierCount",
  "GeneratedAt",
];
const fallbackPublicSheet = {
  publicSheetUrl: "",
  publicSheetLabel: "good documentation jobs",
  updateCadence: "Updated at least 2 times per week",
  tabs: [
    {
      name: "01_good_documentation_jobs",
      description: "Curated good-fit documentation, technical writing, content, and related roles.",
    },
    {
      name: "02_company_coverage",
      description: "Company/ATS coverage status showing which companies were checked, produced jobs, failed, or are catalog-only.",
    },
  ],
};

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    return false;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function normalizeUrl(value) {
  return cleanText(value).toLowerCase().replace(/\/+$/, "");
}

function normalizeJobKey(row) {
  const url = normalizeUrl(row["Apply Link"]);
  if (url) return `url:${url}`;
  return `fallback:${[row.Company, row.Title, row.Location].map(normalizeText).join("|")}`;
}

function normalizeTitle(value) {
  return normalizeText(value)
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\b(senior|sr|staff|principal|lead|junior|jr|mid|associate)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value) {
  return nullableNumber(value);
}

function parseTimestamp(value) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function coerceDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = cleanText(value);
  if (!text) return null;

  const snapshotDate = parseTimestamp(text);
  if (snapshotDate) return snapshotDate;

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));

  const friendlyUtc = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+UTC$/i);
  if (friendlyUtc) {
    return new Date(Date.UTC(
      Number(friendlyUtc[1]),
      Number(friendlyUtc[2]) - 1,
      Number(friendlyUtc[3]),
      Number(friendlyUtc[4]),
      Number(friendlyUtc[5]),
    ));
  }

  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (usDate) {
    const year = Number(usDate[3].length === 2 ? `20${usDate[3]}` : usDate[3]);
    return new Date(Date.UTC(year, Number(usDate[1]) - 1, Number(usDate[2])));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDisplay(value) {
  const date = coerceDate(value);
  if (!date) return "";
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("-");
}

function formatDateTimeDisplay(value) {
  const date = coerceDate(value);
  if (!date) return "";
  return `${formatDateDisplay(date)} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}

function formatSnapshotLabel(snapshotId) {
  return formatDateTimeDisplay(parseTimestamp(snapshotId));
}

function formatSnapshotDate(snapshotId) {
  return formatDateDisplay(parseTimestamp(snapshotId));
}

function parseDateOnly(value, endOfDay = false) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCliOptions(argv) {
  const options = {
    rangeMode: "weekly",
    days: 7,
    start: "",
    end: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--range") {
      options.rangeMode = requireOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--days") {
      options.days = Number(requireOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--start") {
      options.start = requireOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--end") {
      options.end = requireOptionValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const validModes = new Set(["weekly", "days", "all", "current-previous"]);
  if (!validModes.has(options.rangeMode)) {
    throw new Error(`Invalid --range value: ${options.rangeMode}`);
  }

  if (!Number.isInteger(options.days) || options.days <= 0) {
    throw new Error("--days must be a positive whole number.");
  }

  if ((options.start && !options.end) || (!options.start && options.end)) {
    throw new Error("--start and --end must be supplied together.");
  }

  if (options.start && options.end) {
    const startDate = parseDateOnly(options.start);
    const endDate = parseDateOnly(options.end, true);
    if (!startDate || !endDate) throw new Error("--start and --end must use YYYY-MM-DD.");
    if (startDate.getTime() > endDate.getTime()) throw new Error("--start must be before or equal to --end.");
    options.rangeMode = "explicit";
    options.startDate = startDate;
    options.endDate = endDate;
  }

  return options;
}

function requireOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${optionName} requires a value.`);
  return value;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(digits));
}

function compareRowsByScore(left, right) {
  return (numberValue(right["Writer Fit Score"]) || 0) - (numberValue(left["Writer Fit Score"]) || 0)
    || normalizeText(left.Company).localeCompare(normalizeText(right.Company))
    || normalizeText(left.Title).localeCompare(normalizeText(right.Title));
}

async function readCsvRows(filePath) {
  const parsed = parseCsvRecords(await fs.readFile(filePath, "utf8"));
  return parsed.rows;
}

async function loadPublicSheetConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(publicSheetConfigPath, "utf8"));
    return {
      ...fallbackPublicSheet,
      ...parsed,
      tabs: Array.isArray(parsed.tabs) && parsed.tabs.length ? parsed.tabs : fallbackPublicSheet.tabs,
    };
  } catch (error) {
    return fallbackPublicSheet;
  }
}

async function loadCompanyNormalization() {
  try {
    return JSON.parse(await fs.readFile(companyNormalizationConfigPath, "utf8"));
  } catch (error) {
    return {};
  }
}

function companyKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function displayCompany(value, companyNormalization = {}) {
  const original = cleanText(value) || "Unknown";
  return companyNormalization[companyKey(original)] || original;
}

function displayRowCompany(row, companyNormalization) {
  return displayCompany(row.Company, companyNormalization);
}

async function loadSnapshots() {
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  const snapshots = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !packageTimestampPattern.test(entry.name)) continue;
    const packageDir = path.join(packageRoot, entry.name);
    const jobCsvPath = path.join(packageDir, jobCsvName);
    if (!(await fileExists(jobCsvPath))) continue;

    const companyCoveragePath = path.join(packageDir, companyCoverageCsvName);
    const rows = await readCsvRows(jobCsvPath);
    snapshots.push({
      id: entry.name,
      date: parseTimestamp(entry.name),
      packageDir,
      jobCsvPath,
      companyCoveragePath: (await fileExists(companyCoveragePath)) ? companyCoveragePath : "",
      rows,
      keyedRows: new Map(rows.map((row) => [normalizeJobKey(row), row])),
    });
  }

  return snapshots.sort((left, right) => left.id.localeCompare(right.id));
}

function buildHistory(snapshots) {
  const history = new Map();
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      const key = normalizeJobKey(row);
      if (!history.has(key)) {
        history.set(key, {
          key,
          firstSeen: snapshot.id,
          firstDate: snapshot.date,
          lastSeen: snapshot.id,
          lastDate: snapshot.date,
          snapshotIds: [],
          rows: [],
        });
      }
      const entry = history.get(key);
      entry.lastSeen = snapshot.id;
      entry.lastDate = snapshot.date;
      entry.snapshotIds.push(snapshot.id);
      entry.rows.push(row);
    }
  }
  return history;
}

function uniqueCount(rows, field) {
  return new Set(rows.map((row) => normalizeText(row[field])).filter(Boolean)).size;
}

function averageScore(rows) {
  const scores = rows.map((row) => numberValue(row["Writer Fit Score"])).filter((value) => value !== null);
  if (!scores.length) return "";
  return formatNumber(scores.reduce((sum, value) => sum + value, 0) / scores.length, 1);
}

function tierCount(rows, tier) {
  return rows.filter((row) => normalizeText(row["Fit Tier"]) === tier.toLowerCase()).length;
}

function currentPreviousSets(current, previous) {
  const currentKeys = new Set(current.keyedRows.keys());
  const previousKeys = new Set(previous.keyedRows.keys());
  const newKeys = [...currentKeys].filter((key) => !previousKeys.has(key));
  const removedKeys = [...previousKeys].filter((key) => !currentKeys.has(key));
  const continuingKeys = [...currentKeys].filter((key) => previousKeys.has(key));
  return {
    newKeys,
    removedKeys,
    continuingKeys,
  };
}

function buildSummaryRow({ current, previous, newRows, removedRows, continuingRows, generatedAt }) {
  return {
    CurrentSnapshot: current.id,
    PreviousSnapshot: previous.id,
    CurrentJobCount: current.rows.length,
    PreviousJobCount: previous.rows.length,
    NetChange: current.rows.length - previous.rows.length,
    NewJobs: newRows.length,
    RemovedJobs: removedRows.length,
    ContinuingJobs: continuingRows.length,
    CompaniesRepresented: uniqueCount(current.rows, "Company"),
    UniqueTitles: uniqueCount(current.rows, "Title"),
    AverageWriterFitScore: averageScore(current.rows),
    ATierCount: tierCount(current.rows, "A"),
    BTierCount: tierCount(current.rows, "B"),
    CTierCount: tierCount(current.rows, "C"),
    GeneratedAt: generatedAt,
  };
}

function pickJobColumns(row) {
  return Object.fromEntries(jobColumns.map((column) => [column, row[column] || ""]));
}

function buildNewJobsRows(rows) {
  return rows.sort(compareRowsByScore).map(pickJobColumns);
}

function buildRemovedJobsRows(rows, previous) {
  return rows.sort(compareRowsByScore).map((row) => ({
    Title: row.Title || "",
    Company: row.Company || "",
    Location: row.Location || "",
    "Apply Link": row["Apply Link"] || "",
    "Previous Writer Fit Score": row["Writer Fit Score"] || "",
    "Previous Fit Tier": row["Fit Tier"] || "",
    "Last Seen": previous.id,
    "Possible Reason": "No longer present in latest Good Documentation Jobs output",
  }));
}

function buildContinuingRows(keys, current, history) {
  return keys
    .map((key) => {
      const row = current.keyedRows.get(key);
      const entry = history.get(key);
      return {
        Title: row.Title || "",
        Company: row.Company || "",
        Location: row.Location || "",
        "Apply Link": row["Apply Link"] || "",
        "Writer Fit Score": row["Writer Fit Score"] || "",
        "Fit Tier": row["Fit Tier"] || "",
        "First Seen": entry ? entry.firstSeen : current.id,
        "Last Seen": current.id,
        "Snapshot Count": entry ? entry.snapshotIds.length : 1,
        "Age (Days)": row["Age (Days)"] || "",
        Source: row.Source || "",
      };
    })
    .sort(compareRowsByScore);
}

function groupRows(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = cleanText(row[field]) || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function groupRowsByDisplayCompany(rows, companyNormalization) {
  const groups = new Map();
  for (const row of rows) {
    const company = displayRowCompany(row, companyNormalization);
    if (!groups.has(company)) groups.set(company, []);
    groups.get(company).push(row);
  }
  return groups;
}

function buildCompanyTrends(current, previous, newRows, removedRows, companyNormalization) {
  const companies = new Set([
    ...current.rows.map((row) => displayRowCompany(row, companyNormalization)),
    ...previous.rows.map((row) => displayRowCompany(row, companyNormalization)),
  ]);
  const currentGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  const previousGroups = groupRowsByDisplayCompany(previous.rows, companyNormalization);
  const newGroups = groupRowsByDisplayCompany(newRows, companyNormalization);
  const removedGroups = groupRowsByDisplayCompany(removedRows, companyNormalization);

  return [...companies].map((company) => {
    const currentRows = currentGroups.get(company) || [];
    const previousRows = previousGroups.get(company) || [];
    const topRow = [...currentRows].sort(compareRowsByScore)[0] || {};
    const bestScore = Math.max(0, ...currentRows.map((row) => numberValue(row["Writer Fit Score"]) || 0));
    return {
      Company: company,
      "Current Jobs": currentRows.length,
      "Previous Jobs": previousRows.length,
      "Net Change": currentRows.length - previousRows.length,
      "New Jobs": (newGroups.get(company) || []).length,
      "Removed Jobs": (removedGroups.get(company) || []).length,
      "Best Current Score": currentRows.length ? bestScore : "",
      "Top Current Title": topRow.Title || "",
      "Top Current URL": topRow["Apply Link"] || "",
    };
  }).sort((left, right) => Number(right["Current Jobs"]) - Number(left["Current Jobs"])
    || Number(right["Net Change"]) - Number(left["Net Change"])
    || left.Company.localeCompare(right.Company));
}

function buildTitleTrends(current, previous, companyNormalization) {
  const currentGroups = groupByNormalizedTitle(current.rows);
  const previousGroups = groupByNormalizedTitle(previous.rows);
  const titles = new Set([...currentGroups.keys(), ...previousGroups.keys()]);

  return [...titles].map((title) => {
    const currentRows = currentGroups.get(title) || [];
    const previousRows = previousGroups.get(title) || [];
    const example = currentRows[0] || previousRows[0] || {};
    return {
      "Normalized Title": title || "unknown",
      "Current Count": currentRows.length,
      "Previous Count": previousRows.length,
      "Net Change": currentRows.length - previousRows.length,
      "Example Company": example.Company ? displayRowCompany(example, companyNormalization) : "",
      "Example URL": example["Apply Link"] || "",
    };
  }).sort((left, right) => Number(right["Current Count"]) - Number(left["Current Count"])
    || Number(right["Net Change"]) - Number(left["Net Change"])
    || left["Normalized Title"].localeCompare(right["Normalized Title"]));
}

function groupByNormalizedTitle(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeTitle(row.Title) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function buildTitleCategorySummary(current, previous) {
  const currentCounts = countCategories(current.rows);
  const previousCounts = countCategories(previous.rows);
  return titleCategories.map((category) => ({
    Category: category,
    "Current Count": currentCounts.get(category) || 0,
    "Previous Count": previousCounts.get(category) || 0,
    "Net Change": (currentCounts.get(category) || 0) - (previousCounts.get(category) || 0),
  })).filter((row) => row["Current Count"] > 0 || row["Previous Count"] > 0);
}

function countCategories(rows) {
  const counts = new Map();
  for (const row of rows) {
    const category = categorizeTitle(row.Title);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

function buildNewCompaniesRows(current, previous, companyNormalization) {
  const previousCompanies = new Set(previous.rows.map((row) => displayRowCompany(row, companyNormalization)));
  const currentGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  return [...currentGroups.entries()]
    .filter(([company]) => !previousCompanies.has(company))
    .map(([company, rows]) => {
      const topRow = [...rows].sort(compareRowsByScore)[0] || {};
      return {
        Company: company,
        "Current Jobs": rows.length,
        "Top Title": topRow.Title || "",
        "Top URL": topRow["Apply Link"] || "",
      };
    })
    .sort((left, right) => Number(right["Current Jobs"]) - Number(left["Current Jobs"]) || left.Company.localeCompare(right.Company));
}

function buildCompanyMoversRows(companyRows) {
  return companyRows
    .map((row) => ({
      Company: row.Company,
      "Previous Jobs": row["Previous Jobs"],
      "Current Jobs": row["Current Jobs"],
      "Net Change": row["Net Change"],
    }))
    .filter((row) => Number(row["Net Change"]) !== 0)
    .sort((left, right) => Math.abs(Number(right["Net Change"])) - Math.abs(Number(left["Net Change"]))
      || Number(right["Current Jobs"]) - Number(left["Current Jobs"])
      || left.Company.localeCompare(right.Company));
}

function buildRepeatHiringCompanyRows(snapshots, current, companyNormalization) {
  const snapshotPresence = new Map();
  for (const snapshot of snapshots) {
    const companies = new Set(snapshot.rows.map((row) => displayRowCompany(row, companyNormalization)));
    for (const company of companies) {
      snapshotPresence.set(company, (snapshotPresence.get(company) || 0) + 1);
    }
  }

  const currentGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  return [...snapshotPresence.entries()]
    .filter(([, count]) => count >= 3)
    .map(([company, snapshotsPresent]) => {
      const currentRows = currentGroups.get(company) || [];
      return {
        Company: company,
        SnapshotsPresent: snapshotsPresent,
        CurrentJobs: currentRows.length,
        BestCurrentScore: currentRows.length ? Math.max(...currentRows.map((row) => numberValue(row["Writer Fit Score"]) || 0)) : "",
      };
    })
    .sort((left, right) => Number(right.CurrentJobs) - Number(left.CurrentJobs)
      || Number(right.SnapshotsPresent) - Number(left.SnapshotsPresent)
      || left.Company.localeCompare(right.Company));
}

function buildMarketHistoryRows(snapshots, companyNormalization) {
  return snapshots.map((snapshot) => ({
    Snapshot: snapshot.id,
    "Snapshot Date": snapshot.id,
    Jobs: snapshot.rows.length,
    Companies: new Set(snapshot.rows.map((row) => displayRowCompany(row, companyNormalization))).size,
    "Unique Titles": uniqueCount(snapshot.rows, "Title"),
    "Average Writer Fit Score": averageScore(snapshot.rows),
    "A Tier Count": tierCount(snapshot.rows, "A"),
    "B Tier Count": tierCount(snapshot.rows, "B"),
    "C Tier Count": tierCount(snapshot.rows, "C"),
  }));
}

function buildJobLifecycleRows(history, current, companyNormalization) {
  const currentKeys = new Set(current.keyedRows.keys());
  return [...history.values()]
    .map((entry) => {
      const latestRow = entry.rows[entry.rows.length - 1] || {};
      return {
        Title: latestRow.Title || "",
        Company: latestRow.Company ? displayRowCompany(latestRow, companyNormalization) : "",
        Location: latestRow.Location || "",
        "Apply Link": latestRow["Apply Link"] || "",
        "First Seen": entry.firstSeen,
        "Last Seen": entry.lastSeen,
        "Snapshot Count": entry.snapshotIds.length,
        "Currently Present": currentKeys.has(entry.key) ? "TRUE" : "FALSE",
        "Writer Fit Score": latestRow["Writer Fit Score"] || "",
        "Fit Tier": latestRow["Fit Tier"] || "",
        "Posted Date": latestRow["Posted Date"] || "",
        Source: latestRow.Source || "",
      };
    })
    .sort((left, right) => normalizeText(left.Company).localeCompare(normalizeText(right.Company))
      || normalizeText(left.Title).localeCompare(normalizeText(right.Title)));
}

function buildFreshnessRows(current) {
  const ageValues = current.rows.map((row) => numberValue(row["Age (Days)"])).filter((value) => value !== null);
  const sorted = [...ageValues].sort((left, right) => left - right);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[Math.floor(sorted.length / 2)]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : "";
  const average = ageValues.length ? ageValues.reduce((sum, value) => sum + value, 0) / ageValues.length : "";

  return [
    { Metric: "Jobs posted in last 7 days", Value: ageValues.filter((value) => value <= 7).length },
    { Metric: "Jobs posted in last 14 days", Value: ageValues.filter((value) => value <= 14).length },
    { Metric: "Jobs posted in last 30 days", Value: ageValues.filter((value) => value <= 30).length },
    { Metric: "Jobs with unknown posted date", Value: current.rows.length - ageValues.length },
    { Metric: "Median Age Days", Value: median === "" ? "" : formatNumber(median, 1) },
    { Metric: "Average Age Days", Value: average === "" ? "" : formatNumber(average, 1) },
    { Metric: "Oldest Posting Age Days", Value: sorted.length ? sorted[sorted.length - 1] : "" },
    { Metric: "Newest Posting Age Days", Value: sorted.length ? sorted[0] : "" },
  ];
}

function buildOutliers(current, previous, history, companyNormalization, snapshotCountTotal) {
  const rows = [];
  const previousKeys = new Set(previous.keyedRows.keys());
  const currentCompanyGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  const longRunningThreshold = Math.max(4, snapshotCountTotal - 1);

  for (const row of current.rows) {
    const age = numberValue(row["Age (Days)"]);
    const score = numberValue(row["Writer Fit Score"]);
    const key = normalizeJobKey(row);
    const entry = history.get(key);
    const snapshotCount = entry ? entry.snapshotIds.length : 1;
    const category = categorizeTitle(row.Title);
    const editorialCandidate = !["Adjacent Roles", "Unknown"].includes(category);

    if (editorialCandidate && age !== null && age >= 500) rows.push(outlierRow("EXTREME_OLD_POSTING", row, snapshotCount, `Posted age is ${age} days.`, companyNormalization));

    if (editorialCandidate && snapshotCount >= longRunningThreshold) rows.push(outlierRow("LONG_RUNNING_JOB", row, snapshotCount, `Appears in ${snapshotCount} package snapshots.`, companyNormalization));
    if (editorialCandidate && score !== null && score >= 85 && age !== null && age >= 90) {
      rows.push(outlierRow("HIGH_SCORE_OLD_JOB", row, snapshotCount, `Score ${score} with posted age ${age} days.`, companyNormalization));
    }
    if (editorialCandidate && entry && entry.snapshotIds.length >= 2 && !previousKeys.has(key)) {
      rows.push(outlierRow(
        "REAPPEARED_JOB",
        row,
        snapshotCount,
        `Seen before ${formatSnapshotLabel(current.id)}, absent from ${formatSnapshotLabel(previous.id)}, and present again now.`,
        companyNormalization,
      ));
    }
  }

  for (const [company, companyRows] of currentCompanyGroups.entries()) {
    if (companyRows.length < 3) continue;
    const row = [...companyRows].filter((item) => !["Adjacent Roles", "Unknown"].includes(categorizeTitle(item.Title))).sort(compareRowsByScore)[0];
    if (!row) continue;
    const entry = history.get(normalizeJobKey(row));
    rows.push(outlierRow("COMPANY_WITH_MANY_JOBS", row, entry ? entry.snapshotIds.length : 1, `${company} has ${companyRows.length} current good jobs.`, companyNormalization));
  }

  return rows.sort((left, right) => outlierRank(left["Outlier Type"]) - outlierRank(right["Outlier Type"])
    || Number(right["Writer Fit Score"] || 0) - Number(left["Writer Fit Score"] || 0)
    || Number(right["Age (Days)"] || 0) - Number(left["Age (Days)"] || 0));
}

function outlierRank(type) {
  return [
    "EXTREME_OLD_POSTING",
    "LONG_RUNNING_JOB",
    "HIGH_SCORE_OLD_JOB",
    "COMPANY_WITH_MANY_JOBS",
    "REAPPEARED_JOB",
  ].indexOf(type);
}

function outlierRow(type, row, snapshotCount, why, companyNormalization) {
  return {
    "Outlier Type": type,
    Title: row.Title || "",
    Company: displayRowCompany(row, companyNormalization),
    Location: row.Location || "",
    "Apply Link": row["Apply Link"] || "",
    "Writer Fit Score": row["Writer Fit Score"] || "",
    "Fit Tier": row["Fit Tier"] || "",
    "Age (Days)": row["Age (Days)"] || "",
    "Snapshot Count": snapshotCount,
    "Why Interesting": why,
  };
}

function buildRollingMetrics(snapshots, history, current, days, companyNormalization) {
  const currentTime = current.date.getTime();
  const windowStart = currentTime - (days * dayMs);
  const windowSnapshots = snapshots.filter((snapshot) => snapshot.date.getTime() >= windowStart && snapshot.date.getTime() <= currentTime);
  const uniqueKeys = new Set(windowSnapshots.flatMap((snapshot) => [...snapshot.keyedRows.keys()]));
  const firstSeenKeys = [...uniqueKeys].filter((key) => {
    const entry = history.get(key);
    return entry && entry.firstDate.getTime() >= windowStart && entry.firstDate.getTime() <= currentTime;
  });
  const companies = new Set();
  const companyCounts = new Map();

  for (const key of uniqueKeys) {
    const entry = history.get(key);
    const row = entry ? entry.rows[entry.rows.length - 1] : null;
    const company = row ? displayRowCompany(row, companyNormalization) : "Unknown";
    companies.add(company);
    companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  }

  return {
    days,
    snapshotsCounted: windowSnapshots.length,
    uniqueJobsSeen: uniqueKeys.size,
    newJobsFirstSeen: firstSeenKeys.length,
    companiesRepresented: companies.size,
    topCompanies: [...companyCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([company, count]) => ({ company, count })),
  };
}

function buildTrendRange(snapshots, options) {
  const current = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];
  let mode = options.rangeMode;
  let days = null;
  let startDate = null;
  let endDate = null;
  let included = [];
  let note = "";

  if (mode === "explicit") {
    startDate = options.startDate;
    endDate = options.endDate;
    included = snapshots.filter((snapshot) => snapshot.date.getTime() >= startDate.getTime() && snapshot.date.getTime() <= endDate.getTime());
  } else if (mode === "all") {
    startDate = snapshots[0].date;
    endDate = current.date;
    included = snapshots;
  } else if (mode === "current-previous") {
    startDate = previous.date;
    endDate = current.date;
    included = [previous, current];
  } else {
    days = mode === "weekly" ? 7 : options.days;
    startDate = new Date(current.date.getTime() - (days * dayMs));
    endDate = current.date;
    included = snapshots.filter((snapshot) => snapshot.date.getTime() >= startDate.getTime() && snapshot.date.getTime() <= endDate.getTime());
    const availableHistoryDays = Math.max(0, (current.date.getTime() - snapshots[0].date.getTime()) / dayMs);
    if (availableHistoryDays < days) {
      included = snapshots;
      note = days === 7
        ? "Available history is still shorter than 7 days, so this report uses all available snapshots."
        : `Available history is still shorter than ${days} days, so this report uses all available snapshots.`;
    }
  }

  if (included.length < 2) {
    throw new Error("Selected trend range must include at least two timestamped Google Sheets package snapshots.");
  }

  const includedIds = new Set(included.map((snapshot) => snapshot.id));
  const endSnapshot = included[included.length - 1];
  const previousSnapshot = included[included.length - 2];

  return {
    mode,
    days,
    label: trendRangeLabel(mode, days),
    startDate,
    endDate,
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
    note,
    snapshots: included,
    snapshotIds: included.map((snapshot) => snapshot.id),
    excludedSnapshotIds: snapshots.filter((snapshot) => !includedIds.has(snapshot.id)).map((snapshot) => snapshot.id),
    endSnapshot,
    previousSnapshot,
  };
}

function trendRangeLabel(mode, days) {
  if (mode === "weekly" || (mode === "days" && days === 7)) return "This Week";
  if (mode === "days") return `Last ${days} Days`;
  if (mode === "all") return "All Available History";
  if (mode === "current-previous") return "Latest Snapshot Change";
  if (mode === "explicit") return "Selected Date Range";
  return "Selected Range";
}

function rangePhrase(weeklyContext) {
  const label = weeklyContext.trendRange.label;
  if (label === "This Week") return "this week";
  if (label.startsWith("Last ")) return `the ${label.toLowerCase()}`;
  if (label === "All Available History") return "all available history";
  if (label === "Latest Snapshot Change") return "the latest snapshot change";
  if (label === "Selected Date Range") return "the selected date range";
  return "the selected range";
}

function movementHeading(weeklyContext) {
  return `## Movement: ${weeklyContext.trendRange.label}`;
}

function droppedHeading(weeklyContext) {
  const label = weeklyContext.trendRange.label;
  if (label === "This Week") return "## Dropped This Week";
  return `## Dropped In ${label}`;
}

function reportRangeSection(weeklyContext) {
  const range = weeklyContext.trendRange;
  return [
    "## Report Range",
    "",
    `- Range label: ${range.label}`,
    `- Range mode: ${range.mode}`,
    `- Range days: ${range.days === null ? "n/a" : range.days}`,
    `- Start: ${formatDateTimeDisplay(range.startIso)}`,
    `- End: ${formatDateTimeDisplay(range.endIso)}`,
    `- Snapshots included (${range.snapshotIds.length}): ${range.snapshotIds.map(formatSnapshotLabel).join(", ")}`,
    ...(range.note ? [`- ${range.note}`] : []),
    "",
  ];
}

function buildWeeklyContext(snapshots, history, current, companyNormalization, trendRange) {
  const activeWeeklySnapshots = trendRange.snapshots;
  const currentTime = current.date.getTime();
  const earliest = snapshots[0];
  const availableHistoryDays = earliest && earliest.date
    ? Math.max(0, (currentTime - earliest.date.getTime()) / dayMs)
    : 0;
  const weeklyStart = activeWeeklySnapshots[0];
  const weeklySnapshotIds = new Set(activeWeeklySnapshots.map((snapshot) => snapshot.id));
  const weeklyKeys = new Set(activeWeeklySnapshots.flatMap((snapshot) => [...snapshot.keyedRows.keys()]));
  const currentKeys = new Set(current.keyedRows.keys());
  const weeklyFirstSeenKeys = [...weeklyKeys].filter((key) => {
    const entry = history.get(key);
    return entry && entry.firstDate.getTime() >= weeklyStart.date.getTime() && entry.firstDate.getTime() <= currentTime;
  });
  const weeklyDroppedKeys = [...weeklyKeys].filter((key) => !currentKeys.has(key));
  const weeklyPersistentKeys = [...weeklyKeys].filter((key) => activeWeeklySnapshots.every((snapshot) => snapshot.keyedRows.has(key)));
  const weeklyReappearedKeys = [...currentKeys].filter((key) => reappearedInWeeklyWindow(key, snapshots, activeWeeklySnapshots));
  const weeklyCompanies = new Set();

  for (const snapshot of activeWeeklySnapshots) {
    for (const row of snapshot.rows) {
      weeklyCompanies.add(displayRowCompany(row, companyNormalization));
    }
  }

  const companyFirstSeen = buildCompanyFirstSeen(snapshots, companyNormalization);
  const currentCompanyGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  const weeklyNewCompanyNames = [...currentCompanyGroups.keys()].filter((company) => {
    const entry = companyFirstSeen.get(company);
    return entry && entry.date.getTime() >= weeklyStart.date.getTime() && entry.date.getTime() <= currentTime;
  });

  const metrics = {
    WeeklySnapshotCount: activeWeeklySnapshots.length,
    WeeklyStartSnapshot: weeklyStart.id,
    WeeklyEndSnapshot: current.id,
    WeeklyUniqueJobsSeen: weeklyKeys.size,
    WeeklyCurrentJobs: current.rows.length,
    WeeklyFirstSeenJobs: weeklyFirstSeenKeys.length,
    WeeklyDroppedJobs: weeklyDroppedKeys.length,
    WeeklyNetChange: current.rows.length - weeklyStart.rows.length,
    WeeklyCompaniesRepresented: weeklyCompanies.size,
    WeeklyNewCompanies: weeklyNewCompanyNames.length,
    WeeklyPersistentJobs: weeklyPersistentKeys.length,
    WeeklyReappearedJobs: weeklyReappearedKeys.length,
    AvailableHistoryDays: formatNumber(availableHistoryDays, 1),
    WeeklyWindowNote: trendRange.note,
  };

  return {
    trendRange,
    snapshots: activeWeeklySnapshots,
    snapshotIds: activeWeeklySnapshots.map((snapshot) => snapshot.id),
    startSnapshot: weeklyStart,
    endSnapshot: current,
    weeklySnapshotIds,
    weeklyKeys,
    weeklyFirstSeenKeys,
    weeklyDroppedKeys,
    weeklyPersistentKeys,
    weeklyReappearedKeys,
    weeklyNewCompanyNames,
    metrics,
  };
}

function reappearedInWeeklyWindow(key, snapshots, weeklySnapshots) {
  let seenBefore = false;
  let missingInWeeklyAfterSeen = false;
  const weeklyIds = new Set(weeklySnapshots.map((snapshot) => snapshot.id));
  const current = weeklySnapshots[weeklySnapshots.length - 1];
  if (!current || !current.keyedRows.has(key)) return false;

  for (const snapshot of snapshots) {
    const present = snapshot.keyedRows.has(key);
    if (weeklyIds.has(snapshot.id) && !present && seenBefore) {
      missingInWeeklyAfterSeen = true;
    }
    if (present) seenBefore = true;
    if (snapshot.id === current.id) break;
  }

  return missingInWeeklyAfterSeen;
}

function buildCompanyFirstSeen(snapshots, companyNormalization) {
  const firstSeen = new Map();
  for (const snapshot of snapshots) {
    const companies = new Set(snapshot.rows.map((row) => displayRowCompany(row, companyNormalization)));
    for (const company of companies) {
      if (!firstSeen.has(company)) firstSeen.set(company, { snapshot: snapshot.id, date: snapshot.date });
    }
  }
  return firstSeen;
}

function buildWeeklyNewJobsRows(weeklyContext, history, companyNormalization) {
  return weeklyContext.weeklyFirstSeenKeys
    .map((key) => {
      const entry = history.get(key);
      const row = entry ? entry.rows[0] : null;
      if (!entry || !row) return null;
      return {
        Title: row.Title || "",
        Company: displayRowCompany(row, companyNormalization),
        Location: row.Location || "",
        "Apply Link": row["Apply Link"] || "",
        "Writer Fit Score": row["Writer Fit Score"] || "",
        "Fit Tier": row["Fit Tier"] || "",
        "Why It Matched": row["Why It Matched"] || "",
        "First Seen": entry.firstSeen,
        "Posted Date": row["Posted Date"] || "",
        "Age (Days)": row["Age (Days)"] || "",
        Source: row.Source || "",
      };
    })
    .filter(Boolean)
    .sort(compareRowsByScore);
}

function buildWeeklyDroppedJobsRows(weeklyContext, history, companyNormalization) {
  return weeklyContext.weeklyDroppedKeys
    .map((key) => {
      const seen = lastSeenInSnapshots(key, weeklyContext.snapshots);
      const entry = history.get(key);
      if (!seen || !seen.row) return null;
      const row = seen.row;
      return {
        Title: row.Title || "",
        Company: displayRowCompany(row, companyNormalization),
        Location: row.Location || "",
        "Apply Link": row["Apply Link"] || "",
        "Last Seen": seen.snapshot.id,
        "Snapshot Count": entry ? entry.snapshotIds.filter((id) => weeklyContext.weeklySnapshotIds.has(id)).length : "",
        "Previous Writer Fit Score": row["Writer Fit Score"] || "",
        "Previous Fit Tier": row["Fit Tier"] || "",
        "Possible Reason": "Not present in current Good Documentation Jobs output",
      };
    })
    .filter(Boolean)
    .sort(compareRowsByScore);
}

function buildWeeklyPersistentJobsRows(weeklyContext, current, history, companyNormalization) {
  return weeklyContext.weeklyPersistentKeys
    .map((key) => {
      const row = current.keyedRows.get(key);
      const entry = history.get(key);
      if (!row) return null;
      return {
        Title: row.Title || "",
        Company: displayRowCompany(row, companyNormalization),
        Location: row.Location || "",
        "Apply Link": row["Apply Link"] || "",
        "Writer Fit Score": row["Writer Fit Score"] || "",
        "Fit Tier": row["Fit Tier"] || "",
        "First Seen": entry ? entry.firstSeen : weeklyContext.startSnapshot.id,
        "Last Seen": current.id,
        "Snapshot Count": weeklyContext.snapshots.length,
        "Age Days": row["Age (Days)"] || "",
        Source: row.Source || "",
      };
    })
    .filter(Boolean)
    .sort(compareRowsByScore);
}

function buildWeeklyNewCompaniesRows(weeklyContext, current, companyNormalization) {
  const currentGroups = groupRowsByDisplayCompany(current.rows, companyNormalization);
  return weeklyContext.weeklyNewCompanyNames
    .map((company) => {
      const rows = currentGroups.get(company) || [];
      const topRow = [...rows].sort(compareRowsByScore)[0] || {};
      return {
        Company: company,
        "First Seen": companyFirstSeenInWeekly(company, weeklyContext, companyNormalization),
        "Current Jobs": rows.length,
        "Top Current Title": topRow.Title || "",
        "Top Current URL": topRow["Apply Link"] || "",
      };
    })
    .sort((left, right) => Number(right["Current Jobs"]) - Number(left["Current Jobs"]) || left.Company.localeCompare(right.Company));
}

function companyFirstSeenInWeekly(company, weeklyContext, companyNormalization) {
  for (const snapshot of weeklyContext.snapshots) {
    if (snapshot.rows.some((row) => displayRowCompany(row, companyNormalization) === company)) return snapshot.id;
  }
  return weeklyContext.startSnapshot.id;
}

function buildWeeklyCompanyMovementRows(weeklyContext, weeklyNewJobsRows, weeklyDroppedJobsRows, companyNormalization) {
  const startGroups = groupRowsByDisplayCompany(weeklyContext.startSnapshot.rows, companyNormalization);
  const currentGroups = groupRowsByDisplayCompany(weeklyContext.endSnapshot.rows, companyNormalization);
  const weeklyNewCounts = new Map(countBy(weeklyNewJobsRows, (row) => row.Company));
  const weeklyDroppedCounts = new Map(countBy(weeklyDroppedJobsRows, (row) => row.Company));
  const companies = new Set([...startGroups.keys(), ...currentGroups.keys(), ...weeklyNewCounts.keys(), ...weeklyDroppedCounts.keys()]);

  return [...companies].map((company) => {
    const currentRows = currentGroups.get(company) || [];
    const topRow = [...currentRows].sort(compareRowsByScore)[0] || {};
    return {
      Company: company,
      "Start Jobs": (startGroups.get(company) || []).length,
      "Current Jobs": currentRows.length,
      "Net Change": currentRows.length - (startGroups.get(company) || []).length,
      "Weekly First-Seen Jobs": weeklyNewCounts.get(company) || 0,
      "Weekly Dropped Jobs": weeklyDroppedCounts.get(company) || 0,
      "Top Current Title": topRow.Title || "",
      "Top Current URL": topRow["Apply Link"] || "",
    };
  }).sort((left, right) => Math.abs(Number(right["Net Change"])) - Math.abs(Number(left["Net Change"]))
    || Number(right["Current Jobs"]) - Number(left["Current Jobs"])
    || left.Company.localeCompare(right.Company));
}

function buildWeeklyTitleCategoryMovementRows(weeklyContext, weeklyNewJobsRows, weeklyDroppedJobsRows) {
  const startCounts = countCategories(weeklyContext.startSnapshot.rows);
  const currentCounts = countCategories(weeklyContext.endSnapshot.rows);
  const weeklyNewCounts = countCategories(weeklyNewJobsRows);
  const weeklyDroppedCounts = countCategories(weeklyDroppedJobsRows);

  return titleCategories.map((category) => ({
    Category: category,
    "Start Count": startCounts.get(category) || 0,
    "Current Count": currentCounts.get(category) || 0,
    "Net Change": (currentCounts.get(category) || 0) - (startCounts.get(category) || 0),
    "Weekly First-Seen Jobs": weeklyNewCounts.get(category) || 0,
    "Weekly Dropped Jobs": weeklyDroppedCounts.get(category) || 0,
  })).filter((row) => row["Start Count"] > 0 || row["Current Count"] > 0 || row["Weekly First-Seen Jobs"] > 0 || row["Weekly Dropped Jobs"] > 0);
}

function lastSeenInSnapshots(key, snapshots) {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    const row = snapshot.keyedRows.get(key);
    if (row) return { snapshot, row };
  }
  return null;
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = getter(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function publicSheetLink(publicSheet) {
  if (!publicSheet.publicSheetUrl) return publicSheet.publicSheetLabel;
  return `[${publicSheet.publicSheetLabel}](${publicSheet.publicSheetUrl})`;
}

function publicSheetSection(publicSheet) {
  return [
    "## Public Sheet",
    "",
    `Read the latest ${publicSheetLink(publicSheet)} sheet.`,
    "",
    `The sheet is ${String(publicSheet.updateCadence || "").replace(/^Updated/i, "updated")} and includes:`,
    "",
    ...publicSheet.tabs.map((tab) => `- ${tab.name}: ${tab.description}`),
    "",
  ];
}

function buildWeeklyMarkdown({
  summaryRow,
  weeklyContext,
  rollingMetrics,
  weeklyNewJobsRows,
  weeklyDroppedJobsRows,
  weeklyCompanyMovementRows,
  freshnessRows,
  outlierRows,
  weeklyTitleCategoryRows,
  publicSheet,
}) {
  const metrics = weeklyContext.metrics;
  const range = weeklyContext.trendRange;
  const phrase = rangePhrase(weeklyContext);
  return [
    "# Trend Summary",
    "",
    `Generated: ${formatDateTimeDisplay(summaryRow.GeneratedAt)}`,
    "",
    ...reportRangeSection(weeklyContext),
    ...publicSheetSection(publicSheet),
    `## ${range.label} Snapshot Summary`,
    "",
    `- Range window: ${formatSnapshotLabel(metrics.WeeklyStartSnapshot)} to ${formatSnapshotLabel(metrics.WeeklyEndSnapshot)}`,
    `- Snapshots counted: ${metrics.WeeklySnapshotCount}`,
    `- Current good documentation jobs: ${metrics.WeeklyCurrentJobs}`,
    `- Unique jobs seen in ${phrase}: ${metrics.WeeklyUniqueJobsSeen}`,
    `- Jobs first seen in ${phrase}: ${metrics.WeeklyFirstSeenJobs}`,
    `- Jobs dropped from current output in ${phrase}: ${metrics.WeeklyDroppedJobs}`,
    `- Net change over ${phrase}: ${signed(metrics.WeeklyNetChange)}`,
    `- Companies represented in ${phrase}: ${metrics.WeeklyCompaniesRepresented}`,
    `- New companies in ${phrase}: ${metrics.WeeklyNewCompanies}`,
    `- Persistent jobs in ${phrase}: ${metrics.WeeklyPersistentJobs}`,
    `- Reappeared jobs in ${phrase}: ${metrics.WeeklyReappearedJobs}`,
    "",
    "## Previous Snapshot Check",
    "",
    `- Previous snapshot: ${formatSnapshotLabel(summaryRow.PreviousSnapshot)}`,
    `- Previous-snapshot net change: ${signed(summaryRow.NetChange)}`,
    `- Previous-snapshot new jobs: ${summaryRow.NewJobs}`,
    `- Previous-snapshot removed jobs: ${summaryRow.RemovedJobs}`,
    `- A/B/C tier counts: ${summaryRow.ATierCount}/${summaryRow.BTierCount}/${summaryRow.CTierCount}`,
    "",
    "## Job Categories",
    "",
    ...listOrNone(weeklyTitleCategoryRows.map((row) => (
      `- ${row.Category}: ${row["Current Count"]} current, ${row["Start Count"]} at range start, ${signed(row["Net Change"])}`
    ))),
    "",
    "## Rolling Windows",
    "",
    ...rollingMetrics.flatMap((metric) => [
      `### Last ${metric.days} days`,
      "",
      `- Snapshots counted: ${metric.snapshotsCounted}`,
      `- Unique jobs seen: ${metric.uniqueJobsSeen}`,
      `- New jobs first seen: ${metric.newJobsFirstSeen}`,
      `- Companies represented: ${metric.companiesRepresented}`,
      `- Top companies: ${formatTopCompanies(metric.topCompanies)}`,
      "",
    ]),
    "## Top First-Seen Titles",
    "",
    ...listOrNone(countBy(weeklyNewJobsRows, (row) => cleanText(row.Title)).slice(0, 8).map(([title, count]) => `- ${title}: ${count}`)),
    "",
    movementHeading(weeklyContext),
    "",
    ...listOrNone(weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) !== 0).slice(0, 10).map((row) => (
      `- ${row.Company}: ${row["Start Jobs"]} to ${row["Current Jobs"]} (${signed(row["Net Change"])})`
    ))),
    "",
    droppedHeading(weeklyContext),
    "",
    ...listOrNone(weeklyDroppedJobsRows.slice(0, 8).map((row) => `- ${row.Title} at ${row.Company}`)),
    "",
    "## Freshness",
    "",
    ...freshnessRows.map((row) => `- ${row.Metric}: ${row.Value}`),
    "",
    "## Outliers",
    "",
    ...listOrNone(outlierRows.slice(0, 10).map((row) => `- ${row["Outlier Type"]}: ${row.Title} at ${row.Company} (${row["Why Interesting"]})`)),
    "",
  ].join("\n");
}

function buildEditorInsights({
  summaryRow,
  weeklyContext,
  weeklyTitleCategoryRows,
  weeklyCompanyMovementRows,
  companyRows,
  freshnessRows,
  outlierRows,
  weeklyNewCompanyRows,
}) {
  const insights = [];
  const metrics = weeklyContext.metrics;
  const phrase = rangePhrase(weeklyContext);
  const label = weeklyContext.trendRange.label;
  const categoryRows = weeklyTitleCategoryRows.filter((row) => Number(row["Current Count"]) > 0);
  const largestCategory = categoryRows.sort((left, right) => Number(right["Current Count"]) - Number(left["Current Count"]))[0];
  const biggestCategoryIncrease = [...weeklyTitleCategoryRows].sort((left, right) => Number(right["Net Change"]) - Number(left["Net Change"]))[0];
  const biggestCategoryDecrease = [...weeklyTitleCategoryRows].sort((left, right) => Number(left["Net Change"]) - Number(right["Net Change"]))[0];
  const topCompany = companyRows.filter((row) => Number(row["Current Jobs"]) > 0)[0];
  const topWeeklyGainer = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) > 0)
    .sort((left, right) => Number(right["Net Change"]) - Number(left["Net Change"]) || left.Company.localeCompare(right.Company))[0];
  const topWeeklyDecliner = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) < 0)
    .sort((left, right) => Number(left["Net Change"]) - Number(right["Net Change"]) || left.Company.localeCompare(right.Company))[0];
  const freshness = Object.fromEntries(freshnessRows.map((row) => [row.Metric, Number(row.Value) || 0]));
  const extremeOldCount = outlierRows.filter((row) => row["Outlier Type"] === "EXTREME_OLD_POSTING").length;
  const longRunningCount = outlierRows.filter((row) => row["Outlier Type"] === "LONG_RUNNING_JOB").length;

  insights.push(`${metrics.WeeklyFirstSeenJobs} jobs were first seen during ${phrase}.`);
  insights.push(`${metrics.WeeklyDroppedJobs} jobs appeared during ${phrase} but are not present in the current output.`);

  if (Number(metrics.WeeklyNetChange) === 0) {
    insights.push(`The current job count was unchanged from the start of ${phrase}.`);
  } else {
    insights.push(`The current job count changed by ${signed(metrics.WeeklyNetChange)} from the start of ${phrase}.`);
  }

  if (largestCategory) {
    insights.push(`${largestCategory.Category} is the largest category with ${largestCategory["Current Count"]} current jobs.`);
  }

  if (biggestCategoryIncrease && Number(biggestCategoryIncrease["Net Change"]) > 0) {
    insights.push(`${biggestCategoryIncrease.Category} increased by ${biggestCategoryIncrease["Net Change"]} jobs during ${phrase}.`);
  }

  if (biggestCategoryDecrease && Number(biggestCategoryDecrease["Net Change"]) < 0) {
    insights.push(`${biggestCategoryDecrease.Category} decreased by ${Math.abs(Number(biggestCategoryDecrease["Net Change"]))} jobs during ${phrase}.`);
  }

  if (topCompany) {
    insights.push(`${topCompany.Company} has the largest number of active documentation-related openings with ${topCompany["Current Jobs"]} current jobs.`);
  }

  if (topWeeklyGainer) {
    insights.push(`${topWeeklyGainer.Company} had the largest ${label} company increase at ${signed(topWeeklyGainer["Net Change"])} jobs.`);
  }

  if (topWeeklyDecliner) {
    insights.push(`${topWeeklyDecliner.Company} had the largest ${label} company decrease at ${signed(topWeeklyDecliner["Net Change"])} jobs.`);
  }

  insights.push(`${freshness["Jobs posted in last 7 days"] || 0} jobs were posted within the last 7 days.`);

  if (weeklyNewCompanyRows.length > 0) {
    insights.push(`${weeklyNewCompanyRows.length} companies with current jobs first appeared during ${phrase}.`);
  }

  if (extremeOldCount > 0) {
    insights.push(`${extremeOldCount} jobs have posting ages of 500 days or more.`);
  }

  if (longRunningCount > 0) {
    insights.push(`${longRunningCount} outlier rows are jobs that appear in at least four package snapshots.`);
  }

  if (Number(summaryRow.NetChange) === 0) {
    insights.push("The total number of current good documentation jobs was unchanged from the previous snapshot.");
  } else {
    insights.push(`The total number of current good documentation jobs changed by ${signed(summaryRow.NetChange)} since the previous snapshot.`);
  }

  return insights.map((insight) => ({ Insight: insight }));
}

function buildEditorInsightsMarkdown(editorInsightRows) {
  return [
    "# Editor Insights",
    "",
    ...listOrNone(editorInsightRows.map((row) => `- ${row.Insight}`)),
    "",
  ].join("\n");
}

function buildWeeklySubstackReport({
  summaryRow,
  weeklyContext,
  companyRows,
  weeklyTitleCategoryRows,
  weeklyNewCompanyRows,
  weeklyCompanyMovementRows,
  freshnessRows,
  outlierRows,
  editorInsightRows,
  publicSheet,
}) {
  const metrics = weeklyContext.metrics;
  const range = weeklyContext.trendRange;
  const phrase = rangePhrase(weeklyContext);
  const topCompanies = companyRows.filter((row) => row["Current Jobs"] > 0).slice(0, 10);
  const topGainers = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) > 0)
    .sort((left, right) => Number(right["Net Change"]) - Number(left["Net Change"]) || left.Company.localeCompare(right.Company))
    .slice(0, 10);
  const topDecliners = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) < 0)
    .sort((left, right) => Number(left["Net Change"]) - Number(right["Net Change"]) || left.Company.localeCompare(right.Company))
    .slice(0, 10);
  const freshness = Object.fromEntries(freshnessRows.map((row) => [row.Metric, row.Value]));

  return [
    "# Documentation Jobs Market Snapshot",
    "",
    ...reportRangeSection(weeklyContext),
    `## ${range.label} at a Glance`,
    "",
    `This report uses ${metrics.WeeklySnapshotCount} package snapshots from ${formatSnapshotLabel(metrics.WeeklyStartSnapshot)} through ${formatSnapshotLabel(metrics.WeeklyEndSnapshot)}.`,
    "",
    `Current good documentation jobs: ${metrics.WeeklyCurrentJobs}`,
    `Unique jobs seen in ${phrase}: ${metrics.WeeklyUniqueJobsSeen}`,
    `Jobs first seen in ${phrase}: ${metrics.WeeklyFirstSeenJobs}`,
    `Jobs dropped from current output in ${phrase}: ${metrics.WeeklyDroppedJobs}`,
    `Net change over ${phrase}: ${signed(metrics.WeeklyNetChange)}`,
    `Companies represented in ${phrase}: ${metrics.WeeklyCompaniesRepresented}`,
    `New companies with current jobs: ${metrics.WeeklyNewCompanies}`,
    "",
    movementHeading(weeklyContext),
    "",
    `${metrics.WeeklyFirstSeenJobs} jobs first appeared during ${phrase}, while ${metrics.WeeklyDroppedJobs} jobs appeared in ${phrase} but are not present in the current output. The current list is ${signed(metrics.WeeklyNetChange)} jobs compared with the first snapshot in the selected range.`,
    "",
    `For operational checks, the newest snapshot (${formatSnapshotLabel(summaryRow.CurrentSnapshot)}) is also compared with the previous snapshot (${formatSnapshotLabel(summaryRow.PreviousSnapshot)}): ${summaryRow.NewJobs} new, ${summaryRow.RemovedJobs} dropped, ${signed(summaryRow.NetChange)} net.`,
    "",
    "## Job Categories",
    "",
    ...listOrNone(weeklyTitleCategoryRows.map((row) => (
      `- ${row.Category}: ${row["Current Count"]} current, ${row["Start Count"]} at range start, ${signed(row["Net Change"])} net`
    ))),
    "",
    "## New Companies Hiring Documentation Talent",
    "",
    ...listOrNone(weeklyNewCompanyRows.slice(0, 10).map((row) => `- ${row.Company}: ${row["Current Jobs"]} current jobs; top role: ${row["Top Current Title"]}`)),
    "",
    "## Companies Hiring the Most",
    "",
    ...listOrNone(topCompanies.map((row, index) => `${index + 1}. ${row.Company} (${row["Current Jobs"]})`)),
    "",
    "## Biggest Movers",
    "",
    "### Top Gainers",
    "",
    ...listOrNone(topGainers.map((row) => `- ${row.Company}: ${row["Start Jobs"]} -> ${row["Current Jobs"]} (${signed(row["Net Change"])})`)),
    "",
    "### Top Decliners",
    "",
    ...listOrNone(topDecliners.map((row) => `- ${row.Company}: ${row["Start Jobs"]} -> ${row["Current Jobs"]} (${signed(row["Net Change"])})`)),
    "",
    "## Freshness",
    "",
    `- ${freshness["Jobs posted in last 7 days"] || 0} jobs appear to have been posted in the last 7 days.`,
    `- ${freshness["Jobs posted in last 14 days"] || 0} jobs appear to have been posted in the last 14 days.`,
    `- ${freshness["Jobs with unknown posted date"] || 0} jobs have unknown posted dates.`,
    `- Median posting age: ${freshness["Median Age Days"] || ""} days.`,
    "",
    "## Weird / Worth Noting",
    "",
    ...listOrNone(outlierRows.slice(0, 8).map((row) => `- ${row["Outlier Type"]}: ${row.Title} at ${row.Company} (${row["Why Interesting"]})`)),
    "",
    "## Editor Insights",
    "",
    ...listOrNone(editorInsightRows.map((row) => `- ${row.Insight}`)),
    "",
    "## Link to Sheet",
    "",
    publicSheetLink(publicSheet),
    "",
    `The sheet is ${String(publicSheet.updateCadence || "").replace(/^Updated/i, "updated")} and includes:`,
    "",
    ...publicSheet.tabs.map((tab) => `- ${tab.name}: ${tab.description}`),
    "",
  ].join("\n");
}

function buildSubstackNotes(args) {
  const {
    weeklyContext,
    weeklyCompanyMovementRows,
    freshnessRows,
    outlierRows,
    publicSheet,
  } = args;
  const metrics = weeklyContext.metrics;
  const range = weeklyContext.trendRange;
  const phrase = rangePhrase(weeklyContext);
  const topGainer = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) > 0)
    .sort((left, right) => Number(right["Net Change"]) - Number(left["Net Change"]) || left.Company.localeCompare(right.Company))[0];
  const topDecliner = weeklyCompanyMovementRows.filter((row) => Number(row["Net Change"]) < 0)
    .sort((left, right) => Number(left["Net Change"]) - Number(right["Net Change"]) || left.Company.localeCompare(right.Company))[0];
  const freshness = Object.fromEntries(freshnessRows.map((row) => [row.Metric, row.Value]));

  return [
    "# Substack Notes",
    "",
    ...reportRangeSection(weeklyContext),
    `${range.label}: ${formatSnapshotLabel(metrics.WeeklyStartSnapshot)} to ${formatSnapshotLabel(metrics.WeeklyEndSnapshot)}`,
    "",
    "## Lead Numbers",
    "",
    `- Current jobs: ${metrics.WeeklyCurrentJobs}`,
    `- First seen in ${phrase}: ${metrics.WeeklyFirstSeenJobs}`,
    `- Dropped from current output in ${phrase}: ${metrics.WeeklyDroppedJobs}`,
    `- Net change over ${phrase}: ${signed(metrics.WeeklyNetChange)}`,
    `- New companies with current jobs: ${metrics.WeeklyNewCompanies}`,
    "",
    "## Biggest Movers",
    "",
    ...(topGainer ? [`- Top gainer: ${topGainer.Company} (${topGainer["Start Jobs"]} -> ${topGainer["Current Jobs"]}, ${signed(topGainer["Net Change"])})`] : ["- Top gainer: none."]),
    ...(topDecliner ? [`- Top decliner: ${topDecliner.Company} (${topDecliner["Start Jobs"]} -> ${topDecliner["Current Jobs"]}, ${signed(topDecliner["Net Change"])})`] : ["- Top decliner: none."]),
    "",
    "## Freshness",
    "",
    `- Posted in last 7 days: ${freshness["Jobs posted in last 7 days"] || 0}`,
    `- Posted in last 14 days: ${freshness["Jobs posted in last 14 days"] || 0}`,
    `- Unknown posted date: ${freshness["Jobs with unknown posted date"] || 0}`,
    "",
    "## Weird / Worth Noting",
    "",
    ...listOrNone(outlierRows.slice(0, 5).map((row) => `- ${row["Outlier Type"]}: ${row.Title} at ${row.Company} (${row["Why Interesting"]})`)),
    "",
    "## Link to Sheet",
    "",
    publicSheetLink(publicSheet),
    "",
  ].join("\n");
}

function signed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number > 0 ? `+${number}` : String(number);
}

function formatTopCompanies(companies) {
  return companies.length ? companies.map((row) => `${row.company} (${row.count})`).join(", ") : "none";
}

function listOrNone(items) {
  return items.length ? items : ["- None."];
}

function formatSnapshotOrDateTimeDisplay(value) {
  return formatSnapshotLabel(value) || formatDateTimeDisplay(value);
}

function formatTrendCsvValue(column, value) {
  if (value === null || value === undefined || value === "") return "";
  if (["CurrentSnapshot", "PreviousSnapshot", "Snapshot", "First Seen", "Last Seen"].includes(column)) {
    return formatSnapshotOrDateTimeDisplay(value);
  }
  if (column === "GeneratedAt" || column === "Last Checked") return formatDateTimeDisplay(value);
  if (column === "Posted Date" || column === "Snapshot Date") return formatDateDisplay(value);
  return value;
}

function displayCsvRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([column, value]) => [column, formatTrendCsvValue(column, value)]),
  ));
}

async function writeOutputs(outputDir, outputs) {
  await ensureDir(outputDir);
  await fs.writeFile(path.join(outputDir, "weekly-trend-summary.md"), outputs.weeklyMarkdown, "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-trend-summary.csv"), rowsToCsv(summaryColumns, displayCsvRows([outputs.summaryRow])), "utf8");
  await fs.writeFile(path.join(outputDir, "new-jobs.csv"), rowsToCsv(jobColumns, displayCsvRows(outputs.newJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "removed-jobs.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Previous Writer Fit Score",
    "Previous Fit Tier",
    "Last Seen",
    "Possible Reason",
  ], displayCsvRows(outputs.removedJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "continuing-jobs.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Writer Fit Score",
    "Fit Tier",
    "First Seen",
    "Last Seen",
    "Snapshot Count",
    "Age (Days)",
    "Source",
  ], displayCsvRows(outputs.continuingJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-new-jobs.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Writer Fit Score",
    "Fit Tier",
    "Why It Matched",
    "First Seen",
    "Posted Date",
    "Age (Days)",
    "Source",
  ], displayCsvRows(outputs.weeklyNewJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-dropped-jobs.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Last Seen",
    "Snapshot Count",
    "Previous Writer Fit Score",
    "Previous Fit Tier",
    "Possible Reason",
  ], displayCsvRows(outputs.weeklyDroppedJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-persistent-jobs.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Writer Fit Score",
    "Fit Tier",
    "First Seen",
    "Last Seen",
    "Snapshot Count",
    "Age Days",
    "Source",
  ], displayCsvRows(outputs.weeklyPersistentJobsRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-new-companies.csv"), rowsToCsv([
    "Company",
    "First Seen",
    "Current Jobs",
    "Top Current Title",
    "Top Current URL",
  ], displayCsvRows(outputs.weeklyNewCompanyRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-company-movement.csv"), rowsToCsv([
    "Company",
    "Start Jobs",
    "Current Jobs",
    "Net Change",
    "Weekly First-Seen Jobs",
    "Weekly Dropped Jobs",
    "Top Current Title",
    "Top Current URL",
  ], displayCsvRows(outputs.weeklyCompanyMovementRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-title-category-movement.csv"), rowsToCsv([
    "Category",
    "Start Count",
    "Current Count",
    "Net Change",
    "Weekly First-Seen Jobs",
    "Weekly Dropped Jobs",
  ], displayCsvRows(outputs.weeklyTitleCategoryRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "market-history.csv"), rowsToCsv([
    "Snapshot",
    "Snapshot Date",
    "Jobs",
    "Companies",
    "Unique Titles",
    "Average Writer Fit Score",
    "A Tier Count",
    "B Tier Count",
    "C Tier Count",
  ], displayCsvRows(outputs.marketHistoryRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "job-lifecycle.csv"), rowsToCsv([
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "First Seen",
    "Last Seen",
    "Snapshot Count",
    "Currently Present",
    "Writer Fit Score",
    "Fit Tier",
    "Posted Date",
    "Source",
  ], displayCsvRows(outputs.jobLifecycleRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "company-trends.csv"), rowsToCsv([
    "Company",
    "Current Jobs",
    "Previous Jobs",
    "Net Change",
    "New Jobs",
    "Removed Jobs",
    "Best Current Score",
    "Top Current Title",
    "Top Current URL",
  ], displayCsvRows(outputs.companyRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "title-trends.csv"), rowsToCsv([
    "Normalized Title",
    "Current Count",
    "Previous Count",
    "Net Change",
    "Example Company",
    "Example URL",
  ], displayCsvRows(outputs.titleRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "title-category-summary.csv"), rowsToCsv([
    "Category",
    "Current Count",
    "Previous Count",
    "Net Change",
  ], displayCsvRows(outputs.titleCategoryRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "new-companies.csv"), rowsToCsv([
    "Company",
    "Current Jobs",
    "Top Title",
    "Top URL",
  ], displayCsvRows(outputs.newCompanyRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "company-movers.csv"), rowsToCsv([
    "Company",
    "Previous Jobs",
    "Current Jobs",
    "Net Change",
  ], displayCsvRows(outputs.companyMoverRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "repeat-hiring-companies.csv"), rowsToCsv([
    "Company",
    "SnapshotsPresent",
    "CurrentJobs",
    "BestCurrentScore",
  ], displayCsvRows(outputs.repeatHiringCompanyRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "freshness-trends.csv"), rowsToCsv(["Metric", "Value"], displayCsvRows(outputs.freshnessRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "outliers.csv"), rowsToCsv([
    "Outlier Type",
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Writer Fit Score",
    "Fit Tier",
    "Age (Days)",
    "Snapshot Count",
    "Why Interesting",
  ], displayCsvRows(outputs.outlierRows)), "utf8");
  await fs.writeFile(path.join(outputDir, "editor-insights.md"), buildEditorInsightsMarkdown(outputs.editorInsightRows), "utf8");
  await fs.writeFile(path.join(outputDir, "substack-notes.md"), outputs.substackNotes, "utf8");
  await fs.writeFile(path.join(outputDir, "weekly-substack-report.md"), outputs.weeklySubstackReport, "utf8");
  await writeJsonFile(path.join(outputDir, "trend-manifest.json"), outputs.manifest);
}

function buildManifest({ generatedAt, current, previous, snapshots, outputs, publicSheet }) {
  return {
    GeneratedAt: generatedAt,
    GeneratedAtDisplay: formatDateTimeDisplay(generatedAt),
    PublicSheetUrl: publicSheet.publicSheetUrl || "",
    PublicSheetLabel: publicSheet.publicSheetLabel || "",
    UpdateCadence: publicSheet.updateCadence || "",
    PublicSheetTabs: publicSheet.tabs || [],
    CurrentSnapshot: current.id,
    CurrentSnapshotDisplay: formatSnapshotLabel(current.id),
    CurrentSnapshotPath: current.packageDir,
    PreviousSnapshot: previous.id,
    PreviousSnapshotDisplay: formatSnapshotLabel(previous.id),
    PreviousSnapshotPath: previous.packageDir,
    SnapshotCount: snapshots.length,
    SnapshotIds: snapshots.map((snapshot) => snapshot.id),
    ...outputs.weeklyContext.metrics,
    TrendRangeMode: outputs.weeklyContext.trendRange.mode,
    TrendRangeDays: outputs.weeklyContext.trendRange.days,
    TrendRangeStart: outputs.weeklyContext.trendRange.startIso,
    TrendRangeStartDisplay: formatDateTimeDisplay(outputs.weeklyContext.trendRange.startIso),
    TrendRangeEnd: outputs.weeklyContext.trendRange.endIso,
    TrendRangeEndDisplay: formatDateTimeDisplay(outputs.weeklyContext.trendRange.endIso),
    TrendSnapshotsIncluded: outputs.weeklyContext.trendRange.snapshotIds,
    TrendSnapshotsIncludedDisplay: outputs.weeklyContext.trendRange.snapshotIds.map(formatSnapshotLabel),
    TrendSnapshotsExcluded: outputs.weeklyContext.trendRange.excludedSnapshotIds,
    TrendSnapshotsExcludedDisplay: outputs.weeklyContext.trendRange.excludedSnapshotIds.map(formatSnapshotLabel),
    TrendWindowNote: outputs.weeklyContext.trendRange.note,
    Inputs: {
      CurrentGoodDocumentationJobsCsv: current.jobCsvPath,
      PreviousGoodDocumentationJobsCsv: previous.jobCsvPath,
      CurrentCompanyCoverageCsv: current.companyCoveragePath,
    },
    Outputs: {
      WeeklyTrendSummaryMarkdown: "weekly-trend-summary.md",
      WeeklyTrendSummaryCsv: "weekly-trend-summary.csv",
      NewJobsCsv: "new-jobs.csv",
      RemovedJobsCsv: "removed-jobs.csv",
      ContinuingJobsCsv: "continuing-jobs.csv",
      WeeklyNewJobsCsv: "weekly-new-jobs.csv",
      WeeklyDroppedJobsCsv: "weekly-dropped-jobs.csv",
      WeeklyPersistentJobsCsv: "weekly-persistent-jobs.csv",
      WeeklyNewCompaniesCsv: "weekly-new-companies.csv",
      WeeklyCompanyMovementCsv: "weekly-company-movement.csv",
      WeeklyTitleCategoryMovementCsv: "weekly-title-category-movement.csv",
      MarketHistoryCsv: "market-history.csv",
      JobLifecycleCsv: "job-lifecycle.csv",
      CompanyTrendsCsv: "company-trends.csv",
      TitleTrendsCsv: "title-trends.csv",
      TitleCategorySummaryCsv: "title-category-summary.csv",
      NewCompaniesCsv: "new-companies.csv",
      CompanyMoversCsv: "company-movers.csv",
      RepeatHiringCompaniesCsv: "repeat-hiring-companies.csv",
      FreshnessTrendsCsv: "freshness-trends.csv",
      OutliersCsv: "outliers.csv",
      EditorInsightsMarkdown: "editor-insights.md",
      SubstackNotesMarkdown: "substack-notes.md",
      WeeklySubstackReportMarkdown: "weekly-substack-report.md",
      TrendManifestJson: "trend-manifest.json",
    },
    Counts: {
      CurrentJobs: current.rows.length,
      PreviousJobs: previous.rows.length,
      NewJobs: outputs.newJobsRows.length,
      RemovedJobs: outputs.removedJobsRows.length,
      ContinuingJobs: outputs.continuingJobsRows.length,
      WeeklyFirstSeenJobs: outputs.weeklyNewJobsRows.length,
      WeeklyDroppedJobs: outputs.weeklyDroppedJobsRows.length,
      WeeklyPersistentJobs: outputs.weeklyPersistentJobsRows.length,
      WeeklyNewCompanies: outputs.weeklyNewCompanyRows.length,
      WeeklyCompanyMovementRows: outputs.weeklyCompanyMovementRows.length,
      WeeklyTitleCategoryRows: outputs.weeklyTitleCategoryRows.length,
      MarketHistoryRows: outputs.marketHistoryRows.length,
      JobLifecycleRows: outputs.jobLifecycleRows.length,
      Outliers: outputs.outlierRows.length,
      NewCompanies: outputs.newCompanyRows.length,
      CompanyMovers: outputs.companyMoverRows.length,
      RepeatHiringCompanies: outputs.repeatHiringCompanyRows.length,
    },
    Notes: [
      "Trend reporting reads existing Google Sheets package snapshots only.",
      "It does not fetch jobs, delete rows, or edit Google Sheets package exports.",
    ],
  };
}

async function main() {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  const publicSheet = await loadPublicSheetConfig();
  const companyNormalization = await loadCompanyNormalization();
  const snapshots = await loadSnapshots();
  if (snapshots.length < 2) {
    throw new Error("At least two timestamped Google Sheets package snapshots are required.");
  }

  const trendRange = buildTrendRange(snapshots, cliOptions);
  const current = trendRange.endSnapshot;
  const previous = trendRange.previousSnapshot;
  const historySnapshots = snapshots.filter((snapshot) => snapshot.date.getTime() <= current.date.getTime());
  const history = buildHistory(historySnapshots);
  const { newKeys, removedKeys, continuingKeys } = currentPreviousSets(current, previous);
  const newRows = newKeys.map((key) => current.keyedRows.get(key)).filter(Boolean);
  const removedRows = removedKeys.map((key) => previous.keyedRows.get(key)).filter(Boolean);
  const generatedAt = new Date().toISOString();
  const summaryRow = buildSummaryRow({
    current,
    previous,
    newRows,
    removedRows,
    continuingRows: continuingKeys,
    generatedAt,
  });
  const newJobsRows = buildNewJobsRows(newRows);
  const removedJobsRows = buildRemovedJobsRows(removedRows, previous);
  const continuingJobsRows = buildContinuingRows(continuingKeys, current, history);
  const companyRows = buildCompanyTrends(current, previous, newRows, removedRows, companyNormalization);
  const titleRows = buildTitleTrends(current, previous, companyNormalization);
  const titleCategoryRows = buildTitleCategorySummary(current, previous);
  const newCompanyRows = buildNewCompaniesRows(current, previous, companyNormalization);
  const companyMoverRows = buildCompanyMoversRows(companyRows);
  const repeatHiringCompanyRows = buildRepeatHiringCompanyRows(historySnapshots, current, companyNormalization);
  const freshnessRows = buildFreshnessRows(current);
  const outlierRows = buildOutliers(current, previous, history, companyNormalization, historySnapshots.length);
  const rollingMetrics = [7, 14, 30].map((days) => buildRollingMetrics(historySnapshots, history, current, days, companyNormalization));
  const weeklyContext = buildWeeklyContext(historySnapshots, history, current, companyNormalization, trendRange);
  const weeklyNewJobsRows = buildWeeklyNewJobsRows(weeklyContext, history, companyNormalization);
  const weeklyDroppedJobsRows = buildWeeklyDroppedJobsRows(weeklyContext, history, companyNormalization);
  const weeklyPersistentJobsRows = buildWeeklyPersistentJobsRows(weeklyContext, current, history, companyNormalization);
  const weeklyNewCompanyRows = buildWeeklyNewCompaniesRows(weeklyContext, current, companyNormalization);
  const weeklyCompanyMovementRows = buildWeeklyCompanyMovementRows(weeklyContext, weeklyNewJobsRows, weeklyDroppedJobsRows, companyNormalization);
  const weeklyTitleCategoryRows = buildWeeklyTitleCategoryMovementRows(weeklyContext, weeklyNewJobsRows, weeklyDroppedJobsRows);
  const marketHistoryRows = buildMarketHistoryRows(historySnapshots, companyNormalization);
  const jobLifecycleRows = buildJobLifecycleRows(history, current, companyNormalization);
  const editorInsightRows = buildEditorInsights({
    summaryRow,
    weeklyContext,
    weeklyTitleCategoryRows,
    weeklyCompanyMovementRows,
    companyRows,
    freshnessRows,
    outlierRows,
    weeklyNewCompanyRows,
  });
  const outputs = {
    summaryRow,
    weeklyContext,
    newJobsRows,
    removedJobsRows,
    continuingJobsRows,
    weeklyNewJobsRows,
    weeklyDroppedJobsRows,
    weeklyPersistentJobsRows,
    weeklyNewCompanyRows,
    weeklyCompanyMovementRows,
    weeklyTitleCategoryRows,
    marketHistoryRows,
    jobLifecycleRows,
    companyRows,
    titleRows,
    titleCategoryRows,
    newCompanyRows,
    companyMoverRows,
    repeatHiringCompanyRows,
    freshnessRows,
    outlierRows,
    editorInsightRows,
    weeklyMarkdown: buildWeeklyMarkdown({
      summaryRow,
      weeklyContext,
      rollingMetrics,
      weeklyNewJobsRows,
      weeklyDroppedJobsRows,
      weeklyCompanyMovementRows,
      freshnessRows,
      outlierRows,
      weeklyTitleCategoryRows,
      publicSheet,
    }),
  };
  outputs.weeklySubstackReport = buildWeeklySubstackReport({
    summaryRow,
    weeklyContext,
    companyRows,
    weeklyTitleCategoryRows,
    weeklyNewCompanyRows,
    weeklyCompanyMovementRows,
    freshnessRows,
    outlierRows,
    editorInsightRows,
    publicSheet,
  });
  outputs.substackNotes = buildSubstackNotes({
    summaryRow,
    weeklyContext,
    companyRows,
    weeklyTitleCategoryRows,
    weeklyNewCompanyRows,
    weeklyCompanyMovementRows,
    freshnessRows,
    outlierRows,
    editorInsightRows,
    publicSheet,
  });
  outputs.manifest = buildManifest({ generatedAt, current, previous, snapshots, outputs, publicSheet });

  const timestampedOutputDir = path.join(trendsRoot, current.id);
  await writeOutputs(timestampedOutputDir, outputs);
  await writeOutputs(latestTrendDir, outputs);

  console.log("Job trend report complete.");
  console.log(`Current snapshot: ${current.id}`);
  console.log(`Previous snapshot: ${previous.id}`);
  console.log(`Snapshots counted: ${snapshots.length}`);
  console.log(`Current jobs: ${current.rows.length}`);
  console.log(`Trend range mode: ${trendRange.mode}`);
  console.log(`Trend range label: ${trendRange.label}`);
  console.log(`Trend range: ${weeklyContext.metrics.WeeklyStartSnapshot} to ${weeklyContext.metrics.WeeklyEndSnapshot}`);
  console.log(`Trend snapshots included: ${weeklyContext.metrics.WeeklySnapshotCount}`);
  console.log(`Range first-seen jobs: ${weeklyNewJobsRows.length}`);
  console.log(`Range dropped jobs: ${weeklyDroppedJobsRows.length}`);
  console.log(`Range net change: ${signed(weeklyContext.metrics.WeeklyNetChange)}`);
  console.log(`New jobs: ${newJobsRows.length}`);
  console.log(`Removed jobs: ${removedJobsRows.length}`);
  console.log(`Continuing jobs: ${continuingJobsRows.length}`);
  console.log(`Trend folder: ${timestampedOutputDir}`);
  console.log(`Latest trend folder: ${latestTrendDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
