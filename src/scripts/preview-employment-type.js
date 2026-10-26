const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { ensureEmploymentType, EMPLOYMENT_FIELDS } = require("../lib/employment-type");
const { parseCsvRecords, writeLargeCsvFile } = require("../lib/csv");
const { buildSimpleTopFiles, groupPublicSheetCountryPostings } = require("./build-gsheet-package");
const { buildSimplePublicRow } = require("../lib/simple-public-export");
const { packageEligibility } = require("../lib/public-package-eligibility");
const { employmentCoverage } = require("../lib/employment-type-report");
const { manifestCsv } = require("../lib/package-manifest");
const { fromRoot } = require("../lib/files");
const arg = (name, fallback = "") => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
async function preview(input, output, generatedAt = new Date().toISOString(), savedReviewPath = "") {
  input = path.resolve(input); output = path.resolve(output);
  if (!/^\d{8}-\d{4}$/.test(path.basename(output))) throw new Error("Use a new output directory with a YYYYMMDD-HHMM name so package validators can identify it.");
  const protectedRoots = ["data", ".git", "src", "test"].map(p => fromRoot(p));
  if (protectedRoots.some(p => output === p || output.startsWith(`${p}${path.sep}`))) throw new Error("Preview output must be outside production data, source, and test directories.");
  // An existing output is never reused. Refuse symlink parents into production.
  const parent = await fs.realpath(path.dirname(output));
  if (protectedRoots.some(p => parent === p || parent.startsWith(`${p}${path.sep}`))) throw new Error("Preview parent resolves into a protected directory.");
  const bytes = await fs.readFile(input);
  const rows = input.endsWith(".csv") ? parseCsvRecords(bytes.toString()).rows : JSON.parse(bytes.toString());
  if (!Array.isArray(rows)) throw new Error("Preview input must be an array or detailed CSV.");
  await fs.mkdir(output); // exclusive creation; fails if it exists
  const json = async (file, value) => fs.writeFile(path.join(output, file), JSON.stringify(value, null, 2) + "\n");
  const start = performance.now();
  const enriched = rows.map(row => ({ ...row, ...ensureEmploymentType(row) }));
  const extractionMs = performance.now() - start;
  const eligible = packageEligibility(enriched).included;
  const oldPublic = eligible.map(row => { const result = buildSimplePublicRow(row, generatedAt); delete result["Employment Type"]; return result; });
  const oldCount = groupPublicSheetCountryPostings(oldPublic).length;
  const headers = [...new Set([...rows.flatMap(Object.keys), ...EMPLOYMENT_FIELDS])];
  await json("03_top_matches_full.json", enriched);
  await writeLargeCsvFile(path.join(output, "03_top_matches_full.csv"), enriched, headers);
  const packageStart = performance.now();
  const manifest = await buildSimpleTopFiles(output, generatedAt, { exists: true, rows: enriched }, {
    includeStartHere: true, simpleFileName: "01_good_documentation_jobs.csv", formulaFileName: "good_documentation_jobs_formula.csv", coveragePercent: "",
  });
  const packageMs = performance.now() - packageStart;
  const groupingRows = JSON.parse(await fs.readFile(path.join(output, "public-schema.json"))).rowCount;
  let savedURLReview = null;
  if (savedReviewPath) {
    const reviewBytes = await fs.readFile(savedReviewPath);
    const review = parseCsvRecords(reviewBytes.toString());
    const publicPath = path.join(output, "01_good_documentation_jobs.csv");
    const publicCsv = parseCsvRecords(await fs.readFile(publicPath, "utf8"));
    const byLink = new Map(review.rows.map(row => [row["Apply Link"], row]));
    if (byLink.size !== review.rows.length || publicCsv.rows.some(row => !byLink.has(row["Apply Link"]))) throw new Error("Saved URL review must contain one matching result for every public row");
    const reviewColumns = ["UrlCheckOk", "UrlCheckStatus", "UrlCheckIssue", "UrlCheckHttpStatus", "UrlCheckFinalUrl", "UrlCheckDurationMs", "UrlCheckCheckedAt"];
    if (reviewColumns.some(column => !review.headers.includes(column))) throw new Error("Saved URL review lacks required check fields");
    const mapped = publicCsv.rows.map(row => ({ ...row, ...Object.fromEntries(reviewColumns.map(column => [column, byLink.get(row["Apply Link"])[column]])) }));
    await writeLargeCsvFile(path.join(output, "saved-url-review.csv"), mapped, [...publicCsv.headers, ...reviewColumns]);
    const result = await require("./check-gsheet-url-health").applyPrune(publicPath, publicCsv.headers, mapped,
      { backupCsv: path.join(output, "01_good_documentation_jobs-before-url-prune.csv") }, { applySafe: true });
    savedURLReview = { input: path.resolve(savedReviewPath), sha256: createHash("sha256").update(reviewBytes).digest("hex"),
      checkedAt: [...new Set(review.rows.map(row => row.UrlCheckCheckedAt))].sort(), ...result,
      note: "Saved URL results were replayed. No URL was checked again. These results do not prove current live status." };
  }

  // The shared builder's manifest identifies the production default. Correct it for this preview.
  for (const entry of manifest) { entry.SourcePath = input; entry.SizeBytes = (await fs.stat(entry.OutputPath)).size; }
  await json("gsheet-package-manifest.json", manifest);
  await fs.writeFile(path.join(output, "gsheet-package-manifest.csv"), manifestCsv(manifest));
  const coverage = JSON.parse(await fs.readFile(path.join(output, "employment-type-coverage.json")));
  const report = {
    derivedPreview: true, input, inputSHA256: createHash("sha256").update(bytes).digest("hex"), inputBytes: bytes.length,
    generatedAt, sourceObservationDatesPreserved: true, networkRequests: 0, inputRows: rows.length,
    detailed: employmentCoverage(eligible), public: coverage.public, tableRange: coverage.tableRange,
    oldGroupingRows: oldCount, newGroupingRows: groupingRows,
    groupingRowChange: groupingRows - oldCount, savedURLReview,
    runtime: { extractionMs, packageMs, totalMs: performance.now() - start, note: "One saved shortlist. No collection, URL checks, full-feed merge, or production refresh was timed. Disk cache and machine load can affect these values." },
  };
  await json("preview-report.json", report);
  await fs.writeFile(path.join(output, "README_GSHEET_PACKAGE.md"), `# Derived employment-type preview\n\nGenerated: ${generatedAt}\n\nSource: ${input}\n\nThis is an offline preview from saved records. No job detail was requested. Missing structured data in old records cannot be recovered here. Source observation dates stay unchanged.\n\nPublic rows: ${coverage.public.denominator}. Table and pivot source range: ${coverage.tableRange}. Employment grouping changes the old count of ${oldCount} by ${report.groupingRowChange} rows. ${savedURLReview ? `Saved URL results then remove ${savedURLReview.prunedRows} rows. These checks were not repeated.` : "This preview stops before URL pruning."}\n\nSee EMPLOYMENT_TYPE_IMPORT.md for import and filter instructions. See employment-type-coverage.json and preview-report.json for counts, denominators, source labels, and timings. These files do not prove live job status. This preview does not publish to Sheets.\n`);
  return report;
}
if (require.main === module) {
  const input = arg("--input"), output = arg("--output");
  if (!input || !output) { console.error("Use --input SAVED_JSON_OR_CSV --output NEW_DIRECTORY. The output parent must exist; the new directory name must be YYYYMMDD-HHMM."); process.exitCode = 1; }
  else preview(input, output, arg("--generated-at", new Date().toISOString()), arg("--saved-url-review")).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { preview };
