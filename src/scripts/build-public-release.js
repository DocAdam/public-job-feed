const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeTextFile } = require("../lib/files");

const publicDir = fromRoot("data", "jobs", "public");
const slicesDir = path.join(publicDir, "slices");
const releasesDir = path.join(publicDir, "releases");
const latestSummaryMarkdownPath = path.join(publicDir, "public-job-feed-summary.md");
const operatorNotesPath = path.join(publicDir, "OPERATOR_NOTES.md");
const publishingPrepPath = path.join(publicDir, "PUBLISHING_PREP.md");
const dataDictionaryCsvPath = path.join(publicDir, "public-job-feed-data-dictionary.csv");
const dataDictionaryMarkdownPath = path.join(publicDir, "public-job-feed-data-dictionary.md");
const reviewerReadmePath = path.join(publicDir, "README_FOR_REVIEWERS.md");

const latestFiles = [
  "public-job-feed-latest.csv",
  "public-job-feed-latest.json",
  "public-job-feed-latest-summary.csv",
  "public-job-feed-latest-summary.json",
  "public-job-feed-top.csv",
  "public-job-feed-top.json",
  "public-job-feed-deduped-top.csv",
  "public-job-feed-deduped-top.json",
  "public-job-feed-deduped-writer-focus.csv",
  "public-job-feed-deduped-writer-focus.json",
  "public-job-feed-deduped-remote-writer-focus.csv",
  "public-job-feed-deduped-remote-writer-focus.json",
  "OPERATOR_NOTES.md",
  "PUBLISHING_PREP.md",
  "public-job-feed-data-dictionary.csv",
  "public-job-feed-data-dictionary.md",
];

const sliceExplanations = [
  ["public-job-feed-latest.csv/json", "Complete latest feed. Nothing is filtered out."],
  ["public-job-feed-top.csv/json", "Sorted shortlist using the strong-match rows."],
  ["slices/public-job-feed-firehose.csv/json", "Full firehose copy of the latest feed."],
  ["slices/public-job-feed-writer-focus.csv/json", "Broad writer/docs/content review slice."],
  ["slices/public-job-feed-strong-matches.csv/json", "Smaller high-signal writer match slice."],
  ["slices/public-job-feed-remote-us-likely.csv/json", "Rows marked Remote and US remote eligible."],
  ["slices/public-job-feed-remote-writer-focus.csv/json", "Remote US likely rows with writer-focus signals."],
  ["slices/public-job-feed-salary-detected.csv/json", "Rows where salary detection found a range."],
  ["slices/public-job-feed-review-needed.csv/json", "Rows needing review because of quality or duplicate flags."],
  ["slices/public-job-feed-demoted-high-score.csv/json", "Rows demoted by Writer Fit v3 penalties or A/B guardrails."],
  ["slices/public-job-feed-slice-summary.csv/json", "Counts and quick metrics for each slice."],
  ["slices/deduped/public-job-feed-deduped-firehose.csv/json", "Firehose convenience view with one selected representative per duplicate group."],
  ["slices/deduped/public-job-feed-deduped-writer-focus.csv/json", "Deduped writer-focus review set."],
  ["slices/deduped/public-job-feed-deduped-strong-matches.csv/json", "Deduped strong-match shortlist."],
  ["slices/deduped/public-job-feed-deduped-remote-writer-focus.csv/json", "Deduped remote writer-focus set."],
  ["slices/deduped/public-job-feed-deduped-top.csv/json", "Deduped top shortlist."],
  ["slices/deduped/public-job-feed-dedupe-summary.csv/json", "Counts showing rows removed from each deduped convenience view."],
  ["slices/deduped/public-job-feed-dedupe-decisions.csv/json", "Duplicate group selection diagnostics."],
  ["OPERATOR_NOTES.md", "Internal operator notes for inspecting outputs and sanity-checking counts."],
  ["PUBLISHING_PREP.md", "Internal publishing prep notes for moving selected CSVs into Google Sheets."],
  ["public-job-feed-data-dictionary.csv/md", "Column definitions for internal review and future Sheet tabs."],
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

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function getProfile() {
  const profile = String(getArgValue("--profile", "full")).trim().toLowerCase();
  if (!["daily", "full"].includes(profile)) {
    throw new Error(`Unsupported --profile value: ${profile}. Use daily or full.`);
  }

  return profile;
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

function runNodeScript(scriptPath, args, heapMb = 16384) {
  return runCommand(process.execPath, [`--max-old-space-size=${heapMb}`, scriptPath, ...args]);
}

async function runOptionalNodeScript(scriptPath, args, label, heapMb = 12288) {
  try {
    await runNodeScript(scriptPath, args, heapMb);
  } catch (error) {
    console.warn(`Warning: ${label} failed: ${error.message}`);
  }
}

async function copyFileToRelease(sourcePath, releaseDir, relativeOutputPath, createdFiles) {
  const outputPath = path.join(releaseDir, relativeOutputPath);

  await ensureDir(path.dirname(outputPath));
  await fs.copyFile(sourcePath, outputPath);
  createdFiles.push(outputPath);
}

async function copyLatestFiles(releaseDir, createdFiles) {
  for (const filename of latestFiles) {
    await copyFileToRelease(path.join(publicDir, filename), releaseDir, filename, createdFiles);
  }
}

async function copySliceFiles(releaseDir, createdFiles) {
  async function copyDir(sourceDir, relativeDir) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const relativePath = path.join(relativeDir, entry.name);

      if (entry.isDirectory()) {
        await copyDir(sourcePath, relativePath);
      } else if (entry.isFile()) {
        await copyFileToRelease(sourcePath, releaseDir, relativePath, createdFiles);
      }
    }
  }

  await copyDir(slicesDir, "slices");
}

