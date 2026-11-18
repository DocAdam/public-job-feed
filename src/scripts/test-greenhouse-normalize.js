const fs = require("fs/promises");
const path = require("path");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");
const { normalizeGreenhouseJob, normalizeLeverJob } = require("../lib/jobs-normalize");
const { buildSimplePublicRow } = require("../lib/simple-public-export");
const onsiteNegationFixture = require("./fixtures/greenhouse-onsite-negation.json");

const reportIndex = process.argv.indexOf("--report-dir");
const reportsDir = reportIndex >= 0 ? path.resolve(process.argv[reportIndex + 1]) : fromRoot("data", "jobs", "reports");
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

const workArrangementFixtures = [
  {
    name: "saved full-week office and remote denial is onsite",
    job: onsiteNegationFixture.job,
    expectedRemoteStatus: onsiteNegationFixture.expectedRemoteStatus,
    excludedSignals: ["remote"],
  },
  ...onsiteNegationFixture.samlino.jobs.map((job) => ({
    name: `saved Samlino ${job.id} full-week office schedule and remote denial is onsite`,
    job,
    expectedRemoteStatus: job.expectedRemoteStatus,
    expectedSignals: ["full-time office attendance", "remote work denied"],
    excludedSignals: ["remote"],
  })),
  {
    name: "saved 10a Labs conditional metro office requirement is unknown",
    job: onsiteNegationFixture.tenALabs.savedJob,
    expectedRemoteStatus: onsiteNegationFixture.tenALabs.expectedRemoteStatusFromSavedInputs,
    expectedSignals: ["conditional office requirement"],
    excludedSignals: ["fully remote outside named locations"],
    expectedReviewPatterns: [
      /recurring office requirement applies to named candidate locations/,
      /Washington, DC, New York City, San Francisco Bay Area, and Denver metropolitan areas/,
      /office at least two days per week/,
      /fully remote eligibility outside them is not stated/,
    ],
  },
  {
    name: "conditional metro office requirement stays remote when outside eligibility is explicit",
    job: {
      ...onsiteNegationFixture.tenALabs.savedJob,
      id: "conditional-office-explicit-remote-control",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/conditional-office-explicit-remote-control",
      content: `${onsiteNegationFixture.tenALabs.savedJob.content}<p>Candidates outside these locations may work fully remotely.</p>`,
    },
    expectedRemoteStatus: onsiteNegationFixture.tenALabs.expectedRemoteStatusWhenRemoteOutsideIsExplicit,
    expectedSignals: ["conditional office requirement", "fully remote outside named locations"],
    expectedReviewPatterns: [
      /source explicitly permits fully remote work outside them/,
      /Candidates outside these locations may work fully remotely/,
    ],
  },
  {
    name: "a named metro office rule without remote evidence keeps onsite",
    job: {
      ...onsiteNegationFixture.tenALabs.savedJob,
      id: "conditional-office-city-control",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/conditional-office-city-control",
      location: { name: "New York City" },
    },
    expectedRemoteStatus: "Onsite",
    expectedSignals: ["conditional office requirement", "office days in qualifying location"],
    expectedReviewPatterns: [
      /recurring office requirement applies to this posting location/,
      /posting location: New York City/,
    ],
  },
  {
    name: "a named metro office rule plus explicit remote evidence is hybrid",
    job: {
      ...onsiteNegationFixture.tenALabs.savedJob,
      id: "conditional-office-city-remote-control",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/conditional-office-city-remote-control",
      location: { name: "New York City" },
      content: `${onsiteNegationFixture.tenALabs.savedJob.content}<p>Work Environment: Fully remote.</p>`,
    },
    expectedRemoteStatus: "Hybrid",
    expectedSignals: ["remote", "conditional office requirement", "office days in qualifying location"],
    expectedReviewPattern: /recurring office requirement applies to this posting location/,
  },
  {
    name: "an outside city stays unknown when remote eligibility is unresolved",
    job: {
      ...onsiteNegationFixture.tenALabs.savedJob,
      id: "conditional-office-outside-city-control",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/conditional-office-outside-city-control",
      location: { name: "Boston, Massachusetts" },
    },
    expectedRemoteStatus: "Unknown",
    expectedSignals: ["conditional office requirement"],
    excludedSignals: ["office days in qualifying location", "fully remote outside named locations"],
    expectedReviewPattern: /fully remote eligibility outside them is not stated/,
  },
  {
    name: "explicit hybrid evidence remains hybrid with a conditional metro office rule",
    job: {
      ...onsiteNegationFixture.tenALabs.savedJob,
      id: "conditional-office-explicit-hybrid-control",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/conditional-office-explicit-hybrid-control",
      content: `${onsiteNegationFixture.tenALabs.savedJob.content}<p>This is a hybrid role.</p>`,
    },
    expectedRemoteStatus: "Hybrid",
    expectedSignals: ["hybrid", "conditional office requirement"],
  },
  {
    name: "onboarding and occasional travel alone do not make a remote role hybrid",
    job: {
      id: "onboarding-travel-control",
      title: "Technical Writer & Instructional Designer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/onboarding-travel-control",
      location: { name: "Remote" },
      content: "<p>All new hires will participate in in-person onboarding during their first week. Occasional travel may also be required for interviews, in-person meetings, and other business needs.</p>",
    },
    expectedRemoteStatus: "Remote",
    excludedSignals: ["hybrid", "conditional office requirement"],
  },
  {
    name: "office business hours and a remote denial do not establish attendance",
    job: {
      id: "office-hours-denial-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/office-hours-denial-control",
      location: { name: "" },
      content: "<p>Our office business hours are Monday to Friday, 9 a.m. to 5 p.m. Remote work options are currently unavailable.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["remote", "full-time office attendance"],
  },
  {
    name: "an isolated weekday range and a remote denial do not establish office attendance",
    job: {
      id: "weekday-range-denial-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/weekday-range-denial-control",
      location: { name: "" },
      content: "<p>Monday to Friday is our publishing schedule. Remote work options are currently unavailable.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["remote", "full-time office attendance"],
  },
  {
    name: "a remote-only denial does not turn a weekday office sentence into onsite proof",
    job: {
      id: "remote-only-weekday-office-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/remote-only-weekday-office-control",
      location: { name: "" },
      content: "<p>Monday to Friday, we thrive in our office environment. We do not offer remote-only roles.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["remote", "full-time office attendance"],
  },
  {
    name: "saved Adyen office-first text stays unknown without its form schedule",
    job: onsiteNegationFixture.adyen.savedJob,
    expectedRemoteStatus: onsiteNegationFixture.adyen.expectedRemoteStatusFromSavedInputs,
    excludedSignals: ["remote"],
    expectedReviewPattern: /full-week office attendance is not established/,
  },
  {
    name: "saved Adyen 3x office and 2x WFH schedule is hybrid",
    job: onsiteNegationFixture.adyenHybridSchedule.savedJob,
    expectedRemoteStatus: onsiteNegationFixture.adyenHybridSchedule.expectedRemoteStatus,
    expectedSignals: ["hybrid"],
    excludedSignals: ["remote"],
  },
  {
    name: "Adyen three-office-days and two-home-days schedule is hybrid when present in normal inputs",
    job: {
      ...onsiteNegationFixture.adyen.savedJob,
      content: `${onsiteNegationFixture.adyen.savedJob.content}<p>This role works three days in the Amsterdam office and two days from home.</p>`,
    },
    expectedRemoteStatus: onsiteNegationFixture.adyen.expectedRemoteStatusWhenScheduleIsAvailable,
    excludedSignals: ["remote"],
  },
  {
    name: "standalone WFH does not establish an explicit hybrid schedule",
    job: {
      id: "standalone-wfh-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/standalone-wfh-control",
      location: { name: "" },
      content: "<p>WFH may be available.</p><p>We do not offer remote-only roles.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["hybrid"],
  },
  {
    name: "lone 3x office count does not add explicit hybrid evidence",
    job: {
      id: "lone-office-count-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/lone-office-count-control",
      location: { name: "" },
      content: "<p>This role works 3x in the office.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["hybrid"],
  },
  {
    name: "unrelated numeric office and WFH mentions do not establish hybrid",
    job: {
      id: "unrelated-numeric-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/unrelated-numeric-control",
      location: { name: "" },
      content: "<p>The platform delivered 3x office growth. A separate survey reported 2x WFH usage.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["hybrid"],
  },
  {
    name: "separate 3x office and 2x WFH sentences do not establish hybrid",
    job: {
      id: "separate-schedule-sentences-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/separate-schedule-sentences-control",
      location: { name: "" },
      content: "<p>The team works 3x in the office. A separate policy example mentions 2x WFH.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["hybrid"],
  },
  {
    name: "hybrid role with fully remote denial stays hybrid",
    job: {
      id: "hybrid-control",
      title: "Content Designer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/hybrid-control",
      location: { name: "Manchester, United Kingdom" },
      content: "<p>This role is hybrid. You work in office two days per week. We do not offer fully remote work.</p>",
    },
    expectedRemoteStatus: "Hybrid",
    excludedSignals: ["remote"],
  },
  {
    name: "optional office visit stays remote",
    job: {
      id: "optional-office-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/optional-office-control",
      location: { name: "Remote UK" },
      content: "<p>This is a remote role. You may optionally visit our office for team events.</p>",
    },
    expectedRemoteStatus: "Remote",
  },
  {
    name: "travel does not make a remote role hybrid",
    job: {
      id: "travel-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/travel-control",
      location: { name: "Remote UK" },
      content: "<p>This is a remote role with quarterly travel to client offices.</p>",
    },
    expectedRemoteStatus: "Remote",
  },
  {
    name: "remote denial without office evidence is unknown",
    job: {
      id: "denial-only-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/denial-only-control",
      location: { name: "London, United Kingdom" },
      content: "<p>We do not offer remote work.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["remote"],
  },
  {
    name: "travel plus remote denial is not forced onsite",
    job: {
      id: "travel-denial-control",
      title: "Change Manager",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/travel-denial-control",
      location: { name: "Baltimore, United States" },
      content: "<p>This is not a remote position because the role requires 75% travel to client locations.</p>",
    },
    expectedRemoteStatus: "Unknown",
    excludedSignals: ["remote"],
  },
  {
    name: "full-week office evidence without denial is not forced onsite",
    job: {
      id: "office-only-control",
      title: "Technical Writer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/office-only-control",
      location: { name: "" },
      content: "<p>Monday through Friday we work from our office.</p>",
    },
    expectedRemoteStatus: "Unknown",
  },
  {
    name: "Affirm-style Remote UK text stays remote",
    job: {
      id: "remote-uk-control",
      title: "Content Designer II",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/remote-uk-control",
      location: { name: "Remote UK" },
      content: "<p>Remote-first with flexibility built in. Some positions may occasionally require in-person work at an office.</p>",
    },
    expectedRemoteStatus: "Remote",
  },
  {
    name: "remote-first but not remote-only is not a role denial",
    job: {
      id: "remote-only-boilerplate-control",
      title: "Support Specialist",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/remote-only-boilerplate-control",
      location: { name: "Manila, Philippines" },
      content: "<p>We are a remote-first, but not remote-only company. This role requires full-time, in-office presence, five days a week.</p>",
    },
    expectedRemoteStatus: "Hybrid",
  },
  {
    name: "explicit hybrid evidence wins a contradictory full-week office statement",
    job: {
      id: "hybrid-conflict-control",
      title: "Content Designer",
      absolute_url: "https://boards.greenhouse.io/fixture/jobs/hybrid-conflict-control",
      location: { name: "London, United Kingdom" },
      content: "<p>This is a hybrid role with three days in the office and two days from home. Another statement says Monday through Friday we work from our office and do not offer remote work.</p>",
    },
    expectedRemoteStatus: "Hybrid",
    expectedReviewPattern: /explicit Hybrid evidence conflicts/,
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

  for (const fixture of workArrangementFixtures) {
    const normalized = normalizeGreenhouseJob(fixture.job, context, []);
    const failures = [];

    if (normalized.RemoteStatus !== fixture.expectedRemoteStatus) {
      failures.push(`expected RemoteStatus ${fixture.expectedRemoteStatus}, got ${normalized.RemoteStatus}`);
    }
    for (const signal of fixture.expectedSignals || []) {
      if (!normalized.RemoteSignal.split(" | ").includes(signal)) {
        failures.push(`expected positive signal ${signal}, got ${normalized.RemoteSignal}`);
      }
    }
    for (const signal of fixture.excludedSignals || []) {
      if (normalized.RemoteSignal.split(" | ").includes(signal)) {
        failures.push(`did not expect positive signal ${signal}, got ${normalized.RemoteSignal}`);
      }
    }
    if (fixture.expectedReviewPattern && !fixture.expectedReviewPattern.test(normalized.LocationReviewReason)) {
      failures.push(`expected review reason to match ${fixture.expectedReviewPattern}, got ${normalized.LocationReviewReason}`);
    }
    for (const pattern of fixture.expectedReviewPatterns || []) {
      if (!pattern.test(normalized.LocationReviewReason)) {
        failures.push(`expected review reason to match ${pattern}, got ${normalized.LocationReviewReason}`);
      }
    }

    const status = failures.length ? "FAIL" : "PASS";
    result.Results.push({
      Name: fixture.name,
      Status: status,
      RemoteStatus: normalized.RemoteStatus,
      RemoteSignal: normalized.RemoteSignal,
      LocationReviewReason: normalized.LocationReviewReason,
      ExpectedRemoteStatus: fixture.expectedRemoteStatus,
    });
    for (const failure of failures) {
      result.Failures.push(`${fixture.name}: ${failure}`);
    }
  }

  const leverControl = normalizeLeverJob(
    {
      id: "lever-provider-control",
      text: "Technical Writer",
      hostedUrl: "https://jobs.lever.co/fixture/lever-provider-control",
      categories: { location: "London, United Kingdom" },
      descriptionPlain: "Monday - Friday we work from our office and do not offer remote work.",
    },
    { ...context, ats: "lever" },
    []
  );
  const leverControlStatus = leverControl.RemoteStatus === "Remote" ? "PASS" : "FAIL";
  result.Results.push({
    Name: "non-Greenhouse provider behavior is unchanged",
    Status: leverControlStatus,
    RemoteStatus: leverControl.RemoteStatus,
    RemoteSignal: leverControl.RemoteSignal,
    ExpectedRemoteStatus: "Remote",
  });
  if (leverControlStatus === "FAIL") {
    result.Failures.push(`non-Greenhouse provider behavior is unchanged: expected RemoteStatus Remote, got ${leverControl.RemoteStatus}`);
  }

  result.Status = result.Failures.length ? "FAIL" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-greenhouse-normalize-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-greenhouse-normalize-results.md"), buildMarkdown(result), "utf8");

  console.log(`Greenhouse normalize regression: ${result.Status}`);
  for (const row of result.Results) {
    const detail = row.PostedDate
      ? `${row.PostedDate} age ${row.AgeDays}`
      : `${row.RemoteStatus} (${row.RemoteSignal || "no positive text signal"})`;
    console.log(`${row.Status}: ${row.Name} -> ${detail}`);
  }

  if (result.Failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
