const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { fromRoot } = require("../lib/files");
const { getOutputPaths } = require("./fetch-batch-jobs");
const { getIntervalHours, nextCheckAt, selectBoards, syncBoardStateFromEntries } = require("../lib/board-state");

const now = "2026-11-05T12:00:00.000Z";
const checkedAt = "2026-11-05T10:00:00.000Z";
const urls = {
  ashby: slug => `https://jobs.ashbyhq.com/${slug}`,
  greenhouse: slug => `https://boards.greenhouse.io/${slug}`,
  lever: slug => `https://jobs.lever.co/${slug}`,
  bamboohr: slug => `https://${slug}.bamboohr.com/careers`,
};

function entry(ats, slug) {
  return {
    ATS: ats, BoardKey: `${ats}|${slug}`, CatalogSlug: slug,
    Company: "Workos", CompanyKey: "workos", BoardURL: urls[ats](slug),
    FetchEligible: true, CrawlPriority: "HIGH",
  };
}

function failedBoard(board) {
  return {
    ...board, Active: true, FirstSeenAt: "2026-10-01T00:00:00.000Z",
    LastCatalogSeenAt: "2026-11-04T00:00:00.000Z",
    CoverageStatus: "FETCH_FAILED", LastFetchStatus: "failed",
    LastAttemptAt: "2026-11-04T10:00:00.000Z", LastSuccessAt: "2026-10-01T10:00:00.000Z",
    LastError: "HTTP 404", LastErrorClass: "BOARD_NOT_FOUND",
    LastDiagnostic: { board_key: board.BoardKey, http_status: 404, response_prefix: "Not Found" },
    JobCount: 0, GoodMatchCount: 0, AttemptCount: 12, ConsecutiveFailures: 5,
    NextCheckAt: "2026-11-11T10:00:00.000Z",
  };
}

function coverage(board, status, urlField) {
  return {
    ATS: board.ATS, CompanyKey: board.CompanyKey, [urlField]: board.BoardURL,
    LastChecked: checkedAt, LastFetchStatus: status,
    CoverageStatus: status === "empty" ? "FETCHED_EMPTY" : "JOBS_FOUND",
    JobsFound: status === "empty" ? 0 : 28, GoodMatchesFound: 0, LastFetchError: "",
  };
}

function testCoverageIdentity() {
  for (const ats of Object.keys(urls)) {
    for (const status of ["success", "empty"]) {
      for (const urlField of ["CareerSiteURL", "EstimatedFetchURL"]) {
        const source = entry(ats, "workos");
        const other = entry(ats, "workos-inc");
        const previous = { Boards: [failedBoard(source), failedBoard(other)] };
        const saved = JSON.parse(JSON.stringify(previous));
        const row = coverage(source, status, urlField);
        const state = syncBoardStateFromEntries([source, other], previous, [row], now);
        const retained = state.Boards.find(board => board.BoardKey === other.BoardKey);
        // Compare the full failure record, including dates, diagnostic and retry.
        assert.deepEqual(retained, { ...saved.Boards[1], LastCatalogSeenAt: now });
        assert.deepEqual(previous, saved, "synchronization must not mutate saved input");

        const updated = state.Boards.find(board => board.BoardKey === source.BoardKey);
        assert.equal(updated.CoverageStatus, row.CoverageStatus);
        assert.equal(updated.LastFetchStatus, status);
        assert.equal(updated.LastAttemptAt, checkedAt);
        assert.equal(updated.LastSuccessAt, checkedAt);
        assert.equal(updated.ConsecutiveFailures, 0);
        assert.equal(updated.JobCount, row.JobsFound);
        assert.equal(updated.LastError, "");
        const next = status === "empty" ? "2026-11-15T10:00:00.000Z" : "2026-11-10T10:00:00.000Z";
        assert.equal(updated.NextCheckAt, next);

        const created = syncBoardStateFromEntries([source, other], {}, [row], now).Boards;
        const exact = created.find(board => board.BoardKey === source.BoardKey);
        assert.equal(exact.CoverageStatus, row.CoverageStatus);
        assert.equal(exact.LastSuccessAt, checkedAt);
        assert.equal(exact.NextCheckAt, next);
        const unattempted = created.find(board => board.BoardKey === other.BoardKey);
        assert.equal(unattempted.CoverageStatus, "NOT_ATTEMPTED");
        assert.equal(unattempted.LastFetchStatus, "");
        assert.equal(unattempted.LastAttemptAt, "");
        assert.equal(unattempted.LastSuccessAt, "");
        assert.equal(unattempted.AttemptCount, 0);
        assert.equal(unattempted.JobCount, 0);
        assert.equal(unattempted.NextCheckAt, "1970-01-01T00:00:00.000Z");

        // An exact row must still win over a newer row for the same company.
        const newer = { ...coverage(other, "empty", urlField), LastChecked: now };
        const precedence = syncBoardStateFromEntries([source], previous, [row, newer], now).Boards[0];
        assert.equal(precedence.LastAttemptAt, checkedAt);
        assert.equal(precedence.CoverageStatus, row.CoverageStatus);
      }
    }
  }
}