function getSliceCount(sliceSummaryRows, sliceName) {
  const row = sliceSummaryRows.find((item) => item.SliceName === sliceName);
  return row ? row.Rows : 0;
}

function getDedupeCount(dedupeSummaryRows, sliceName) {
  const row = dedupeSummaryRows.find((item) => item.SliceName === sliceName);
  return row ? row.OutputRows : 0;
}

function getDataDictionaryRows(headers) {
  const descriptions = {
    SourceBatch: "Batch folder that produced this row.",
    SourceATSCount: "Distinct ATS sources involved in this row's duplicate key group.",
    CrossATSDuplicate: "True when the duplicate group contains more than one ATS.",
    CrossATSDuplicateATSList: "Pipe-separated ATS list for cross-ATS duplicate groups.",
    Source: "Fetcher or API source label.",
    ATS: "Applicant tracking system source.",
    Company: "Normalized display company name.",
    CompanyKey: "Compact normalized company key used for grouping.",
    Title: "Job title from the ATS posting.",
    ExportQualityFlag: "Export quality status: OK, REVIEW, or BAD_ROW.",
    ExportQualityIssues: "Pipe-separated quality issues for review.",
    PossibleDuplicate: "True when another row shares a likely duplicate key.",
    DuplicateReason: "Reason a row was flagged as a possible duplicate.",
    JobKey: "Primary job key, preferring ATS and raw job id.",
    CompanyTitleLocationKey: "Fallback duplicate key based on company, title, and location.",
    CanonicalURLKey: "Job URL normalized without query string or fragment.",
    DuplicateGroupKey: "Duplicate grouping key used by dedupe diagnostics.",
    TitleReviewBucket: "Excel-review title bucket, not final scoring.",
    TitleReviewPriority: "Numeric title review priority; lower is stronger.",
    TitleReviewReason: "Human-readable title bucket reason.",
    "Role Type": "Broad role family for filtering core documentation, content, developer relations, knowledge, leadership, and adjacent transferable opportunities.",
    TitleDomainSignal: "Domain terms found in the title.",
    TitleSenioritySignal: "Seniority terms found in the title.",
    TitleLeadershipSignal: "True when title includes leadership terms.",
    TitleICSignal: "True when title includes individual-contributor role terms.",
    WriterFitScore: "Transparent writer-fit score for spreadsheet filtering. Remote/location fields are filters only.",
    WriterFitVersion: "Writer Fit scoring version used for this row.",
    WriterFitBaseScore: "Writer Fit score before v3 penalties, title-match floors, and A/B guardrails.",
    WriterFitTier: "Writer-fit tier A through F.",
    WriterFitReasons: "Pipe-separated score reasons.",
    WriterFitPositiveSignals: "Positive writer-fit signals.",
    WriterFitNegativeSignals: "Negative writer-fit signals.",
    WriterFitPenaltySignals: "Writer Fit v3 penalty reasons applied to obvious non-writer roles.",
    WriterFitDemotionReason: "Reason a high base score was capped or demoted.",
    WriterFitGuardrailApplied: "True when A/B tier was capped because strong writer/docs evidence was missing.",
    TitleMatchType: "Strict watchlist match type: exact, contains, token, or none.",
    TitleMatchCategory: "Watchlist category for the matched title.",
    MatchedWatchlistTitle: "Watchlist title that matched.",
    TitleMatchScore: "Strict title match score.",
    TitleConfidence: "Strict title match confidence.",
    Location: "Normalized job location.",
    RemoteStatus: "Heuristic remote status: Remote, Hybrid, Onsite, or Unknown.",
    RemoteSignal: "Remote/location text signal found by heuristics.",
    RemoteConfidence: "Confidence for remote status heuristic.",
    USRemoteEligible: "Heuristic US remote eligibility: true, false, or unknown.",
    LocationRisk: "Heuristic location risk for review.",
    LocationReviewReason: "Human-readable location heuristic reason.",
    SalaryDetected: "True when salary detection found a range.",
    SalaryMin: "Detected minimum salary.",
    SalaryMax: "Detected maximum salary.",
    SalaryCurrency: "Detected salary currency.",
    SalaryPeriod: "Detected salary period.",
    SalaryText: "Raw detected salary text.",
    Department: "Department/team from the ATS posting.",
    DatePosted: "Posting date if available.",
    "Posted Date": "Display-friendly posting date supplied by the ATS if available, formatted YYYY-MM-DD in simple public exports.",
    "Age (Days)": "Integer number of days between Posted Date and the report generation date in simple public exports.",
    URL: "Primary job URL.",
    ApplyURL: "Direct application URL when a curated employer posting exposes one; otherwise use URL.",
    Description: "Raw or lightly normalized job description.",
    CatalogSlug: "Catalog slug used for board fetching.",
    BoardURL: "Likely public board URL.",
    FetchURL: "Endpoint or URL attempted by the fetcher.",
    FetchedAt: "Timestamp when the job was fetched.",
    "Last Checked": "Display-friendly time when the system last saw the job in the ATS, formatted YYYY-MM-DD HH:MM UTC in simple public exports.",
    "Report Run Date":
      "Package/report generation time. In simple Google Sheets packages this is stored in 00_start_here.csv instead of repeated on every job row.",
    RawJobId: "Raw ATS job id.",
    RawJobURL: "Raw ATS job URL.",
    RawLocation: "Raw ATS location value.",
    RawDepartment: "Raw ATS department value.",
    DedupeSelected: "True for selected representative rows in deduped exports.",
    DedupeSelectionReason: "Reason the representative row was selected.",
    DedupeGroupSize: "Number of rows in the dedupe group.",
  };

  function getCategory(field) {
    if (field.startsWith("Dedupe")) return "Dedupe";
    if (field.startsWith("WriterFit")) return "Writer Fit";
    if (field.startsWith("Title")) return "Title Review";
    if (field.includes("Remote") || field.includes("Location") || field === "USRemoteEligible") return "Location";
    if (field.startsWith("Salary")) return "Salary";
    if (field.includes("Duplicate") || field.includes("Key") || field.includes("Quality")) return "Quality/Dedupe";
    if (field.startsWith("Raw")) return "Raw ATS";
    if (field.includes("URL") || field.includes("Fetch") || field.includes("Catalog") || field === "BoardURL") return "Source";
    return "Core";
  }

  return headers.map((field) => ({
    Field: field,
    Category: getCategory(field),
    Description: descriptions[field] || "Generated export field.",
    SharingNote:
      field === "Description"
        ? "Useful but can make Sheets heavy; consider hiding after import."
        : "Safe for internal review; decide final public presentation in Google Sheets.",
  }));
}

