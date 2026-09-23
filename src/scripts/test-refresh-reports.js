const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { promisify } = require("util");
const exec = promisify(require("child_process").execFile);
const { fromRoot } = require("../lib/files");
const { readPackageTimestamp, parseRecordedTime } = require("../lib/package-time");
const { validateOutputs } = require("./validate-refresh-output");
const { boardCoverage } = require("../lib/board-coverage");
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "report-test-"));
  try {
    for (const date of ["2026-09-23T12:09:47.814Z", "2026-01-23T13:09:47.814Z", "2026-11-01T06:30:00Z", "2026-11-01T07:30:00Z"]) {
      await fs.writeFile(path.join(dir, "README_GSHEET_PACKAGE.md"), `Generated: ${date}\n`);
      assert.equal((await readPackageTimestamp(dir)).toISOString(), new Date(date).toISOString());
    }
    await fs.rm(path.join(dir, "README_GSHEET_PACKAGE.md"));
    await fs.writeFile(path.join(dir, "00_start_here.csv"), "Report Run Date\n2026-09-23 12:09 UTC\n");
    assert.equal((await readPackageTimestamp(dir)).toISOString(), "2026-09-23T12:09:00.000Z");
    assert.equal(parseRecordedTime("20260923-0709"), null);
    await fs.rm(path.join(dir, "00_start_here.csv"));
    await assert.rejects(readPackageTimestamp(dir), /no recorded UTC timestamp/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "validation-cli-test-"));
  try {
    for (const folder of ["src/scripts", "src/lib", "data/jobs/reports", "data/jobs/gsheet-package/latest"]) {
      await fs.mkdir(path.join(root, folder), { recursive: true });
    }
    for (const file of ["src/scripts/validate-refresh-output.js", "src/lib/files.js", "src/lib/csv.js", "src/lib/package-status.js", "src/lib/package-time.js"]) {
      await fs.copyFile(fromRoot(file), path.join(root, file));
    }
    const latest = path.join(root, "data/jobs/gsheet-package/latest");
    const manifest = path.join(latest, "gsheet-package-manifest.json");
    const reports = path.join(root, "data/jobs/reports");
    const output = path.join(reports, "refresh-output-validation.json");
    const validManifest = JSON.stringify([{ FileName: "01_good_documentation_jobs.csv", OutputPath: "/packages/20260923-0709/01_good_documentation_jobs.csv" }]);
    await fs.writeFile(path.join(latest, "README_GSHEET_PACKAGE.md"), "Generated: 2026-09-23T12:09:00Z\n");
    for (const scenario of ["missing manifest", "invalid manifest", "corrupt report", "missing reports"]) {
      await fs.writeFile(output, JSON.stringify({ Status: "PASS", GeneratedAt: "2000-01-01T00:00:00Z" }));
      await fs.writeFile(manifest, scenario === "invalid manifest" ? "[]" : validManifest);
      const report = path.join(reports, "us-remote-daily-report.json");
      await fs.rm(report, { force: true });
      if (scenario === "missing manifest") await fs.rm(manifest);
      if (scenario === "corrupt report") await fs.writeFile(report, "{invalid JSON");
      await assert.rejects(exec(process.execPath, [path.join(root, "src/scripts/validate-refresh-output.js")]), error => error.code === 1);
      const result = JSON.parse(await fs.readFile(output, "utf8"));
      assert.equal(result.Status, "FAIL", scenario);
      assert.ok(result.Failures.length > 0, scenario);
      assert.notEqual(result.GeneratedAt, "2000-01-01T00:00:00Z", scenario);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
  const catalog = [{ ATS: "workday", CatalogSlug: "one|wd1|jobs", FetchEligible: true }, { ATS: "workday", CatalogSlug: "two|wd1|jobs", FetchEligible: true }];
  const log = { ATS: "workday", CatalogSlug: "one|wd1|jobs", FetchedAt: "2026-09-23T12:00:00Z", Status: "success" };
  const result = boardCoverage(catalog, [log, log, { ...log, CatalogSlug: "outside" }, { ...log, FetchedAt: "2026-09-24T12:00:00Z", Status: "failed" }]);
  assert.equal(result.byAts[0].CoveragePercent, 50);
  assert.equal(result.byAts[0].AttemptedRows, 1);
  assert.equal(result.byAts[0].FailedRows, 1);
  assert.equal(result.remaining.length, 1);
  assert.throws(() => boardCoverage([catalog[0], catalog[0]], []), /duplicate/);
  const data = { packageRun: "20260923-0709", packageTime: "2026-09-23T12:09:00Z", feed: { GeneratedAt: "2026-09-23T12:00:00Z", TotalRows: 10 } };
  data.us = data.international = data.trends = { CurrentSnapshot: data.packageRun, GeneratedAt: "2026-09-23T12:10:00Z" };
  data.combined = `Generated: 2026-09-23 12:10:00 UTC\nPackages: ${data.packageRun} (current)`;
  data.consumer = { source: { feedGeneratedAt: data.feed.GeneratedAt }, summary: { scannedRows: 10 } };
  assert.deepEqual(validateOutputs(data), []);
  assert.ok(validateOutputs({ ...data, us: { ...data.us, CurrentSnapshot: "old" } }).some(x => x.includes("US report package")));
  assert.ok(validateOutputs({ ...data, consumer: { source: {}, summary: { scannedRows: 9 } } }).length >= 2);
  assert.ok(validateOutputs({ ...data, trends: { ...data.trends, GeneratedAt: "2026-09-22T12:00:00Z" } }).some(x => x.includes("predates")));
  console.log("Report identity, UTC timestamp, and board coverage fixtures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
