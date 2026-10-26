const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

// Read-only preview of a cleaner human-facing listing view. It never edits a
// package CSV, alters dedupe fields, or makes a publication decision.
const defaultInput = fromRoot("data", "jobs", "gsheet-package", "latest", "01_good_documentation_jobs.csv");
const outputDir = fromRoot("data", "jobs", "reports", "listing-consolidation");
const latestPackageDir = fromRoot("data", "jobs", "gsheet-package", "latest");

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function joinValues(rows, field) {
  return unique(rows.map((row) => row[field])).join(" | ");
}

function parseOptions(argv) {
  const options = { input: defaultInput };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--input") throw new Error(`Unknown option: ${argv[index]}`);
    const value = argv[index + 1];
    if (!value) throw new Error("--input requires a CSV path.");
    options.input = path.resolve(fromRoot(), value);
    index += 1;
  }
  return options;
}

// This is the current D-style hygiene filter used in the title-definition
// simulation. It removes only clear title-level noise; generic content roles
// remain until a separate review rule is agreed.
function isClearTitleNoise(title) {
  return /\b(technical recruiter|clinical documentation|medical documentation|risk adjustment|hcc documentation|loan documentation|mortgage loan|legal document|document specialist|controlled substance|ocean freight|technical developer|software developer|developer productivity|developer experience|information security|security architect|content marketing|technical content marketing|seo|social media|content licensing|content partnerships|content creator|developer events|developer platform partnership|technical product marketing)\b/i.test(title);
}

function consolidationKey(row) {
  return `${normalize(row.Company)}\u0000${normalize(row.Title)}`;
}

function selectRepresentative(rows) {
  return [...rows].sort((left, right) => Number(right["Writer Fit Score"] || 0) - Number(left["Writer Fit Score"] || 0)
    || clean(left.Location).localeCompare(clean(right.Location))
    || clean(left["Apply Link"]).localeCompare(clean(right["Apply Link"])))[0];
}

function workArrangementForGroup(rows) {
  const arrangements = new Set(rows.map((row) => normalize(row["Work Arrangement"])));
  // Retain remote discoverability for the existing remote_jobs_pivot. A group
  // with any remote variant is a valid remote opportunity, and the combined
  // Location field makes the multi-location nature visible.
  if (arrangements.has("remote")) return "Remote";
  if (arrangements.has("hybrid")) return "Hybrid";
  if (arrangements.has("onsite")) return "Onsite";
  return clean(rows[0]["Work Arrangement"]);
}

function representativeForGroup(rows) {
  const preferredRows = rows.filter((row) => normalize(row["Work Arrangement"]) === workArrangementForGroup(rows).toLowerCase());
  return selectRepresentative(preferredRows.length ? preferredRows : rows);
}

function groupedLocationSummary(rows) {
  const locations = unique(rows.map((row) => row.Location)).sort((left, right) => left.localeCompare(right));
  return `Multiple locations (${rows.length} postings): ${locations.join("; ")}`;
}

function earliestDate(rows, field) {
  return rows.map((row) => clean(row[field])).filter(Boolean).sort()[0] || "";
}

function largestNumber(rows, field) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  return values.length ? String(Math.max(...values)) : "";
}

function newestLastChecked(rows) {
  return rows.map((row) => clean(row["Last Checked"])).filter(Boolean).sort().at(-1) || "";
}

// This signal deliberately does not merge rows. It finds a common sourcing
// pattern such as "Content Writer - Amharic - Remote" for one company, where
// the middle qualifier may be a real job requirement rather than a location.
function titleFamilyKey(row) {
  const match = clean(row.Title).match(/^(.+?)\s+-\s+[^-]+\s+-\s+(remote)$/i);
  if (!match) return "";
  return `${normalize(row.Company)}\u0000${normalize(match[1])} - ${normalize(match[2])}`;
}

