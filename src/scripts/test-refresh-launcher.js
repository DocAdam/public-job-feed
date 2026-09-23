const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { fromRoot } = require("../lib/files");
const exec = promisify(execFile);

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "feed-launcher-test-"));
  try {
    for (const dir of ["bin", "src/scripts", "src/lib", "launchers", "data/jobs/gsheet-package/20260923-0709"]) {
      await fs.mkdir(path.join(root, dir), { recursive: true });
    }
    for (const file of ["src/scripts/record-refresh-run.js", "src/lib/files.js"]) {
      await fs.copyFile(fromRoot(file), path.join(root, file));
    }
    const source = await fs.readFile(fromRoot("launchers", "Refresh Job Feed.command"), "utf8");
    // Only replace the fixture's working directory and executable search path.
    const fixture = source.replace(/^PROJECT_DIR=.*$/m, `PROJECT_DIR="${root}"`)
      .replace(/^export PATH=.*$/m, `export PATH="${root}/bin:$PATH"`);
    const launcher = path.join(root, "launchers", "Refresh Job Feed.command");
    await fs.writeFile(launcher, fixture);
    await fs.writeFile(path.join(root, "launchers", "Clean Broken Links.command"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    await fs.writeFile(path.join(root, "bin", "npm"), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$TEST_COMMAND_LOG"\nif [[ -n "$TEST_FAIL_MATCH" && "$*" == *"$TEST_FAIL_MATCH"* ]]; then exit 7; fi\n', { mode: 0o755 });
    await fs.writeFile(path.join(root, "bin", "open"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });
    const log = path.join(root, "commands.log");
    const env = { ...process.env, TEST_COMMAND_LOG: log, TEST_FAIL_MATCH: "" };
    await exec("/bin/bash", [launcher, "test argument with spaces"], { env, timeout: 15000 });
    const complete = JSON.parse(await fs.readFile(path.join(root, "data/jobs/reports/refresh-run.json"), "utf8"));
    assert.equal(complete.Status, "COMPLETE");
    assert.deepEqual(complete.Arguments, ["test argument with spaces"]);
    assert.equal(complete.LauncherPath, await fs.realpath(launcher));
    assert.match(complete.LauncherSHA256, /^[0-9a-f]{64}$/);
    const calls = await fs.readFile(log, "utf8");
    assert.ok(calls.indexOf("jobs:test-all") < calls.indexOf("jobs:status -- --sync-package"));
    assert.ok(calls.includes("jobs:review-package-evidence"));
    await fs.writeFile(log, "");
    await assert.rejects(exec("/bin/bash", [launcher], { env: { ...env, TEST_FAIL_MATCH: "jobs:public-release" }, timeout: 15000 }), (error) => error.code === 7);
    const failed = JSON.parse(await fs.readFile(path.join(root, "data/jobs/reports/refresh-run.json"), "utf8"));
    assert.equal(failed.Status, "FAILED");
    assert.equal(failed.ExitCode, 7);
    assert.match(failed.LastStep, /Step 2/);
    assert.doesNotMatch(await fs.readFile(log, "utf8"), /jobs:gsheet-package|--sync-package/);
    await fs.writeFile(log, "");
    await assert.rejects(exec("/bin/bash", [launcher], { env: { ...env, TEST_FAIL_MATCH: "jobs:validate-refresh-output" }, timeout: 15000 }), (error) => error.code === 7);
    const oldOutput = JSON.parse(await fs.readFile(path.join(root, "data/jobs/reports/refresh-run.json"), "utf8"));
    assert.equal(oldOutput.Status, "FAILED");
    assert.match(oldOutput.LastStep, /Step 7/);
    assert.doesNotMatch(await fs.readFile(log, "utf8"), /--sync-package/);
    await fs.writeFile(log, "");
    await assert.rejects(exec("/bin/bash", [launcher], { env: { ...env, TEST_FAIL_MATCH: "jobs:status -- --sync-package" }, timeout: 15000 }), (error) => error.code === 7);
    const syncFailure = JSON.parse(await fs.readFile(path.join(root, "data/jobs/reports/refresh-run.json"), "utf8"));
    assert.equal(syncFailure.Status, "FAILED");
    assert.equal(syncFailure.ExitCode, 7);
    assert.match(syncFailure.LastStep, /Step 8/);
    assert.doesNotMatch(await fs.readFile(path.join(root, "data/jobs/reports/refresh-job-feed-status.md"), "utf8"), /^Completed:/m);
    const wrapper = await fs.readFile(fromRoot("launchers", "Refresh Job Feed.desktop-wrapper.sh"), "utf8");
    assert.ok(wrapper.includes(`exec /bin/bash "${fromRoot("launchers", "Refresh Job Feed.command")}" "$@"`));
    await exec("/bin/bash", ["-n", fromRoot("launchers", "Refresh Job Feed.desktop-wrapper.sh")]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log("Refresh launcher success and failure tests passed; no live refresh ran.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
