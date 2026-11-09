const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { fromRoot, writeJsonFile, readJsonFile } = require("../lib/files");
const { acquireLock } = require("./refresh-job-index");
const { withBatchMaintenance, LOCK_NAME } = require("../lib/batch-maintenance");
const { countAttempts, sumAttempts, terminalResult } = require("../lib/index-run-status");
const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(base, name) {
  const root = path.join(base, name);
  await fs.mkdir(root);
  await fs.cp(fromRoot("src"), path.join(root, "src"), { recursive: true });
  const entries = ["ashby", "lever"].map(ats => ({
    ATS: ats, BoardKey: `${ats}|fixture`, CatalogSlug: "fixture", Company: "Fixture",
    CompanyKey: "fixture", BoardURL: `https://example.test/${ats}`, FetchEligible: true, CrawlPriority: "HIGH",
  }));
  await writeJsonFile(path.join(root, "data/catalogs/crawl/board-catalog.json"), entries);
  await writeJsonFile(path.join(root, "data/catalogs/crawl/crawl-queue.json"), [{}]);
  await writeJsonFile(path.join(root, "data/catalogs/crawl/catalog-queue-diff.json"), { AddedBoardCount: 0 });
  await writeJsonFile(path.join(root, "data/jobs/state/board-state.json"), { Boards: entries.map(entry => ({
    ...entry, Active: true, CoverageStatus: "NOT_ATTEMPTED", AttemptCount: 0, NextCheckAt: "1970-01-01T00:00:00.000Z",
  })) });
  await fs.mkdir(path.join(root, "data/config"), { recursive: true });
  await fs.writeFile(path.join(root, "data/config/job-titles.md"), "# Titles\n- Technical Writer\n");
  for (const name of ["refresh-catalogs.js", "index-batches.js", "report-ats-anomalies.js"]) {
    await fs.writeFile(path.join(root, "src/scripts", name), 'if (process.env.FIXTURE_COMMAND_FAILURE && __filename.endsWith("index-batches.js")) process.exit(7);\n');
  }
  // Keep the real freshness summarizer. Only the CLI is bypassed in this fixture.
  const freshness = path.join(root, "src/scripts/report-board-freshness.js");
  await fs.writeFile(freshness, (await fs.readFile(freshness, "utf8")).replace("if (require.main === module)", "if (false)"));
  await fs.writeFile(path.join(root, "mock-fetch.cjs"), `
    global.fetch = () => { throw new Error("External fetch is forbidden in this test"); };
    const fs = require("fs/promises");
    const path = require("path");
    const batch = require("./src/scripts/fetch-batch-jobs");
    batch.fetchAtsRows = async (rows, ats) => {
      const scenario = process.env.FIXTURE_SCENARIO;
      if (scenario === "stall") return { fetchLogRows: [], jobRows: [] };
      if (scenario === "interrupt" && ats === "lever") {
        await fs.writeFile(path.join(__dirname, "ready"), String(process.pid));
        await new Promise(resolve => setTimeout(resolve, 1500));
        throw new Error("Fixture interrupted before group checkpoint");
      }
      const status = scenario === "all_failed" || (["mixed", "interrupt"].includes(scenario) && ats === "ashby") ? "failed" : scenario === "empty" ? "empty" : "success";
      const fetchedAt = new Date().toISOString();
      return { fetchLogRows: rows.map(row => ({ ATS: ats, CatalogSlug: "fixture", Company: row.PreferredCompanyName, Status: status, FetchedAt: fetchedAt, JobCount: status === "success" ? 1 : 0 })),
        jobRows: status === "success" ? [{ ATS: ats, CatalogSlug: "fixture", Company: "Fixture", Title: "Technical Writer", URL: "https://example.test/job/" + ats, FetchedAt: fetchedAt, Description: "Fixture role" }] : [] };
    };
  `);
  const env = { ...process.env, NODE_OPTIONS: `--require=${JSON.stringify(path.join(root, "mock-fetch.cjs"))}`, FIXTURE_SCENARIO: name };
  for (const key of ["FEED_RUN_ID", "INDEX_PARENT_RUN_ID", "INDEX_CYCLE_NUMBER", "INDEX_RUN_ORIGIN", "XPC_SERVICE_NAME"]) delete env[key];
  return { root, env };
}

const args = ["--dry-run", "false", "--include-known-good", "false", "--due-limit", "10"];
async function maintain(f, extra = []) {
  let result;
  try { result = await exec(process.execPath, [path.join(f.root, "src/scripts/refresh-job-index.js"), ...args, ...extra], { env: f.env, timeout: 15000 }); }
  catch (error) { result = error; }
  return { ...result, run: await readJsonFile(path.join(f.root, "data/jobs/reports/job-index-maintenance-run.json")) };
}

