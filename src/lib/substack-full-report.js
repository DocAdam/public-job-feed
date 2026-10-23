const { normalizeCompanyKey } = require("./company-key");
const { locate, plainDescription, sheetUrl } = require("./daily-jobs-review");
const { jobKey } = require("./us-remote-daily-report");
const { normalizeTitle } = require("./job-titles");
const { hasExplicitInternationalLocation } = require("./international-remote-daily-report");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function markdownText(value) {
  return cleanText(value).replace(/[\\`*_[\]<>|]/g, "\\$&");
}

function applicationUrl(row) {
  return cleanText(row.URL || row["Apply Link"] || row.ApplyURL || row.RawJobURL);
}

function canonicalJobKey(row) {
  const sourceKey = cleanText(row.JobKey);
  const url = applicationUrl(row).toLowerCase().replace(/\/+$/, "");
  if (sourceKey && url) return `${sourceKey}\u0000${url}`;
  return sourceKey || jobKey({
    Company: row.Company,
    Title: row.Title,
    Location: row.Location,
    "Apply Link": applicationUrl(row),
  });
}

function postedTime(row) {
  const value = cleanText(row.DatePosted || row["Posted Date"]);
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function newestFirst(rows) {
  return rows.map((row, index) => ({ row, index, time: postedTime(row) }))
    .sort((left, right) => right.time - left.time || left.index - right.index)
    .map(({ row }) => row);
}

function companyCandidate(description) {
  const text = plainDescription(description);
  const patterns = [
    /^([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4}),\s+(?:the\s+[^,]{2,60},\s+)?(?:is|are|enables|builds|creates|delivers|offers|provides|helps|develops)\b/,
    /^([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4})\s+(?:is|are|enables|builds|creates|delivers|offers|provides|helps|develops)\b/,
    /^At\s+([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4}),/,
    /\bAbout\s+([A-Z][A-Za-z0-9&.'’+-]*(?:\s+[A-Z][A-Za-z0-9&.'’+-]*){0,4})(?:\s|:|—|-)/,
    /\b([A-Z][A-Z0-9&.'’+-]{2,})\s+(?:is|are)\s+(?:seeking|looking|building|hiring|a\b|an\b)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const words = cleanText(match[1]).split(" ").filter(Boolean);
      if (/^we$/i.test(words.at(-1))) words.pop();
      return words.filter((word, index) => !index || word.toLowerCase() !== words[index - 1].toLowerCase()).join(" ");
    }
  }
  return "";
}

function displayCompanyName(row) {
  const fallback = cleanText(row.PreferredCompanyName || row.Company);
  const candidate = companyCandidate(row.Description);
  if (!candidate) return fallback;
  const fallbackKey = normalizeCompanyKey(fallback);
  const candidateKey = normalizeCompanyKey(candidate);
  const sourceLike = /(?:referrals?|useonly|jobboard|careers?|hiring)/.test(fallbackKey);
  if (sourceLike || fallbackKey === candidateKey || fallbackKey.startsWith(candidateKey)) {
    return candidate;
  }
  return fallback;
}

function locationRegions(row) {
  const places = locate(row.Location);
  const us = places.some((place) => place.code === "US");
  const international = hasExplicitInternationalLocation(row.Location) || places.some((place) => (
    (place.code && place.code !== "US")
    || ["Worldwide", "Europe", "Multiple regions", "Asia and Oceania", "Africa and Middle East"].includes(place.region)
  ));
  const regions = [];
  if (us) regions.push("us");
  if (international) regions.push("international");
  if (!regions.length) regions.push("unresolved");
  return regions;
}

function presentationFamily(row) {
  const title = cleanText(row.Title);
  const language = title.match(/^Content Writer\s+-\s+(.+?)\s+-\s+Remote$/i);
  if (language) return {
    key: "content-writer-language-remote",
    title: "Remote Content Writers — multiple languages",
    scope: "Multiple countries and languages",
    qualifier: language[1].toLowerCase(),
  };
  const parenthetical = title.match(/^(.+?)\s+\(([^)]+)\)$/);
  if (parenthetical) return {
    key: `parenthetical:${normalizeTitle(parenthetical[1])}`,
    title: `${cleanText(parenthetical[1])} — multiple locations`,
    scope: "Multiple locations",
    qualifier: parenthetical[2].toLowerCase(),
  };
  return {
    key: `exact:${normalizeTitle(title)}`,
    title: `${title} — multiple locations`,
    scope: "Multiple locations",
    qualifier: cleanText(row.Location).toLowerCase(),
  };
}

function presentationGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const family = presentationFamily(row);
    const key = `${normalizeCompanyKey(displayCompanyName(row))}\u0000${family.key}`;
    if (!groups.has(key)) groups.set(key, { ...family, rows: [] });
    groups.get(key).rows.push(row);
  }
  return new Map([...groups].filter(([, group]) => group.rows.length > 1
    && new Set(group.rows.map((row) => presentationFamily(row).qualifier)).size > 1));
}

function renderJob(row) {
  const title = markdownText(row.Title) || "Untitled role";
  const company = markdownText(displayCompanyName(row)) || "Employer not specified";
  const location = markdownText(row.Location) || "Location not specified";
  return `- [${title}](${applicationUrl(row)}) — ${company} — ${location}`;
}

function renderJobs(rows) {
  const sorted = newestFirst(rows);
  const groups = presentationGroups(sorted);
  const rendered = new Set();
  return sorted.flatMap((row) => {
    const family = presentationFamily(row);
    const key = `${normalizeCompanyKey(displayCompanyName(row))}\u0000${family.key}`;
    const group = groups.get(key);
    if (!group) return [renderJob(row)];
    if (rendered.has(key)) return [];
    rendered.add(key);
    const representative = newestFirst(group.rows)[0];
    const otherLinks = group.rows.filter((item) => item !== representative)
      .map((item, index) => `[Apply ${index + 2}](${applicationUrl(item)})`).join(" · ");
    return [`- [${markdownText(group.title)}](${applicationUrl(representative)}) — ${markdownText(displayCompanyName(representative))} — ${group.scope} (${group.rows.length} records) · ${otherLinks}`];
  });
}

function formatWeekDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("The report needs a valid generated date.");
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(date);
}

function arrangementRows(rows, arrangement) {
  return rows.filter((row) => cleanText(row.RemoteStatus || row["Work Arrangement"]).toLowerCase() === arrangement);
}

function arrangementSection(label, rows, heading = `${label} jobs`) {
  if (!rows.length) return [];
  const sections = [];
  const regionLabels = [
    ["us", `U.S. ${label.toLowerCase()}`],
    ["international", `International ${label.toLowerCase()}`],
    ["unresolved", `${label} — location not resolved`],
  ];
  sections.push(`## ${heading}`, "");
  for (const [region, heading] of regionLabels) {
    const subset = rows.filter((row) => locationRegions(row).includes(region));
    if (subset.length) sections.push(`### ${heading}`, "", ...renderJobs(subset), "");
  }
  return sections;
}

function buildSubstackFullReport({ generatedAt, reportDate = generatedAt, currentSnapshot, previousSnapshot,
  sourceGeneratedAt, currentRows, previousRows = [] }) {
  const previousKeys = new Set(previousRows.map(canonicalJobKey));
  const newRows = currentRows.filter((row) => !previousKeys.has(canonicalJobKey(row)));
  const currentKeys = new Set(currentRows.map(canonicalJobKey));
  const removed = previousRows.filter((row) => !currentKeys.has(canonicalJobKey(row)));
  const remote = arrangementRows(currentRows, "remote");
  const hybrid = arrangementRows(currentRows, "hybrid");
  const onsite = arrangementRows(currentRows, "onsite");
  const unknown = currentRows.filter((row) => !["remote", "hybrid", "onsite"].includes(
    cleanText(row.RemoteStatus || row["Work Arrangement"]).toLowerCase()
  ));
  const out = [
    "# Writing and documentation jobs",
    "",
    `Snapshot: ${formatWeekDate(reportDate)}`,
    `Generated: ${generatedAt}`,
    ...(currentSnapshot ? [`Packages: ${currentSnapshot} (current); ${previousSnapshot || "not available"} (previous).`] : []),
    ...(sourceGeneratedAt ? [`Canonical feed generated: ${sourceGeneratedAt}`] : []),
    "",
    `${currentRows.length} current jobs · ${remote.length} remote · ${hybrid.length} hybrid · ${onsite.length} onsite · ${unknown.length} unknown`,
    "",
    "Scope: selected source records before public-list location grouping and link removal. This is not the complete collected feed. Current means included in this saved selection; it does not confirm that a job is open.",
    "",
    "Location groups use source labels and existing city/state mappings. They do not confirm eligibility. A job can appear in both geographic sections. Grouped bullets retain each application link; totals count source records.",
    "",
    `[Open the public Google Sheet (grouped and checked list)](${sheetUrl})`,
    "",
  ];
  if (previousSnapshot || previousRows.length) out.push(
    `${newRows.length} added · ${removed.length} removed · ${currentRows.length - newRows.length} continuing since the previous package.`,
    "Added and removed mean changes in list membership, not posting or closure dates. These are daily changes.", "",
    "## Added since previous package", "", ...(newRows.length ? renderJobs(newRows) : ["None."]), ""
  );
  else out.push("Previous selection not available; changes were not calculated.", "");
  out.push(...arrangementSection("Remote", remote));
  out.push(...arrangementSection("Hybrid", hybrid));
  out.push(...arrangementSection("Onsite", onsite));
  if (unknown.length) out.push(...arrangementSection(
    "Work arrangement not specified", unknown, "Work arrangement not specified"
  ));
  return `${out.join("\n").trimEnd()}\n`;
}

module.exports = {
  applicationUrl,
  buildSubstackFullReport,
  canonicalJobKey,
  displayCompanyName,
  locationRegions,
  newestFirst,
  renderJobs,
};
