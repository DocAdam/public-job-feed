// Derived integration fixtures from the saved review. All writes use a new temporary project.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
const { DuckDBInstance } = require("@duckdb/node-api");
const { sampleRows } = require("./test-employment-type");
const { EMPLOYMENT_FIELDS, displayEmploymentType, ensureEmploymentType } = require("../lib/employment-type");
const { buildJobExportArtifacts, publicFeedHeaders } = require("../lib/job-export");
const { rowsToCsv, parseCsvRecords } = require("../lib/csv");
const { writeLargeJsonArrayFile, fromRoot } = require("../lib/files");
const { preview } = require("./preview-employment-type");
const { runHistory, query } = require("../lib/jobs-history");
const runtime = require("../lib/job-history-runtime");
const { scoreWriterFit } = require("../lib/writer-fit-score");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "pjf-employment-integration-"));
  const project = path.join(temp, "project");
  const json = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
  try {
    await fs.mkdir(project);
    await fs.cp(fromRoot("src"), path.join(project, "src"), { recursive: true });
    await fs.symlink(fromRoot("node_modules"), path.join(project, "node_modules"));
    await fs.copyFile(fromRoot("package.json"), path.join(project, "package.json"));
    await fs.mkdir(path.join(project, "data/config"), { recursive: true });
    await fs.copyFile(fromRoot("data/config/job-titles.md"), path.join(project, "data/config/job-titles.md"));
    await fs.cp(fromRoot("test"), path.join(project, "test"), { recursive: true });
    const guard = path.join(temp, "no-network.cjs");
    await fs.writeFile(guard, 'globalThis.fetch = async () => { throw new Error("Network is disabled in the employment integration test"); };\n');
    const cli = async (script, args = []) => {
      try { return await run(process.execPath, [path.join(project, "src/scripts", script), ...args], { cwd: project, env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${guard}` }, maxBuffer: 8 * 1024 * 1024 }); }
      catch (error) { throw new Error(`${script}: ${error.stdout || ""}\n${error.stderr || error.message}`); }
    };
    const batchRows = sampleRows.map((row, i) => ({ ...row, CatalogSlug: `review-${i + 1}` }));
    const exportRows = buildJobExportArtifacts(batchRows, [], [], "2026-10-24T12:00:00Z").publicFeedRows;
    for (const row of batchRows) {
      const before = { ...row }; for (const field of EMPLOYMENT_FIELDS) delete before[field];
      assert.deepEqual(scoreWriterFit(row), scoreWriterFit(before), "Employment fields must not change scoring");
    }
    const index = [];
    for (const ats of new Set(exportRows.map(row => row.ATS))) {
      const rows = exportRows.filter(row => row.ATS === ats);
      const folder = path.join(project, "data/jobs/batches", ats);
      await json(path.join(folder, "public-job-feed-batch.json"), rows);
      await json(path.join(folder, "jobs-batch-fetch-log.json"), rows.map(row => ({ ATS: ats, CatalogSlug: row.CatalogSlug, Status: "success", FetchedAt: row.FetchedAt })));
      index.push({ ATS: ats, IndexStatus: "OK", BatchName: ats, BatchFolder: folder, PublicFeedRows: rows.length });
    }
    await json(path.join(project, "data/jobs/index/batch-index.json"), index);
    await cli("merge-batches.js", ["--ats", "all", "--output-name", "employment-test"]);
    const mergedPath = path.join(project, "data/jobs/public/public-job-feed-latest.json");
    const merged = JSON.parse(await fs.readFile(mergedPath));
    assert.equal(merged.length, 18);
    for (const row of exportRows) {
      const after = merged.find(r => r.URL === row.URL);
      assert.ok(after);
      for (const key of publicFeedHeaders.filter(k => !["PossibleDuplicate", "DuplicateReason", "DuplicateGroupKey"].includes(k))) assert.deepEqual(after[key], row[key], `Merge changed ${key}: ${row.URL}`);
    }
    await cli("export-public-slices.js", ["--profile", "daily"]);
    const topPath = path.join(project, "data/jobs/public/public-job-feed-deduped-top.json");
    const top = JSON.parse(await fs.readFile(topPath));
    assert.ok(top.length > 0);
    for (const row of top) assert.deepEqual(row.EmploymentTypeEvidence, merged.find(r => r.URL === row.URL).EmploymentTypeEvidence);
    const topCsv = parseCsvRecords(await fs.readFile(topPath.replace(/json$/, "csv"), "utf8"));
    for (const row of topCsv.rows) assert.deepEqual(JSON.parse(row.EmploymentTypeEvidence), top.find(r => r.URL === row.URL).EmploymentTypeEvidence);
    const out = path.join(temp, "20261024-1200");
    await preview(topPath, out, "2026-10-24T12:00:00Z");
    const publicCsv = parseCsvRecords(await fs.readFile(path.join(out, "01_good_documentation_jobs.csv"), "utf8"));
    assert.equal(publicCsv.headers.length, 16); assert.equal(publicCsv.headers[15], "Employment Type");
    assert.ok(!publicCsv.headers.some(h => h.includes("Evidence")));
    const formulaCsv = parseCsvRecords(await fs.readFile(path.join(out, "good_documentation_jobs_formula.csv"), "utf8"));
    assert.deepEqual(formulaCsv.rows.map(r => r["Employment Type"]), publicCsv.rows.map(r => r["Employment Type"]));
    await cli("test-gsheet-package.js", ["--package-dir", out, "--min-rows", "1", "--report-dir", path.join(temp, "reports")]);
    // New schema must reject a missing employment column. Old packages remain valid.
    const savedPublic = await fs.readFile(path.join(out, "01_good_documentation_jobs.csv"));
    await fs.writeFile(path.join(out, "01_good_documentation_jobs.csv"), rowsToCsv(publicCsv.headers.slice(0, -1), publicCsv.rows));
    await assert.rejects(cli("test-gsheet-package.js", ["--package-dir", out, "--min-rows", "1", "--report-dir", path.join(temp, "reports")]), /headers do not match|invalid Employment Type/);
    await fs.writeFile(path.join(out, "01_good_documentation_jobs.csv"), savedPublic);
    const historyRoot = path.join(temp, "snapshots");
    const oldDir = path.join(historyRoot, "20261023-1200"), newDir = path.join(historyRoot, "20261024-1200");
    await fs.mkdir(oldDir, { recursive: true }); await fs.mkdir(newDir);
    const oldHeaders = publicFeedHeaders.filter(k => !EMPLOYMENT_FIELDS.includes(k));
    await fs.writeFile(path.join(oldDir, "03_top_matches_full.csv"), rowsToCsv(oldHeaders, exportRows));
    await fs.writeFile(path.join(oldDir, "01_good_documentation_jobs.csv"), rowsToCsv(publicCsv.headers.slice(0, -1), publicCsv.rows));
    await json(path.join(oldDir, "gsheet-package-manifest.json"), [{ FileName: "01_good_documentation_jobs.csv", OutputPath: path.join(oldDir, "01_good_documentation_jobs.csv") }]);
    await cli("test-gsheet-package.js", ["--package-dir", oldDir, "--min-rows", "1", "--report-dir", path.join(temp, "old-reports")]);
    await fs.writeFile(path.join(newDir, "03_top_matches_full.csv"), rowsToCsv(publicFeedHeaders, exportRows));
    await fs.writeFile(path.join(newDir, "01_good_documentation_jobs.csv"), savedPublic);
    for (const [kind, build] of [["legacy", runHistory], ["v2", runtime.runHistory]]) {
      const database = path.join(temp, `${kind}/history.duckdb`);
      await fs.mkdir(path.dirname(database));
      const options = { root: historyRoot, database, ...(kind === "v2" ? { format: "v2" } : {}) };
      await build("build", options);
      const audit = await build("audit", options); assert.equal(audit.errors.length, 0);
      const instance = await DuckDBInstance.create(database, { access_mode: "READ_ONLY" }), connection = await instance.connect();
      try {
        const historyRows = await query(connection, "SELECT snapshot_id, employment_type_evidence FROM posting_observations ORDER BY snapshot_id");
        assert.equal(historyRows.length, 36);
        assert.ok(historyRows.filter(r => r.snapshot_id === "20261023-1200").every(r => r.employment_type_evidence === null));
        const newRows = historyRows.filter(r => r.snapshot_id === "20261024-1200");
        assert.equal(newRows.length, 18); assert.ok(newRows.every(r => Array.isArray(JSON.parse(r.employment_type_evidence))));
      } finally { connection.closeSync(); instance.closeSync(); }
    }
    const latestCopy = path.join(temp, "latest");
    await fs.cp(out, latestCopy, { recursive: true });
    // Apply the existing prune function to a saved synthetic result. No URL is requested.
    const { applyPrune } = require("./check-gsheet-url-health");
    const pruneResult = await applyPrune(path.join(out, "01_good_documentation_jobs.csv"), publicCsv.headers,
      publicCsv.rows.map((row, index) => ({ ...row, UrlCheckOk: index ? "Yes" : "No", UrlCheckStatus: index ? "Good" : "Bad", UrlCheckIssue: index ? "" : "HTTP 404" })),
      { backupCsv: path.join(out, "before-prune.csv") }, { applySafe: true });
    assert.equal(pruneResult.prunedRows, 1); assert.equal(pruneResult.updatedEmploymentMetadata, true);
    const prunedSchema = JSON.parse(await fs.readFile(path.join(out, "public-schema.json")));
    assert.equal(prunedSchema.rowCount, publicCsv.rows.length - 1);
    const prunedCoverage = JSON.parse(await fs.readFile(path.join(out, "employment-type-coverage.json")));
    assert.equal(prunedCoverage.public.denominator, publicCsv.rows.length - 1);
    assert.equal(prunedCoverage.detailed.denominator, top.length);
    assert.ok((await fs.readFile(path.join(out, "EMPLOYMENT_TYPE_IMPORT.md"), "utf8")).includes(prunedSchema.tableRange));
    const prunedFormula = parseCsvRecords(await fs.readFile(path.join(out, "good_documentation_jobs_formula.csv"), "utf8"));
    assert.equal(prunedFormula.rows.length, publicCsv.rows.length - 1);
    await cli("test-gsheet-package.js", ["--package-dir", out, "--min-rows", "1", "--report-dir", path.join(temp, "pruned-reports")]);
    // Execute the actual launcher sync function with temporary paths and stubbed
    // progress/report commands. The full launcher and URL collector are not run.
    const launcher = await fs.readFile(fromRoot("launchers/Clean Broken Links.command"), "utf8");
    const syncStart = launcher.indexOf("sync_latest_package() {");
    const syncBody = launcher.slice(syncStart, launcher.indexOf("\n}\n", syncStart) + 3);
    await run("bash", ["-c", 'step_start() { :; }; step_complete() { :; }; npm() { :; };\n' + syncBody + "\nsync_latest_package"],
      { cwd: project, env: { ...process.env, LATEST_TIMESTAMPED_DIR: out, LATEST_DIR: latestCopy } });
    const syncedSchema = JSON.parse(await fs.readFile(path.join(latestCopy, "public-schema.json")));
    assert.deepEqual(syncedSchema, prunedSchema);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(latestCopy, "employment-type-coverage.json"))), prunedCoverage);
    await cli("test-gsheet-package.js", ["--package-dir", latestCopy, "--min-rows", "1", "--report-dir", path.join(temp, "synced-reports")]);
    // Streaming selection and CSV evidence must agree with the normal daily path.
    const streamingInput = path.join(temp, "streaming.json");
    const contract = exportRows.find(r => r.EmploymentTerms.includes("Contract"));
    const permanent = exportRows.find(r => r.EmploymentTerms.includes("Permanent"));
    const streamRows = [
      { ...contract, DuplicateGroupKey: "bridge", WriterFitTier: "A" },
      { ...permanent, URL: contract.URL, CanonicalURLKey: contract.CanonicalURLKey, RawJobId: contract.RawJobId, ATS: contract.ATS, Company: contract.Company, CompanyKey: contract.CompanyKey, DuplicateGroupKey: "bridge", WriterFitTier: "A" },
      { ...permanent, DuplicateGroupKey: "bridge", WriterFitTier: "A" },
    ];
    await writeLargeJsonArrayFile(streamingInput, streamRows);
    const staging = path.join(temp, "streaming");
    await cli("export-public-slices-streaming-dry-run.js", ["--input", streamingInput, "--staging-root", staging, "--profile", "daily"]);
    const runDir = path.join(staging, (await fs.readdir(staging))[0]);
    const { ExportRunReader } = require("../adapters/storage/export-run-reader");
    const reader = new ExportRunReader(runDir);
    try {
      const selected = [...reader.iterateSelectedSlice("deduped-top")];
      assert.equal(selected.length, 2);
      assert.ok(selected.some(r => displayEmploymentType(r) === "Needs review"));
    } finally { reader.close(); }
    await cli("test-scoring.js");
    console.log(`PASS: actual merge, daily slices, ${top.length} shortlist records, public/formula CSV, new-schema rejection, old package loading, legacy and v2 history, URL-prune and actual launcher-sync metadata/formula synchronization, streaming conflict protection, scoring regression. All writes used temporary paths; collection was disabled.`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
