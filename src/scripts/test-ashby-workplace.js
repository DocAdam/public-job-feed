const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { buildJobExportArtifacts, publicFeedHeaders } = require("../lib/job-export");
const { readJobTitles } = require("../lib/job-titles");
const { normalizeAshbyJob, normalizeGreenhouseJob } = require("../lib/jobs-normalize");
const { SIMPLE_PUBLIC_HEADERS, buildSimplePublicRow } = require("../lib/simple-public-export");
const { groupPublicSheetCountryPostings } = require("./build-gsheet-package");

const fixturePath = path.join(
  __dirname,
  "fixtures",
  "ashby-workplace",
  "1password-staff-content-developer.json"
);

const context = {
  company: "1Password",
  companyKey: "1password",
  catalogSlug: "1password",
  boardUrl: "https://jobs.ashbyhq.com/1password",
  fetchUrl: "https://api.ashbyhq.com/posting-api/job-board/1password",
  fetchedAt: "2026-11-17T12:00:00.000Z",
};

function ashbyJob(overrides = {}) {
  return {
    id: "test-job",
    title: "Technical Writer",
    location: "Remote, United States",
    jobUrl: "https://jobs.ashbyhq.com/example/test-job",
    descriptionHtml: "<p>This role is remote in the United States.</p>",
    ...overrides,
  };
}

