const fs = require("fs/promises");
const path = require("path");
const { ExportRunReader } = require("../adapters/storage/export-run-reader");
const { writeRecords } = require("../adapters/exports/stream-record-writers");
const { writeJsonFile } = require("../lib/files");
const { rowsToCsv } = require("../lib/csv");

const rawSlices = ["firehose", "writer-focus", "strong-matches", "remote-us-likely", "remote-writer-focus", "salary-detected", "review-needed"];
const dedupedSlices = ["deduped-firehose", "deduped-writer-focus", "deduped-strong-matches", "deduped-remote-writer-focus", "deduped-top"];
const summaryHeaders = ["SliceName", "Rows", "UniqueCompanies", "UniqueTitles", "WriterFitACount", "WriterFitBCount", "WriterFitCCount", "RemoteCount", "USRemoteEligibleTrueCount", "SalaryDetectedCount", "ReviewCount", "DuplicateCount", "WriterFitGuardrailAppliedCount", "WriterFitPenaltyAppliedCount", "DemotedHighScoreCount", "GeneratedAt"];
const dedupeSummaryHeaders = ["SliceName", "InputRows", "OutputRows", "RemovedDuplicateRows", "DuplicateGroupsResolved", "GeneratedAt"];
const decisionHeaders = ["SliceName", "DuplicateGroupKey", "DedupeGroupSize", "SelectedCompany", "SelectedTitle", "SelectedATS", "SelectedURL", "SelectedWriterFitScore", "SelectedWriterFitTier", "SelectionReason", "RejectedRowsSummary"];
const demotedHeaders = ["Title", "Company", "Location", "URL", "WriterFitBaseScore", "WriterFitScore", "WriterFitTier", "WriterFitPenaltySignals", "WriterFitDemotionReason", "WriterFitGuardrailApplied", "WriterFitReasons", "TitleDomainSignal", "TitleReviewBucket", "RemoteStatus"];

function getArgValue(name, fallback) { const i = process.argv.indexOf(name); return i === -1 || i + 1 >= process.argv.length ? fallback : process.argv[i + 1]; }
function isTrue(value) { return value === true || String(value).toUpperCase() === "TRUE"; }
function sortTopRows(rows) { const t = (a, b) => { const left = String(a || "").toLowerCase(); const right = String(b || "").toLowerCase(); return left < right ? -1 : left > right ? 1 : 0; }; return [...rows].sort((a, b) => (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) || (Number(a.TitleReviewPriority) || 999) - (Number(b.TitleReviewPriority) || 999) || Number(isTrue(b.USRemoteEligible)) - Number(isTrue(a.USRemoteEligible)) || Number(isTrue(b.SalaryDetected)) - Number(isTrue(a.SalaryDetected)) || t(a.Company, b.Company) || t(a.Title, b.Title)); }
function demotedRow(row) { return Object.fromEntries(demotedHeaders.map((key) => [key, row[key]])); }
function summaryRow(name, metric, generatedAt) { return { SliceName: name, Rows: metric.rows, UniqueCompanies: metric.unique_companies, UniqueTitles: metric.unique_titles, WriterFitACount: metric.writer_fit_a, WriterFitBCount: metric.writer_fit_b, WriterFitCCount: metric.writer_fit_c, RemoteCount: metric.remote_rows, USRemoteEligibleTrueCount: metric.us_remote_eligible_rows, SalaryDetectedCount: metric.salary_detected_rows, ReviewCount: metric.review_rows, DuplicateCount: metric.duplicate_rows, WriterFitGuardrailAppliedCount: metric.guardrail_rows, WriterFitPenaltyAppliedCount: metric.penalty_rows, DemotedHighScoreCount: metric.demoted_rows, GeneratedAt: generatedAt }; }

async function writePair(basePath, makeRows, headers) { await writeRecords(`${basePath}.csv`, makeRows(), "csv", headers); await writeRecords(`${basePath}.json`, makeRows(), "json", headers); }

