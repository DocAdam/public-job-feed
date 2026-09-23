const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { packageIdentity, syncDashboard, previousPackage } = require("../lib/package-status");

const { buildDashboard, sourceStatus } = require("./build-status-dashboard");

const { executeTests } = require("./run-test-suite");

const { reviewQueue, applyCheck, applyUserReview } = require("./review-package-evidence");

const { absoluteHealth, evaluateAtsAnomalies } = require("../lib/ats-anomaly");

const { exportProfile, buildRunSummary } = require("../lib/run-summary");

async function main() {
  const { checkJobUrl } = require("../lib/job-url-health");
  for (const url of ["https://unity.com/careers/positions?gh_jid=7921865", "https://unity.com/careers/positions/7921865?gh_jid=7921865"]) {
    assert.match((await checkJobUrl(url)).issue, /reviewed confirmed-dead/);
  }
  const observation = { ApplyLink: "https://example.com/job", PackageRun: "one", Status: "USER_CONFIRMED_OPEN", ReviewedAt: "2026-09-23", Note: "Bot check resolved", FlagForWritingReview: false };
  const auto = { ApplyLink: observation.ApplyLink, UrlStatus: "Bad", HttpStatus: 403, JobOpenStatus: "UNVERIFIED" };
  assert.equal(applyUserReview(auto, [observation], "one").JobOpenStatus, "USER_CONFIRMED_OPEN");
  assert.equal(applyUserReview(auto, [observation], "one").HttpStatus, 403);
  assert.equal(applyUserReview(auto, [observation], "two").UserReviewStatus, "NOT_REVIEWED");
  assert.equal(applyUserReview(auto, [{ ...observation, Status: "USER_REPORTED_OUTAGE" }], "one").JobOpenStatus, "UNVERIFIED");
  assert.equal(applyUserReview(auto, [{ ...observation, PackageRun: "", FlagForWritingReview: true }], "two").FlagForWritingReview, true);

  assert.equal(exportProfile({}).Profile, "unknown");
  assert.equal(buildDashboard({ releaseComparison: { Status: "NOT_APPLICABLE", Differences: {} } }).TestStatus.ReleaseComparisonSummary, null);
  assert.equal(exportProfile({ exportRun: { FeedGeneratedAt: "2026-09-23", Profile: "daily" }, latestSummary: { GeneratedAt: "2026-09-22" } }).Profile, "unknown");
  const daily = buildDashboard({ exportRun: { FeedGeneratedAt: "2026-09-23", Profile: "daily" }, latestSummary: { GeneratedAt: "2026-09-23" } });
  assert.equal(daily.DedupedExportStatus.DedupedFirehoseRows, "Skipped by daily profile");
  assert.equal(daily.DedupedExportStatus.DedupedStrongTopRows, null);
  assert.equal(buildDashboard({ packageRun: "20260923-0709", fullTest: { PackageRun: "20260922-0700", Status: "PASS" } }).TestStatus.FullSuiteStatus, "OTHER_PACKAGE_RUN");
  assert.match(buildDashboard({ fullTest: { Status: "FAIL" } }).SuggestedNextAction, /Resolve the failed validation/);
  assert.equal(buildRunSummary(daily, {}).TotalRows, null);
  const failedRows = Array.from({ length: 100 }, () => ({ Status: "failed", HttpStatus: 403, JobCount: 0 }));
  assert.equal(evaluateAtsAnomalies("lever", failedRows, failedRows).Status, "OK");
  assert.equal(absoluteHealth(failedRows).Status, "HIGH");
  assert.equal(absoluteHealth([]).Status, "INSUFFICIENT_DATA");
  assert.equal(absoluteHealth([{ Status: "skipped" }]).Attempts, 0);
  const queueNow = Date.parse("2026-09-23T12:00:00Z");
  const job = { Title: "Writer", "Apply Link": "https://example.com/job", "Last Checked": "2026-06-30 12:08 UTC" };
  assert.equal(reviewQueue([job], [], queueNow).length, 1);
  const recent = { ...job, "Last Checked": "2026-09-23 11:00 UTC" };
  assert.equal(reviewQueue([recent], [], queueNow).length, 1);
  assert.equal(reviewQueue([recent], [{ "Apply Link": job["Apply Link"], UrlCheckOk: "Yes", UrlCheckStatus: "Good" }], queueNow).length, 0);
  assert.equal(reviewQueue([recent], [{ "Apply Link": job["Apply Link"], UrlCheckOk: "Yes", UrlCheckStatus: "Rate Limited" }], queueNow).length, 1);
  const reviewed = applyCheck(reviewQueue([job], [], queueNow)[0], { status: "Good", ok: true, checkedAt: "2026-09-23T12:00:00Z" });
  assert.equal(reviewed.JobOpenStatus, "UNVERIFIED");
  assert.equal(reviewed.BoardLastChecked, job["Last Checked"]);
  const states = [];
  const failed = await executeTests(["first", "bad", "never"], async (name) => ({ ExitCode: name === "bad" ? 1 : 0 }), async (result) => states.push(result.Status));
  assert.equal(failed.Status, "FAIL");
  assert.equal((await executeTests(["throws"], async () => { throw new Error("spawn failed"); }, async () => {})).Status, "FAIL");
  assert.equal(failed.Tests.length, 2);
  assert.equal(failed.FailedTest, "bad");
  assert.equal(states[0], "RUNNING");
  assert.equal((await executeTests(["good"], async () => ({ ExitCode: 0 }), async () => {})).Status, "PASS");
  const dashboard = buildDashboard({ archiveSummary: "- ARCHIVE_CANDIDATE: 0\n- ARCHIVED: 1\n" });
  assert.equal(dashboard.CleanupArchive.ArchiveCandidateCount, 0);
  assert.equal(dashboard.CleanupArchive.ArchiveFilesCreated, 1);
  const now = Date.parse("2026-09-23T12:00:00Z");
  assert.equal(sourceStatus("inventorySummary", { GeneratedAt: "2026-08-24T12:00:00Z" }, now).Status, "STALE");
  assert.equal(sourceStatus("releaseTest", { GeneratedAt: "2026-09-23T11:00:00Z" }, now).Status, "CURRENT");
  assert.equal(sourceStatus("releaseTest", {}, now).Status, "DATE_UNKNOWN");
  assert.equal(sourceStatus("releaseTest", null, now).Status, "MISSING");
  assert.equal(sourceStatus("archiveSummary", "Generated: 2026-06-02T16:24:36.089Z", now).Status, "STALE");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "feed-status-test-"));
  try {
    const id = "20260923-0709";
    for (const dir of ["latest", id]) {
      await fs.mkdir(path.join(root, dir));
      await fs.writeFile(path.join(root, dir, "gsheet-package-manifest.json"), JSON.stringify([
        { FileName: "01_good_documentation_jobs.csv", OutputPath: path.join(root, id, "01_good_documentation_jobs.csv"), SizeBytes: 13, Exists: true },
        { FileName: "PROJECT_STATUS_DASHBOARD.md", OutputPath: path.join(root, id, "PROJECT_STATUS_DASHBOARD.md"), SizeBytes: 0, Exists: false },
      ]));
      await fs.writeFile(path.join(root, dir, "01_good_documentation_jobs.csv"), "Title\nWriter\n");
    }
    assert.equal(await packageIdentity(path.join(root, "latest")), id);
    const older = "20260922-0700";
    await fs.mkdir(path.join(root, older));
    await fs.writeFile(path.join(root, older, "gsheet-package-manifest.json"), JSON.stringify([
      { FileName: "01_good_documentation_jobs.csv", OutputPath: path.join(root, older, "01_good_documentation_jobs.csv") },
    ]));
    assert.equal(await previousPackage(path.join(root, "latest")), path.join(root, older));
    assert.equal(await previousPackage(path.join(root, id)), path.join(root, older));
    assert.equal(await previousPackage(path.join(root, older)), "");
    await assert.rejects(previousPackage(path.join(root, "latest"), root, path.join(root, id)), /earlier distinct run/);

    const markdown = `Package run: ${id}\nNew status\n`;
    assert.equal(await syncDashboard(root, markdown), id);
    for (const dir of ["latest", id]) {
      assert.equal(await fs.readFile(path.join(root, dir, "PROJECT_STATUS_DASHBOARD.md"), "utf8"), markdown);
      const manifest = JSON.parse(await fs.readFile(path.join(root, dir, "gsheet-package-manifest.json"), "utf8"));
      assert.equal(manifest.find((row) => row.FileName === "PROJECT_STATUS_DASHBOARD.md").SizeBytes, Buffer.byteLength(markdown));
    }
    await assert.rejects(syncDashboard(root, "Package run: other\n"), /does not match/);
    await fs.writeFile(path.join(root, "latest", "01_good_documentation_jobs.csv"), "Title\nChanged\n");
    await assert.rejects(syncDashboard(root, markdown), /packages differ/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log("Dashboard tests passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
