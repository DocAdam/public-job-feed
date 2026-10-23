const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  buildSubstackFullReport,
  displayCompanyName,
  locationRegions,
  canonicalJobKey,
} = require("../lib/substack-full-report");
const {
  FULL_FEED_PATH,
  loadSelectedCurrentRows,
} = require("./report-substack-full");

function row(title, url, options = {}) {
  return {
    JobKey: options.jobKey || url,
    Title: title,
    Company: options.company || "Example Company",
    Location: options.location || "United States",
    URL: url,
    RemoteStatus: options.arrangement || "Remote",
    DatePosted: options.date,
    Description: options.description || "",
  };
}

async function testCanonicalSourceLoading() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "substack-full-report-"));
  try {
    const feed = path.join(dir, "public-job-feed-latest.json");
    const selection = path.join(dir, "public-job-feed-deduped-top.json");
    await fs.writeFile(feed, `[\n${JSON.stringify(row("Selected", "https://example.test/selected", { jobKey: "selected" }))},\n${JSON.stringify(row("Not selected", "https://example.test/other", { jobKey: "other" }))}\n]\n`);
    await fs.writeFile(selection, `${JSON.stringify([{ JobKey: "selected", URL: "https://example.test/selected" }])}\n`);
    const loaded = await loadSelectedCurrentRows(feed, selection);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].Title, "Selected");
    const saved = [{ ...loaded[0], Title: "Saved title", RemoteStatus: "Hybrid" }];
    const savedRows = await loadSelectedCurrentRows(feed, selection, saved);
    assert.equal(savedRows[0].Title, "Saved title");
    assert.equal(savedRows[0].RemoteStatus, "Hybrid");
    assert.match(FULL_FEED_PATH, /data\/jobs\/public\/public-job-feed-latest\.json$/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function testRendering() {
  const current = [
    row("Old but new", "https://example.test/old", { date: "2020-01-01", location: "United States" }),
    row("Newest remote", "https://example.test/newest", { date: "2026-10-01", location: "United States" }),
    row("No date remote", "https://example.test/no-date", { location: "Germany" }),
    row("Hybrid writer", "https://example.test/hybrid", { arrangement: "Hybrid", location: "Chicago, IL" }),
    row("Onsite writer", "https://example.test/onsite", { arrangement: "Onsite", location: "London" }),
    row("Unknown writer", "https://example.test/unknown", { arrangement: "Unknown", location: "" }),
    row("Content Writer - Amharic - Remote", "https://example.test/lilt-amharic", { company: "LILT", location: "Ethiopia", date: "2026-09-30" }),
    row("Content Writer - Urdu - Remote", "https://example.test/lilt-urdu", { company: "LILT", location: "Pakistan", date: "2026-09-29" }),
    row("Localization Program Manager", "https://example.test/lilt-manager", { company: "LILT", location: "United States", date: "2026-09-28" }),
  ];
  const before = JSON.stringify(current);
  const previous = [current[1], current[2], current[3], current[4], current[5], current[8]];
  const markdown = buildSubstackFullReport({ generatedAt: "2026-10-01T12:00:00Z", currentRows: current, previousRows: previous });

  for (const expected of [
    "# Writing and documentation jobs",
    "Snapshot: October 1, 2026",
    "9 current jobs · 6 remote · 1 hybrid · 1 onsite · 1 unknown",
    "## Added since previous package",
    "## Remote jobs",
    "### U.S. remote",
    "### International remote",
    "## Hybrid jobs",
    "### U.S. hybrid",
    "## Onsite jobs",
    "### International onsite",
    "## Work arrangement not specified",
    "Remote Content Writers — multiple languages",
    "Localization Program Manager",
  ]) assert.ok(markdown.includes(expected), `Expected report text: ${expected}`);

  const newSection = markdown.slice(markdown.indexOf("## Added since previous package"), markdown.indexOf("## Remote jobs"));
  assert.ok(newSection.includes("Old but new"), "Membership comparison must keep an old but newly appearing job.");
  assert.ok(!newSection.includes("Newest remote"), "A continuing job must not appear as new.");
  const usRemote = markdown.slice(markdown.indexOf("### U.S. remote"), markdown.indexOf("### International remote"));
  assert.ok(usRemote.indexOf("Newest remote") < usRemote.indexOf("Old but new"));
  assert.ok(usRemote.indexOf("Localization Program Manager") < usRemote.indexOf("Old but new"));
  const internationalRemote = markdown.slice(markdown.indexOf("### International remote"), markdown.indexOf("## Hybrid jobs"));
  assert.ok(internationalRemote.indexOf("Remote Content Writers") < internationalRemote.indexOf("No date remote"));
  assert.equal((internationalRemote.match(/Remote Content Writers/g) || []).length, 1);
  assert.ok(internationalRemote.includes("https://example.test/lilt-amharic") && internationalRemote.includes("https://example.test/lilt-urdu"), "Grouped bullets must preserve all application links.");
  assert.ok(!internationalRemote.includes("Content Writer - Amharic") && !internationalRemote.includes("Content Writer - Urdu"));
  assert.ok(!markdown.includes("Posted Date") && !markdown.includes("2026-09-30"));
  assert.equal(JSON.stringify(current), before, "Rendering must not change the source corpus.");
}

function testEmptySectionsAndCompanyName() {
  const markdown = buildSubstackFullReport({
    generatedAt: "2026-10-01T12:00:00Z",
    currentRows: [row("Principal Technical Writer", "https://example.test/elastic", {
      company: "Referralsuseonly",
      location: "United States",
      description: "Elastic, the Search AI Company, enables everyone to find answers.",
    })],
    previousRows: [row("Principal Technical Writer", "https://example.test/elastic", { company: "Referralsuseonly" })],
  });
  assert.equal(displayCompanyName({ Company: "Referralsuseonly", Description: "Elastic, the Search AI Company, enables everyone to find answers." }), "Elastic");
  assert.ok(markdown.includes("— Elastic — United States"));
  assert.ok(markdown.includes("0 added · 0 removed · 1 continuing"));
  assert.ok(!markdown.includes("## Hybrid jobs"));
  assert.ok(!markdown.includes("## Onsite jobs"));
  assert.ok(!markdown.includes("### International remote"));
}

async function main() {
  await testCanonicalSourceLoading();
  testRendering();
  testEmptySectionsAndCompanyName();
  assert.deepEqual(locationRegions({ Location: "LATAM" }), ["international"]);
  assert.deepEqual(locationRegions({ Location: "Global" }), ["international"]);
  const current = row("Writer", "https://example.test/writer", { jobKey: "ashby:1" });
  const csvPrevious = { ...current, DatePosted: "", RemoteStatus: "Remote" };
  assert.equal(canonicalJobKey(current), canonicalJobKey(csvPrevious));
  const dated = buildSubstackFullReport({ generatedAt: "2026-10-11T12:00:00Z", reportDate: "2026-10-10T11:58:00Z",
    currentSnapshot: "20261010-0658", previousSnapshot: "20261009-0509", currentRows: [current], previousRows: [csvPrevious] });
  assert.ok(dated.includes("Snapshot: October 10, 2026"));
  assert.ok(dated.includes("Packages: 20261010-0658 (current); 20261009-0509 (previous)."));
  assert.ok(dated.includes("0 added · 0 removed · 1 continuing"));
  assert.ok(!dated.includes("New this week"));
  console.log("Substack full report tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