async function launcher(f, env = {}, onStart) {
  await fs.mkdir(path.join(f.root, "launchers"), { recursive: true });
  await fs.mkdir(path.join(f.root, "bin"), { recursive: true });
  const source = await fs.readFile(fromRoot("launchers/Run Overnight Index Catch-Up.command"), "utf8");
  const file = path.join(f.root, "launchers/Run Overnight Index Catch-Up.command");
  await fs.writeFile(file, source.replace(/^PROJECT_DIR=.*$/m, `PROJECT_DIR="${f.root}"`).replace(/^export PATH=.*$/m, `export PATH="${f.root}/bin:$PATH"`));
  await fs.writeFile(path.join(f.root, "bin/npm"), '#!/bin/bash\nexec "$FIXTURE_NODE" "$FIXTURE_ROOT/src/scripts/refresh-job-index.js" "${@:4}"\n', { mode: 0o755 });
  try {
    const promise = exec("/bin/bash", [file], { env: { ...f.env, OVERNIGHT_CAFFEINATED: "1", FIXTURE_ROOT: f.root, FIXTURE_NODE: process.execPath, ...env }, timeout: 20000 });
    // Attach the rejection handler before sending a fixture interruption.
    const outcome = promise.catch(error => error);
    if (onStart) await onStart(promise.child);
    return await outcome;
  }
  catch (error) { return error; }
}

