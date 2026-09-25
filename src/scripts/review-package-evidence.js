const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { fromRoot, writeJsonFile, writeTextFile } = require("../lib/files");
const { packageIdentity } = require("../lib/package-status");
const { checkJobUrl } = require("../lib/job-url-health");
const { isPrunableFailure } = require("./check-gsheet-url-health");

function submissionStatus(role, rows, health, intake, feedGeneratedAt) {
  if (!role) return null;
  const submission = intake?.Submissions?.find(item => item.URL === role.URL);
  const entry = health?.Entries?.find(item => (submission && item.Id === submission.Id) || item.VerifiedURL === role.URL);
  const sourceStatus = !entry ? "NOT_CHECKED" : !health.GeneratedAt || !feedGeneratedAt || health.GeneratedAt !== feedGeneratedAt ? "PREVIOUS_CHECK"
    : entry.UsedLastVerifiedRecord ? "CACHED_FALLBACK" : entry.Included && entry.HTTPStatus === 200 ? "VERIFIED"
    : entry.Status !== "APPROVED" ? "NOT_APPROVED" : "FAILED";
  return { URL: role.URL, Title: role.Title, Company: role.Company, SourceStatus: sourceStatus, SourceCheckedAt: health?.GeneratedAt || null,
    PackageStatus: rows.some(row => row["Apply Link"] === role.URL) ? "INCLUDED" : "NOT_INCLUDED" };
}

function reviewQueue(rows, checks, now = Date.now()) {
  const byUrl = new Map(checks.map((row) => [row["Apply Link"], row]));
  return rows.flatMap((row) => {
    const previous = byUrl.get(row["Apply Link"]);
    const lastChecked = Date.parse(String(row["Last Checked"] || "").replace(" UTC", "Z").replace(" ", "T"));
    const age = Number.isFinite(lastChecked) ? (now - lastChecked) / 86400000 : null;
    const ageBand = age === null ? "UNKNOWN" : age > 14 ? "OVER_14_DAYS" : age > 7 ? "OVER_7_DAYS" : "CURRENT";
    const stale = ageBand !== "CURRENT";
    const uncertain = !previous || previous.UrlCheckOk !== "Yes" || previous.UrlCheckStatus === "Rate Limited";
    if (!stale && !uncertain) return [];
    return [{
      Title: row.Title, Company: row.Company, Source: row.Source,
      ApplyLink: row["Apply Link"], BoardLastChecked: row["Last Checked"], BoardAgeBand: ageBand,
      ReviewReason: [stale ? "BOARD_CHECK_OLD_OR_UNKNOWN" : "", uncertain ? "URL_CHECK_UNCERTAIN" : ""].filter(Boolean).join("|"),
      PreviousUrlCheckedAt: previous?.UrlCheckCheckedAt || "",
      PreviousUrlStatus: previous?.UrlCheckStatus || "NOT_RECORDED",
      PreviousUrlIssue: previous?.UrlCheckIssue || "",
      UrlCheckedAt: previous?.UrlCheckCheckedAt || "", UrlStatus: previous?.UrlCheckStatus || "NOT_CHECKED",
      HttpStatus: previous?.UrlCheckHttpStatus || "", UrlIssue: previous?.UrlCheckIssue || "",
      JobOpenStatus: "UNVERIFIED", Action: "Review source job details; preserve the saved board check date.",
    }];
  });
}

function applyCheck(row, check) {
  return { ...row, UrlCheckedAt: check.checkedAt, UrlStatus: check.status, HttpStatus: check.httpStatus,
    UrlIssue: check.issue, FinalUrl: check.finalUrl,
    // URL health does not establish exact role identity or a working application.
    JobOpenStatus: "UNVERIFIED",
    Action: isPrunableFailure(check) ? "Review confirmed invalid-link evidence before the next package cleanup."
      : check.status === "Good" ? "URL check passed; inspect role identity and application evidence."
      : "Access or URL evidence remains uncertain; retain for review.",
  };
}

function applyUserReview(row, reviews, packageRun) {
  const matches = reviews.filter(item => item.ApplyLink === row.ApplyLink)
    .sort((a, b) => (Date.parse(b.ReviewedAt) || 0) - (Date.parse(a.ReviewedAt) || 0));
  const current = matches.find(item => item.PackageRun === packageRun);
  const review = current || matches[0];
  if (!review) return { ...row, UserReviewStatus: "NOT_REVIEWED", UserReviewedAt: "", UserReviewNote: "", FlagForWritingReview: false };
  const flag = Boolean(matches.find(item => typeof item.FlagForWritingReview === "boolean")?.FlagForWritingReview);
  const closed = review.Status === "USER_CONFIRMED_CLOSED" && (!review.PackageRun || current);
  const action = flag ? "Flag role fit: loan-documentation review, not writing."
    : closed ? "User confirmed this role is inactive; exclude at the next safe URL cleanup."
    : !current ? `Previously reviewed on ${review.ReviewedAt || "unknown date"}; current status unverified.`
    : review.Status === "USER_REPORTED_OUTAGE" ? "Temporary outage reported by user; keep for a later check."
    : "User opened the job posting; no link issue flagged for this package.";
  return { ...row, UserReviewStatus: current || closed ? review.Status : "PREVIOUS_REVIEW",
    PreviousUserReviewStatus: review.Status, UserReviewPackage: review.PackageRun || "",
    UserReviewedAt: review.ReviewedAt, UserReviewNote: review.Note, FlagForWritingReview: flag,
    JobOpenStatus: closed ? "USER_CONFIRMED_CLOSED"
      : current && review.Status === "USER_CONFIRMED_OPEN" ? review.Status : row.JobOpenStatus,
    Action: action };
}

