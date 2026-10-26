const assert = require("assert");
const { evaluateAtsAnomalies } = require("../lib/ats-anomaly");

function rows(total, failed, empty = 0) {
  return Array.from({ length: total }, (_, index) => ({
    Status: index < failed ? "failed" : index < failed + empty ? "empty" : "success",
    HttpStatus: index < failed ? 422 : 200,
    JobCount: index < failed + empty ? 0 : 3,
  }));
}

function main() {
  const alert = evaluateAtsAnomalies("workday", rows(100, 35, 10), rows(500, 50, 50));
  assert.equal(alert.Status, "ALERT");
  assert.ok(alert.Alerts.some((row) => row.Metric === "HTTPFailure"));
  assert.ok(alert.Alerts.some((row) => row.Metric === "ZeroJob"));

  const stable = evaluateAtsAnomalies("icims", rows(100, 12, 10), rows(500, 50, 50));
  assert.equal(stable.Status, "OK");
  assert.equal(stable.Alerts.length, 0);

  const small = evaluateAtsAnomalies("icims", rows(5, 5), rows(10, 0));
  assert.equal(small.Status, "INSUFFICIENT_DATA");
  console.log("ATS anomaly-alert tests passed.");
}

if (require.main === module) main();

module.exports = { main };