function testSelectionAndIntervals() {
  assert.equal(getIntervalHours("GOOD_MATCHES_FOUND"), 24);
  assert.equal(getIntervalHours("JOBS_FOUND"), 120);
  assert.equal(getIntervalHours("FETCHED_EMPTY"), 240);
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(n => getIntervalHours("FETCH_FAILED", n)), [24, 48, 96, 168, 168, 168]);
  assert.equal(nextCheckAt("NOT_ATTEMPTED", "", 0), "1970-01-01T00:00:00.000Z");
  assert.equal(nextCheckAt("UNSUPPORTED", checkedAt, 0), "");
  assert.equal(nextCheckAt("CATALOG_ONLY", checkedAt, 0), "");

  const boards = ["ashby", "lever"].flatMap(ats => ["a", "b", "c"].map(slug => ({
    ...entry(ats, slug), Active: true, CoverageStatus: "NOT_ATTEMPTED",
    AttemptCount: 0, NextCheckAt: "1970-01-01T00:00:00.000Z",
  })));
  const delayed = { ...failedBoard(entry("ashby", "delayed")) };
  const good = { ...failedBoard(entry("ashby", "good")), CoverageStatus: "GOOD_MATCHES_FOUND" };
  const state = { Boards: [...boards, delayed, good,
    { ...boards[0], BoardKey: "ashby|inactive", Active: false },
    { ...boards[0], BoardKey: "ashby|ineligible", FetchEligible: false }] };
  const keys = options => selectBoards(state, { now, ...options }).map(board => board.BoardKey);
  assert.deepEqual(keys({ maxTotal: 3 }), ["ashby|a", "lever|a", "ashby|b"]);
  assert.deepEqual(keys({ maxTotal: 10, perAtsLimits: { ashby: 1, lever: 2 } }), ["ashby|a", "lever|a", "lever|b"]);
  assert.equal(keys({}).length, 6);
  assert.deepEqual(keys({ includeKnownGood: true, maxTotal: 1 }), ["ashby|good"]);
  assert.deepEqual(keys({ keys: [delayed.BoardKey] }), [delayed.BoardKey]);
  assert.deepEqual(keys({ keys: [delayed.BoardKey], keysUnattemptedOnly: true }), []);
  const many = { Boards: Array.from({ length: 260 }, (_, i) => ({ ...boards[0], BoardKey: `ashby|${i}` })) };
  assert.equal(selectBoards(many, { now }).length, 250);
}

async function testBatchResume() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "board-identity-resume-test-"));
  try {
    await fs.cp(fromRoot("src"), path.join(root, "src"), { recursive: true });
    const statuses = ["success", "empty", "failed", "skipped"];
    const rows = statuses.map(status => ({
      PreferredCompanyName: status, CompanyKey: status, BestATS: "Ashby",
      CrawlReady: true, CrawlPriority: "HIGH", AshbySlug: status,
    }));
    const logs = statuses.map(status => ({ ATS: "ashby", CatalogSlug: status, Status: status, FetchedAt: checkedAt }));
    const write = async (name, data) => {
      const file = path.join(root, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, typeof data === "string" ? data : JSON.stringify(data));
    };
    await write("data/catalogs/crawl/crawl-queue.json", rows);
    await write("data/config/job-titles.md", "# Titles\n- Technical Writer\n");
    const outputs = getOutputPaths(path.join(root, "batches/resume"));
    await write(path.relative(root, outputs.fetchLogJson), logs);
    await write(path.relative(root, outputs.publicFeedJson), []);
    // Fail the child process if resume attempts any external request.
    await write("deny-fetch.cjs", 'global.fetch = () => { throw new Error("External fetch is forbidden in this fixture"); };\n');
    const { stdout } = await promisify(execFile)(process.execPath, [
      "--require", path.join(root, "deny-fetch.cjs"), path.join(root, "src/scripts/fetch-batch-jobs.js"),
      "--ats", "ashby", "--batch-name", "resume", "--output-root", path.join(root, "batches"),
      "--resume", "true", "--limit", "4", "--delay-ms", "0",
    ], { cwd: root, timeout: 15000 });
    assert.match(stdout, /Boards selected: 4/);
    assert.match(stdout, /Boards skipped due to resume: 4/);
    assert.match(stdout, /Boards attempted this run: 0/);
    const saved = JSON.parse(await fs.readFile(outputs.fetchLogJson, "utf8"));
    assert.deepEqual(saved.map(row => [row.CatalogSlug, row.Status, row.FetchedAt]), logs.map(row => [row.CatalogSlug, row.Status, row.FetchedAt]));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function main() {
  testCoverageIdentity();
  testSelectionAndIntervals();
  await testBatchResume();
  console.log("Board identity, selection, interval, and batch resume fixture tests passed.");
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { main };
