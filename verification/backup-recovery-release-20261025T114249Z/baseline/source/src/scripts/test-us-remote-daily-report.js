const { compareRows, hasExplicitUsLocation } = require("../lib/us-remote-daily-report");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function row({ title = "Role", location = "US Remote", arrangement = "Remote", url = "https://example.test/job" } = {}) {
  return {
    Title: title,
    Company: "Example",
    Location: location,
    "Work Arrangement": arrangement,
    "Apply Link": url,
  };
}

function main() {
  for (const value of ["US", "U.S. Remote", "USA Remote", "Remote - United States", "US-PA-Remote"]) {
    assert(hasExplicitUsLocation(value), `Expected US location to match: ${value}`);
  }
  for (const value of ["Remote", "Canada", "Europe, Americas", "Boston, MA"]) {
    assert(!hasExplicitUsLocation(value), `Expected ambiguous or non-US location not to match: ${value}`);
  }

  const current = [
    row({ title: "Continuing", url: "https://example.test/continuing" }),
    row({ title: "Added", location: "Remote, United States", url: "https://example.test/added" }),
    row({ title: "Hybrid excluded", arrangement: "Hybrid", url: "https://example.test/hybrid" }),
    row({ title: "Generic remote excluded", location: "Remote", url: "https://example.test/generic" }),
  ];
  const previous = [
    row({ title: "Continuing", url: "https://example.test/continuing" }),
    row({ title: "Removed", location: "USA", url: "https://example.test/removed" }),
  ];
  const comparison = compareRows(current, previous);
  assert(comparison.current.length === 2, "Expected two current filtered jobs.");
  assert(comparison.added.length === 1 && comparison.added[0].Title === "Added", "Expected one added job.");
  assert(comparison.removed.length === 1 && comparison.removed[0].Title === "Removed", "Expected one removed job.");
  assert(comparison.continuing.length === 1, "Expected one continuing job.");
  console.log("US-remote daily report tests: PASS");
}

try {
  main();
} catch (error) {
  console.error(`US-remote daily report tests: FAIL: ${error.message}`);
  process.exitCode = 1;
}
