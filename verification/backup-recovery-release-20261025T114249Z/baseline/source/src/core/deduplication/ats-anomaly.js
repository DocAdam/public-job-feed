/**
 * Core ATS anomaly detection engine
 *
 * Evaluates fetch attempts against baselines to detect anomalous behavior
 * in job data ingestion pipelines.
 */

const ANOMALY_METRICS = {
  FAILED_RATE: "failed_rate",
  TOTAL_ATTEMPTS: "total_attempts",
  JOB_COUNT_DELTA: "job_count_delta",
  AVG_JOB_RECORDS: "avg_job_records",
};

const ALERT_TYPES = [
  "HIGH_FAILED_RATE",
  "DECREASED_JOB_COUNT",
  "ZERO_RESULTING_JOBS",
];

const defaultThresholds = {
  failedRate: { high: 0.25, medium: 0.10 },
  jobCountDelta: -0.05,
  zeroResultingJobs: false,
};

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function safeInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
}

function getMetricType(row) {
  const normalizedStatus = cleanText(row?.FetchResult || row?.status).toUpperCase();

  if (normalizedStatus.includes("FAILED")) {
    return ANOMALY_METRICS.FAILED_RATE;
  }

  if (safeInt(row?.JobRecords) > 0) {
    return ANOMALY_METRICS.AVG_JOB_RECORDS;
  }

  return null;
}

function evaluateMetricType(metricTypes, recentJobs, baselineJobs) {
  if (metricTypes.has(ANOMALY_METRICS.FAILED_RATE)) {
    return ANOMALY_METRICS.FAILED_RATE;
  }

  const hasRecentJobData = recentJobs.some((row) => safeInt(row.JobRecords) > 0);
  const hasBaselineJobData = baselineJobs.some((row) => safeInt(row.JobRecords) > 0);

  if (hasRecentJobData || hasBaselineJobData) {
    return ANOMALY_METRICS.AVG_JOB_RECORDS;
  }

  if (recentJobs.length > 0 || baselineJobs.length > 0) {
    return ANOMALY_METRICS.TOTAL_ATTEMPTS;
  }

  return null;
}

function computeFailedRate(rows) {
  if (!rows || rows.length === 0) return { rate: 0, total: 0 };

  const failedCount = rows.filter((row) => {
    const status = cleanText(row?.FetchResult || row?.status);
    return status.toUpperCase().includes("FAILED");
  }).length;

  return {
    rate: failedCount / rows.length,
    total: rows.length,
  };
}

function computeAvgJobRecords(rows) {
  if (!rows || rows.length === 0) return 0;

  const totalJobs = rows.reduce((sum, row) => sum + safeInt(row.JobRecords), 0);
  return totalJobs / rows.length;
}

function detectAnomalies(ats, recentRows, baselineRows, options = {}) {
  if (!Array.isArray(recentRows) || recentRows.length === 0) {
    return null;
  }

  const config = {
    ...defaultThresholds,
    ...(options.thresholds || {}),
  };

  const metricTypes = new Set();
  for (const row of recentRows) {
    const metricType = getMetricType(row);
    if (metricType) metricTypes.add(metricType);
  }

  if (baselineRows && baselineRows.length > 0) {
    for (const row of baselineRows) {
      const metricType = getMetricType(row);
      if (metricType) metricTypes.add(metricType);
    }
  }

  const selectedMetricType = evaluateMetricType(metricTypes, recentRows, baselineRows);

  if (!selectedMetricType) return null;

  const recentFailedRate = computeFailedRate(recentRows);
  const baselineFailedRate = computeFailedRate(baselineRows || []);
  const recentAvgJobRecords = computeAvgJobRecords(recentRows);
  const baselineAvgJobRecords = computeAvgJobRecords(baselineRows || []);

  const alerts = [];
  let status = "NORMAL";

  // Check failed rate anomalies
  if (recentFailedRate.rate > config.failedRate.high) {
    alerts.push({
      type: "HIGH_FAILED_RATE",
      severity: "high",
      message: `High ATS ${ats} fetch failure rate (${Math.round(recentFailedRate.rate * 100)}%)`,
    });
    status = "CRITICAL";
  } else if (recentFailedRate.rate > config.failedRate.medium) {
    alerts.push({
      type: "HIGH_FAILED_RATE",
      severity: "medium",
      message: `Elevated ATS ${ats} fetch failure rate (${Math.round(recentFailedRate.rate * 100)}%)`,
    });
    if (status !== "CRITICAL") status = "DEGRADED";
  }

  // Check job count anomalies when baseline exists
  if (baselineRows && baselineRows.length > 0) {
    const delta = recentAvgJobRecords - baselineAvgJobRecords;
    const relativeDelta = baselineAvgJobRecords !== 0 ? delta / baselineAvgJobRecords : 0;

    if (config.jobCountDelta !== undefined && relativeDelta < config.jobCountDelta) {
      alerts.push({
        type: "DECREASED_JOB_COUNT",
        severity: Math.abs(relativeDelta) > 0.3 ? "high" : "medium",
        message: `Decreased job count for ${ats} (${Math.round(delta)} jobs, ${Math.round(relativeDelta * 100)}%)`,
      });
      if (status === "NORMAL") status = "DEGRADED";
    }

    if (config.zeroResultingJobs && recentAvgJobRecords === 0) {
      alerts.push({
        type: "ZERO_RESULTING_JOBS",
        severity: "high",
        message: `No resulting jobs for ${ats}`,
      });
      status = "CRITICAL";
    }
  }

  return {
    ats,
    metricType: selectedMetricType,
    recentStats: {
      totalAttempts: recentRows.length,
      failedRate: Math.round(recentFailedRate.rate * 100),
      avgJobRecords: Math.round(recentAvgJobRecords * 10) / 10,
    },
    baselineStats: baselineRows ? {
      totalAttempts: baselineRows.length,
      failedRate: Math.round(baselineFailedRate.rate * 100),
      avgJobRecords: Math.round(baselineAvgJobRecords * 10) / 10,
    } : null,
    alerts,
    status,
  };
}

function evaluateAtsAnomalies(ats, recentRows, baselineRows, options = {}) {
  const evaluation = detectAnomalies(ats, recentRows, baselineRows, options);

  if (!evaluation) return null;

  return {
    ...evaluation,
    requiresAction: evaluation.alerts.length > 0,
    priority: evaluation.alerts.some((a) => a.severity === "high") ? "HIGH" : "MEDIUM",
  };
}

module.exports = {
  ANOMALY_METRICS,
  ALERT_TYPES,
  computeAvgJobRecords,
  computeFailedRate,
  detectAnomalies,
  evaluateAtsAnomalies,
};
