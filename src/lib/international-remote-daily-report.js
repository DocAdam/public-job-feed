const {
  jobKey,
  readJobCsv,
  resolveSnapshots,
} = require("./us-remote-daily-report");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// These markers must identify eligibility outside the United States. Generic
// values such as "Remote" are deliberately not enough for this report.
const internationalLocationMarkers = [
  "worldwide", "global", "international", "emea", "europe", "european union",
  "latin america", "latam", "apac", "asia pacific", "africa", "middle east",
  "canada", "can", "united kingdom", "uk", "ireland", "mexico", "argentina", "brazil",
  "chile", "colombia", "costa rica", "uruguay", "south africa", "nigeria",
  "ethiopia", "burundi", "senegal", "somalia", "india", "pakistan", "nepal",
  "philippines", "singapore", "japan", "south korea", "hong kong", "taiwan",
  "malaysia", "vietnam", "australia", "new zealand", "israel", "egypt",
  "turkey", "ukraine", "albania", "armenia", "austria", "azerbaijan",
  "belgium", "bosnia and herzegovina", "bulgaria", "croatia", "cyprus",
  "czech republic", "denmark", "estonia", "finland", "france", "germany",
  "greece", "iceland", "italy", "kazakhstan", "latvia", "lithuania",
  "luxembourg", "malta", "moldova", "netherlands", "north macedonia", "norway",
  "poland", "portugal", "romania", "serbia", "slovakia", "slovenia", "spain",
  "sweden", "switzerland",
  // Common non-US locations that appear without a country in source data.
  "amsterdam", "bucharest", "copenhagen", "edinburgh", "halifax", "kyiv",
  "london", "montreal", "munich", "new delhi", "ottawa", "stavanger", "toronto",
  "alberta", "british columbia", "nova scotia", "ontario", "quebec",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const internationalLocationPattern = new RegExp(
  `(?:^|[^a-z])(?:${internationalLocationMarkers
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join("|")})(?=$|[^a-z])`,
  "i"
);

function hasExplicitInternationalLocation(value) {
  return internationalLocationPattern.test(cleanText(value));
}

function isConfirmedInternationalRemote(row) {
  return cleanText(row["Work Arrangement"]).toLowerCase() === "remote"
    && hasExplicitInternationalLocation(row.Location);
}

function filterConfirmedInternationalRemote(rows) {
  return rows.filter(isConfirmedInternationalRemote);
}

function compareRows(currentRows, previousRows) {
  const current = filterConfirmedInternationalRemote(currentRows);
  const previous = filterConfirmedInternationalRemote(previousRows);
  const currentByKey = new Map(current.map((row) => [jobKey(row), row]));
  const previousByKey = new Map(previous.map((row) => [jobKey(row), row]));
  const added = current.filter((row) => !previousByKey.has(jobKey(row)));
  const removed = previous.filter((row) => !currentByKey.has(jobKey(row)));
  const continuing = current.filter((row) => previousByKey.has(jobKey(row)));

  return { current, previous, added, removed, continuing };
}

function markdownLink(row) {
  const title = cleanText(row.Title) || "Untitled role";
  const company = cleanText(row.Company);
  const location = cleanText(row.Location);
  const label = [title, company].filter(Boolean).join(" — ").replace(/[\[\]]/g, "");
  const url = cleanText(row["Apply Link"]);
  return `- [${label}](${url})${location ? ` — ${location}` : ""}`;
}

function buildMarkdown({ generatedAt, currentSnapshot, previousSnapshot, comparison, currentPath, previousPath }) {
  const section = (heading, rows, emptyText) => [
    `## ${heading}`,
    "",
    ...(rows.length ? rows.map(markdownLink) : [emptyText]),
    "",
  ];
  return [
    "# Explicit International Remote Jobs — Daily Comparison",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Current package: \`${currentSnapshot}\``,
    `Previous package: \`${previousSnapshot}\``,
    `Source CSVs: \`${currentPath}\` and \`${previousPath}\``,
    "",
    "## Filter",
    "",
    "Includes only rows with `Work Arrangement` exactly `Remote` and an explicit non-US country, region, or worldwide marker. A multi-region listing can also appear in the US report. Generic remote locations and US-only locations are excluded.",
    "",
    "## Summary",
    "",
    `- Current explicit international-remote jobs: ${comparison.current.length}`,
    `- Added since previous package: ${comparison.added.length}`,
    `- Removed since previous package: ${comparison.removed.length}`,
    `- Continuing: ${comparison.continuing.length}`,
    `- Net change: ${comparison.current.length - comparison.previous.length >= 0 ? "+" : ""}${comparison.current.length - comparison.previous.length}`,
    "",
    ...section("Added", comparison.added, "None."),
    ...section("Removed", comparison.removed, "None."),
    ...section("Current jobs", comparison.current, "None."),
  ].join("\n");
}

module.exports = {
  buildMarkdown,
  compareRows,
  filterConfirmedInternationalRemote,
  hasExplicitInternationalLocation,
  readJobCsv,
  resolveSnapshots,
};
