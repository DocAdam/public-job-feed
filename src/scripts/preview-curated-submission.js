const fs = require("fs/promises");
const path = require("path");
const { parseJobPosting } = require("../lib/curated-submissions");
const { normalizeGenericAtsJob } = require("../lib/jobs-normalize");
const { buildJobExportArtifacts } = require("../lib/job-export");
const { getCanonicalURLKey } = require("../lib/job-dedupe");
const { readJobTitles } = require("../lib/job-titles");
const { buildSimplePublicRow, SIMPLE_PUBLIC_HEADERS } = require("../lib/simple-public-export");
const { parseCsvRecords, writeLargeCsvFile } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile, writeTextFile } = require("../lib/files");

const defaultUrl = "https://careers.netapp.com/job/-/-/27600/98852323856";
const inputCsvPath = fromRoot("data", "jobs", "gsheet-package", "latest", "01_good_documentation_jobs.csv");
const outputDir = fromRoot("data", "jobs", "reports", "curated-submission-preview");

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getJobId(url) {
  return cleanText(url).match(/\/(\d+)(?:[/?#]|$)/)?.[1] || "";
}

function getLocations(jobPosting) {
  const locations = Array.isArray(jobPosting.jobLocation) ? jobPosting.jobLocation : [jobPosting.jobLocation];
  return locations
    .map((location) => {
      const address = location && location.address;
      return [address && address.addressLocality, address && address.addressRegion, address && address.addressCountry]
        .map(cleanText)
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean)
    .join(" | ");
}

async function fetchPosting(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "public-job-feed-curated-preview/0.1",
    },
    redirect: "follow",
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Posting request failed with HTTP ${response.status}`);

  const jobPosting = parseJobPosting(html);
  if (!jobPosting) throw new Error("Posting did not contain JobPosting JSON-LD");

  return { html, jobPosting, finalUrl: response.url, status: response.status };
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    const leftAge = Number(left["Age (Days)"]);
    const rightAge = Number(right["Age (Days)"]);
    const safeLeftAge = Number.isFinite(leftAge) ? leftAge : Number.POSITIVE_INFINITY;
    const safeRightAge = Number.isFinite(rightAge) ? rightAge : Number.POSITIVE_INFINITY;
    return safeLeftAge - safeRightAge
      || (Number(right["Writer Fit Score"]) || 0) - (Number(left["Writer Fit Score"]) || 0)
      || String(left.Company || "").localeCompare(String(right.Company || ""))
      || String(left.Title || "").localeCompare(String(right.Title || ""));
  });
}

async function main() {
  const sourceUrl = getArgValue("--url", defaultUrl);
  const generatedAt = new Date().toISOString();
  const { jobPosting, finalUrl, status } = await fetchPosting(sourceUrl);
  const titleRecords = await readJobTitles(fromRoot("data", "config", "job-titles.md"));
  const job = normalizeGenericAtsJob(
    {},
    {
      ats: "direct-employer",
      company: "NetApp",
      companyKey: "netapp",
      catalogSlug: "careers.netapp.com",
      boardUrl: "https://careers.netapp.com/search-jobs",
      fetchUrl: sourceUrl,
      fetchedAt: generatedAt,
    },
    titleRecords,
    {
      title: cleanText(jobPosting.title),
      location: getLocations(jobPosting),
      description: cleanText(jobPosting.description),
      datePosted: cleanText(jobPosting.datePosted),
      url: finalUrl,
      department: cleanText(jobPosting.occupationalCategory),
      salary: "",
      rawJobId: getJobId(finalUrl),
    }
  );
  const artifacts = buildJobExportArtifacts([job], [], titleRecords, generatedAt);
  const scoredJob = artifacts.jobRows[0];
  const currentPackage = parseCsvRecords(await fs.readFile(inputCsvPath, "utf8"));
  const canonicalPostingUrl = getCanonicalURLKey(scoredJob.URL);
  const packageDuplicates = currentPackage.rows.filter(
    (row) => getCanonicalURLKey(row["Apply Link"]) === canonicalPostingUrl
  );
  const isEligible = ["A", "B"].includes(scoredJob.WriterFitTier) && scoredJob.ExportQualityFlag === "OK";
  const previewRow = {
    ...buildSimplePublicRow(scoredJob, generatedAt),
    Source: "TalentBrew (direct employer submission; verified)",
  };
  const outputRows = isEligible && packageDuplicates.length === 0
    ? sortRows([...currentPackage.rows, previewRow])
    : currentPackage.rows;

  await ensureDir(outputDir);
  await writeLargeCsvFile(
    path.join(outputDir, "01_good_documentation_jobs-preview.csv"),
    outputRows,
    SIMPLE_PUBLIC_HEADERS
  );
  await writeJsonFile(path.join(outputDir, "netapp-normalized-record.json"), {
    SourceSubmissionURL: sourceUrl,
    VerifiedURL: finalUrl,
    VerificationHTTPStatus: status,
    VerifiedAt: generatedAt,
    NormalizedRecord: scoredJob,
  });
  await writeJsonFile(path.join(outputDir, "preview-manifest.json"), {
    GeneratedAt: generatedAt,
    InputPackage: inputCsvPath,
    InputRows: currentPackage.rows.length,
    OutputRows: outputRows.length,
    SourceSubmissionURL: sourceUrl,
    VerifiedURL: finalUrl,
    VerificationHTTPStatus: status,
    CanonicalPostingURL: canonicalPostingUrl,
    ExistingPackageDuplicateCount: packageDuplicates.length,
    WriterFitScore: scoredJob.WriterFitScore,
    WriterFitTier: scoredJob.WriterFitTier,
    ExportQualityFlag: scoredJob.ExportQualityFlag,
    IncludedInPreview: isEligible && packageDuplicates.length === 0,
    ExclusionReason: !isEligible
      ? "Role did not meet the A/B plus export-quality threshold."
      : packageDuplicates.length > 0
        ? "Canonical posting URL is already present in the current package."
        : "",
  });
  await writeTextFile(
    path.join(outputDir, "README.md"),
    [
      "# Curated Submission Preview",
      "",
      "This is a test-only copy of the current Good Documentation Jobs CSV with one verified direct-employer submission evaluated through the existing normalization and scoring pipeline.",
      "",
      `- Source submission: ${sourceUrl}`,
      `- Verified posting: ${finalUrl}`,
      `- Generated: ${generatedAt}`,
      `- Included: ${isEligible && packageDuplicates.length === 0}`,
      "",
      "The live Google Sheets package was not changed.",
      "",
    ].join("\n")
  );

  console.log(JSON.stringify({
    outputDir,
    inputRows: currentPackage.rows.length,
    outputRows: outputRows.length,
    included: isEligible && packageDuplicates.length === 0,
    score: scoredJob.WriterFitScore,
    tier: scoredJob.WriterFitTier,
    quality: scoredJob.ExportQualityFlag,
    duplicates: packageDuplicates.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
