const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");
const { normalizeGreenhouseJob } = require("../lib/jobs-normalize");
const { buildSimplePublicRow } = require("../lib/simple-public-export");

const reportsDir = fromRoot("data", "jobs", "reports");
const reportRunDate = "2026-07-05T21:22:00.000Z";

const context = {
  company: "Greenhouse Regression Fixture",
  companyKey: "greenhouse-regression-fixture",
  catalogSlug: "greenhouse-regression-fixture",
  boardUrl: "https://boards.greenhouse.io/greenhouse-regression-fixture",
  fetchUrl: "https://boards-api.greenhouse.io/v1/boards/greenhouse-regression-fixture/jobs?content=true",
  fetchedAt: "2026-07-05T21:12:00.000Z",
};

const fixtures = [
  {
    name: "prefers first_published over updated_at",
    job: {
      id: "first-published",
      title: "Senior Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/first-published",
      location: { name: "Remote" },
      content: "<p>Documentation role.</p>",
      first_published: "2026-06-03T12:00:00.000Z",
      updated_at: "2026-07-05T12:00:00.000Z",
    },
    expectedDatePosted: "2026-06-03T12:00:00.000Z",
    expectedPostedDate: "2026-06-03",
    expectedAgeDays: 32,
  },
  {
    name: "falls back to published_at before updated_at",
    job: {
      id: "published-at",
      title: "Documentation Engineer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/published-at",
      location: { name: "Remote" },
      content: "<p>Documentation role.</p>",
      published_at: "2026-06-10T09:00:00.000Z",
      updated_at: "2026-07-04T12:00:00.000Z",
    },
    expectedDatePosted: "2026-06-10T09:00:00.000Z",
    expectedPostedDate: "2026-06-10",
    expectedAgeDays: 25,
  },
  {
    name: "falls back to created_at before updated_at",
    job: {
      id: "created-at",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/created-at",
      location: { name: "Remote" },
      content: "<p>Documentation role.</p>",
      created_at: "2026-06-15T09:00:00.000Z",
      updated_at: "2026-07-04T12:00:00.000Z",
    },
    expectedDatePosted: "2026-06-15T09:00:00.000Z",
    expectedPostedDate: "2026-06-15",
    expectedAgeDays: 20,
  },
  {
    name: "uses updated_at as last fallback",
    job: {
      id: "updated-at",
      title: "Knowledge Base Specialist",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/updated-at",
      location: { name: "Remote" },
      content: "<p>Documentation role.</p>",
      updated_at: "2026-07-03T12:00:00.000Z",
    },
    expectedDatePosted: "2026-07-03T12:00:00.000Z",
    expectedPostedDate: "2026-07-03",
    expectedAgeDays: 2,
  },
];

function buildMarkdown(result) {
  return [
    "# Greenhouse Normalize Regression",
    "",
    `Generated: ${result.GeneratedAt}`,
    "",
    `Status: ${result.Status}`,
    "",
    "## Results",
    "",
    "| Fixture | DatePosted | Posted Date | Age (Days) | Status |",
    "| --- | --- | --- | ---: | --- |",
    ...result.Results.map((row) =>
      `| ${row.Name} | ${row.DatePosted || ""} | ${row.PostedDate || ""} | ${row.AgeDays || ""} | ${row.Status} |`
    ),
    "",
    "## Failures",
    "",
    ...(result.Failures.length ? result.Failures.map((failure) => `- ${failure}`) : ["None"]),
    "",
  ].join("\n");
}

async function main() {
  await ensureDir(reportsDir);

  const result = {
    GeneratedAt: new Date().toISOString(),
    Status: "PASS",
    Results: [],
    Failures: [],
  };

  for (const fixture of fixtures) {
    const normalized = normalizeGreenhouseJob(fixture.job, context, []);
    const publicRow = buildSimplePublicRow(normalized, reportRunDate);
    const failures = [];

    if (normalized.DatePosted !== fixture.expectedDatePosted) {
      failures.push(`expected DatePosted ${fixture.expectedDatePosted}, got ${normalized.DatePosted}`);
    }
    if (publicRow["Posted Date"] !== fixture.expectedPostedDate) {
      failures.push(`expected Posted Date ${fixture.expectedPostedDate}, got ${publicRow["Posted Date"]}`);
    }
    if (publicRow["Age (Days)"] !== fixture.expectedAgeDays) {
      failures.push(`expected Age (Days) ${fixture.expectedAgeDays}, got ${publicRow["Age (Days)"]}`);
    }

    const status = failures.length ? "FAIL" : "PASS";
    result.Results.push({
      Name: fixture.name,
      Status: status,
      DatePosted: normalized.DatePosted,
      PostedDate: publicRow["Posted Date"],
      AgeDays: publicRow["Age (Days)"],
      ExpectedDatePosted: fixture.expectedDatePosted,
      ExpectedPostedDate: fixture.expectedPostedDate,
      ExpectedAgeDays: fixture.expectedAgeDays,
    });

    for (const failure of failures) {
      result.Failures.push(`${fixture.name}: ${failure}`);
    }
  }

  result.Status = result.Failures.length ? "FAIL" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-greenhouse-normalize-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-greenhouse-normalize-results.md"), buildMarkdown(result), "utf8");

  console.log(`Greenhouse normalize regression: ${result.Status}`);
  for (const row of result.Results) {
    console.log(`${row.Status}: ${row.Name} -> ${row.PostedDate} age ${row.AgeDays}`);
  }

  if (result.Failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
