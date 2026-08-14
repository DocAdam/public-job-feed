const metrics = [
  ["HTTPFailure", (row) => String(row.Status).toLowerCase() === "failed" && Number(row.HttpStatus) >= 400],
  ["Empty", (row) => String(row.Status).toLowerCase() === "empty"],
  ["ZeroJob", (row) => !["skipped"].includes(String(row.Status).toLowerCase()) && Number(row.JobCount) === 0],
];

function rate(count, attempts) {
  return attempts ? Number(((count / attempts) * 100).toFixed(2)) : 0;
}

function summarizeAttempts(rows) {
  const terminal = rows.filter((row) => ["success", "empty", "failed"].includes(String(row.Status || "").toLowerCase()));
  const summary = { Attempts: terminal.length };
  for (const [name, predicate] of metrics) {
    const count = terminal.filter(predicate).length;
    summary[`${name}Count`] = count;
    summary[`${name}Rate`] = rate(count, terminal.length);
  }
  return summary;
}

function evaluateAtsAnomalies(ats, recentRows, baselineRows, options = {}) {
  const minimumRecent = Number(options.minimumRecent) || 20;
  const minimumBaseline = Number(options.minimumBaseline) || 50;
  const minimumPointIncrease = Number(options.minimumPointIncrease) || 10;
  const minimumRatio = Number(options.minimumRatio) || 1.5;
  const recent = summarizeAttempts(recentRows);
  const baseline = summarizeAttempts(baselineRows);
  const alerts = [];

  if (recent.Attempts >= minimumRecent && baseline.Attempts >= minimumBaseline) {
    for (const [name] of metrics) {
      const currentRate = recent[`${name}Rate`];
      const baselineRate = baseline[`${name}Rate`];
      const pointIncrease = Number((currentRate - baselineRate).toFixed(2));
      const ratio = baselineRate > 0 ? Number((currentRate / baselineRate).toFixed(2)) : currentRate > 0 ? null : 1;
      const ratioExceeded = baselineRate === 0 ? currentRate >= minimumPointIncrease : ratio >= minimumRatio;
      if (pointIncrease >= minimumPointIncrease && ratioExceeded) {
        alerts.push({
          Metric: name,
          Severity: pointIncrease >= 20 && (ratio === null || ratio >= 2) ? "HIGH" : "WARN",
          RecentRate: currentRate,
          BaselineRate: baselineRate,
          PointIncrease: pointIncrease,
          Ratio: ratio,
        });
      }
    }
  }

  return {
    ATS: ats,
    Status: recent.Attempts < minimumRecent || baseline.Attempts < minimumBaseline ? "INSUFFICIENT_DATA" : alerts.length ? "ALERT" : "OK",
    Recent: recent,
    Baseline: baseline,
    Alerts: alerts,
  };
}

module.exports = { evaluateAtsAnomalies, summarizeAttempts };