async function main() {
  const root = fromRoot("data", "jobs", "gsheet-package");
  const latest = path.join(root, "latest");
  const id = await packageIdentity(latest);
  const userReviewPath = fromRoot("data", "config", "package-user-reviews.json");
  const userReview = await fs.readFile(userReviewPath, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return { Reviews: [] };
    throw error;
  });
  const rows = parseCsvRecords(await fs.readFile(path.join(latest, "01_good_documentation_jobs.csv"), "utf8")).rows;
  const reviewPath = path.join(root, id, "01_good_documentation_jobs-url-review.csv");
  const checks = await fs.readFile(reviewPath, "utf8").then((text) => parseCsvRecords(text).rows).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const optionalJson = async file => fs.readFile(fromRoot(file), "utf8").then(JSON.parse).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const [health, intake, feed] = await Promise.all([
    optionalJson("data/jobs/reports/curated-submissions-health.json"),
    optionalJson("data/config/curated-submissions.json"),
    optionalJson("data/jobs/public/public-job-feed-latest-summary.json"),
  ]);
  const submittedRole = submissionStatus(userReview.NewRole, rows, health, intake, feed?.GeneratedAt);
  const queue = reviewQueue(rows, checks);
  const queuedUrls = new Set(queue.map((row) => row.ApplyLink));
  for (const row of rows) {
    const manual = userReview.Reviews.find((item) => item.ApplyLink === row["Apply Link"] &&
      (item.FlagForWritingReview || ((!item.PackageRun || item.PackageRun === id) && item.Status === "USER_CONFIRMED_CLOSED")));
    if (manual && !queuedUrls.has(row["Apply Link"])) {
      queue.push({ ...reviewQueue([row], [])[0], ReviewReason: "USER_REVIEW" });
      queuedUrls.add(row["Apply Link"]);
    }
  }
  const live = process.argv.includes("--check-urls");
  const results = [];
  // Bound this diagnostic check. It never changes package rows or board state.
  if (live && queue.length > 50) throw new Error(`Review has ${queue.length} rows; split it before live checks (limit 50).`);
  for (let index = 0; index < queue.length; index += 4) {
    results.push(...await Promise.all(queue.slice(index, index + 4).map(async (row) =>
      live ? applyCheck(row, await checkJobUrl(row.ApplyLink, { timeoutMs: 15000 })) : row)));
  }
  for (let index = 0; index < results.length; index += 1) {
    results[index] = applyUserReview(results[index], userReview.Reviews, id);
  }
  const report = { GeneratedAt: new Date().toISOString(), PackageRun: id, LiveChecks: live,
    SubmittedRole: submittedRole,
    SourceReview: reviewPath, UserReviewSource: userReviewPath,
    WritingReviewRows: results.filter((row) => row.FlagForWritingReview).length,
    InputRows: rows.length, ReviewRows: results.length, Rows: results };
  const outputIndex = process.argv.indexOf("--output-dir");
  if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith("--"))) throw new Error("--output-dir requires a path");
  const dir = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : fromRoot("data", "jobs", "reports");
  await writeJsonFile(path.join(dir, "package-evidence-review.json"), report);
  await writeTextFile(path.join(dir, "package-evidence-review.csv"), rowsToCsv(Object.keys(results[0] || { Title: "", ApplyLink: "" }), results));
  await writeTextFile(path.join(dir, "package-evidence-review.md"), [
    "# Package evidence review", "", `Generated: ${report.GeneratedAt}`, `Package run: ${id}`, "",
    "Derived review. Board check dates are unchanged. URL results do not confirm that a job is open.", "",
    "User browser observations are recorded separately from automated URL checks. Open-page observations apply to the named package; outage reports do not establish closure.", "",
    `- Input rows: ${rows.length}`, `- Review rows: ${results.length}`, `- Live URL checks: ${live}`, "",
    `- Roles flagged for writing review: ${report.WritingReviewRows}`, "",
    ...(submittedRole ? [`Submitted role: [${submittedRole.Title} — ${submittedRole.Company}](${submittedRole.URL}). Source: ${submittedRole.SourceStatus} (checked ${submittedRole.SourceCheckedAt || "unknown"}). Package ${id}: ${submittedRole.PackageStatus}.`, ""] : []),
    "## Board freshness review", "",
    "Age bands are exclusive. A row can also have uncertain URL evidence; it is counted once in the review total.", "",
    ...["OVER_7_DAYS", "OVER_14_DAYS", "UNKNOWN"].map(band => `- ${band}: ${results.filter(row => row.BoardAgeBand === band).length}`), "",
    ...results.filter(row => row.BoardAgeBand !== "CURRENT").map(row => `- ${row.BoardAgeBand}: [${row.Title}](${row.ApplyLink}) — ${row.Company}; board check ${row.BoardLastChecked || "unknown"}.`), "",
    "## All review rows", "",
    "| Company | Title | Board last checked | Automated URL status | HTTP | User review | Action |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((row) => `| ${row.Company} | [${row.Title.replace(/\|/g, "/")}](${row.ApplyLink}) | ${row.BoardLastChecked} | ${row.UrlStatus} | ${row.HttpStatus || "Unknown"} | ${row.UserReviewStatus}${row.UserReviewedAt ? ` (${row.UserReviewedAt}; ${row.PreviousUserReviewStatus})` : ""} | ${row.Action} |`), "",
  ].join("\n"));
  console.log(`Evidence review: ${results.length} retained rows; live checks ${live}.`);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { reviewQueue, applyCheck, applyUserReview, submissionStatus };
