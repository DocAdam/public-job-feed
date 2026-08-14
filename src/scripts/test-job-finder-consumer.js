const assert = require("assert/strict");
const { parseJobTitlesMarkdown } = require("../lib/job-titles");
const { matchPersonalTitle, schemaVersion, selectJobFinderConsumerRows } = require("../lib/job-finder-consumer");

const titles = parseJobTitlesMarkdown(`# IC Roles
- Technical Writer
- Content Manager

# Adjacent Management and Operations Roles
## Product operations
- Product Operations Manager
`);

assert.equal(schemaVersion, 1);
assert.equal(matchPersonalTitle("Senior Product Operations Manager, AI Platform", titles).label, "Product Operations Manager");
assert.equal(matchPersonalTitle("Marketing Content Manager", titles), null);

const selected = selectJobFinderConsumerRows([
  row({ Title: "Senior Product Operations Manager, AI Platform", RemoteStatus: "Remote", JobKey: "one" }),
  row({ Title: "Technical Writer", RemoteStatus: "Unknown", JobKey: "two" }),
  row({ Title: "Technical Writer", RemoteStatus: "Hybrid", JobKey: "three" }),
  row({ Title: "Account Executive", RemoteStatus: "Remote", JobKey: "four" }),
], titles);

assert.equal(selected.summary.scannedRows, 4);
assert.equal(selected.summary.titleMatches, 3);
assert.equal(selected.summary.excludedWorkArrangement, 1);
assert.deepEqual(selected.jobs.map((job) => job.title).sort(), [
  "Senior Product Operations Manager, AI Platform",
  "Technical Writer",
]);

console.log("Job Finder consumer export tests passed.");

function row(overrides) {
  return {
    Source: "public-job-feed",
    ATS: "greenhouse",
    Company: "Example",
    CompanyKey: "example",
    Title: "Technical Writer",
    Location: "Remote",
    Description: "Write documentation.",
    URL: `https://example.com/${overrides.JobKey}`,
    DatePosted: "2026-07-12",
    RemoteStatus: "Remote",
    ExportQualityFlag: "OK",
    WriterFitScore: 80,
    WriterFitTier: "A",
    ...overrides,
  };
}
