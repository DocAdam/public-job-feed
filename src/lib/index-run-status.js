function countAttempts(rows = []) {
  const counts = { Unit: "attempts", Total: 0, Successful: 0, Empty: 0, Failed: 0, Skipped: 0, Unknown: 0 };
  const fields = { success: "Successful", empty: "Empty", failed: "Failed", skipped: "Skipped" };
  for (const row of rows) {
    counts.Total += 1;
    counts[fields[String(row.Status || "").toLowerCase()] || "Unknown"] += 1;
  }
  return counts;
}

function sumAttempts(items) {
  const counts = countAttempts();
  for (const item of items) {
    for (const key of Object.keys(counts).filter(key => key !== "Unit")) counts[key] += item[key];
  }
  return counts;
}

function fetchHealth(counts) {
  if (!counts.Total) return "NOT_ATTEMPTED";
  if (counts.Failed === counts.Total) return "ALL_FAILED";
  if (counts.Failed) return "PARTIAL_FAILURE";
  if (counts.Skipped || counts.Unknown) return "INCOMPLETE";
  return "HEALTHY";
}

function queueState(queue) {
  if (!queue) return "UNKNOWN";
  if (queue.DueBoards > 0) return "DUE_REMAINING";
  return queue.RetryDelayedFailedBoards > 0 ? "RETRY_DEFERRED" : "QUEUE_EXHAUSTED";
}

// Queue state and fetch health are independent. Neither establishes publication.
function terminalResult(run, reason, exitCode) {
  const health = fetchHealth(run.Counts);
  const queue = queueState(run.QueueAfter);
  let status = "COMPLETE";
  if (reason === "interrupted") status = "INTERRUPTED";
  else if (reason === "overlap") status = "BLOCKED";
  else if (["command_failure", "unreadable_state"].includes(reason) || queue === "UNKNOWN" || health === "ALL_FAILED" ||
    (run.Kind === "CATCH_UP" && run.Cycles?.some(cycle => cycle.FetchHealth === "ALL_FAILED"))) status = "FAILED";
  else if (["no_progress", "cycle_limit"].includes(reason)) status = "STOPPED";
  else if (health === "PARTIAL_FAILURE" || health === "INCOMPLETE" || queue === "RETRY_DEFERRED" || run.Warnings?.length) status = "COMPLETE_WITH_WARNINGS";
  return { ...run, Status: status, FetchHealth: health, QueueState: queue, ExitReason: reason,
    ExitCode: exitCode, CompletedAt: new Date().toISOString() };
}

module.exports = { countAttempts, sumAttempts, fetchHealth, queueState, terminalResult };
