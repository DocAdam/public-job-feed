const assert = require("assert");
const { isPrunableFailure, shouldKeepReviewRow } = require("./check-gsheet-url-health");

const ashbyShell = {
  status: "Bad",
  issue: "Ashby job URL returned an empty generic Jobs page.",
};

assert.strictEqual(isPrunableFailure(ashbyShell), true, "Ashby empty shell should be safe to prune");
assert.strictEqual(
  shouldKeepReviewRow({ UrlCheckOk: "No", UrlCheckStatus: ashbyShell.status, UrlCheckIssue: ashbyShell.issue }, true),
  false,
  "safe mode should remove an Ashby empty shell"
);

for (const check of [
  { status: "Timeout", issue: "Timed out after 15000ms." },
  { status: "Rate Limited", issue: "HTTP 429; URL was not pruned because the site rate-limited the checker." },
  { status: "Fetch Error", issue: "network connection reset" },
]) {
  assert.strictEqual(isPrunableFailure(check), false, `${check.status} should stay for review`);
  assert.strictEqual(
    shouldKeepReviewRow({ UrlCheckOk: "No", UrlCheckStatus: check.status, UrlCheckIssue: check.issue }, true),
    true,
    `${check.status} should be kept in safe mode`
  );
}

console.log("Google Sheets safe URL pruning tests passed.");
