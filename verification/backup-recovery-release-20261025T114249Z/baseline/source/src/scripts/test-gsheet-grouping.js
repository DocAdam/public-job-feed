const assert = require("assert");
const { groupPublicSheetCountryPostings } = require("./build-gsheet-package");
const {
  SIMPLE_FORMULA_HEADERS,
  SIMPLE_PUBLIC_HEADERS,
  buildSimpleFormulaRow,
  buildSimplePublicRow,
} = require("../lib/simple-public-export");

assert.ok(SIMPLE_PUBLIC_HEADERS.includes("Additional Apply Links"));
assert.ok(SIMPLE_FORMULA_HEADERS.includes("Additional Apply Links"));

function buildRow(overrides = {}) {
  return {
    Title: "Technical Writer",
    Company: "Jobgether",
    Location: "US",
    "Apply Link": "https://example.com/us",
    "Writer Fit Score": "80",
    "Age (Days)": "2",
    "Posted Date": "2026-07-18",
    "Last Checked": "2026-07-20 10:00 UTC",
    Source: "lever",
    ...overrides,
  };
}

const groupedJobgether = groupPublicSheetCountryPostings([
  buildRow(),
  buildRow({
    Location: "Canada",
    "Apply Link": "https://example.com/ca",
    "Writer Fit Score": "85",
    "Age (Days)": "3",
    "Posted Date": "2026-07-17",
    "Last Checked": "2026-07-20 11:00 UTC",
  }),
]);

assert.strictEqual(groupedJobgether.length, 1);
assert.strictEqual(groupedJobgether[0].Location, "Multiple locations (2 postings): Canada; US");
assert.strictEqual(groupedJobgether[0]["Apply Link"], "https://example.com/us");
assert.strictEqual(groupedJobgether[0]["Additional Apply Links"], "https://example.com/ca");
assert.strictEqual(groupedJobgether[0]["Posted Date"], "2026-07-17");
assert.strictEqual(groupedJobgether[0]["Age (Days)"], 3);
assert.strictEqual(groupedJobgether[0]["Last Checked"], "2026-07-20 11:00 UTC");

const rawSimpleRow = buildSimplePublicRow({ URL: "https://example.com/plain" }, "2026-07-20T00:00:00Z");
assert.strictEqual(rawSimpleRow["Additional Apply Links"], "");
const rawFormulaRow = buildSimpleFormulaRow({ URL: "https://example.com/formula" }, "2026-07-20T00:00:00Z");
assert.strictEqual(rawFormulaRow["Additional Apply Links"], "");
assert.strictEqual(rawFormulaRow["Apply Link"], "https://example.com/formula");
assert.strictEqual(
  buildSimplePublicRow({ ApplyURL: "https://example.com/direct", URL: "https://example.com/ats" }, "2026-07-20T00:00:00Z")["Apply Link"],
  "https://example.com/direct",
  "ordinary rows should continue to prefer a direct application URL"
);

const posthogSimpleRow = buildSimplePublicRow(
  {
    ATS: "ashby",
    CompanyKey: "posthog",
    RawJobId: "56cc4793-348c-46c8-bba8-3337b990ecad",
    URL: "https://jobs.ashbyhq.com/posthog/56cc4793-348c-46c8-bba8-3337b990ecad",
  },
  "2026-07-20T00:00:00Z"
);
assert.strictEqual(posthogSimpleRow["Apply Link"], "https://posthog.com/careers/member-of-the-technical-writing-staff");
assert.strictEqual(
  buildSimpleFormulaRow(
    {
      ATS: " AshBy ",
      CompanyKey: " PostHog ",
      RawJobId: "ec954b2d-5bb1-4d8a-b968-88002f78d62c",
      URL: "https://jobs.ashbyhq.com/posthog/ec954b2d-5bb1-4d8a-b968-88002f78d62c",
    },
    "2026-07-20T00:00:00Z"
  ).Apply,
  '=HYPERLINK("https://posthog.com/careers/technical-content-writer","Apply")',
  "formula exports should use the public URL override"
);
assert.strictEqual(
  buildSimplePublicRow(
    {
      ATS: "ashby",
      CompanyKey: "posthog",
      RawJobId: "different-job-id",
      URL: "https://jobs.ashbyhq.com/posthog/different-job-id",
    },
    "2026-07-20T00:00:00Z"
  )["Apply Link"],
  "https://jobs.ashbyhq.com/posthog/different-job-id",
  "an override must not apply to a different job"
);

const groupedCgsFederal = groupPublicSheetCountryPostings([
  buildRow({ Company: "Cgsfederal", Location: "Atlanta, GA" }),
  buildRow({ Company: "Cgsfederal", Location: "Chicago, IL" }),
]);
assert.strictEqual(groupedCgsFederal.length, 1);

const groupedCompany = groupPublicSheetCountryPostings([
  buildRow({ Company: "Caci", Location: "Reston, VA" }),
  buildRow({ Company: "Caci", Location: "Sterling, VA" }),
]);
assert.strictEqual(groupedCompany.length, 1);

const sameLocationRowsStaySeparate = groupPublicSheetCountryPostings([
  buildRow({ Company: "Caci", Location: "Reston, VA", "Apply Link": "https://example.com/a" }),
  buildRow({ Company: "Caci", Location: "Reston, VA", "Apply Link": "https://example.com/b" }),
]);
assert.strictEqual(sameLocationRowsStaySeparate.length, 2);

const remoteVariantStaysRemote = groupPublicSheetCountryPostings([
  buildRow({ Company: "Remote Co", Location: "London", "Work Arrangement": "Onsite" }),
  buildRow({ Company: "Remote Co", Location: "USA", "Work Arrangement": "Remote" }),
]);
assert.strictEqual(remoteVariantStaysRemote.length, 1);
assert.strictEqual(remoteVariantStaysRemote[0]["Work Arrangement"], "Remote");

const differentTitles = groupPublicSheetCountryPostings([
  buildRow(),
  buildRow({ Title: "Senior Technical Writer", Location: "Canada" }),
]);
assert.strictEqual(differentTitles.length, 2);

console.log("Google Sheets multi-location grouping tests passed.");