function buildDataDictionaryMarkdown(rows) {
  const lines = [
    "# Public Job Feed Data Dictionary",
    "",
    "Internal reference for repo-generated CSV columns. This is useful for operator review and for a future Google Sheets data dictionary tab.",
    "",
    "| Field | Category | Description | Sharing Note |",
    "| --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(`| ${row.Field} | ${row.Category} | ${row.Description} | ${row.SharingNote} |`);
  }

  lines.push("");
  return lines.join("\n");
}

function buildOperatorNotes(releaseTimestamp, latestSummary, sliceSummaryRows, dedupeSummaryRows) {
  return [
    "# Operator Notes",
    "",
    `Generated: ${releaseTimestamp}`,
    "",
    "These notes are internal operator/publisher notes for this repo. They are not the final public presentation layer.",
    "",
    "## What Each Generated File Is For",
    "",
    "- `public-job-feed-latest.csv/json`: complete latest feed. Do not delete rows from this firehose.",
    "- `slices/public-job-feed-firehose.csv/json`: complete firehose copy for slice workflows.",
    "- `public-job-feed-top.csv/json`: non-deduped strong-match/top shortlist.",
    "- `public-job-feed-deduped-top.csv/json`: shortest cleaner shortlist for quick inspection.",
    "- `public-job-feed-deduped-remote-writer-focus.csv/json`: best first candidate for a remote-writer Google Sheet.",
    "- `public-job-feed-deduped-writer-focus.csv/json`: broader deduped writer/docs/content review set.",
    "- `slices/deduped/public-job-feed-dedupe-summary.csv/json`: row-reduction counts by deduped slice.",
    "- `slices/deduped/public-job-feed-dedupe-decisions.csv/json`: internal diagnostics showing selected and rejected duplicate rows.",
    "- `slices/public-job-feed-demoted-high-score.csv/json`: internal diagnostics for roles demoted by Writer Fit v3.",
    "- `public-job-feed-data-dictionary.csv/md`: column reference for internal review or a future Sheet tab.",
    "- `public-job-feed-summary.md`: internal release summary generated by the release command.",
    "",
    "## Inspect First",
    "",
    "Start with `public-job-feed-deduped-remote-writer-focus.csv`. It is the best balance of writer focus, remote usefulness, and duplicate reduction.",
    "",
    "Then inspect `public-job-feed-deduped-writer-focus.csv` for breadth and `public-job-feed-deduped-top.csv` for a shorter high-signal shortlist.",
    "",
    "Use `public-job-feed-latest.csv` only when you intentionally want the complete firehose.",
    "",
    "## Best Candidates For Google Sheets",
    "",
    "- `public-job-feed-deduped-remote-writer-focus.csv`",
    "- `public-job-feed-deduped-writer-focus.csv`",
    "- `public-job-feed-deduped-top.csv`",
    "- `public-job-feed-latest.csv` only for a full firehose sheet",
    "- `public-job-feed-data-dictionary.csv` for a Data Dictionary tab",
    "",
    "## Internal-Only Files",
    "",
    "Keep JSON files, fetch logs, batch indexes, ATS health reports, dedupe decision diagnostics, catalog analysis files, `OPERATOR_NOTES.md`, `PUBLISHING_PREP.md`, and `public-job-feed-summary.md` internal unless you intentionally decide otherwise.",
    "",
    "## Count Sanity Checks Before Sharing",
    "",
    `- Latest firehose rows: ${latestSummary.TotalRows}`,
    `- Writer focus rows: ${getSliceCount(sliceSummaryRows, "writer-focus")}`,
    `- Strong matches/top rows: ${getSliceCount(sliceSummaryRows, "strong-matches")}`,
    `- Remote writer focus rows: ${getSliceCount(sliceSummaryRows, "remote-writer-focus")}`,
    `- Review needed rows: ${getSliceCount(sliceSummaryRows, "review-needed")}`,
    `- Demoted high-score rows: ${getSliceCount(sliceSummaryRows, "demoted-high-score")}`,
    `- Deduped writer focus rows: ${getDedupeCount(dedupeSummaryRows, "deduped-writer-focus")}`,
    `- Deduped remote writer focus rows: ${getDedupeCount(dedupeSummaryRows, "deduped-remote-writer-focus")}`,
    `- Deduped top rows: ${getDedupeCount(dedupeSummaryRows, "deduped-top")}`,
    "",
    "Before sharing anything, confirm the selected CSV row count matches the release summary and that the full firehose row count did not unexpectedly shrink.",
    "",
    "## Important Warning",
    "",
    "This repo output is a data-prep layer, not the final public presentation layer. The CSV may eventually be copied into Google Sheets and shared from there, but these generated Markdown notes are for internal operation and publishing prep.",
    "",
  ].join("\n");
}

