const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const planPath = fromRoot("data", "jobs", "plans", "next-batch-plan.json");
const batchIndexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const outputDir = fromRoot("data", "jobs", "runs");

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1];
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).toLowerCase() !== "false";
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function splitCommand(command) {
  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = "";
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function getExistingBatchNames() {
  if (!(await fileExists(batchIndexPath))) {
    return new Set();
  }

  const batchIndexRows = await readJsonFile(batchIndexPath);
  if (!Array.isArray(batchIndexRows)) {
    return new Set();
  }

  return new Set(batchIndexRows.map((row) => cleanText(row.BatchName)).filter(Boolean));
}

function getRunId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

function runShellCommand(command) {
  return new Promise((resolve) => {
    const parts = splitCommand(command);
    if (parts.length === 0) {
      resolve({
        exitCode: 1,
        errorSummary: "Empty command",
      });
      return;
    }

    const child = spawn(parts[0], parts.slice(1), {
      cwd: fromRoot(),
      stdio: "inherit",
    });

    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        errorSummary: error.message,
      });
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code === null ? 1 : code,
        errorSummary: code === 0 ? "" : `Command exited with code ${code}`,
      });
    });
  });
}

async function runCommandRecord(order, command, dryRun) {
  const startedAt = new Date();

  if (dryRun) {
    return {
      Order: order,
      Command: command,
      Status: "WOULD_RUN",
      ExitCode: "",
      StartedAt: startedAt.toISOString(),
      FinishedAt: startedAt.toISOString(),
      ElapsedMs: 0,
      ErrorSummary: "",
    };
  }

  const result = await runShellCommand(command);
  const finishedAt = new Date();
  const succeeded = result.exitCode === 0;

  return {
    Order: order,
    Command: command,
    Status: succeeded ? "SUCCEEDED" : "FAILED",
    ExitCode: result.exitCode,
    StartedAt: startedAt.toISOString(),
    FinishedAt: finishedAt.toISOString(),
    ElapsedMs: finishedAt.getTime() - startedAt.getTime(),
    ErrorSummary: result.errorSummary,
  };
}

function buildMarkdown(log) {
  const lines = [
    "# Planned Batch Run Log",
    "",
    `Generated: ${log.GeneratedAt}`,
    `Run ID: ${log.RunId}`,
    "",
    "## Options",
    "",
    `- Dry run: ${log.DryRun}`,
    `- Continue on error: ${log.ContinueOnError}`,
    `- Run release: ${log.RunRelease}`,
    `- Run status: ${log.RunStatus}`,
    "",
    "## Command List",
    "",
  ];

  if (log.Commands.length === 0) {
    lines.push("No READY planned commands found.", "");
  } else {
    for (const command of log.Commands) {
      lines.push(`${command.Order}. \`${command.Command}\``);
    }
    lines.push("");
  }

  lines.push("## Results", "");
  lines.push("| Order | Status | ExitCode | ElapsedMs | Command | ErrorSummary |");
  lines.push("| ---: | --- | ---: | ---: | --- | --- |");
  for (const command of log.Commands) {
    lines.push(
      `| ${command.Order} | ${command.Status} | ${command.ExitCode} | ${command.ElapsedMs} | \`${command.Command}\` | ${command.ErrorSummary || ""} |`
    );
  }

  lines.push(
    "",
    "## Summary",
    "",
    `- Command count: ${log.CommandCount}`,
    `- Commands succeeded: ${log.CommandsSucceeded}`,
    `- Commands failed: ${log.CommandsFailed}`,
    `- Stopped early: ${log.StoppedEarly}`,
    `- Plan regenerated: ${log.PlanRegenerated}`,
    `- Post-run index ran: ${log.PostRunIndexRan}`,
    `- Post-run plan ran: ${log.PostRunPlanRan}`,
    `- Release ran: ${log.ReleaseRan}`,
    `- Status ran: ${log.StatusRan}`,
    "",
    "## Final Next Step",
    "",
    log.FinalNextStep,
    ""
  );

  return lines.join("\n");
}

async function writeLogFiles(log) {
  const timestampedJson = path.join(outputDir, `run-planned-batches-${log.RunId}.json`);
  const timestampedMarkdown = path.join(outputDir, `run-planned-batches-${log.RunId}.md`);
  const latestJson = path.join(outputDir, "run-planned-batches-latest.json");
  const latestMarkdown = path.join(outputDir, "run-planned-batches-latest.md");
  const markdown = buildMarkdown(log);

  await ensureDir(outputDir);
  await writeJsonFile(timestampedJson, log);
  await writeJsonFile(latestJson, log);
  await fs.writeFile(timestampedMarkdown, markdown, "utf8");
  await fs.writeFile(latestMarkdown, markdown, "utf8");
}

function getFinalNextStep(options, commandsFailed) {
  if (options.dryRun) {
    return "Review the planned commands, then run `npm run jobs:run-planned -- --dry-run false` when ready.";
  }

  if (commandsFailed > 0) {
    return "Inspect failed command output and rerun after fixing.";
  }

  return "Inspect `data/jobs/public/public-job-feed-summary.md` and `data/jobs/reports/project-status-dashboard.md`.";
}

