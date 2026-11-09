const fs = require("fs/promises");
const path = require("path");
const { startRun } = require("./record-refresh-run");
const { fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");
const { summarize } = require("./report-board-freshness");
const { countAttempts, sumAttempts, terminalResult } = require("../lib/index-run-status");

function recordPath(id, root = fromRoot()) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid index run ID.");
  return path.join(root, "data/jobs/reports/index-runs", `${id}.json`);
}

async function readQueue(root = fromRoot()) {
  const state = await readJsonFile(path.join(root, "data/jobs/state/board-state.json"));
  if (!Array.isArray(state.Boards)) throw new Error("Board state is missing or invalid.");
  const observedAt = new Date().toISOString();
  const summary = summarize("", state.Boards, Date.parse(observedAt));
  return { Unit: "unique_active_fetch_eligible_boards", ObservedAt: observedAt, StateGeneratedAt: state.GeneratedAt || null,
    DueBoards: summary.DueBoards, RetryDelayedFailedBoards: summary.RetryDelayedFailedBoards, FailedBoards: summary.FailedBoards };
}

async function saveIndexRun(run, root = fromRoot()) {
  await writeJsonFile(recordPath(run.RunId, root), run);
  const name = run.Kind === "CATCH_UP" ? "overnight-index-catch-up-run.json" : "job-index-maintenance-run.json";
  await writeJsonFile(path.join(root, "data/jobs/reports", name), run);
}

async function startIndexRun(kind, launcher, args, options = {}) {
  const root = options.root || fromRoot();
  const base = await startRun(launcher, args, root);
  const run = { ...base, RunId: options.id || base.RunId, Kind: kind, PID: options.pid || process.pid,
    RunOrigin: options.origin || process.env.INDEX_RUN_ORIGIN ||
      (process.env.FEED_RUN_ID ? "full_refresh" : process.env.XPC_SERVICE_NAME === "com.public-job-feed.maintain-index" ? "launchd_passive" : "UNKNOWN"),
    ParentRunId: process.env.INDEX_PARENT_RUN_ID || process.env.FEED_RUN_ID || null,
    CycleNumber: process.env.INDEX_CYCLE_NUMBER ? Number(process.env.INDEX_CYCLE_NUMBER) : null,
    CompletedAt: null, ExitReason: null, Counts: countAttempts(), Cycles: [], Warnings: [],
    Results: { Feed: "NOT_RUN", History: "NOT_RUN", Backup: "NOT_RUN", Publication: "NOT_RUN" } };
  const file = recordPath(run.RunId, root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // A supplied ID must never replace an earlier run.
  const handle = await fs.open(file, "wx");
  try { await handle.writeFile(`${JSON.stringify(run, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await saveIndexRun(run, root);
  return run;
}

async function appendCycle(run, child, code) {
  if (child.ParentRunId !== run.RunId || run.Cycles.some(cycle => cycle.RunId === child.RunId)) {
    throw new Error("Cycle does not belong to this run, or was already recorded.");
  }
  run.Cycles.push({ Cycle: child.CycleNumber, RunId: child.RunId, StartedAt: child.StartedAt,
    CompletedAt: child.CompletedAt, Status: child.Status, ExitReason: child.ExitReason,
    FetchHealth: child.FetchHealth, Counts: child.Counts, QueueBefore: child.QueueBefore || null,
    QueueAfter: child.QueueAfter || null, ExitCode: code });
  run.Counts = sumAttempts(run.Cycles.map(cycle => cycle.Counts));
  if (child.Warnings?.length) run.Warnings.push(...child.Warnings);
  run.ActiveCycle = null;
  return run;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name, fallback = "") => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const mode = args[0];
  if (mode === "start") {
    const pid = Number(get("--pid"));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("Expected the catch-up launcher PID.");
    const separator = args.indexOf("--");
    const run = await startIndexRun("CATCH_UP", get("--launcher"), separator < 0 ? [] : args.slice(separator + 1), { origin: "overnight_catch_up", pid });
    console.log(run.RunId);
    return;
  }
  const run = await readJsonFile(recordPath(get("--run-id")));
  if (run.Status !== "RUNNING") throw new Error("Run already has a terminal result.");
  if (mode === "queue") {
    const queue = await readQueue();
    if (!run.QueueBefore) run.QueueBefore = queue;
    run.QueueAfter = queue;
    await saveIndexRun(run);
    console.log(queue.DueBoards);
  } else if (mode === "begin-cycle") {
    const id = get("--child-run-id");
    recordPath(id); // Validate before saving a recovery reference.
    run.ActiveCycle = { RunId: id, Cycle: Number(get("--cycle")), StartedAt: new Date().toISOString() };
    await saveIndexRun(run);
  } else if (mode === "cycle") {
    const child = await readJsonFile(recordPath(get("--child-run-id")));
    await appendCycle(run, child, Number(get("--exit-code")));
    await saveIndexRun(run);
    console.log(`Cycle ${child.CycleNumber}: ${child.Status}; fetch health ${child.FetchHealth}; attempts: success ${child.Counts.Successful}, empty ${child.Counts.Empty}, failed ${child.Counts.Failed}, skipped ${child.Counts.Skipped}, unknown ${child.Counts.Unknown}.`);
  } else if (mode === "finish") {
    let reason = get("--reason");
    if (run.ActiveCycle) {
      try {
        const child = await readJsonFile(recordPath(run.ActiveCycle.RunId));
        await appendCycle(run, child, child.ExitCode ?? null);
      } catch (error) { run.Warnings.push(`Active cycle result is unavailable: ${error.message}`); }
    }
    try { run.QueueAfter = await readQueue(); }
    catch (error) { run.QueueAfter = null; run.Warnings.push(error.message); }
    const last = run.Cycles.at(-1);
    if (reason === "command_failure" && ["all_failed", "overlap", "interrupted"].includes(last?.ExitReason)) reason = last.ExitReason;
    if (reason === "queue_exhausted" && run.QueueAfter?.RetryDelayedFailedBoards > 0) reason = "retry_deferred";
    const result = terminalResult(run, reason, Number(get("--exit-code")));
    if (result.Status === "FAILED" && result.ExitCode === 0) {
      result.ExitCode = 1;
      process.exitCode = 1;
    }
    await saveIndexRun(result);
    console.log(`Catch-up ${result.Status}: ${result.ExitReason}; queue ${result.QueueState}; fetch health ${result.FetchHealth}.`);
    console.log(`Run record: ${recordPath(run.RunId)}`);
  } else throw new Error("Use start, queue, begin-cycle, cycle, or finish.");
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { recordPath, readQueue, saveIndexRun, startIndexRun, appendCycle };
