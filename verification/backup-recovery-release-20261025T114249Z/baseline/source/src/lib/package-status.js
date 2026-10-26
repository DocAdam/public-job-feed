const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { writeTextFile } = require("./files");
const { writeJsonFile } = require("./files");
const { parseCsvRecords } = require("./csv");
const { manifestCsv } = require("./package-manifest");
const { withMutablePackage } = require("./package-history-guard");

const jobsFile = "01_good_documentation_jobs.csv";

async function packageIdentity(packageDir) {
  const manifest = JSON.parse(await fs.readFile(path.join(packageDir, "gsheet-package-manifest.json"), "utf8"));
  const row = manifest.find((item) => item.FileName === jobsFile);
  const id = row && path.basename(path.dirname(row.OutputPath || ""));
  if (!/^\d{8}-\d{4}$/.test(id || "")) throw new Error(`Missing package run identity: ${packageDir}`);
  return id;
}

async function packageHash(packageDir) {
  return crypto.createHash("sha256").update(await fs.readFile(path.join(packageDir, jobsFile))).digest("hex");
}

async function syncDashboard(packageRoot, markdown) {
  const latest = path.join(packageRoot, "latest");
  const id = await packageIdentity(latest);
  return withMutablePackage(packageRoot, id, async () => {
    const timestamped = path.join(packageRoot, id);
    if (await packageIdentity(latest) !== id || await packageIdentity(timestamped) !== id || await packageHash(latest) !== await packageHash(timestamped)) {
      throw new Error("Dashboard sync refused: latest and timestamped packages differ.");
    }
    if (!markdown.includes(`Package run: ${id}\n`)) throw new Error("Dashboard package run does not match latest.");
    const updates = [];
    for (const dir of [timestamped, latest]) {
      const manifestPath = path.join(dir, "gsheet-package-manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      const entry = manifest.find((row) => row.FileName === "PROJECT_STATUS_DASHBOARD.md");
      if (!entry) throw new Error(`Dashboard manifest entry missing: ${dir}`);
      entry.SizeBytes = Buffer.byteLength(markdown);
      entry.Exists = true;
      let headers = [];
      try { headers = parseCsvRecords(await fs.readFile(path.join(dir, "gsheet-package-manifest.csv"), "utf8")).headers; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      updates.push({ dir, manifestPath, manifest, csv: manifestCsv(manifest, headers) });
    }
    for (const { dir, manifestPath, manifest, csv } of updates) {
      await writeTextFile(path.join(dir, "PROJECT_STATUS_DASHBOARD.md"), markdown);
      await writeJsonFile(manifestPath, manifest);
      await writeTextFile(path.join(dir, "gsheet-package-manifest.csv"), csv);
    }
    for (const dir of [timestamped, latest]) {
      if (await fs.readFile(path.join(dir, "PROJECT_STATUS_DASHBOARD.md"), "utf8") !== markdown) {
        throw new Error(`Dashboard copy differs: ${dir}`);
      }
    }
    return id;
  });
}

async function previousPackage(packageDir, root = path.dirname(packageDir), explicit = "") {
  const id = await packageIdentity(packageDir);
  if (explicit) {
    const previousId = await packageIdentity(explicit);
    if (previousId >= id) throw new Error("Previous package must be an earlier distinct run.");
    return explicit;
  }
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory() && /^\d{8}-\d{4}$/.test(entry.name) && entry.name < id)
    .map((entry) => entry.name).sort().reverse();
  return names.length ? path.join(root, names[0]) : "";
}

module.exports = { packageIdentity, packageHash, syncDashboard, previousPackage };