async function main() {
  const [fixture, titleRecords] = await Promise.all([
    fs.readFile(fixturePath, "utf8").then(JSON.parse),
    readJobTitles(path.join(process.cwd(), "data", "config", "job-titles.md")),
  ]);

  const normalized = normalizeAshbyJob(fixture, context, titleRecords);
  assert.equal(normalized.RawJobId, "3bacd3c1-45d1-4337-a11b-a21569a51148");
  assert.equal(normalized.Location, "Remote (United States | Canada)");
  assert.equal(normalized.RemoteStatus, "Remote");
  assert.equal(normalized.USRemoteEligible, true);
  assert.equal(normalized.SalaryDetected, false);
  assert.equal(normalized.SalaryText, "");
  assert.match(normalized.RemoteSignal, /workplaceType=Remote/);
  assert.match(normalized.RemoteSignal, /isRemote=true/);
  assert.match(normalized.RemoteSignal, /hybrid/);
  assert.equal(normalized.LocationCountrySignal, "United States | Canada");
  assert.match(normalized.LocationReviewReason, /no explicit role-specific office-day requirement/);
  assert.doesNotMatch(normalized.LocationReviewReason, /workplaceType=Remote conflicts/);
  assert.equal(normalized.EmploymentSchedule, "Full-time");
  assert.deepEqual(normalized.EmploymentTerms, []);
  assert.equal(normalized.EmploymentTypeStatus, "stated");

  const artifacts = buildJobExportArtifacts(
    [normalized],
    [],
    titleRecords,
    "2026-11-17T12:00:00.000Z"
  );
  const exported = artifacts.publicFeedRows[0];
  const simple = buildSimplePublicRow(exported, "2026-11-17T12:00:00.000Z");
  assert.equal(simple["Work Arrangement"], "Remote");
  assert.equal(simple.Salary, "");
  assert.equal(simple["Employment Type"], "Full-time");
  assert.equal(exported.WriterFitScore, 85);
  assert.equal(exported.WriterFitTier, "A");
  assert.equal(exported.JobKey, "ashby:3bacd3c145d14337a11ba21569a51148");
  assert.equal(
    exported.CompanyTitleLocationKey,
    "1password:staffcontentdeveloper:remoteunitedstatescanada"
  );
  assert.equal(exported.PossibleDuplicate, false);
  assert.equal(exported.DuplicateGroupKey, "");
  assert.deepEqual(groupPublicSheetCountryPostings([simple]), [simple]);

  assert.deepEqual(SIMPLE_PUBLIC_HEADERS, [
    "Title",
    "Company",
    "Location",
    "Apply Link",
    "Additional Apply Links",
    "Writer Fit Score",
    "Fit Tier",
    "Why It Matched",
    "Role Type",
    "Work Arrangement",
    "Salary",
    "Posted Date",
    "Age (Days)",
    "Last Checked",
    "Source",
    "Employment Type",
  ]);
  assert.ok(!publicFeedHeaders.includes("workplaceType"));
  assert.ok(!publicFeedHeaders.includes("isRemote"));
  assert.equal(publicFeedHeaders.length, 65);

  const hybrid = normalizeAshbyJob(
    ashbyJob({
      id: "hybrid-role",
      location: "Toronto, Canada",
      workplaceType: "Hybrid",
      isRemote: true,
      descriptionHtml: "<p>This role is hybrid in Toronto. The company also supports remote work.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(hybrid.RemoteStatus, "Hybrid");
  assert.match(hybrid.RemoteSignal, /workplaceType=Hybrid/);
  assert.match(hybrid.RemoteSignal, /remote/);
  assert.doesNotMatch(hybrid.LocationReviewReason, /workplaceType=Hybrid conflicts/);

  const onsite = normalizeAshbyJob(
    ashbyJob({
      id: "onsite-role",
      location: "Denver, Colorado",
      workplaceType: "OnSite",
      isRemote: false,
      descriptionHtml: "<p>This role works from our Denver office. The company also supports remote work.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(onsite.RemoteStatus, "Onsite");
  assert.match(onsite.LocationReviewReason, /structured Onsite overrides text classification=Remote/);
  assert.doesNotMatch(onsite.LocationReviewReason, /workplaceType=OnSite conflicts/);

  const textFallback = normalizeAshbyJob(
    ashbyJob({ workplaceType: null, isRemote: null }),
    context,
    titleRecords
  );
  assert.equal(textFallback.RemoteStatus, "Remote");
  assert.equal(textFallback.RemoteSignal, "remote | remote us");

  const isRemoteOnly = normalizeAshbyJob(
    ashbyJob({
      workplaceType: null,
      isRemote: true,
      descriptionHtml: "<p>Some other roles are hybrid.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(isRemoteOnly.RemoteStatus, "Hybrid");
  assert.match(isRemoteOnly.RemoteSignal, /isRemote=true/);

  const unknownWithRemoteTrue = normalizeAshbyJob(
    ashbyJob({
      workplaceType: "Distributed",
      isRemote: true,
      descriptionHtml: "<p>Some other roles are hybrid.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(unknownWithRemoteTrue.RemoteStatus, "Hybrid");
  assert.match(unknownWithRemoteTrue.LocationReviewReason, /Unrecognized workplaceType=Distributed/);

  const remoteFalseUsesText = normalizeAshbyJob(
    ashbyJob({
      location: "Austin, Texas",
      workplaceType: null,
      isRemote: false,
      descriptionHtml: "<p>This role is hybrid in Austin.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(remoteFalseUsesText.RemoteStatus, "Hybrid");

  const normalHybridRemoteFlag = normalizeAshbyJob(
    ashbyJob({ workplaceType: "Hybrid", isRemote: true }),
    context,
    titleRecords
  );
  assert.equal(normalHybridRemoteFlag.RemoteStatus, "Hybrid");
  assert.doesNotMatch(normalHybridRemoteFlag.LocationReviewReason, /workplaceType=Hybrid conflicts/);

  for (const [workplaceType, isRemote] of [
    ["Remote", false],
    ["Hybrid", false],
    ["OnSite", true],
  ]) {
    const mismatch = normalizeAshbyJob(
      ashbyJob({ workplaceType, isRemote }),
      context,
      titleRecords
    );
    assert.match(
      mismatch.LocationReviewReason,
      new RegExp(`workplaceType=${workplaceType} conflicts with isRemote=${isRemote}`)
    );
  }

  const officeRequirement = normalizeAshbyJob(
    ashbyJob({
      workplaceType: "Remote",
      isRemote: true,
      descriptionHtml: "<p>This role requires two in-office days each week.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(officeRequirement.RemoteStatus, "Remote");
  assert.match(officeRequirement.LocationReviewReason, /explicit role-specific office requirement/);

  const canadaOnly = normalizeAshbyJob(
    ashbyJob({
      location: "Remote, Canada",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "Canada" } },
      descriptionHtml: "<p>This role is available only in Canada.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(canadaOnly.RemoteStatus, "Remote");
  assert.equal(canadaOnly.USRemoteEligible, false);

  const germany = normalizeAshbyJob(
    ashbyJob({
      id: "germany-role",
      location: "Germany",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "Germany" } },
      descriptionHtml: "<p>This role is based in Germany.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(germany.RemoteStatus, "Remote");
  assert.equal(germany.LocationCountrySignal, "Germany");
  assert.equal(germany.USRemoteEligible, false);

  const postHogRemoteUs = normalizeAshbyJob(
    ashbyJob({
      id: "posthog-remote-us",
      location: "Remote (US)",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "United States" } },
      descriptionHtml: "<p>This role works in Pacific time.</p>",
    }),
    { ...context, company: "PostHog", companyKey: "posthog", catalogSlug: "posthog" },
    titleRecords
  );
  assert.equal(postHogRemoteUs.LocationCountrySignal, "United States");
  assert.equal(postHogRemoteUs.USRemoteEligible, true);

  const bareUsWithoutAddress = normalizeAshbyJob(
    ashbyJob({
      id: "bare-us-without-address",
      location: "Remote (US)",
      workplaceType: "Remote",
      isRemote: true,
      descriptionHtml: "<p>This role works in Pacific time.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(bareUsWithoutAddress.LocationCountrySignal, "United States");
  assert.equal(bareUsWithoutAddress.USRemoteEligible, true);

  const secondaryUs = normalizeAshbyJob(
    ashbyJob({
      id: "secondary-us-role",
      location: "Remote, Canada",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "Canada" } },
      secondaryLocations: [
        { address: { addressCountry: "US" } },
      ],
      descriptionHtml: "<p>This role is available in the listed locations.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(secondaryUs.LocationCountrySignal, "Canada | United States");
  assert.equal(secondaryUs.USRemoteEligible, true);

  const additionalPostingCountry = normalizeAshbyJob(
    ashbyJob({
      id: "additional-posting-country",
      location: "Remote (United States | Canada)",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "US" } },
      descriptionHtml: "<p>This role is available in the listed locations.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(additionalPostingCountry.LocationCountrySignal, "United States | Canada");
  assert.equal(additionalPostingCountry.USRemoteEligible, true);

  const conflictingCountryEvidence = normalizeAshbyJob(
    ashbyJob({
      id: "country-conflict",
      location: "Remote (US)",
      workplaceType: "Remote",
      isRemote: true,
      address: { postalAddress: { addressCountry: "Canada" } },
      descriptionHtml: "<p>This role is available in the listed location.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(conflictingCountryEvidence.LocationCountrySignal, "Canada | United States");
  assert.equal(conflictingCountryEvidence.USRemoteEligible, true);
  assert.match(conflictingCountryEvidence.LocationReviewReason, /Country evidence conflict/);

  const roleTextCountryFallback = normalizeAshbyJob(
    ashbyJob({
      id: "role-text-country-fallback",
      location: "Remote",
      workplaceType: "Remote",
      isRemote: true,
      descriptionHtml: "<p>This role is available only in Canada.</p><p>USA-based roles only: The annual base salary is listed separately.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(roleTextCountryFallback.LocationCountrySignal, "Canada");
  assert.equal(roleTextCountryFallback.USRemoteEligible, false);

  const ukWithUsSalaryBoilerplate = normalizeAshbyJob(
    ashbyJob({
      location: "London, UK",
      workplaceType: "Remote",
      isRemote: true,
      descriptionHtml: "<p>This role is in the United Kingdom.</p><p>USA-based roles use a separate salary range.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(ukWithUsSalaryBoilerplate.RemoteStatus, "Remote");
  assert.equal(ukWithUsSalaryBoilerplate.LocationCountrySignal, "United Kingdom");
  assert.equal(ukWithUsSalaryBoilerplate.USRemoteEligible, false);

  const travelOnly = normalizeAshbyJob(
    ashbyJob({
      workplaceType: "Remote",
      isRemote: true,
      descriptionHtml: "<p>This remote US role requires quarterly travel.</p>",
    }),
    context,
    titleRecords
  );
  assert.equal(travelOnly.RemoteStatus, "Remote");
  assert.doesNotMatch(travelOnly.RemoteSignal, /hybrid|office days/);

  const greenhouseControl = normalizeGreenhouseJob(
    {
      id: "greenhouse-control",
      title: "Technical Writer",
      location: { name: "Remote, United States" },
      content: "<p>This role is remote. Some other company roles are hybrid.</p>",
      absolute_url: "https://boards.greenhouse.io/example/jobs/greenhouse-control",
      workplaceType: "Onsite",
      isRemote: false,
    },
    { ...context, ats: "greenhouse" },
    titleRecords
  );
  assert.equal(greenhouseControl.RemoteStatus, "Hybrid");
  assert.equal(greenhouseControl.RemoteSignal, "remote | remote us | hybrid");
  assert.doesNotMatch(greenhouseControl.RemoteSignal, /workplaceType|isRemote/);

  const greenhouseBareUsControl = normalizeGreenhouseJob(
    {
      id: "greenhouse-bare-us-control",
      title: "Technical Writer",
      location: { name: "Remote (US)" },
      content: "<p>Join our distributed team.</p>",
      absolute_url: "https://boards.greenhouse.io/example/jobs/greenhouse-bare-us-control",
    },
    { ...context, ats: "greenhouse" },
    titleRecords
  );
  assert.equal(greenhouseBareUsControl.RemoteStatus, "Remote");
  assert.equal(greenhouseBareUsControl.USRemoteEligible, "unknown");

  console.log(
    "PASS: Ashby structured workplace precedence, conflict diagnostics, geography, public schema, and non-Ashby control."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
