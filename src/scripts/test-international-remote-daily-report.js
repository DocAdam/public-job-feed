const {
  compareRows,
  hasExplicitInternationalLocation,
} = require("../lib/international-remote-daily-report");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function row({ title = "Role", location = "Canada", arrangement = "Remote", url = "https://example.test/job" } = {}) {
  return {
    Title: title,
    Company: "Example",
    Location: location,
    "Work Arrangement": arrangement,
    "Apply Link": url,
  };
}

function main() {
  for (const value of [
    "Canada",
    "Remote - CAN",
    "Home based - EMEA",
    "Worldwide",
    "Multiple locations: US; Canada",
    "USA | Chile | UK | Europe",
    "London, United Kingdom",
  ]) {
    assert(hasExplicitInternationalLocation(value), `Expected international location to match: ${value}`);
  }
  for (const value of ["Remote", "US", "U.S. Remote", "United States", "Boston, MA", ""]) {
    assert(!hasExplicitInternationalLocation(value), `Expected generic or US-only location not to match: ${value}`);
  }

  const current = [
    row({ title: "Continuing", location: "Remote - Canada", url: "https://example.test/continuing" }),
    row({ title: "Added overlap", location: "US / Canada", url: "https://example.test/added" }),
    row({ title: "Hybrid excluded", location: "UK", arrangement: "Hybrid", url: "https://example.test/hybrid" }),
    row({ title: "Generic remote excluded", location: "Remote", url: "https://example.test/generic" }),
  ];
  const previous = [
    row({ title: "Continuing", location: "Remote - Canada", url: "https://example.test/continuing" }),
    row({ title: "Removed", location: "Europe", url: "https://example.test/removed" }),
  ];
  const comparison = compareRows(current, previous);
  assert(comparison.current.length === 2, "Expected two current filtered jobs.");
  assert(comparison.added.length === 1 && comparison.added[0].Title === "Added overlap", "Expected one added job.");
  assert(comparison.removed.length === 1 && comparison.removed[0].Title === "Removed", "Expected one removed job.");
  assert(comparison.continuing.length === 1, "Expected one continuing job.");
  console.log("International-remote daily report tests: PASS");
}

try {
  main();
} catch (error) {
  console.error(`International-remote daily report tests: FAIL: ${error.message}`);
  process.exitCode = 1;
}
