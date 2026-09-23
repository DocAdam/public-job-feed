const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { fromRoot, writeJsonFile } = require("../lib/files");
const { packageIdentity } = require("../lib/package-status");
const config = require("../../package.json");

function runTest(name) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", name], { cwd: fromRoot(), stdio: "inherit" });
    child.once("error", (error) => resolve({ ExitCode: null, Error: error.message }));
    child.once("close", (code, signal) => resolve({ ExitCode: code, Signal: signal }));
  });
}

async function executeTests(names, run, save, context = {}) {
  const result = { ...context, GeneratedAt: new Date().toISOString(), Status: "RUNNING", Tests: [] };
  await save(result);
  for (const name of names) {
    const started = Date.now();
    let outcome;
    try {
      outcome = await run(name);
    } catch (error) {
      outcome = { ExitCode: null, Error: error.message };
    }
    result.Tests.push({ Name: name, ...outcome, DurationMs: Date.now() - started });
    result.GeneratedAt = new Date().toISOString();
    if (outcome.ExitCode !== 0) {
      result.Status = "FAIL";
      result.FailedTest = name;
      await save(result);
      return result;
    }
    await save(result);
  }
  result.Status = "PASS";
  result.CompletedAt = new Date().toISOString();
  await save(result);
  return result;
}

async function main() {
  const result = await executeTests(config.testSuites, runTest,
    (value) => writeJsonFile(fromRoot("data", "jobs", "reports", "test-all-results.json"), value),
    { RunId: process.env.FEED_RUN_ID || randomUUID(), PackageRun: await packageIdentity(fromRoot("data", "jobs", "gsheet-package", "latest")) });
  if (result.Status !== "PASS") process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { executeTests };
