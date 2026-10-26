const { buildDailyReview, locate, enrich } = require("../lib/daily-jobs-review");
const {
  buildMarkdown,
  buildSubstackMarkdown,
  displayCompanyName,
  overlapRows,
  previousRows,
  uniqueRowCount,
  validateReports,
} = require("../lib/all-remote-daily-report");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function row(title, url, location) {
  return { Title: title, Company: "Example", Location: location, "Apply Link": url };
}

function report({ filter, current, added = [], removed = [], previousCount, continuing }) {
  return {
    GeneratedAt: "2026-09-05 12:00:00 UTC",
    CurrentSnapshot: "20260905-0704",
    PreviousSnapshot: "20260904-0441",
    Filter: filter,
    Counts: {
      Current: current.length,
      Previous: previousCount,
      Added: added.length,
      Removed: removed.length,
      Continuing: continuing,
    },
    Added: added,
    Removed: removed,
    Current: current,
  };
}

function main() {
  const shared = row("Shared", "https://example.test/shared", "US / Canada");
  const usOnly = row("US only", "https://example.test/us", "US");
  const internationalOnly = row("International only", "https://example.test/international", "EMEA");
  const removedUs = row("Removed US", "https://example.test/removed-us", "US");
  const removedInternational = row("Removed international", "https://example.test/removed-int", "Canada");
  const usReport = report({
    filter: "US filter.",
    current: [shared, usOnly],
    added: [usOnly],
    removed: [removedUs],
    previousCount: 2,
    continuing: 1,
  });
  const internationalReport = report({
    filter: "International filter.",
    current: [shared, internationalOnly],
    added: [internationalOnly],
    removed: [removedInternational],
    previousCount: 2,
    continuing: 1,
  });

  validateReports(usReport, internationalReport);
  assert(overlapRows(usReport.Current, internationalReport.Current).length === 1, "Expected one overlapping job.");
  assert(uniqueRowCount(usReport.Current, internationalReport.Current) === 3, "Expected three unique current jobs.");
  assert(previousRows(usReport).length === 2, "Expected two reconstructed previous US jobs.");

  const substackRows = [
    { ...row("Old-date new US role", "https://example.test/older-us", "US"), Company: "Alpha", "Work Arrangement": "Remote", "Posted Date": "2020-09-20" },
    { ...row("No-date US role", "https://example.test/no-date-us", "US"), Company: "Beta", "Work Arrangement": "Remote", "Posted Date": "" },
    { ...row("Newest shared role", "https://example.test/newest-shared", "US / Canada"), Company: "Gamma", "Work Arrangement": "Remote", "Posted Date": "2026-10-01" },
    { ...row("Middle international role", "https://example.test/middle-int", "Germany"), Company: "Delta", "Work Arrangement": "Remote", "Posted Date": "2026-09-25" },
    { ...row("Hybrid role", "https://example.test/hybrid", "US"), Company: "Epsilon", "Work Arrangement": "Hybrid", "Posted Date": "2026-10-02" },
  ];
  const substackPreviousRows = [substackRows[1], substackRows[3]];
  const substackDetails = [
    { URL: "https://example.test/newest-shared", Description: "Graphite is a technology-enabled growth agency." },
  ];
  substackRows[2].Company = "Graphitehq";
  const substack = buildSubstackMarkdown({
    generatedAt: "2026-10-01T12:00:00Z",
    currentRows: substackRows,
    previousRows: substackPreviousRows,
    details: substackDetails,
  });
  for (const text of [
    "# Writing and documentation jobs — Remote openings",
    "Snapshot: October 1, 2026",
    "4 unique remote jobs · 3 U.S. remote · 2 international remote",
    "[Open the full active Google Sheet](https://docs.google.com/spreadsheets/",
    "## Added since previous package",
    "## U.S. remote jobs",
    "## International remote jobs",
    "- [Newest shared role](https://example.test/newest-shared) — Graphite — US / Canada",
  ]) assert(substack.includes(text), `Expected Substack Markdown to include: ${text}`);
  assert(!substack.split("\n").filter(line => line.startsWith("- ")).some(line => /2026-10-01|Oct\. 1, 2026/.test(line)), "Job bullets must not display posting dates.");
  assert(displayCompanyName({ Company: "Lightfeatheriollc" }, { Description: "LightFeather is seeking a developer." }) === "LightFeather", "Expected the employer display name from posting text.");
  assert(displayCompanyName({ Company: "Defenseunicorns" }, { Description: "Defense Unicorns delivers secure software." }) === "Defense Unicorns", "Expected the spaced employer display name from posting text.");
  assert(displayCompanyName({ Company: "Jobgether" }, { Description: "The client is seeking a writer." }) === "Jobgether", "Unmatched company names must keep their existing display value.");
  assert(displayCompanyName({ Company: "Referralsuseonly" }, { Description: "Elastic, the Search AI Company, enables everyone to find answers." }) === "Elastic", "Both publication reports must use existing employer-name cleanup.");
  const savedDate = buildSubstackMarkdown({ generatedAt: "2026-10-11T12:00:00Z", reportDate: "2026-10-10T11:58:00Z",
    currentSnapshot: "20261010-0658", previousSnapshot: "20261009-0509", currentRows: substackRows, previousRows: substackRows });
  assert(savedDate.includes("Snapshot: October 10, 2026"), "The snapshot date must come from the package.");
  assert(savedDate.includes("0 unique remote jobs added since the previous package."), "Continuing remote jobs must not count as additions.");
  assert(savedDate.includes("1 jobs appear in both regional lists"), "Overlapping geography must be explicit.");
  const newStart = substack.indexOf("## Added since previous package");
  const usStart = substack.indexOf("## U.S. remote jobs");
  const internationalStart = substack.indexOf("## International remote jobs");
  const newSection = substack.slice(newStart, usStart);
  const usSection = substack.slice(usStart, internationalStart);
  assert(newStart < usStart, "Added since previous package must appear before the regional lists.");
  assert(newSection.includes("Newest shared role") && newSection.includes("Old-date new US role"), "Added since previous package must use comparison membership, including older postings.");
  assert((newSection.match(/Newest shared role/g) || []).length === 1, "A multi-region job must occur once in Added since previous package.");
  assert(usSection.indexOf("Newest shared role") < usSection.indexOf("Old-date new US role"), "Dated US jobs must stay newest first internally.");
  assert(usSection.indexOf("Old-date new US role") < usSection.indexOf("No-date US role"), "US jobs without dates must follow dated jobs.");
  const internationalSection = substack.slice(internationalStart);
  assert(internationalSection.indexOf("Newest shared role") < internationalSection.indexOf("Middle international role"), "International jobs must be newest first.");
  assert((substack.match(/Newest shared role/g) || []).length === 3, "A multi-region job must appear once in Added since previous package and in both regional sections.");
  assert(!substack.includes("Hybrid role"), "Substack mode must reuse remote qualification filters.");
  for (const excluded of ["methodology", "Possible post subjects", "churn", "npm run"]) {
    assert(!substack.includes(excluded), `Substack Markdown must exclude: ${excluded}`);
  }

  const groupedRows = [
    { ...row("Content Writer - Amharic - Remote", "https://example.test/lilt-amharic", "Ethiopia | US"), Company: "LILT", "Work Arrangement": "Remote", "Posted Date": "2026-09-30" },
    { ...row("Content Writer - Urdu - Remote", "https://example.test/lilt-urdu", "India | Pakistan | US"), Company: "LILT", "Work Arrangement": "Remote", "Posted Date": "2026-09-29" },
    { ...row("Localization Program Manager", "https://example.test/lilt-manager", "US"), Company: "LILT", "Work Arrangement": "Remote", "Posted Date": "2026-09-28" },
  ];
  const groupedMarkdown = buildSubstackMarkdown({ generatedAt: "2026-10-01T12:00:00Z", currentRows: groupedRows });
  const groupedUs = groupedMarkdown.slice(groupedMarkdown.indexOf("## U.S. remote jobs"), groupedMarkdown.indexOf("## International remote jobs"));
  assert((groupedUs.match(/Remote Content Writers — multiple languages/g) || []).length === 1, "LILT language variants must collapse into one US entry.");
  assert(groupedUs.includes("Multiple countries and languages"), "The LILT group must summarize its scope.");
  assert(!groupedUs.includes("Content Writer - Amharic") && !groupedUs.includes("Content Writer - Urdu"), "Grouped language titles must not remain as separate US entries.");
  assert(groupedUs.includes("Localization Program Manager"), "A distinct role at LILT must remain separate.");
  assert(groupedMarkdown.includes("3 unique remote jobs · 3 U.S. remote · 2 international remote"), "Presentation grouping must not change source counts.");

  const markdown = buildMarkdown({
    generatedAt: "2026-09-05 12:01:00 UTC",
    usReport,
    internationalReport,
  });
  for (const text of [
    "# All Remote Jobs — Daily Comparison",
    "## At a glance",
    "### Current jobs in both reports",
    "## US Remote Jobs",
    "## International Remote Jobs",
    "### Added",
    "### Removed",
    "### Current jobs",
    "Unique current jobs across both reports: 3",
  ]) {
    assert(markdown.includes(text), `Expected Markdown to include: ${text}`);
  }

  const mismatched = { ...internationalReport, CurrentSnapshot: "20260906-0704" };
  let mismatchFailed = false;
  try {
    validateReports(usReport, mismatched);
  } catch (error) {
    mismatchFailed = /same current and previous snapshots/.test(error.message);
  }
  assert(mismatchFailed, "Expected mismatched snapshots to fail validation.");
  assert(locate("Remote")[0].region === "Needs location review", "Generic remote must stay unresolved.");
  assert(locate("Worldwide")[0].region === "Worldwide", "Worldwide must remain separate.");
  assert(locate("Multiple locations: France; +28 more")[0].region === "Needs location review", "Truncated locations must not imply complete coverage.");
  assert(locate("US | Canada").filter(p => p.code).length === 2, "Multi-country job must reach both countries.");
  assert(locate("London | Stockholm").filter(p => p.code).length === 2, "City mappings must preserve multiple countries.");
  assert(locate("Chicago")[0].inferred, "City mapping must be marked as derived.");
  const testRows = [
    { ...row("Technical Writer", "https://example.test/a", "US"), Company: "Alpha", "Work Arrangement": "Remote" },
    { ...row("Technical Writer", "https://example.test/b", "Canada"), Company: "Beta", "Work Arrangement": "Hybrid" },
    { ...row("Technical Author", "https://example.test/c", "Germany"), Company: "Gamma", "Work Arrangement": "Onsite" },
    { ...row("Content Writer", "https://example.test/d", "Remote"), Company: "Delta", "Work Arrangement": "Unknown" },
  ];
  const detailRows = testRows.slice(0, 3).map(r => ({ URL: r["Apply Link"], Location: r.Location, Description: "<p>You will maintain API documentation for our customers.</p>" }));
  const options = { generatedAt: "2026-09-08", currentSnapshot: "20260908-0506", previousSnapshot: "20260907-0701",
    currentRows: [...testRows, testRows[0]], previousRows: [testRows[0]], baselineRows: [testRows[0]], baselineSnapshot: "20260901-0603", details: detailRows };
  const review = buildDailyReview(options);
  assert(review.includes("4 unique current application URLs"), "Duplicate rows must not inflate totals.");
  assert(review.includes("### API documentation"), "Three companies with source text must produce a topic.");
  assert(review.includes("You will maintain API documentation"), "Topic must include source evidence.");
  assert(review.includes("##### Hybrid (1)") && review.includes("##### Onsite (1)"), "Non-remote jobs must be grouped.");
  assert(review.includes("Needs location review"), "Unresolved jobs must remain available.");
  assert(review.includes("[Apply](https://example.test/c)"), "Supporting entries must preserve application URLs.");
  const ids = [...review.matchAll(/<a id="([^"]+)"/g)].map(m => m[1]);
  assert(new Set(ids).size === ids.length, "Explicit anchors must be unique.");
  for (const match of review.matchAll(/\]\(#([^)]*)\)/g)) {
    assert(ids.includes(match[1]) || match[1] === "remote-comparison", `Missing internal anchor: ${match[1]}`);
  }
  const oneEmployer = buildDailyReview({ ...options, currentRows: testRows.map(r => ({ ...r, Company: "Alpha" })) });
  assert(!oneEmployer.includes("### API documentation"), "One company with multiple jobs must not meet the topic threshold.");
  const noText = buildDailyReview({ ...options, details: [] });
  assert(noText.includes("Posting text matched to 0 of 4"), "Missing source text coverage must be explicit.");
  assert(!noText.includes("### API documentation"), "Missing text must not produce unsupported topics.");
  const grouped = { ...testRows[0], Location: "Multiple locations (2 postings): US; +1 more", "Additional Apply Links": testRows[1]["Apply Link"] };
  assert(enrich([grouped], detailRows)[0].places.filter(p => p.code).length === 2, "Complete source links must recover country groups.");
  assert(enrich([grouped], detailRows.slice(0, 1))[0].places[0].region === "Needs location review", "Partial source links must leave truncated locations unresolved.");
  const combined = buildMarkdown({ generatedAt: "2026-09-08", usReport, internationalReport, review: options });
  assert(combined.startsWith("# Daily Jobs Review") && combined.includes('id="remote-comparison"'), "Combined report must include review and remote comparison.");
  require("./test-jobs-snapshot").main();
  console.log("All-remote daily report tests: PASS");
}

try {
  main();
} catch (error) {
  console.error(`All-remote daily report tests: FAIL: ${error.message}`);
  process.exitCode = 1;
}
