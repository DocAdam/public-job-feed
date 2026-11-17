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

const distinctSameSourceRows = [
  row({
    ATS: "direct-employer",
    Company: "NetApp",
    CompanyKey: "netapp",
    RawJobId: "1448139200",
    URL: "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1448139200/",
    CanonicalURLKey: "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1448139200",
    DuplicateGroupKey: "netapp:technicalwriter:morrisvillencus",
  }),
  row({
    ATS: "direct-employer",
    Company: "NetApp",
    CompanyKey: "netapp",
    RawJobId: "1450475000",
    URL: "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1450475000/",
    CanonicalURLKey: "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1450475000",
    DuplicateGroupKey: "netapp:technicalwriter:morrisvillencus",
  }),
];
assertDedupeParity(distinctSameSourceRows, "distinct-same-source-fixture");
const distinctSameSourceResult = exportDedupe.selectDedupedRows(
  distinctSameSourceRows,
  "distinct-same-source-fixture"
);
assert.equal(distinctSameSourceResult.rows.length, 2, "Different stable job IDs from one source must remain separate");
assert.equal(distinctSameSourceResult.summary.RemovedDuplicateRows, 0);

const samePostingRows = [
  row({ ATS: "ashby", CompanyKey: "example", RawJobId: "posting-123", URL: "https://example.com/jobs/a", CanonicalURLKey: "https://example.com/jobs/a", DuplicateGroupKey: "same-role" }),
  row({ ATS: "ashby", CompanyKey: "example", RawJobId: "posting-123", URL: "https://example.com/jobs/b", CanonicalURLKey: "https://example.com/jobs/b", DuplicateGroupKey: "same-role" }),
];
assertDedupeParity(samePostingRows, "same-posting-fixture");
assert.equal(exportDedupe.selectDedupedRows(samePostingRows, "same-posting-fixture").rows.length, 1);

const crossSourceRows = [
  row({ ATS: "ashby", CompanyKey: "example", RawJobId: "ashby-123", URL: "https://example.com/jobs/a", CanonicalURLKey: "https://example.com/jobs/a", DuplicateGroupKey: "same-role" }),
  row({ ATS: "greenhouse", CompanyKey: "example", RawJobId: "greenhouse-456", URL: "https://example.com/jobs/b", CanonicalURLKey: "https://example.com/jobs/b", DuplicateGroupKey: "same-role" }),
];
assertDedupeParity(crossSourceRows, "cross-source-fixture");
assert.equal(exportDedupe.selectDedupedRows(crossSourceRows, "cross-source-fixture").rows.length, 1);

console.log("Dedupe selection tests passed.");
