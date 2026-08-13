const assert = require("assert/strict");
const { selectDedupedRows } = require("../lib/dedupe-select");

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

const aliasResult = selectDedupedRows(
  [
    row({ Company: "Careers Chenega" }),
    row({
      Company: "Chenega",
      DuplicateGroupKey: "https://careers.example.com/jobs/123/technical-writer/job | chenega:technicalwriter",
    }),
  ],
  "canonical-alias-fixture"
);

assert.equal(aliasResult.rows.length, 1);
assert.equal(aliasResult.rows[0].Company, "Chenega");
assert.equal(aliasResult.summary.RemovedDuplicateRows, 1);

const roleResult = selectDedupedRows(
  [
    row({ URL: "https://example.com/jobs/a", CanonicalURLKey: "https://example.com/jobs/a", DuplicateGroupKey: "same-role" }),
    row({ URL: "https://example.com/jobs/b", CanonicalURLKey: "https://example.com/jobs/b", DuplicateGroupKey: "same-role" }),
  ],
  "duplicate-group-fixture"
);

assert.equal(roleResult.rows.length, 1);
assert.equal(roleResult.summary.RemovedDuplicateRows, 1);

console.log("Dedupe selection tests passed.");
