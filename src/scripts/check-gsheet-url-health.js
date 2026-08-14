const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");
const { checkJobUrl } = require("../lib/job-url-health");

const defaultInputPath = fromRoot(
  "data",
  "jobs",
  "gsheet-package",
  "latest",
  "01_good_documentation_jobs.csv"
);
const defaultConcurrency = 8;
const defaultTimeoutMs = 15000;
const reviewColumns = [
  "UrlCheckOk",
  "UrlCheckStatus",
  "UrlCheckIssue",
  "UrlCheckHttpStatus",
  "UrlCheckFinalUrl",
  "UrlCheckDurationMs",
  "UrlCheckCheckedAt",
];

function parseArgs(args) {
  const options = {
    input: "",
    packageDir: "",
    outputDir: "",
    urlColumn: "",
    concurrency: defaultConcurrency,
    timeoutMs: defaultTimeoutMs,
    apply: false,
    applySafe: false,
    strict: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input" || arg === "-i") {
      options.input = path.resolve(fromRoot(), args[++index]);
    } else if (arg === "--package-dir") {
      options.packageDir = path.resolve(fromRoot(), args[++index]);
    } else if (arg === "--output-dir" || arg === "-o") {
      options.outputDir = path.resolve(fromRoot(), args[++index]);
    } else if (arg === "--url-column" || arg === "-c") {
      options.urlColumn = args[++index];
    } else if (arg === "--concurrency") {
      options.concurrency = positiveInteger(args[++index], "--concurrency");
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = positiveInteger(args[++index], "--timeout-ms");
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--apply-safe") {
      options.applySafe = true;
    } else if (arg === "--strict") {
      options.strict = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.input && options.packageDir) {
    throw new Error("Use either --input or --package-dir, not both.");
  }

  if (options.packageDir) {
    options.input = path.join(options.packageDir, "01_good_documentation_jobs.csv");
  }

  if (!options.input) {
    options.input = defaultInputPath;
  }

  return options;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveUrlColumn(headers, requestedColumn) {
  if (requestedColumn) {
    const normalized = normalizeHeader(requestedColumn);
    const index = headers.findIndex((header) => normalizeHeader(header) === normalized);
    if (index !== -1) {
      return headers[index];
    }
    throw new Error(`Could not find URL column "${requestedColumn}". Available columns: ${headers.join(", ")}`);
  }

  const preferred = new Set(["applylink", "url", "joburl", "applyurl", "applicationurl", "link"]);
  const detected = headers.find((header) => preferred.has(normalizeHeader(header)));
  if (!detected) {
    throw new Error("Could not auto-detect a URL column. Pass --url-column Apply Link or another URL column name.");
  }
  return detected;
}

function outputPathsFor(inputPath, outputDir) {
  const dir = outputDir || path.dirname(inputPath);
  const parsed = path.parse(inputPath);

  return {
    reviewCsv: path.join(dir, `${parsed.name}-url-review.csv`),
    failuresCsv: path.join(dir, `${parsed.name}-url-failures.csv`),
    summaryJson: path.join(dir, `${parsed.name}-url-check-summary.json`),
    summaryMarkdown: path.join(dir, `${parsed.name}-url-check-summary.md`),
    backupCsv: path.join(dir, `${parsed.name}-before-url-prune.csv`),
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function buildReviewRow(row, check) {
  return {
    ...row,
    UrlCheckOk: check.ok ? "Yes" : "No",
    UrlCheckStatus: check.status,
    UrlCheckIssue: check.issue,
    UrlCheckHttpStatus: check.httpStatus,
    UrlCheckFinalUrl: check.finalUrl,
    UrlCheckDurationMs: check.durationMs,
    UrlCheckCheckedAt: check.checkedAt,
  };
}

function summarize(checks, inputPath, urlColumn, outputs, applyResult) {
  const bad = checks.filter((check) => !check.ok).length;
  const prunableBad = checks.filter((check) => isPrunableFailure(check)).length;

  return {
    InputPath: inputPath,
    UrlColumn: urlColumn,
    CheckedAt: new Date().toISOString(),
    TotalRows: checks.length,
    GoodRows: checks.length - bad,
    BadRows: bad,
    PrunableBadRows: prunableBad,
    AmbiguousBadRows: bad - prunableBad,
    MissingUrlRows: checks.filter((check) => check.status === "Missing URL").length,
    InvalidUrlRows: checks.filter((check) => check.status === "Invalid URL").length,
    TimedOutRows: checks.filter((check) => check.status === "Timeout").length,
    FetchErrorRows: checks.filter((check) => check.status === "Fetch Error").length,
    ReviewCsv: outputs.reviewCsv,
    FailuresCsv: outputs.failuresCsv,
    SummaryMarkdown: outputs.summaryMarkdown,
    Applied: Boolean(applyResult),
    ApplyMode: applyResult ? applyResult.applyMode : "",
    PrunedRows: applyResult ? applyResult.prunedRows : 0,
    KeptRows: applyResult ? applyResult.keptRows : 0,
    KeptAmbiguousFailureRows: applyResult ? applyResult.keptAmbiguousFailureRows : 0,
    BackupCsv: applyResult ? applyResult.backupCsv : "",
  };
}

function buildSummaryMarkdown(summary) {
  return [
    "# Google Sheets URL Check",
    "",
    `Checked: ${summary.CheckedAt}`,
    "",
    `- Input: \`${summary.InputPath}\``,
    `- URL column: \`${summary.UrlColumn}\``,
    `- Total rows: ${summary.TotalRows}`,
    `- Good rows: ${summary.GoodRows}`,
    `- Bad rows: ${summary.BadRows}`,
    `- Prunable bad rows: ${summary.PrunableBadRows}`,
    `- Ambiguous bad rows kept for review: ${summary.AmbiguousBadRows}`,
    `- Missing URL rows: ${summary.MissingUrlRows}`,
    `- Invalid URL rows: ${summary.InvalidUrlRows}`,
    `- Timed out rows: ${summary.TimedOutRows}`,
    `- Fetch error rows: ${summary.FetchErrorRows}`,
    `- Review CSV: \`${summary.ReviewCsv}\``,
    `- Failures CSV: \`${summary.FailuresCsv}\``,
    "",
    summary.Applied
      ? `Applied ${summary.ApplyMode} pruning: removed ${summary.PrunedRows} rows after backing up the original CSV to \`${summary.BackupCsv}\`. Kept ${summary.KeptAmbiguousFailureRows} ambiguous failed rows for review.`
      : "No rows were removed. Review the failures CSV, then rerun with `--apply-safe` to prune deterministic failures or `--apply` to prune all failed rows.",
    "",
  ].join("\n");
}

async function updateStartHereCount(inputPath, goodRows) {
  const startHerePath = path.join(path.dirname(inputPath), "00_start_here.csv");

  try {
    const parsed = parseCsvRecords(await fs.readFile(startHerePath, "utf8"));
    if (!parsed.headers.includes("Good Documentation Jobs Count") || parsed.rows.length === 0) {
      return false;
    }

    parsed.rows[0]["Good Documentation Jobs Count"] = goodRows;
    await fs.writeFile(startHerePath, rowsToCsv(parsed.headers, parsed.rows), "utf8");
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isPrunableFailure(check) {
  if (["Missing URL", "Invalid URL"].includes(check.status)) {
    return true;
  }

  if (check.status !== "Bad") {
    return false;
  }

  const issue = String(check.issue || "");
  return (
    /^HTTP (404|410)\b/.test(issue) ||
    issue === "Final URL matches a known expired/error page pattern." ||
    issue === "URL is on the reviewed confirmed-dead job URL list." ||
    issue === "Page text matches a known closed/not-found job pattern." ||
    issue.startsWith("Greenhouse job URL redirected")
  );
}

function shouldKeepReviewRow(row, safeMode) {
  if (row.UrlCheckOk === "Yes") {
    return true;
  }

  if (!safeMode) {
    return false;
  }

  return !isPrunableFailure({ status: row.UrlCheckStatus, issue: row.UrlCheckIssue });
}

async function applyPrune(inputPath, headers, reviewRows, outputs, options) {
  const safeMode = Boolean(options.applySafe);
  const keepRows = reviewRows
    .filter((row) => shouldKeepReviewRow(row, safeMode))
    .map((row) => Object.fromEntries(headers.map((header) => [header, row[header]])));

  await fs.copyFile(inputPath, outputs.backupCsv);
  await fs.writeFile(inputPath, rowsToCsv(headers, keepRows), "utf8");
  const updatedStartHere = await updateStartHereCount(inputPath, keepRows.length);

  return {
    applyMode: safeMode ? "safe" : "all-failures",
    prunedRows: reviewRows.length - keepRows.length,
    keptRows: keepRows.length,
    keptAmbiguousFailureRows: safeMode
      ? reviewRows.filter((row) => row.UrlCheckOk !== "Yes" && shouldKeepReviewRow(row, true)).length
      : 0,
    backupCsv: outputs.backupCsv,
    updatedStartHere,
  };
}

function printUsage() {
  console.log(`Usage:
  npm run jobs:gsheet-check-urls
  npm run jobs:gsheet-check-urls -- --input data/jobs/gsheet-package/20260605-0620/01_good_documentation_jobs.csv
  npm run jobs:gsheet-check-urls -- --package-dir data/jobs/gsheet-package/20260605-0620
  npm run jobs:gsheet-check-urls -- --apply
  npm run jobs:gsheet-check-urls -- --apply-safe

Options:
  --input, -i       CSV to check. Defaults to data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv.
  --package-dir     Package folder to check; uses 01_good_documentation_jobs.csv inside that folder.
  --url-column, -c  URL column name. Defaults to Apply Link/URL auto-detection.
  --output-dir, -o  Where review files are written. Defaults beside the input CSV.
  --apply           After writing review files, back up the input CSV and remove rows whose URL check failed.
  --apply-safe      Back up the input CSV and remove deterministic failures only; keep timeouts/fetch errors.
  --strict          Exit with code 1 when any failed URL is found.
  --concurrency     Parallel URL checks. Default: ${defaultConcurrency}.
  --timeout-ms      Per-URL timeout. Default: ${defaultTimeoutMs}.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const inputPath = path.resolve(options.input);
  const outputs = outputPathsFor(inputPath, options.outputDir);
  const parsed = parseCsvRecords(await fs.readFile(inputPath, "utf8"));
  if (parsed.rows.length === 0) {
    throw new Error(`No rows found in ${inputPath}`);
  }

  const urlColumn = resolveUrlColumn(parsed.headers, options.urlColumn);
  await ensureDir(path.dirname(outputs.reviewCsv));

  let checked = 0;
  const checkedRows = await mapWithConcurrency(parsed.rows, options.concurrency, async (row) => {
    const check = await checkJobUrl(row[urlColumn], options);
    checked += 1;
    process.stderr.write(`\rChecked ${checked}/${parsed.rows.length}`);
    return {
      row,
      check,
    };
  });
  process.stderr.write("\n");

  const reviewHeaders = [...parsed.headers, ...reviewColumns];
  const reviewRows = checkedRows.map(({ row, check }) => buildReviewRow(row, check));
  const failureRows = reviewRows.filter((row) => row.UrlCheckOk !== "Yes");

  await fs.writeFile(outputs.reviewCsv, rowsToCsv(reviewHeaders, reviewRows), "utf8");
  await fs.writeFile(outputs.failuresCsv, rowsToCsv(reviewHeaders, failureRows), "utf8");

  const applyResult =
    options.apply || options.applySafe ? await applyPrune(inputPath, parsed.headers, reviewRows, outputs, options) : null;
  const summary = summarize(
    checkedRows.map(({ check }) => check),
    inputPath,
    urlColumn,
    outputs,
    applyResult
  );
  await writeJsonFile(outputs.summaryJson, summary);
  await fs.writeFile(outputs.summaryMarkdown, buildSummaryMarkdown(summary), "utf8");

  console.log("Google Sheets URL check complete.");
  console.log(`Input: ${inputPath}`);
  console.log(`Rows checked: ${summary.TotalRows}`);
  console.log(`Good rows: ${summary.GoodRows}`);
  console.log(`Bad rows: ${summary.BadRows}`);
  console.log(`Failures CSV: ${outputs.failuresCsv}`);
  console.log(`Review CSV: ${outputs.reviewCsv}`);
  if (applyResult) {
    console.log(`Pruned rows: ${applyResult.prunedRows}`);
    console.log(`Kept ambiguous failed rows: ${applyResult.keptAmbiguousFailureRows}`);
    console.log(`Backup CSV: ${applyResult.backupCsv}`);
    console.log(`Updated 00_start_here.csv count: ${applyResult.updatedStartHere ? "yes" : "no"}`);
  } else {
    console.log("No rows removed. Rerun with --apply-safe to prune deterministic failures after reviewing failures.");
  }

  if (options.strict && summary.BadRows > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
