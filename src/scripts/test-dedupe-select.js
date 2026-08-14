const assert = require("assert/strict");
const legacyDedupe = require("../lib/dedupe-select");
const exportDedupe = require("../adapters/exports/export-dedupe");

function row(overrides = {}) {
  return {
    ATS: "icims",
    Company: "Example",
    Title: "Technical Writer",
    URL: "https://careers.example.com/jobs/123/technical-writer/job",
    CanonicalURLKey: "https://careers.example.com/jobs/123/technical-writer/job",
    DuplicateGroupKey: "https://careers.example.com/jobs/123/technical-writer/job | example:technicalwriter",
    WriterFitScore: 85,
    WriterFitTier: "A",
    ExportQualityFlag: "REVIEW",
    RemoteStatus: "Unknown",
    DatePosted: "2026-07-15",
    ...overrides,
  };
}

function assertDedupeParity(rows, sliceName) {
  assert.deepEqual(
    exportDedupe.selectDedupedRows(rows, sliceName),
    legacyDedupe.selectDedupedRows(rows, sliceName),
    "Export dedupe adapter must preserve legacy selection behavior"
  );
}

const aliasRows = [
  row({ Company: "Careers Chenega" }),
  row({
    Company: "Chenega",
    DuplicateGroupKey: "https://careers.example.com/jobs/123/technical-writer/job | chenega:technicalwriter",
  }),
];
assertDedupeParity(aliasRows, "canonical-alias-fixture");
const aliasResult = exportDedupe.selectDedupedRows(
  aliasRows,
  "canonical-alias-fixture"
);

assert.equal(aliasResult.rows.length, 1);
assert.equal(aliasResult.rows[0].Company, "Chenega");
assert.equal(aliasResult.summary.RemovedDuplicateRows, 1);

const roleRows = [
  row({ URL: "https://example.com/jobs/a", CanonicalURLKey: "https://example.com/jobs/a", DuplicateGroupKey: "same-role" }),
  row({ URL: "https://example.com/jobs/b", CanonicalURLKey: "https://example.com/jobs/b", DuplicateGroupKey: "same-role" }),
];
assertDedupeParity(roleRows, "duplicate-group-fixture");
const roleResult = exportDedupe.selectDedupedRows(
  roleRows,
  "duplicate-group-fixture"
);

assert.equal(roleResult.rows.length, 1);
assert.equal(roleResult.summary.RemovedDuplicateRows, 1);

console.log("Dedupe selection tests passed.");