async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "index-run-record-test-"));
  try {
    for (const [name, status, success, empty, failed] of [
      ["success", "COMPLETE", 2, 0, 0], ["empty", "COMPLETE", 0, 2, 0],
      ["mixed", "COMPLETE_WITH_WARNINGS", 1, 0, 1], ["all_failed", "FAILED", 0, 0, 2],
    ]) {
      const f = await fixture(base, name);
      const result = await maintain(f);
      assert.equal(result.run.Status, status, result.stderr);
      assert.deepEqual([result.run.Counts.Successful, result.run.Counts.Empty, result.run.Counts.Failed], [success, empty, failed]);
      assert.equal(result.run.Counts.Total, 2);
      assert.equal(result.run.QueueAfter.DueBoards, 0);
      assert.equal(result.run.QueueAfter.RetryDelayedFailedBoards, failed);
      assert.equal(result.run.Results.Publication, "NOT_RUN");
      assert.equal(result.run.Cycles[0].Batches.length, 2);
      assert.ok(result.run.CompletedAt && result.run.StartedAt);
      if (name === "all_failed") {
        assert.equal(result.code, 1);
        assert.equal(result.run.ExitReason, "all_failed");
        assert.equal(result.run.FetchHealth, "ALL_FAILED");
        assert.doesNotMatch(result.stdout, /Maintenance complete:|Catch-up complete:/);
      }
      const state = await fs.readFile(path.join(f.root, "data/jobs/state/board-state.json"));
      const record = await fs.readFile(path.join(f.root, "data/jobs/reports/index-runs", `${result.run.RunId}.json`));
      // A second pass retains retry dates, failures, and earlier run records.
      const restart = await maintain(f, ["--run-id", "same-restart-label"]);
      assert.equal(restart.run.Counts.Total, 0);
      assert.equal(restart.run.QueueAfter.RetryDelayedFailedBoards, failed);
      assert.deepEqual(JSON.parse(state).Boards.map(row => [row.AttemptCount, row.NextCheckAt, row.ConsecutiveFailures]),
        (await readJsonFile(path.join(f.root, "data/jobs/state/board-state.json"))).Boards.map(row => [row.AttemptCount, row.NextCheckAt, row.ConsecutiveFailures]));
      assert.deepEqual(await fs.readFile(path.join(f.root, "data/jobs/reports/index-runs", `${result.run.RunId}.json`)), record);
      // Catch-up reads current board state, including retry deferrals, without fetching.
      const caught = await launcher(f);
      assert.equal(caught.code, undefined, caught.stderr);
      const catchRun = await readJsonFile(path.join(f.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
      assert.equal(catchRun.Status, failed ? "COMPLETE_WITH_WARNINGS" : "COMPLETE");
      assert.equal(catchRun.ExitReason, failed ? "retry_deferred" : "queue_exhausted");
    }

    const interrupted = await fixture(base, "interrupt");
    const child = spawn(process.execPath, [path.join(interrupted.root, "src/scripts/refresh-job-index.js"), ...args], { env: interrupted.env, stdio: "ignore" });
    const stopped = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (await fs.access(path.join(interrupted.root, "ready")).then(() => true, () => false)) { ready = true; break; }
      await delay(20);
    }
    assert.ok(ready, "Fixture child must reach its second ATS group");
    child.kill("SIGTERM"); // Only the test process created above receives this signal.
    assert.deepEqual(await stopped, { code: 143, signal: null });
    const old = await readJsonFile(path.join(interrupted.root, "data/jobs/reports/job-index-maintenance-run.json"));
    assert.equal(old.Status, "INTERRUPTED");
    assert.equal(old.Counts.Failed, 1);
    const oldPath = path.join(interrupted.root, "data/jobs/reports/index-runs", `${old.RunId}.json`);
    const earlierRecord = await fs.readFile(oldPath);
    const batch = path.join(interrupted.root, "data/jobs/batches", old.Cycles[0].Batches[0].BatchName, "jobs-batch-fetch-log.json");
    const earlierAttempts = await fs.readFile(batch);
    const oldState = await readJsonFile(path.join(interrupted.root, "data/jobs/state/board-state.json"));
    interrupted.env.FIXTURE_SCENARIO = "success";
    const restart = await maintain(interrupted, ["--run-id", "restart"]);
    assert.equal(restart.run.Counts.Successful, 1);
    const nextState = await readJsonFile(path.join(interrupted.root, "data/jobs/state/board-state.json"));
    const { LastCatalogSeenAt: oldSeen, ...oldFailure } = oldState.Boards.find(row => row.ATS === "ashby");
    const { LastCatalogSeenAt: newSeen, ...newFailure } = nextState.Boards.find(row => row.ATS === "ashby");
    assert.ok(newSeen >= oldSeen);
    assert.deepEqual(newFailure, oldFailure);
    assert.deepEqual(await fs.readFile(oldPath), earlierRecord);
    assert.deepEqual(await fs.readFile(batch), earlierAttempts);

    const allFailed = await fixture(base, "catch-all-failed");
    allFailed.env.FIXTURE_SCENARIO = "all_failed";
    const caught = await launcher(allFailed);
    assert.equal(caught.code, 1, caught.stderr);
    const failedRun = await readJsonFile(path.join(allFailed.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
    assert.equal(failedRun.Status, "FAILED");
    assert.equal(failedRun.FetchHealth, "ALL_FAILED");
    assert.equal(failedRun.ExitReason, "all_failed");
    assert.equal(failedRun.Cycles.length, 1);
    assert.equal(failedRun.QueueAfter.DueBoards, 0);
    assert.equal(failedRun.QueueAfter.RetryDelayedFailedBoards, 2);
    assert.doesNotMatch(caught.stdout, /Catch-up complete:/);

    for (const [name, expected] of [["success", "COMPLETE"], ["empty", "COMPLETE"], ["mixed", "COMPLETE_WITH_WARNINGS"]]) {
      const f = await fixture(base, `catch-${name}`);
      f.env.FIXTURE_SCENARIO = name;
      const result = await launcher(f);
      assert.equal(result.code, undefined, result.stderr);
      const run = await readJsonFile(path.join(f.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
      assert.equal(run.Status, expected);
      assert.equal(run.Cycles.length, 1);
      assert.equal(run.Counts.Total, 2);
      const child = await readJsonFile(path.join(f.root, "data/jobs/reports/index-runs", `${run.Cycles[0].RunId}.json`));
      assert.equal(child.ParentRunId, run.RunId);
      assert.equal(child.RunOrigin, "overnight_catch_up");
    }
    for (const [name, env, reason] of [["stall", { MAX_STALLED_RUNS: "2" }, "no_progress"], ["limit", { MAX_ITERATIONS: "1" }, "cycle_limit"]]) {
      const f = await fixture(base, name);
      f.env.FIXTURE_SCENARIO = "stall";
      const result = await launcher(f, env);
      assert.equal(result.code, 2, result.stderr);
      const run = await readJsonFile(path.join(f.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
      assert.equal(run.Status, "STOPPED");
      assert.equal(run.ExitReason, reason);
      assert.equal(run.QueueAfter.DueBoards, 2);
    }
    const shellInterrupt = await fixture(base, "shell-interrupt");
    shellInterrupt.env.FIXTURE_SCENARIO = "interrupt";
    const shellResult = await launcher(shellInterrupt, {}, async processUnderTest => {
      let ready = false;
      for (let i = 0; i < 300; i++) {
        if (await fs.access(path.join(shellInterrupt.root, "ready")).then(() => true, () => false)) { ready = true; break; }
        await delay(20);
      }
      assert.ok(ready);
      const active = await readJsonFile(path.join(shellInterrupt.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
      assert.equal(active.PID, processUnderTest.pid);
      processUnderTest.kill("SIGTERM");
    });
    assert.equal(shellResult.code, 143, shellResult.stderr);
    const shellRun = await readJsonFile(path.join(shellInterrupt.root, "data/jobs/reports/overnight-index-catch-up-run.json"));
    assert.equal(shellRun.Status, "INTERRUPTED");
    assert.equal(shellRun.Cycles.length, 1);
    assert.equal(shellRun.Counts.Failed, 1);

    const command = await fixture(base, "command-failure");
    command.env.FIXTURE_COMMAND_FAILURE = "1";
    const failedCommand = await maintain(command);
    assert.equal(failedCommand.run.Status, "FAILED");
    assert.equal(failedCommand.run.ExitReason, "command_failure");
    assert.equal(failedCommand.run.Counts.Total, 2);
    assert.ok(failedCommand.run.Steps.some(step => step.ExitCode === 7));

    const firstPass = await fixture(base, "first-pass");
    await fs.unlink(path.join(firstPass.root, "data/jobs/state/board-state.json"));
    const initialized = await maintain(firstPass);
    assert.equal(initialized.run.Status, "COMPLETE");
    assert.equal(initialized.run.QueueBefore, null);
    assert.equal(initialized.run.Counts.Total, 2);

    const unreadable = await fixture(base, "unreadable-state");
    const unreadablePath = path.join(unreadable.root, "data/jobs/state/board-state.json");
    await fs.writeFile(unreadablePath, "invalid saved state");
    const unreadableResult = await launcher(unreadable);
    assert.equal(unreadableResult.code, 1);
    assert.equal((await readJsonFile(path.join(unreadable.root, "data/jobs/reports/overnight-index-catch-up-run.json"))).ExitReason, "unreadable_state");
    assert.equal(await fs.readFile(unreadablePath, "utf8"), "invalid saved state");

    const lockPath = path.join(base, "overlap.lock");
    const owner = JSON.stringify({ PID: process.pid, StartedAt: new Date().toISOString() });
    await fs.writeFile(lockPath, owner);
    await assert.rejects(acquireLock(0, { lockPath }), /still active/);
    assert.equal(await fs.readFile(lockPath, "utf8"), owner);
    await fs.writeFile(lockPath, "unverified lock");
    await assert.rejects(acquireLock(0, { lockPath }), /Cannot verify/);
    assert.equal(await fs.readFile(lockPath, "utf8"), "unverified lock");
    const locked = await fixture(base, "batch-overlap");
    const batches = path.join(locked.root, "data/jobs/batches");
    await withBatchMaintenance(batches, "fixture-owner", async () => {
      const before = await fs.readFile(path.join(batches, LOCK_NAME));
      const result = await maintain(locked);
      assert.equal(result.run.Status, "FAILED");
      assert.equal(result.run.Counts.Total, 0);
      assert.deepEqual(await fs.readFile(path.join(batches, LOCK_NAME)), before);
    });

    const counts = sumAttempts([countAttempts([{ Status: "success" }]), countAttempts([{ Status: "failed" }])]);
    assert.equal(counts.Total, 2); // Totals count attempts, even if one board is fetched twice.
    for (const [reason, status, code] of [["no_progress", "STOPPED", 2], ["cycle_limit", "STOPPED", 2], ["overlap", "BLOCKED", 1]]) {
      assert.equal(terminalResult({ Counts: counts, QueueAfter: { DueBoards: 1 }, Warnings: [] }, reason, code).Status, status);
    }
    console.log("Fixture record extract:", JSON.stringify({ RunId: failedRun.RunId, Kind: failedRun.Kind,
      RunOrigin: failedRun.RunOrigin, StartedAt: failedRun.StartedAt, CompletedAt: failedRun.CompletedAt,
      Status: failedRun.Status, ExitReason: failedRun.ExitReason, ExitCode: failedRun.ExitCode,
      FetchHealth: failedRun.FetchHealth, QueueState: failedRun.QueueState, Counts: failedRun.Counts,
      DueBoards: failedRun.QueueAfter.DueBoards, RetryDelayedFailedBoards: failedRun.QueueAfter.RetryDelayedFailedBoards }));
    console.log("Index run records: success, empty, mixed, all-failed, retry delay, interruption/restart, command failure, overlap, and stop status checks passed. No live collection ran.");
  } finally { await fs.rm(base, { recursive: true, force: true }); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
