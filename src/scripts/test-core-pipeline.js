const assert = require("assert/strict");
const { buildJobFeed, processCatalog } = require("../index.js");

const rawJobs = [
  {
    RawJobId: "writer-001",
    Company: "Example Co",
    Title: "Technical Writer",
    Location: "Remote, United States",
    Description: "Remote US role. Compensation range: $100,000 - $120,000.",
    URL: "https://careers.example.com/jobs/writer-001",
    DatePosted: "2026-08-13",
  },
  {
    RawJobId: "writer-002",
    Company: "Example Co",
    Title: "Technical Writer",
    Location: "Remote, United States",
    Description: "Remote US role.",
    URL: "https://careers.example.com/jobs/writer-002",
  },
];

async function main() {
  // This exercises the documented default options path, including an omitted
  // options.context.
  const defaultResult = buildJobFeed(rawJobs);
  assert.equal(defaultResult.length, 1);

  const [defaultJob] = defaultResult;
  assert.equal(defaultJob.Source, "public-job-feed");
  assert.equal(defaultJob.Company, "Example Co");
  assert.equal(defaultJob.ATS, "");
  assert.equal(defaultJob.RemoteStatus, "Remote");
  assert.equal(defaultJob.USRemoteEligible, true);
  assert.equal(defaultJob.SalaryDetected, true);
  assert.equal(defaultJob.SalaryMin, "100000");
  assert.equal(defaultJob.SalaryMax, "120000");
  assert.ok(defaultJob.DuplicateGroupKey);

  const contextualResult = await processCatalog(rawJobs, {
    context: {
      ats: "greenhouse",
      catalogSlug: "example-co",
      boardUrl: "https://boards.greenhouse.io/example",
      fetchUrl: "https://boards-api.greenhouse.io/v1/boards/example/jobs",
    },
    loadWatchlist: false,
  });
  assert.equal(contextualResult.length, 1);
  assert.equal(contextualResult[0].ATS, "greenhouse");
  assert.equal(contextualResult[0].CatalogSlug, "example-co");
  assert.equal(contextualResult[0].BoardURL, "https://boards.greenhouse.io/example");

  console.log("Core pipeline regression tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
