const { jobKey } = require("./us-remote-daily-report");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateReports(usReport, internationalReport) {
  for (const [label, report] of [["US", usReport], ["international", internationalReport]]) {
    if (!report || !report.Counts || !Array.isArray(report.Added)
      || !Array.isArray(report.Removed) || !Array.isArray(report.Current)) {
      throw new Error(`${label} remote report does not have the expected structure.`);
    }
  }

  if (usReport.CurrentSnapshot !== internationalReport.CurrentSnapshot
    || usReport.PreviousSnapshot !== internationalReport.PreviousSnapshot) {
    throw new Error("The US and international reports must use the same current and previous snapshots.");
  }
}

function overlapRows(usRows, internationalRows) {
  const internationalKeys = new Set(internationalRows.map(jobKey));
  return usRows.filter((row) => internationalKeys.has(jobKey(row)));
}

function uniqueRowCount(leftRows, rightRows) {
  return new Set([...leftRows, ...rightRows].map(jobKey)).size;
}

function previousRows(report) {
  const addedKeys = new Set(report.Added.map(jobKey));
  return [
    ...report.Current.filter((row) => !addedKeys.has(jobKey(row))),
    ...report.Removed,
  ];
}

function markdownLink(row) {
  const title = cleanText(row.Title) || "Untitled role";
  const company = cleanText(row.Company);
  const location = cleanText(row.Location);
  const label = [title, company].filter(Boolean).join(" — ").replace(/[\[\]]/g, "");
  const url = cleanText(row["Apply Link"]);
  return `- [${label}](${url})${location ? ` — ${location}` : ""}`;
}

function jobSection(heading, rows) {
  return [
    `### ${heading}`,
    "",
    ...(rows.length ? rows.map(markdownLink) : ["None."]),
    "",
  ];
}

function reportSection(heading, report) {
  const netChange = report.Counts.Current - report.Counts.Previous;
  return [
    `## ${heading}`,
    "",
    "### Filter",
    "",
    report.Filter,
    "",
    "### Summary",
    "",
    `- Current jobs: ${report.Counts.Current}`,
    `- Added since previous package: ${report.Counts.Added}`,
    `- Removed since previous package: ${report.Counts.Removed}`,
    `- Continuing: ${report.Counts.Continuing}`,
    `- Net change: ${netChange >= 0 ? "+" : ""}${netChange}`,
    "",
    ...jobSection("Added", report.Added),
    ...jobSection("Removed", report.Removed),
    ...jobSection("Current jobs", report.Current),
  ];
}

function buildMarkdown({ generatedAt, usReport, internationalReport, review }) {
  validateReports(usReport, internationalReport);
  const currentOverlap = overlapRows(usReport.Current, internationalReport.Current);
  const usPrevious = previousRows(usReport);
  const internationalPrevious = previousRows(internationalReport);

  const remoteMarkdown = [
    "# All Remote Jobs — Daily Comparison",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Current package: \`${usReport.CurrentSnapshot}\``,
    `Previous package: \`${usReport.PreviousSnapshot}\``,
    `US source report generated: ${usReport.GeneratedAt}`,
    `International source report generated: ${internationalReport.GeneratedAt}`,
    "",
    "## At a glance",
    "",
    "| Report | Current | Previous | Added | Removed | Continuing |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    `| US remote | ${usReport.Counts.Current} | ${usReport.Counts.Previous} | ${usReport.Counts.Added} | ${usReport.Counts.Removed} | ${usReport.Counts.Continuing} |`,
    `| International remote | ${internationalReport.Counts.Current} | ${internationalReport.Counts.Previous} | ${internationalReport.Counts.Added} | ${internationalReport.Counts.Removed} | ${internationalReport.Counts.Continuing} |`,
    "",
    `- Unique current jobs across both reports: ${uniqueRowCount(usReport.Current, internationalReport.Current)}`,
    `- Unique previous jobs across both reports: ${uniqueRowCount(usPrevious, internationalPrevious)}`,
    `- Current jobs in both reports: ${currentOverlap.length}`,
    "",
    "A multi-region job can appear in both report sections. The unique totals count each application URL once.",
    "",
    ...jobSection("Current jobs in both reports", currentOverlap),
    ...reportSection("US Remote Jobs", usReport),
    ...reportSection("International Remote Jobs", internationalReport),
  ].join("\n");
  if (!review) return remoteMarkdown;
  const { buildDailyReview } = require("./daily-jobs-review");
  return buildDailyReview({ ...review, generatedAt,
    currentSnapshot: usReport.CurrentSnapshot, previousSnapshot: usReport.PreviousSnapshot })
    + '\n<a id="remote-comparison"></a>\n## Remote comparison\n\n'
    + remoteMarkdown.replace(/^# (.*)$/m, '### $1').replace(/^## (.*)$/gm, '### $1');
}

// Build both remote sections from the same saved rows as the opening snapshot.
function buildSnapshotWithRemote(input) {
  const { buildSnapshot } = require("./jobs-snapshot");
  const makeReport = (comparison, filter) => ({
    GeneratedAt: input.generatedAt,
    CurrentSnapshot: input.currentSnapshot,
    PreviousSnapshot: input.previousSnapshot,
    Filter: filter,
    Counts: {
      Current: comparison.current.length, Previous: comparison.previous.length,
      Added: comparison.added.length, Removed: comparison.removed.length,
      Continuing: comparison.continuing.length,
    },
    Added: comparison.added, Removed: comparison.removed, Current: comparison.current,
  });
  const us = require("./us-remote-daily-report").compareRows(input.currentRows, input.previousRows);
  const international = require("./international-remote-daily-report").compareRows(input.currentRows, input.previousRows);
  const remote = buildMarkdown({ generatedAt: input.generatedAt,
    usReport: makeReport(us, "Work Arrangement exactly Remote plus explicit US, U.S., USA, or United States location marker."),
    internationalReport: makeReport(international, "Work Arrangement exactly Remote plus an explicit non-US country, region, or worldwide location marker. Multi-region listings can overlap with the US report."),
  });
  const snapshot = buildSnapshot(input).replace(/^(#{1,5}) /gm, '$1# ');
  return '# All Remote Jobs — Daily Comparison\n\n'
    + '[Daily snapshot](#daily-jobs-snapshot) · [Remote comparison](#remote-comparison) · [U.S. remote jobs](#us-remote-jobs) · [International remote jobs](#international-remote-jobs)\n\n'
    + snapshot
    + '\n---\n\n<a id="remote-comparison"></a>\n'
    + remote.replace(/^# All Remote Jobs — Daily Comparison\n/, '');
}

module.exports = {
  buildSnapshotWithRemote,
  buildMarkdown,
  overlapRows,
  previousRows,
  uniqueRowCount,
  validateReports,
};
