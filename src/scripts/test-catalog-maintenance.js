const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { refreshCatalogSources } = require("../lib/catalog-refresh");
const { buildBoardCatalog, diffBoardEntries } = require("../lib/board-registry");
const { selectBoards, syncBoardState, updateBoardState } = require("../lib/board-state");
const { nullableNumber } = require("../lib/number");
const { detectSalary } = require("../lib/salary-detect");
const { getICIMSFetchUrl, parseICIMSJobs } = require("../lib/ats/icims");
const { getWorkdayFetchUrl } = require("../lib/ats/workday");
const { countCsvRows } = require("./test-release");
const { getLatestLiveFetchByBoard, keepFreshBoardRow } = require("./merge-batches");

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => body,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
  };
}

function queueRow(company, slug) {
  return {
    CompanyKey: company.toLowerCase(),
    PreferredCompanyName: company,
    ATSList: ["ashby"],
    HasAshby: true,
    AshbySlug: slug,
    AshbyURL: `https://jobs.ashbyhq.com/${slug}`,
    BestATS: "Ashby",
    CrawlReady: true,
    CrawlPriority: "HIGH",
  };
}

async function testCatalogFallbacks(tempDir) {
  const rawDir = path.join(tempDir, "raw");
  const manifestPath = path.join(tempDir, "manifest.json");
  const sources = [{ ats: "test", filename: "test.json", url: "https://example.test/catalog" }];
  const baseOptions = {
    sources,
    rawDir,
    manifestPath,
    timeoutMs: 1000,
    maximumDropRatio: 0.2,
    allowLargeDrop: false,
    force: false,
    strict: false,
  };
  const initialRows = Array.from({ length: 10 }, (_, index) => ({ slug: `company-${index}` }));
  let manifest = await refreshCatalogSources({
    ...baseOptions,
    fetchImpl: async () => response(200, JSON.stringify(initialRows), { etag: "one" }),
  });
  assert.equal(manifest.RefreshStatus, "complete");
  assert.equal(manifest.Sources[0].Status, "updated");
  assert.equal(JSON.parse(await fs.readFile(path.join(rawDir, "test.json"), "utf8")).length, 10);

  manifest = await refreshCatalogSources({
    ...baseOptions,
    fetchImpl: async () => response(200, "not json"),
  });
  assert.equal(manifest.RefreshStatus, "partial");
  assert.equal(manifest.Sources[0].Status, "fallback");
  assert.equal(JSON.parse(await fs.readFile(path.join(rawDir, "test.json"), "utf8")).length, 10);

  manifest = await refreshCatalogSources({
    ...baseOptions,
    fetchImpl: async () => response(200, JSON.stringify([{ slug: "only-one" }])),
  });
  assert.equal(manifest.Sources[0].Status, "fallback");
  assert.match(manifest.Sources[0].Error, /row count fell/);
  assert.equal(JSON.parse(await fs.readFile(path.join(rawDir, "test.json"), "utf8")).length, 10);
}

function testKeyDiffAndState() {
  const previous = [queueRow("Zulu", "zulu")];
  const next = [queueRow("Alpha", "alpha"), queueRow("Zulu", "zulu")];
  const diff = diffBoardEntries(previous, next);
  assert.deepEqual(diff.AddedBoards.map((row) => row.BoardKey), ["ashby|alpha"]);
  assert.equal(diff.RetainedBoardCount, 1);

  const now = "2026-07-14T12:00:00.000Z";
  let state = syncBoardState(next, {}, [], now);
  const selected = selectBoards(state, { keys: ["ashby|alpha"], maxTotal: 10, now });
  assert.deepEqual(selected.map((row) => row.BoardKey), ["ashby|alpha"]);
  state = updateBoardState(
    state,
    [
      {
        ATS: "ashby",
        CatalogSlug: "alpha",
        Status: "success",
        JobCount: 1,
        FetchedAt: now,
        Error: "",
      },
    ],
    [{ ATS: "ashby", CatalogSlug: "alpha", WriterFitTier: "C" }],
    now
  );
  const alpha = state.Boards.find((row) => row.BoardKey === "ashby|alpha");
  assert.equal(alpha.CoverageStatus, "JOBS_FOUND");
  assert.equal(alpha.JobCount, 1);
  assert.ok(Date.parse(alpha.NextCheckAt) > Date.parse(now));
  assert.equal(
    selectBoards(state, { keys: ["ashby|alpha"], keysUnattemptedOnly: true, maxTotal: 10, now }).length,
    0
  );

  const goodMatchAt = "2026-07-14T13:00:00.000Z";
  state = updateBoardState(
    state,
    [
      {
        ATS: "ashby",
        CatalogSlug: "alpha",
        Status: "success",
        JobCount: 1,
        FetchedAt: goodMatchAt,
        Error: "",
      },
    ],
    [{ ATS: "ashby", CatalogSlug: "alpha", WriterFitTier: "A" }],
    goodMatchAt
  );
  assert.equal(alpha.CoverageStatus, "GOOD_MATCHES_FOUND");
  assert.equal(alpha.GoodMatchCount, 1);

  const workdayCatalog = buildBoardCatalog(
    [
      { ATS: "workday", CatalogSlug: "example|wd1|careers", CatalogValue: "example|wd1|careers" },
      { ATS: "workday", CatalogSlug: "example|wd1|students", CatalogValue: "example|wd1|students" },
    ],
    [],
    now
  );
  assert.deepEqual(
    workdayCatalog.map((row) => row.BoardKey),
    ["workday|example|wd1|careers", "workday|example|wd1|students"]
  );
}

