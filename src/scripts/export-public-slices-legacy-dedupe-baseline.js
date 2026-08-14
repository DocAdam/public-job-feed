const fs = require("fs/promises");
const path = require("path");
const Database = require("better-sqlite3");
const { buildSelectionReason, compareRows, getDedupeKeys, summarizeRejectedRows } = require("../lib/dedupe-select");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, writeJsonFile, writeTextFile } = require("../lib/files");
const { writeRecords } = require("../adapters/exports/stream-record-writers");

const fullSlices = ["deduped-firehose", "deduped-writer-focus", "deduped-strong-matches", "deduped-remote-writer-focus", "deduped-top"];
const summaryHeaders = ["SliceName", "InputRows", "OutputRows", "RemovedDuplicateRows", "DuplicateGroupsResolved", "GeneratedAt"];
const decisionHeaders = ["SliceName", "DuplicateGroupKey", "DedupeGroupSize", "SelectedCompany", "SelectedTitle", "SelectedATS", "SelectedURL", "SelectedWriterFitScore", "SelectedWriterFitTier", "SelectionReason", "RejectedRowsSummary"];
function arg(name, fallback) { const i = process.argv.indexOf(name); return i === -1 || i + 1 >= process.argv.length ? fallback : process.argv[i + 1]; }
function isTrue(value) { return value === true || String(value).toUpperCase() === "TRUE"; }
function sortTopRows(rows) { const t = (a, b) => { const l = String(a || "").toLowerCase(), r = String(b || "").toLowerCase(); return l < r ? -1 : l > r ? 1 : 0; }; return [...rows].sort((a, b) => (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0) || (Number(a.TitleReviewPriority) || 999) - (Number(b.TitleReviewPriority) || 999) || Number(isTrue(b.USRemoteEligible)) - Number(isTrue(a.USRemoteEligible)) || Number(isTrue(b.SalaryDetected)) - Number(isTrue(a.SalaryDetected)) || t(a.Company, b.Company) || t(a.Title, b.Title)); }