async function main() {
  const options = {
    dryRun: parseBoolean(getArgValue("--dry-run", "true"), true),
    continueOnError: parseBoolean(getArgValue("--continue-on-error", "false"), false),
    runRelease: parseBoolean(getArgValue("--run-release", "true"), true),
    runStatus: parseBoolean(getArgValue("--run-status", "true"), true),
  };

  if (!(await fileExists(planPath))) {
    console.log("Next batch plan is missing.");
    console.log("Run:");
    console.log("npm run jobs:plan-next-batches");
    return;
  }

  const runId = getRunId();
  const generatedAt = new Date().toISOString();
  const planRows = await readJsonFile(planPath);
  const existingBatchNames = await getExistingBatchNames();
  const readyPlanRows = planRows.filter((row) => row.PlanStatus === "READY" && row.Command);
  const staleReadyRows = readyPlanRows.filter((row) => existingBatchNames.has(cleanText(row.BatchName)));
  const readyRows = readyPlanRows.filter((row) => !existingBatchNames.has(cleanText(row.BatchName)));
  const commandRecords = [];
  let stoppedEarly = false;
  let planRegenerated = false;
  let postRunIndexRan = false;
  let postRunPlanRan = false;

  console.log(`Planned READY commands: ${readyRows.length}`);
  if (staleReadyRows.length > 0) {
    console.log(`Skipped stale READY commands already present in batch index: ${staleReadyRows.length}`);
    for (const row of staleReadyRows) {
      console.log(`- ${row.BatchName}`);
    }
  }

  for (let index = 0; index < readyRows.length; index += 1) {
    const command = readyRows[index].Command;
    console.log(`${options.dryRun ? "WOULD_RUN" : "RUN"} ${index + 1}/${readyRows.length}: ${command}`);
    const record = await runCommandRecord(index + 1, command, options.dryRun);
    commandRecords.push(record);

    if (!options.dryRun && record.Status === "FAILED" && !options.continueOnError) {
      stoppedEarly = true;
      break;
    }
  }

  const commandsSucceeded = commandRecords.filter((record) => record.Status === "SUCCEEDED").length;
  const commandsFailed = commandRecords.filter((record) => record.Status === "FAILED").length;
  const blockingFailure = stoppedEarly || commandsFailed > 0;
  let releaseRan = false;
  let statusRan = false;

  if (!options.dryRun && !blockingFailure) {
    const order = commandRecords.length + 1;
    console.log(`RUN index ${order}: npm run jobs:index-batches`);
    commandRecords.push(await runCommandRecord(order, "npm run jobs:index-batches", false));
    postRunIndexRan = commandRecords[commandRecords.length - 1].Status === "SUCCEEDED";
  }

  const postIndexFailure = commandRecords.some((record) => record.Status === "FAILED");
  if (!options.dryRun && !postIndexFailure) {
    const order = commandRecords.length + 1;
    console.log(`RUN plan ${order}: npm run jobs:plan-next-batches`);
    commandRecords.push(await runCommandRecord(order, "npm run jobs:plan-next-batches", false));
    postRunPlanRan = commandRecords[commandRecords.length - 1].Status === "SUCCEEDED";
    planRegenerated = postRunPlanRan;
  }

  const postPlanFailure = commandRecords.some((record) => record.Status === "FAILED");
  if (!options.dryRun && options.runRelease && !postPlanFailure) {
    const order = commandRecords.length + 1;
    console.log(`RUN release ${order}: npm run jobs:public-release`);
    commandRecords.push(await runCommandRecord(order, "npm run jobs:public-release", false));
    releaseRan = commandRecords[commandRecords.length - 1].Status === "SUCCEEDED";
  }

  const postReleaseFailure = commandRecords.some((record) => record.Status === "FAILED");
  if (!options.dryRun && options.runStatus && !postReleaseFailure) {
    const order = commandRecords.length + 1;
    console.log(`RUN status ${order}: npm run jobs:status`);
    commandRecords.push(await runCommandRecord(order, "npm run jobs:status", false));
    statusRan = commandRecords[commandRecords.length - 1].Status === "SUCCEEDED";
  }

  const finalFailedCount = commandRecords.filter((record) => record.Status === "FAILED").length;
  const finalSucceededCount = commandRecords.filter((record) => record.Status === "SUCCEEDED").length;
  const log = {
    RunId: runId,
    GeneratedAt: generatedAt,
    DryRun: options.dryRun,
    ContinueOnError: options.continueOnError,
    RunRelease: options.runRelease,
    RunStatus: options.runStatus,
    CommandCount: readyRows.length,
    CommandsSucceeded: finalSucceededCount,
    CommandsFailed: finalFailedCount,
    StoppedEarly: stoppedEarly,
    PlanRegenerated: planRegenerated,
    PostRunIndexRan: postRunIndexRan,
    PostRunPlanRan: postRunPlanRan,
    ReleaseRan: releaseRan,
    StatusRan: statusRan,
    Commands: commandRecords,
    FinalNextStep: getFinalNextStep(options, finalFailedCount),
  };

  await writeLogFiles(log);

  console.log("Planned batch run log complete.");
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Commands succeeded: ${log.CommandsSucceeded}`);
  console.log(`Commands failed: ${log.CommandsFailed}`);
  console.log(`Stopped early: ${log.StoppedEarly}`);
  console.log("Output files:");
  console.log(path.join(outputDir, "run-planned-batches-latest.json"));
  console.log(path.join(outputDir, "run-planned-batches-latest.md"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
