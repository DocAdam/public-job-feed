const assert = require("assert");
const { fromRoot, readJsonFile } = require("../lib/files");
const { summarize, validateFreshnessSummary } = require("./report-board-freshness");

function board(overrides = {}) {
  return {
    Active: true,
    FetchEligible: true,
    ATS: "workday",
    CoverageStatus: "NOT_ATTEMPTED",
    LastAttemptAt: "",
    NextCheckAt: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function main() {
  const now = Date.parse("2026-07-15T12:00:00.000Z");
  const rows = [
    board(),
    board({ CoverageStatus: "JOBS_FOUND", LastAttemptAt: "2026-07-15T11:00:00.000Z", NextCheckAt: "2026-07-20T11:00:00.000Z" }),
    board({ CoverageStatus: "FETCH_FAILED", LastAttemptAt: "2026-07-15T10:00:00.000Z", NextCheckAt: "2026-07-16T10:00:00.000Z" }),
    board({ CoverageStatus: "FETCH_FAILED", LastAttemptAt: "2026-07-14T10:00:00.000Z", NextCheckAt: "2026-07-15T10:00:00.000Z" }),
    board({ Active: false, FetchEligible: false }),
  ];
  const summary = summarize("", rows, now);
  assert.equal(summary.ActiveBoards, 4);
  assert.equal(summary.FetchEligibleBoards, 4);
  assert.equal(summary.AttemptedBoards, 3);
  assert.equal(summary.NeverAttemptedBoards, 1);
  assert.equal(summary.DueBoards, 2);
  assert.equal(summary.FailedBoards, 2);
  assert.equal(summary.RetryDelayedFailedBoards, 1);
  assert.equal(summary.DueFailedBoards, 1);
  assert.deepEqual(validateFreshnessSummary(summary), []);

  const invalid = { ...summary, FetchEligibleBoards: 5 };
  assert.ok(validateFreshnessSummary(invalid).length >= 2);

  const [state, catalog] = await Promise.all([
    readJsonFile(fromRoot("data", "jobs", "state", "board-state.json")),
    readJsonFile(fromRoot("data", "catalogs", "crawl", "board-catalog.json")),
  ]);
  const live = summarize("", state.Boards, Date.now());
  assert.deepEqual(validateFreshnessSummary(live), []);
  assert.equal(live.ActiveBoards, Number(state.ActiveBoardCount));
  assert.equal(live.FetchEligibleBoards, Number(state.FetchEligibleBoardCount));
  assert.equal(live.ActiveBoards, catalog.length);
  assert.equal(live.FetchEligibleBoards, catalog.filter((row) => row.FetchEligible).length);
  console.log("Board freshness consistency tests passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