function buildPublishingPrep(releaseTimestamp) {
  return [
    "# Publishing Prep",
    "",
    `Generated: ${releaseTimestamp}`,
    "",
    "These are internal publishing prep notes. They are not public-facing documentation.",
    "",
    "## Recommended Sharing Path",
    "",
    "1. Generate a release with `npm run jobs:public-release`.",
    "2. Inspect the deduped CSVs in `data/jobs/public/` and the release folder.",
    "3. Upload the selected CSV to Google Sheets.",
    "4. Apply filters, freeze the header row, and add conditional formatting.",
    "5. Share the Google Sheet link in Substack.",
    "",
    "## Recommended Google Sheets Source Files",
    "",
    "- `data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv` as the main tab after running `npm run jobs:gsheet-package`",
    "- `data/jobs/gsheet-package/latest/02_company_coverage.csv` for internal coverage diagnostics only",
    "- `data/jobs/gsheet-package/latest/03_top_matches_full.csv` only if diagnostic columns are needed",
    "- `public-job-feed-deduped-remote-writer-focus.csv`",
    "- `public-job-feed-deduped-writer-focus.csv`",
    "- `public-job-feed-deduped-top.csv`",
    "- `public-job-feed-latest.csv` only if sharing the full firehose",
    "",
    "## Suggested Sheet Tabs",
    "",
    "- `01_good_documentation_jobs`",
    "- `remote_jobs_pivot` (preserve this derived remote view when replacing the main data)",
    "",
    "## Suggested Sheet Setup",
    "",
    "- Freeze the first row.",
    "- Turn on filters.",
    "- Hide or collapse `Description` if the sheet feels too heavy.",
    "- Consider conditional formatting for `WriterFitTier`, `RemoteStatus`, `USRemoteEligible`, `ExportQualityFlag`, and `PossibleDuplicate`.",
    "- Keep the repo Markdown docs internal; write any public-facing explanatory text separately in Substack or in a curated Sheet `Start Here` tab.",
    "",
  ].join("\n");
}