async function main() {
  const runDir = path.resolve(getArgValue("--run-dir", ""));
  if (!runDir) throw new Error("Provide --run-dir for a completed Phase 2 staging run.");
  const manifest = JSON.parse(await fs.readFile(path.join(runDir, "manifest.json"), "utf8"));
  if (manifest.Status !== "PHASE_2_COMPLETE") throw new Error("Run must be PHASE_2_COMPLETE.");
  const full = manifest.Profile === "full";
  const rawSliceOnly = getArgValue("--raw-slice", "");
  const dedupeOnly = process.argv.includes("--dedupe-only");
  if (rawSliceOnly && (!full || ![...rawSlices, "top", "demoted-high-score"].includes(rawSliceOnly))) {
    throw new Error("--raw-slice must name a full-profile raw slice.");
  }
  const outputDir = path.join(runDir, "outputs");
  const slicesDir = path.join(outputDir, "slices");
  const dedupedDir = path.join(slicesDir, "deduped");
  const headers = manifest.Headers;
  const dedupedHeaders = [...headers, "DedupeSelected", "DedupeSelectionReason", "DedupeGroupSize"];
  const generatedAt = manifest.StartedAt;
  const reader = new ExportRunReader(runDir);
  try {
    if (rawSliceOnly) {
      const base = path.join(rawSliceOnly === "top" ? outputDir : slicesDir, `public-job-feed-${rawSliceOnly}`);
      if (rawSliceOnly === "demoted-high-score") {
        const rows = Array.from(reader.iterateRawSlice(rawSliceOnly), demotedRow).sort((a, b) => (Number(b.WriterFitBaseScore) || 0) - (Number(a.WriterFitBaseScore) || 0) || (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) || String(a.Title || "").localeCompare(String(b.Title || "")));
        await writePair(base, () => rows, demotedHeaders);
      } else if (rawSliceOnly === "top") {
        const rows = sortTopRows(Array.from(reader.iterateRawSlice("top")));
        await writePair(base, () => rows, headers);
      } else {
        await writePair(base, () => reader.iterateRawSlice(rawSliceOnly), headers);
      }
      console.log(`Phase 3 raw slice staged: ${rawSliceOnly}`);
      return;
    }
    if (!dedupeOnly && full) for (const name of rawSlices) await writePair(path.join(slicesDir, `public-job-feed-${name}`), () => reader.iterateRawSlice(name), headers);
    if (!dedupeOnly) {
      const topRows = sortTopRows(Array.from(reader.iterateRawSlice("top")));
      await writePair(path.join(outputDir, "public-job-feed-top"), () => topRows, headers);
    }
    if (!dedupeOnly && full) {
      const demoted = Array.from(reader.iterateRawSlice("demoted-high-score"), demotedRow).sort((a, b) => (Number(b.WriterFitBaseScore) || 0) - (Number(a.WriterFitBaseScore) || 0) || (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) || String(a.Title || "").localeCompare(String(b.Title || "")));
      await writePair(path.join(slicesDir, "public-job-feed-demoted-high-score"), () => demoted, demotedHeaders);
    }
    const outputDedupe = full ? dedupedSlices : ["deduped-top"];
    const summaries = [];
    for (const name of outputDedupe) {
      const rows = name === "deduped-top" ? sortTopRows(Array.from(reader.iterateSelectedSlice(name))) : undefined;
      const base = `public-job-feed-${name}`;
      await writePair(path.join(dedupedDir, base), () => rows || reader.iterateSelectedSlice(name), dedupedHeaders);
      if (name === "deduped-top" || (full && ["deduped-writer-focus", "deduped-remote-writer-focus"].includes(name))) {
        const latest = name === "deduped-top" ? sortTopRows(Array.from(reader.iterateSelectedSlice(name))) : undefined;
        await writePair(path.join(outputDir, base), () => latest || reader.iterateSelectedSlice(name), dedupedHeaders);
      }
      const stat = reader.getDedupeSummary(name);
      summaries.push({ SliceName: name, InputRows: stat.input, OutputRows: stat.output, RemovedDuplicateRows: stat.input - stat.output, DuplicateGroupsResolved: stat.groups, GeneratedAt: generatedAt });
    }
    if (!dedupeOnly && full) {
      const rows = [...rawSlices, "top", "demoted-high-score"].map((name) => summaryRow(name, reader.getSliceSummary(name), generatedAt));
      await fs.mkdir(slicesDir, { recursive: true });
      await fs.writeFile(path.join(slicesDir, "public-job-feed-slice-summary.csv"), rowsToCsv(summaryHeaders, rows));
      await writeJsonFile(path.join(slicesDir, "public-job-feed-slice-summary.json"), rows);
    }
    await fs.mkdir(dedupedDir, { recursive: true });
    await fs.writeFile(path.join(dedupedDir, "public-job-feed-dedupe-summary.csv"), rowsToCsv(dedupeSummaryHeaders, summaries));
    await writeJsonFile(path.join(dedupedDir, "public-job-feed-dedupe-summary.json"), summaries);
    const decisions = outputDedupe.flatMap((name) => Array.from(reader.iterateDedupeDecisionsForSlice(name)));
    await writeRecords(path.join(dedupedDir, "public-job-feed-dedupe-decisions.csv"), decisions, "csv", decisionHeaders);
    await writeRecords(path.join(dedupedDir, "public-job-feed-dedupe-decisions.json"), decisions, "json", decisionHeaders);
    await writeJsonFile(path.join(outputDir, "output-manifest.json"), { Status: "PHASE_3_STAGED", SourceRun: runDir, Profile: manifest.Profile, PublishedOutputsChanged: false, CompletedAt: new Date().toISOString() });
    console.log(`Phase 3 ${manifest.Profile} outputs staged: ${outputDir}`);
  } finally { reader.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