function buildPreview(rows) {
  const baseline = rows.filter((row) => !isClearTitleNoise(row.Title));
  const groups = new Map();
  for (const row of baseline) {
    const key = consolidationKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const multiLocationGroups = [...groups.values()]
    .filter((group) => group.length > 1 && unique(group.map((row) => row.Location)).length > 1)
    .sort((left, right) => right.length - left.length || clean(left[0].Company).localeCompare(clean(right[0].Company)));

  const consolidatedRows = [...groups.values()].map((group) => {
    const representative = representativeForGroup(group);
    return {
      Title: representative.Title,
      Company: representative.Company,
      "Listing Count": group.length,
      "Locations (all variants)": joinValues(group, "Location"),
      "Work Arrangements (all variants)": joinValues(group, "Work Arrangement"),
      "Apply Links (all variants)": joinValues(group, "Apply Link"),
      "Best Writer Fit Score": representative["Writer Fit Score"],
      "Fit Tiers (all variants)": joinValues(group, "Fit Tier"),
      Source: joinValues(group, "Source"),
      "Consolidation Status": group.length > 1 && unique(group.map((row) => row.Location)).length > 1
        ? "EXACT_TITLE_MULTI_LOCATION"
        : "UNCHANGED",
    };
  }).sort((left, right) => Number(right["Best Writer Fit Score"] || 0) - Number(left["Best Writer Fit Score"] || 0)
    || left.Company.localeCompare(right.Company) || left.Title.localeCompare(right.Title));

  const consolidationGroups = multiLocationGroups.map((group) => {
    const representative = representativeForGroup(group);
    return {
      Company: representative.Company,
      Title: representative.Title,
      "Listings Consolidated": group.length,
      "Locations (all variants)": joinValues(group, "Location"),
      "Apply Links (all variants)": joinValues(group, "Apply Link"),
      "Selected Representative Location": representative.Location,
      "Selected Representative URL": representative["Apply Link"],
      "Decision": "Preview only: exact company/title with multiple locations; retain every location and URL in the consolidated record.",
    };
  });

  const familyGroups = new Map();
  for (const row of baseline) {
    const key = titleFamilyKey(row);
    if (!key) continue;
    if (!familyGroups.has(key)) familyGroups.set(key, []);
    familyGroups.get(key).push(row);
  }
  const familyReviewRows = [...familyGroups.values()]
    .filter((group) => group.length > 1 && unique(group.map((row) => row.Title)).length > 1)
    .map((group) => ({
      Company: group[0].Company,
      "Title Family": clean(group[0].Title).replace(/\s+-\s+[^-]+\s+-\s+remote$/i, " - [qualifier] - Remote"),
      "Listings in Family": group.length,
      "Distinct Titles": joinValues(group, "Title"),
      "Locations (all variants)": joinValues(group, "Location"),
      "Apply Links (all variants)": joinValues(group, "Apply Link"),
      "Decision": "REVIEW ONLY: title qualifiers can be material requirements. Do not merge automatically.",
    }))
    .sort((left, right) => right["Listings in Family"] - left["Listings in Family"] || left.Company.localeCompare(right.Company));

  return { baseline, consolidatedRows, consolidationGroups, familyReviewRows };
}

function buildPackageRows(headers, baseline) {
  const groups = new Map();
  for (const row of baseline) {
    const key = consolidationKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.values()].map((group) => {
    const representative = representativeForGroup(group);
    const hasMultipleLocations = group.length > 1 && unique(group.map((row) => row.Location)).length > 1;
    if (!hasMultipleLocations) return representative;
    const additionalLinks = unique(group.map((row) => row["Apply Link"]))
      .filter((url) => url !== representative["Apply Link"])
      .join(" | ");
    return {
      ...representative,
      Location: groupedLocationSummary(group),
      "Work Arrangement": workArrangementForGroup(group),
      "Posted Date": earliestDate(group, "Posted Date"),
      "Age (Days)": largestNumber(group, "Age (Days)"),
      "Last Checked": newestLastChecked(group),
      "Additional Apply Links": additionalLinks,
    };
  }).map((row) => Object.fromEntries(headers.map((header) => [header, row[header] || ""])));
}

async function writePackageShapedPreview(headers, result) {
  const testPackageDir = path.join(outputDir, "package-test");
  await ensureDir(testPackageDir);
  const testHeaders = headers.includes("Additional Apply Links")
    ? headers
    : [...headers, "Additional Apply Links"];
  const packageRows = buildPackageRows(testHeaders, result.baseline);
  await fs.writeFile(path.join(testPackageDir, "01_good_documentation_jobs.csv"), rowsToCsv(testHeaders, packageRows), "utf8");

  const startHere = parseCsvRecords(await fs.readFile(path.join(latestPackageDir, "00_start_here.csv"), "utf8"));
  const updatedStartHereRows = startHere.rows.map((row) => ({
    ...row,
    "Good Documentation Jobs Count": String(packageRows.length),
    Notes: `${clean(row.Notes)} Test-only exact-title/multi-location consolidation preview; source package unchanged.`,
  }));
  await fs.writeFile(path.join(testPackageDir, "00_start_here.csv"), rowsToCsv(startHere.headers, updatedStartHereRows), "utf8");
  await fs.copyFile(path.join(latestPackageDir, "02_company_coverage.csv"), path.join(testPackageDir, "02_company_coverage.csv"));
  await writeJsonFile(path.join(testPackageDir, "gsheet-package-manifest.json"), {
    testOnly: true,
    sourcePackage: latestPackageDir,
    generatedAt: new Date().toISOString(),
    goodDocumentationJobsRows: packageRows.length,
  });
  return { testPackageDir, packageRows, testHeaders };
}

function buildMarkdown(input, result) {
  const exactAffectedRows = result.consolidationGroups.reduce((sum, group) => sum + group["Listings Consolidated"], 0);
  const reducedBy = result.baseline.length - result.consolidatedRows.length;
  return [
    "# Listing Consolidation Preview",
    "",
    `Input: \`${input}\``,
    "",
    "## Scope",
    "",
    "This is a read-only preview. The source package, live Sheet, score, and existing duplicate logic are not edited. It starts with the broad D-style hygiene filter, then combines only records with the same normalized company and exact normalized title when they have different locations.",
    "",
    "## Result",
    "",
    `- D-style baseline: ${result.baseline.length} listings.`,
    `- Exact-title multi-location groups: ${result.consolidationGroups.length}, covering ${exactAffectedRows} listings.`,
    `- Consolidated preview: ${result.consolidatedRows.length} listings (${reducedBy} fewer rows).`,
    `- Title-family review candidates: ${result.familyReviewRows.length}; these are explicitly not auto-consolidated.`,
    "",
    "## Files",
    "",
    "- `consolidated-preview.csv`: one representative display row per company/title, with all locations and application URLs preserved.",
    "- `exact-title-multi-location-groups.csv`: every automatically consolidatable group and its full variants.",
    "- `title-family-review.csv`: patterns such as language-qualified title families; review only because qualifiers may be material.",
    "",
  ].join("\n");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const csv = parseCsvRecords(await fs.readFile(options.input, "utf8"));
  const result = buildPreview(csv.rows);
  await ensureDir(outputDir);
  await fs.writeFile(path.join(outputDir, "consolidated-preview.csv"), rowsToCsv(Object.keys(result.consolidatedRows[0] || {}), result.consolidatedRows), "utf8");
  await fs.writeFile(path.join(outputDir, "exact-title-multi-location-groups.csv"), rowsToCsv(Object.keys(result.consolidationGroups[0] || {}), result.consolidationGroups), "utf8");
  await fs.writeFile(path.join(outputDir, "title-family-review.csv"), rowsToCsv(Object.keys(result.familyReviewRows[0] || {}), result.familyReviewRows), "utf8");
  await fs.writeFile(path.join(outputDir, "README.md"), buildMarkdown(options.input, result), "utf8");
  const packagePreview = await writePackageShapedPreview(csv.headers, result);
  await writeJsonFile(path.join(outputDir, "summary.json"), {
    input: options.input,
    inputRows: csv.rows.length,
    dStyleBaselineRows: result.baseline.length,
    exactTitleMultiLocationGroups: result.consolidationGroups.length,
    exactTitleMultiLocationRows: result.consolidationGroups.reduce((sum, group) => sum + group["Listings Consolidated"], 0),
    consolidatedPreviewRows: result.consolidatedRows.length,
    titleFamilyReviewCandidates: result.familyReviewRows.length,
    packageTestDir: packagePreview.testPackageDir,
    packageTestRows: packagePreview.packageRows.length,
  });
  console.log(`Read-only consolidation preview: ${outputDir}`);
  console.log(`D-style baseline: ${result.baseline.length}; consolidated preview: ${result.consolidatedRows.length}.`);
  console.log(`Package-shaped test directory: ${packagePreview.testPackageDir}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