async function readCsvHeaders(filePath) {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstChunk = buffer.subarray(0, bytesRead).toString("utf8");
    const firstLine = firstChunk.split(/\r?\n/)[0] || "";

    return firstLine.split(",");
  } finally {
    await handle.close();
  }
}

async function removeReviewerReadme() {
  await fs.rm(reviewerReadmePath, { force: true });
}

async function writeInternalDocs(releaseTimestamp) {
  const latestSummary = await readJsonFile(path.join(publicDir, "public-job-feed-latest-summary.json"));
  const sliceSummaryRows = await readJsonFile(path.join(slicesDir, "public-job-feed-slice-summary.json"));
  const dedupeSummaryRows = await readJsonFile(
    path.join(slicesDir, "deduped", "public-job-feed-dedupe-summary.json")
  );
  const headers = await readCsvHeaders(path.join(publicDir, "public-job-feed-latest.csv"));
  const dataDictionaryRows = getDataDictionaryRows([
    ...headers,
    "DedupeSelected",
    "DedupeSelectionReason",
    "DedupeGroupSize",
  ]);

  await removeReviewerReadme();
  await writeTextFile(
    dataDictionaryCsvPath,
    rowsToCsv(["Field", "Category", "Description", "SharingNote"], dataDictionaryRows)
  );
  await writeTextFile(dataDictionaryMarkdownPath, buildDataDictionaryMarkdown(dataDictionaryRows));
  await writeTextFile(
    operatorNotesPath,
    buildOperatorNotes(releaseTimestamp, latestSummary, sliceSummaryRows, dedupeSummaryRows)
  );
  await writeTextFile(publishingPrepPath, buildPublishingPrep(releaseTimestamp));
}