function createSliceIterators(db, sliceName) {
  const groups = db.prepare(`
    SELECT c.component_id, c.group_size, m.membership_sequence, r.row_json
    FROM dedupe_components c
    JOIN dedupe_memberships m ON m.slice_name = c.slice_name AND m.row_id = c.row_id
    JOIN rows r ON r.id = c.row_id
    JOIN (
      SELECT c2.component_id, MIN(m2.membership_sequence) AS first_sequence
      FROM dedupe_components c2 JOIN dedupe_memberships m2 ON m2.slice_name = c2.slice_name AND m2.row_id = c2.row_id
      WHERE c2.slice_name = ? GROUP BY c2.component_id
    ) ordering ON ordering.component_id = c.component_id
    WHERE c.slice_name = ? ORDER BY ordering.first_sequence, m.membership_sequence
  `);
  function* components() {
    let id = null, size = 0, entries = [];
    for (const record of groups.iterate(sliceName, sliceName)) {
      if (id !== null && record.component_id !== id) { yield { id, size, entries }; entries = []; }
      id = record.component_id; size = record.group_size;
      const row = JSON.parse(record.row_json);
      // Verify the exact legacy key contract remains true for every stored row.
      if (!getDedupeKeys(row, record.membership_sequence - 1).length) throw new Error(`Missing legacy dedupe key for ${sliceName}`);
      entries.push({ row, sequence: record.membership_sequence });
    }
    if (id !== null) yield { id, size, entries };
  }
  function choose(component) {
    return component.entries.reduce((best, candidate) => !best || compareRows(candidate.row, best.row) < 0 || (compareRows(candidate.row, best.row) === 0 && candidate.sequence < best.sequence) ? candidate : best, null);
  }
  return {
    *rows() { for (const component of components()) { const winner = choose(component); yield { ...winner.row, DedupeSelected: true, DedupeSelectionReason: buildSelectionReason(winner.row, component.size), DedupeGroupSize: component.size }; } },
    *decisions() { for (const component of components()) { if (component.size <= 1) continue; const winner = choose(component); const reason = buildSelectionReason(winner.row, component.size); const rejected = component.entries.filter((entry) => entry !== winner).sort((a, b) => compareRows(a.row, b.row) || a.sequence - b.sequence).map((entry) => ({ ...entry.row, DedupeSelected: false, DedupeSelectionReason: `Rejected in favor of ${winner.row.ATS || ""} ${winner.row.URL || ""}`.trim(), DedupeGroupSize: component.size })); yield { SliceName: sliceName, DuplicateGroupKey: component.id, DedupeGroupSize: component.size, SelectedCompany: winner.row.Company, SelectedTitle: winner.row.Title, SelectedATS: winner.row.ATS, SelectedURL: winner.row.URL, SelectedWriterFitScore: winner.row.WriterFitScore, SelectedWriterFitTier: winner.row.WriterFitTier, SelectionReason: reason, RejectedRowsSummary: summarizeRejectedRows(rejected) }; } },
  };
}
async function pair(fileBase, makeRows, headers) { await writeRecords(`${fileBase}.csv`, makeRows(), "csv", headers); await writeRecords(`${fileBase}.json`, makeRows(), "json", headers); }
async function main() {
  const runDir = path.resolve(arg("--run-dir", "")), outputDir = path.resolve(arg("--output-dir", ""));
  if (!runDir || !outputDir) throw new Error("Provide --run-dir and --output-dir.");
  const manifest = JSON.parse(await fs.readFile(path.join(runDir, "manifest.json"), "utf8"));
  const slices = manifest.Profile === "full" ? fullSlices : ["deduped-top"];
  const db = new Database(path.join(runDir, "run-store.sqlite"), { readonly: true });
  const headers = [...manifest.Headers, "DedupeSelected", "DedupeSelectionReason", "DedupeGroupSize"];
  const dedupedDir = manifest.Profile === "full" ? path.join(outputDir, "slices", "deduped") : outputDir;
  try {
    await ensureDir(dedupedDir); const summaries = [];
    for (const slice of slices) { const iterators = createSliceIterators(db, slice); const count = db.prepare("SELECT COUNT(*) AS count FROM dedupe_memberships WHERE slice_name = ?").get(slice).count; const output = db.prepare("SELECT COUNT(*) AS count FROM selected_rows WHERE slice_name = ?").get(slice).count; const groups = db.prepare("SELECT COUNT(*) AS count FROM (SELECT component_id FROM dedupe_components WHERE slice_name = ? AND group_size > 1 GROUP BY component_id)").get(slice).count; if (slice === "deduped-top") { const rows = sortTopRows(Array.from(iterators.rows())); await pair(path.join(dedupedDir, `public-job-feed-${slice}`), () => rows, headers); await pair(path.join(outputDir, `public-job-feed-${slice}`), () => rows, headers); } else { await pair(path.join(dedupedDir, `public-job-feed-${slice}`), () => iterators.rows(), headers); if (["deduped-writer-focus", "deduped-remote-writer-focus"].includes(slice)) await pair(path.join(outputDir, `public-job-feed-${slice}`), () => iterators.rows(), headers); } summaries.push({ SliceName: slice, InputRows: count, OutputRows: output, RemovedDuplicateRows: count - output, DuplicateGroupsResolved: groups, GeneratedAt: manifest.StartedAt }); console.log(`Legacy disk baseline: ${slice}`); }
    await writeTextFile(path.join(dedupedDir, "public-job-feed-dedupe-summary.csv"), rowsToCsv(summaryHeaders, summaries)); await writeJsonFile(path.join(dedupedDir, "public-job-feed-dedupe-summary.json"), summaries);
    function* decisions() { for (const slice of slices) yield* createSliceIterators(db, slice).decisions(); }
    await pair(path.join(dedupedDir, "public-job-feed-dedupe-decisions"), decisions, decisionHeaders);
  } finally { db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