function testCorrectnessFixtures() {
  assert.equal(nullableNumber(""), null);
  assert.equal(nullableNumber("0"), 0);
  const nebius = detectSalary({
    Description: "<strong>Base Compensation Range</strong><span>$150,000</span><span> - </span><span>$187,500 USD</span>",
  });
  assert.equal(nebius.SalaryDetected, true);
  assert.equal(nebius.SalaryMin, 150000);
  assert.equal(nebius.SalaryMax, 187500);
  const stripe = detectSalary({ Description: "The annual US base range is $135,800 - $203,800." });
  assert.equal(stripe.SalaryDetected, true);
  assert.equal(stripe.SalaryMin, 135800);
  assert.equal(stripe.SalaryMax, 203800);
  assert.equal(
    getWorkdayFetchUrl("23andme|wd5|23"),
    "https://23andme.wd5.myworkdayjobs.com/wday/cxs/23andme/23/jobs"
  );
  assert.match(getICIMSFetchUrl("horizon"), /^https:\/\/careers-horizon\.icims\.com\/jobs\/search/);
  const icimsJobs = parseICIMSJobs(`
    <li class="iCIMS_JobCardItem"><div class="header left"><span class="sr-only">Job Locations</span><span>US-Remote</span></div>
    <div class="title"><a href="https://careers-example.icims.com/jobs/123/technical-writer/job?in_iframe=1"><h3>Technical Writer</h3></a></div>
    <div class="description">Write API documentation &amp; guides.</div></li>`);
  assert.equal(icimsJobs.length, 1);
  assert.equal(icimsJobs[0].title, "Technical Writer");
  assert.equal(icimsJobs[0].location, "US-Remote");
}

function testMergeFreshnessFiltering() {
  const latest = getLatestLiveFetchByBoard([
    {
      ATS: "ashby",
      CatalogSlug: "alpha",
      Status: "success",
      FetchedAt: "2026-07-15T01:00:00.000Z",
      SourceBatch: "alpha-latest-success",
    },
    {
      ATS: "ashby",
      CatalogSlug: "alpha",
      Status: "failed",
      FetchedAt: "2026-07-15T02:00:00.000Z",
      SourceBatch: "alpha-later-failure",
    },
    {
      ATS: "lever",
      CatalogSlug: "empty-board",
      Status: "empty",
      FetchedAt: "2026-07-15T03:00:00.000Z",
      SourceBatch: "empty-latest",
    },
  ]);

  assert.equal(
    keepFreshBoardRow(
      { ATS: "ashby", CatalogSlug: "alpha", SourceBatch: "alpha-latest-success" },
      latest
    ),
    true
  );
  assert.equal(
    keepFreshBoardRow({ ATS: "ashby", CatalogSlug: "alpha", SourceBatch: "alpha-old" }, latest),
    false
  );
  assert.equal(
    keepFreshBoardRow(
      {
        ATS: "lever",
        CatalogSlug: "empty-board",
        FetchedAt: "2026-07-14T03:00:00.000Z",
        SourceBatch: "empty-old",
      },
      latest
    ),
    false
  );
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "public-job-feed-catalog-test-"));
  try {
    await testCatalogFallbacks(tempDir);
    testKeyDiffAndState();
    testCorrectnessFixtures();
    testMergeFreshnessFiltering();
    const csvFixture = path.join(tempDir, "quoted.csv");
    await fs.writeFile(csvFixture, 'Title,Description\n"Writer, Senior","Line one\nLine two with ""quotes"""\nPlain,Text\n');
    assert.equal(await countCsvRows(csvFixture), 2);
    console.log("Catalog maintenance tests passed.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