function buildMarkdown(releaseTimestamp, latestSummary, sliceSummaryRows, dedupeSummaryRows) {
  const lines = [
    "# Public Job Feed Internal Release Summary",
    "",
    `Generated: ${releaseTimestamp}`,
    "",
    "## Counts",
    "",
    `- Total rows: ${latestSummary.TotalRows}`,
    `- ATS included: ${latestSummary.ATSIncluded || ""}`,
    `- Writer focus: ${getSliceCount(sliceSummaryRows, "writer-focus")}`,
    `- Strong matches / top: ${getSliceCount(sliceSummaryRows, "strong-matches")}`,
    `- Remote US likely: ${getSliceCount(sliceSummaryRows, "remote-us-likely")}`,
    `- Remote writer focus: ${getSliceCount(sliceSummaryRows, "remote-writer-focus")}`,
    `- Salary detected: ${getSliceCount(sliceSummaryRows, "salary-detected")}`,
    `- Review needed: ${getSliceCount(sliceSummaryRows, "review-needed")}`,
    `- Demoted high-score: ${getSliceCount(sliceSummaryRows, "demoted-high-score")}`,
    `- Deduped firehose: ${getDedupeCount(dedupeSummaryRows, "deduped-firehose")}`,
    `- Deduped writer focus: ${getDedupeCount(dedupeSummaryRows, "deduped-writer-focus")}`,
    `- Deduped strong/top: ${getDedupeCount(dedupeSummaryRows, "deduped-top")}`,
    `- Deduped remote writer focus: ${getDedupeCount(dedupeSummaryRows, "deduped-remote-writer-focus")}`,
    "",
    "## Recommended Google Sheets Source",
    "",
    "`data/jobs/gsheet-package/latest/01_good_documentation_jobs.csv`",
    "",
    "Use Good Documentation Jobs as the primary upload and preserve the existing `remote_jobs_pivot` derived view. `02_company_coverage.csv` and `03_top_matches_full.csv` remain available for internal diagnostics. The full firehose remains available internally for debugging and audit work.",
    "",
    "## Files",
    "",
    ...sliceExplanations.map(([file, explanation]) => `- \`${file}\`: ${explanation}`),
    "",
    "## Internal Docs",
    "",
    "- `OPERATOR_NOTES.md`: internal operator notes for file selection and sanity checks.",
    "- `PUBLISHING_PREP.md`: internal prep notes for moving selected CSVs into Google Sheets and sharing the Sheet link.",
    "- `public-job-feed-data-dictionary.csv/md`: internal column reference for review and future Sheet tabs.",
    "",
    "## Notes",
    "",
    "Rows are preserved in the main latest feed and firehose export. Quality issues, possible duplicates, and cross-ATS duplicates are flagged for review instead of being deleted.",
    "",
    "Deduped exports are convenience views for sharing and review. They select one representative row per duplicate group, but the complete firehose remains available unchanged.",
    "",
    "This release does not publish to Substack automatically. The repo Markdown docs are internal operator/publisher notes, not the final public presentation layer.",
    "",
  ];

  return lines.join("\n");
}

