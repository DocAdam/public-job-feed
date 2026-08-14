const fs = require("fs/promises");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { fromRoot } = require("../lib/files");

const defaultRoots = [
  fromRoot("src"),
  fromRoot("data", "config"),
  fromRoot("data", "catalogs"),
  fromRoot("data", "jobs", "batches"),
];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function findDatalessFiles(roots) {
  return new Promise((resolve, reject) => {
    execFile("find", [...roots, "-flags", "+dataless", "-type", "f", "-print"], (error, stdout, stderr) => {
      if (error) {
        if (/unknown primary|illegal option|bad flag/i.test(stderr || error.message || "")) {
          resolve([]);
          return;
        }

        reject(error);
        return;
      }

      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      );
    });
  });
}

function getDisplayPath(filePath) {
  const relative = path.relative(fromRoot(), filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function probeReadable(filePath) {
  return new Promise((resolve) => {
    const child = spawn("head", ["-c", "1", filePath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        filePath,
        ok: false,
        issue: "read timed out",
      });
    }, 5000);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        filePath,
        ok: code === 0,
        issue: code === 0 ? "" : `read exited with code ${code}`,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        filePath,
        ok: false,
        issue: error.code || error.message,
      });
    });
  });
}

async function findUnreadableFiles(files) {
  const unreadable = [];

  for (const filePath of files) {
    const result = await probeReadable(filePath);
    if (!result.ok) {
      unreadable.push(result);
    }
  }

  return unreadable;
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("Local file availability check skipped: dataless file flags are macOS-specific.");
    return;
  }

  const roots = [];
  for (const root of defaultRoots) {
    if (await pathExists(root)) {
      roots.push(root);
    }
  }

  const datalessFiles = await findDatalessFiles(roots);
  if (datalessFiles.length === 0) {
    console.log("Local file availability check passed.");
    console.log("No dataless/offloaded files found in required build inputs.");
    return;
  }

  const unreadableFiles = await findUnreadableFiles(datalessFiles);
  if (unreadableFiles.length === 0) {
    console.log("Local file availability check passed with warnings.");
    console.log(`Dataless/offloaded file flags found: ${datalessFiles.length}`);
    console.log("All flagged files were readable during the probe, so the build can continue.");
    console.log("If later steps show ETIMEDOUT, rerun OneDrive Always Keep on This Device.");
    return;
  }

  console.log("Local file availability check failed.");
  console.log(`Dataless/offloaded files found: ${datalessFiles.length}`);
  console.log(`Unreadable or timing out files found: ${unreadableFiles.length}`);
  console.log("");
  console.log("The public release reads many local source and batch files.");
  console.log("When OneDrive has offloaded those files, Node can fail with ETIMEDOUT or false invalid JSON errors.");
  console.log("");
  console.log("Recommended fix:");
  console.log("1. In Finder, right-click the public-job-feed folder.");
  console.log("2. Choose Always Keep on This Device.");
  console.log("3. Wait for OneDrive to finish downloading/syncing.");
  console.log("4. Rerun npm run jobs:check-local-files.");
  console.log("");
  console.log("First unreadable/timing out files:");
  for (const result of unreadableFiles.slice(0, 40)) {
    console.log(`- ${getDisplayPath(result.filePath)} (${result.issue})`);
  }
  if (unreadableFiles.length > 40) {
    console.log(`- ...and ${unreadableFiles.length - 40} more`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
