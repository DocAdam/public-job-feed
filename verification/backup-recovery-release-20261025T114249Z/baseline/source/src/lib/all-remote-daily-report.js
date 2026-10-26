const { jobKey } = require("./us-remote-daily-report");
const { sheetUrl, plainDescription } = require("./daily-jobs-review");
const { normalizeCompanyKey } = require("./company-key");
const { normalizeTitle } = require("./job-titles");

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

function remoteSummary(usRows, internationalRows) {
  return {
    us: usRows.length, international: internationalRows.length,
    unique: uniqueRowCount(usRows, internationalRows), overlap: overlapRows(usRows, internationalRows),
  };
}

function postedDate(row) {
  const value = cleanText(row["Posted Date"]);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function newestFirst(rows) {
  return rows.map((row, index) => ({ row, index, date: postedDate(row) }))
    .sort((left, right) => {
      if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date);
      if (left.date !== right.date) return left.date ? -1 : 1;
      return left.index - right.index;
    })
    .map((item) => item.row);
}

function markdownText(value) {
  return cleanText(value).replace(/[\\`*_[\]<>|]/g, "\\$&");
}

function displayCompanyName(row, detail) {
  const fallback = require("./substack-full-report").displayCompanyName({ ...detail, ...row });
  if (fallback !== cleanText(row.Company)) return fallback;
  const sourceKey = normalizeCompanyKey(fallback);
  const description = plainDescription(detail && detail.Description);
  if (!sourceKey || !description) return fallback;

  const candidates = [];
  const patterns = [
    /\b([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4})(?:,\s*(?:Inc\.?|LLC|Ltd\.?|Limited|Corp\.?|Corporation))?\s+(?:is|are|delivers|offers|provides|builds|creates|helps|seeks|has|was)\b/g,
    /\b([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4})['’]s\s+(?:mission|team|platform|products?|services?)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of description.matchAll(pattern)) {
      const words = match[1].split(/\s+/);
      for (let index = 0; index < words.length; index += 1) candidates.push(words.slice(index).join(" "));
    }
  }

  const matches = candidates.map((name, index) => ({ name, index, key: normalizeCompanyKey(name) }))
    .filter(({ key }) => key.length >= 4 && (key === sourceKey || sourceKey.startsWith(key)))
    .sort((left, right) => {
      const leftExact = left.key === sourceKey ? 1 : 0;
      const rightExact = right.key === sourceKey ? 1 : 0;
      return rightExact - leftExact || right.key.length - left.key.length || left.index - right.index;
    });
  return matches[0]?.name || fallback;
}

function substackJob(row, detail, companyName = "") {
  const title = markdownText(row.Title) || "Untitled role";
  const company = markdownText(companyName || displayCompanyName(row, detail));
  const location = markdownText(row.Location);
  const details = [company, location].filter(Boolean).join(" — ");
  return `- [${title}](${cleanText(row["Apply Link"])})${details ? ` — ${details}` : ""}`;
}

function pluralRole(title) {
  if (/writer$/i.test(title)) return title.replace(/writer$/i, "Writers");
  if (/manager$/i.test(title)) return title.replace(/manager$/i, "Managers");
  if (/editor$/i.test(title)) return title.replace(/editor$/i, "Editors");
  return `${title} roles`;
}

function presentationFamily(row) {
  const title = cleanText(row.Title);
  const language = title.match(/^Content Writer\s+-\s+([^-]+?)\s+-\s+Remote$/i);
  if (language) return {
    key: "content-writer-language-remote",
    title: "Remote Content Writers — multiple languages",
    scope: "Multiple countries and languages",
    qualifier: cleanText(language[1]).toLowerCase(),
    kind: "variant",
  };

  const remoteLocation = title.match(/^Remote\s+(.+?)\s+-\s+([^-]+)$/i);
  if (remoteLocation) return {
    key: `remote-location:${normalizeTitle(remoteLocation[1])}`,
    title: `${pluralRole(`Remote ${cleanText(remoteLocation[1])}`)} — multiple locations`,
    scope: "Multiple locations",
    qualifier: cleanText(remoteLocation[2]).toLowerCase(),
    kind: "variant",
  };

  const parentheticalLocation = title.match(/^(.+?)\s+\(([^)]+)\)$/);
  if (parentheticalLocation) return {
    key: `parenthetical-location:${normalizeTitle(parentheticalLocation[1])}`,
    title: `${pluralRole(cleanText(parentheticalLocation[1]))} — multiple locations`,
    scope: "Multiple locations",
    qualifier: cleanText(parentheticalLocation[2]).toLowerCase(),
    kind: "variant",
  };

  return {
    key: `exact:${normalizeTitle(title)}`,
    title: `${pluralRole(title)} — multiple locations`,
    scope: "Multiple locations",
    qualifier: cleanText(row.Location).toLowerCase(),
    kind: "exact",
  };
}

function presentationGroups(rows) {
  const candidates = new Map();
  for (const row of rows) {
    const family = presentationFamily(row);
    const key = `${normalizeCompanyKey(row.Company)}\u0000${family.key}`;
    if (!candidates.has(key)) candidates.set(key, { ...family, rows: [] });
    candidates.get(key).rows.push(row);
  }
  return new Map([...candidates.entries()].filter(([, group]) => group.rows.length > 1
    && new Set(group.rows.map((row) => presentationFamily(row).qualifier)).size > 1));
}

function groupedSubstackJob(group, companyName) {
  return `- [${markdownText(group.title)}](${sheetUrl}) — ${markdownText(companyName)} — ${group.scope}`;
}

function substackJobs(rows, detailsByUrl, companyNames) {
  const sorted = newestFirst(rows);
  const groups = presentationGroups(sorted);
  const renderedGroups = new Set();
  return sorted.flatMap((row) => {
    const family = presentationFamily(row);
    const groupKey = `${normalizeCompanyKey(row.Company)}\u0000${family.key}`;
    const group = groups.get(groupKey);
    const companyName = companyNames.get(normalizeCompanyKey(row.Company)) || cleanText(row.Company);
    if (!group) return [substackJob(row, detailsByUrl.get(jobKey(row)), companyName)];
    if (renderedGroups.has(groupKey)) return [];
    renderedGroups.add(groupKey);
    return [groupedSubstackJob(group, companyName)];
  });
}

function formatWeekDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Substack report needs a valid generated date.");
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(date);
}

function buildSubstackMarkdown({ generatedAt, reportDate = generatedAt, currentSnapshot, previousSnapshot,
  currentRows, previousRows = [], details = [] }) {
  const usComparison = require("./us-remote-daily-report").compareRows(currentRows, previousRows);
  const internationalComparison = require("./international-remote-daily-report").compareRows(currentRows, previousRows);
  const us = usComparison.current;
  const international = internationalComparison.current;
  const added = [...new Map([...usComparison.added, ...internationalComparison.added]
    .map((row) => [jobKey(row), row])).values()];
  const summary = remoteSummary(us, international);
  const detailsByUrl = new Map(details.map((row) => [jobKey({ "Apply Link": row.URL }), row]));
  const companyNames = new Map();
  for (const row of currentRows) {
    const name = displayCompanyName(row, detailsByUrl.get(jobKey(row)));
    if (name !== cleanText(row.Company)) companyNames.set(normalizeCompanyKey(row.Company), name);
  }
  const section = (heading, rows) => [
    `## ${heading}`,
    "",
    ...(rows.length ? substackJobs(rows, detailsByUrl, companyNames) : ["None."]),
    "",
  ];

  return [
    "# Writing and documentation jobs — Remote openings",
    "",
    `Snapshot: ${formatWeekDate(reportDate)}`,
    `Generated: ${generatedAt}`,
    ...(currentSnapshot ? [`Packages: ${currentSnapshot} (current); ${previousSnapshot} (previous).`] : []),
    "",
    `${summary.unique} unique remote jobs · ${summary.us} U.S. remote · ${summary.international} international remote`,
    "",
    `Scope: the saved public list after location grouping and confirmed invalid-link removal. ${summary.overlap.length} jobs appear in both regional lists; the unique total counts each application URL once. Counts describe saved list membership, not confirmed live openings.`,
    "",
    "Remote means the saved work arrangement is Remote. Geographic groups use location markers, including some city names; they do not confirm eligibility for every location in a grouped listing. Remote records without a recognized marker are outside these lists. Grouped bullets link to the public Sheet; totals count jobs before bullet grouping.",
    "",
    `[Open the full active Google Sheet](${sheetUrl})`,
    "",
    `${added.length} unique remote jobs added since the previous package. These are daily list changes, not posting dates or weekly additions.`,
    "",
    ...section("Added since previous package", added),
    ...section("U.S. remote jobs", us),
    ...section("International remote jobs", international),
  ].join("\n");
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

function buildMarkdown({ generatedAt, usReport, internationalReport, review, currentRemote }) {
  validateReports(usReport, internationalReport);
  const summary = currentRemote || remoteSummary(usReport.Current, internationalReport.Current);
  const currentOverlap = summary.overlap;
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
    `- Unique current jobs across both reports: ${summary.unique}`,
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
  const currentRemote = remoteSummary(us.current, international.current);
  const remote = buildMarkdown({ generatedAt: input.generatedAt,
    currentRemote,
    usReport: makeReport(us, "Work Arrangement exactly Remote plus explicit US, U.S., USA, or United States location marker."),
    internationalReport: makeReport(international, "Work Arrangement exactly Remote plus an explicit non-US country, region, or worldwide location marker. Multi-region listings can overlap with the US report."),
  });
  const snapshot = buildSnapshot({ ...input, remoteSummary: currentRemote }).replace(/^(#{1,5}) /gm, '$1# ');
  return '# All Remote Jobs — Daily Comparison\n\n'
    + '[Daily snapshot](#daily-jobs-snapshot) · [Remote comparison](#remote-comparison) · [U.S. remote jobs](#us-remote-jobs) · [International remote jobs](#international-remote-jobs)\n\n'
    + snapshot
    + '\n---\n\n<a id="remote-comparison"></a>\n'
    + remote.replace(/^# All Remote Jobs — Daily Comparison\n/, '');
}

module.exports = {
  buildSubstackMarkdown,
  buildSnapshotWithRemote,
  buildMarkdown,
  displayCompanyName,
  overlapRows,
  previousRows,
  remoteSummary,
  newestFirst,
  uniqueRowCount,
  validateReports,
};