async function writeSummaryMarkdown(releaseDir, releaseTimestamp, createdFiles) {
  const latestSummary = await readJsonFile(path.join(publicDir, "public-job-feed-latest-summary.json"));
  const sliceSummaryRows = await readJsonFile(path.join(slicesDir, "public-job-feed-slice-summary.json"));
  const dedupeSummaryRows = await readJsonFile(
    path.join(slicesDir, "deduped", "public-job-feed-dedupe-summary.json")
  );
  const markdown = buildMarkdown(releaseTimestamp, latestSummary, sliceSummaryRows, dedupeSummaryRows);

  if (releaseDir) {
    const releaseMarkdownPath = path.join(releaseDir, "public-job-feed-summary.md");
    await writeTextFile(releaseMarkdownPath, markdown);
    createdFiles.push(releaseMarkdownPath);
  }

  await writeTextFile(latestSummaryMarkdownPath, markdown);
  createdFiles.push(latestSummaryMarkdownPath);

  return {
    latestSummary,
    sliceSummaryRows,
    dedupeSummaryRows,
  };
}

async function main() {
  const timestamp = getTimestampParts(new Date());
  const profile = getProfile();
  const archiveRelease = parseBoolean(getArgValue("--archive-release", "false"), false);
  const releaseDir = path.join(releasesDir, timestamp.folder);
  const createdFiles = [];

  await runCommand("npm", ["run", "jobs:check-local-files"]);
  await runCommand("npm", ["run", "jobs:index-batches"]);
  await runNodeScript("src/scripts/merge-batches.js", [
    "--ats",
    "all",
    "--output-name",
    "public-feed-release",
  ]);
  await runNodeScript("src/scripts/export-public-slices.js", ["--profile", profile]);
  await writeInternalDocs(timestamp.iso);

  if (archiveRelease) {
    await ensureDir(releaseDir);
    await copyLatestFiles(releaseDir, createdFiles);
    await copySliceFiles(releaseDir, createdFiles);
  }

  const { latestSummary, sliceSummaryRows, dedupeSummaryRows } = await writeSummaryMarkdown(
    archiveRelease ? releaseDir : "",
    timestamp.iso,
    createdFiles
  );

  await runOptionalNodeScript("src/scripts/report-ats-health.js", [], "ATS health report");
  await runOptionalNodeScript("src/scripts/report-crawl-coverage.js", [], "crawl coverage report");

  console.log("\nPublic release complete.");
  console.log(`Profile: ${profile}`);
  if (archiveRelease) {
    console.log("Release folder:");
    console.log(releaseDir);
  } else {
    console.log("Release archive skipped. Latest files were updated in:");
    console.log(publicDir);
    console.log("Use --archive-release true only when you intentionally need a full timestamped public snapshot.");
  }
  console.log(`Total rows: ${latestSummary.TotalRows}`);
  console.log(`Writer focus: ${getSliceCount(sliceSummaryRows, "writer-focus")}`);
  console.log(`Strong matches / top: ${getSliceCount(sliceSummaryRows, "strong-matches")}`);
  console.log(`Remote US likely: ${getSliceCount(sliceSummaryRows, "remote-us-likely")}`);
  console.log(`Remote writer focus: ${getSliceCount(sliceSummaryRows, "remote-writer-focus")}`);
  console.log(`Salary detected: ${getSliceCount(sliceSummaryRows, "salary-detected")}`);
  console.log(`Review needed: ${getSliceCount(sliceSummaryRows, "review-needed")}`);
  console.log(`Demoted high-score: ${getSliceCount(sliceSummaryRows, "demoted-high-score")}`);
  console.log(`Deduped firehose: ${getDedupeCount(dedupeSummaryRows, "deduped-firehose")}`);
  console.log(`Deduped writer focus: ${getDedupeCount(dedupeSummaryRows, "deduped-writer-focus")}`);
  console.log(`Deduped strong/top: ${getDedupeCount(dedupeSummaryRows, "deduped-top")}`);
  console.log(`Deduped remote writer focus: ${getDedupeCount(dedupeSummaryRows, "deduped-remote-writer-focus")}`);
  console.log(`Files created: ${createdFiles.length}`);
  for (const filePath of createdFiles) {
    console.log(`- ${filePath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
