const fs = require("fs/promises");
const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { execFileSync } = require("child_process");
const { fromRoot, writeJsonFile } = require("../lib/files");

async function startRun(launcher, args, root = fromRoot()) {
  const resolved = await fs.realpath(launcher);
  const bytes = await fs.readFile(resolved);
  let revision = "UNKNOWN";
  let dirty = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    dirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
  } catch { /* Missing Git evidence remains explicit. */ }
  return { RunId: randomUUID(), StartedAt: new Date().toISOString(), Status: "RUNNING", ProjectRoot: root,
    LauncherPath: resolved, LauncherSHA256: createHash("sha256").update(bytes).digest("hex"),
    GitRevision: revision, WorkingTreeChanged: dirty, Arguments: args,
    ParentLauncher: process.env.FEED_PARENT_LAUNCHER || null };
}

function finishRun(run, status, exitCode, step) {
  if (!["COMPLETE", "FAILED"].includes(status)) throw new Error(`Invalid refresh status: ${status}`);
  return { ...run, Status: status, ExitCode: exitCode, LastStep: step, CompletedAt: new Date().toISOString() };
}

async function main() {
  const args = process.argv.slice(2);
  const reports = fromRoot("data", "jobs", "reports");
  const latest = path.join(reports, "refresh-run.json");
  const get = (name, fallback = "") => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  let run;
  if (args[0] === "start") {
    const separator = args.indexOf("--");
    run = await startRun(get("--launcher"), separator < 0 ? [] : args.slice(separator + 1));
  } else if (args[0] === "finish") {
    const id = get("--run-id");
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid refresh run ID.");
    const saved = JSON.parse(await fs.readFile(path.join(reports, "refresh-runs", `${id}.json`), "utf8"));
    run = finishRun(saved, get("--status"), Number(get("--exit-code", "0")), get("--step"));
  } else throw new Error("Use start or finish.");
  await writeJsonFile(path.join(reports, "refresh-runs", `${run.RunId}.json`), run);
  await writeJsonFile(latest, run);
  if (args[0] === "start") console.log(run.RunId);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { startRun, finishRun };
