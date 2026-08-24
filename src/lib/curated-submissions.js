const { normalizeGenericAtsJob } = require("./jobs-normalize");
const { fromRoot, readJsonFile, writeJsonFile } = require("./files");

const submissionsPath = fromRoot("data", "config", "curated-submissions.json");
const reportPath = fromRoot("data", "jobs", "reports", "curated-submissions-health.json");
const cachePath = fromRoot("data", "jobs", "state", "curated-submissions-cache.json");

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseJobPosting(html) {
  const scripts = String(html || "").match(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const payload = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
      const job = candidates.find((candidate) => {
        const type = candidate && candidate["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (job) return job;
    } catch (error) {
      // Keep looking: a page can contain multiple JSON-LD blocks.
    }
  }
  return null;
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

function getJobId(url) {
  return cleanText(url).match(/\/(\d+)(?:[/?#]|$)/)?.[1] || "";
}

function getApplyUrl(html, baseUrl) {
  const tag = String(html || "").match(/<meta\b[^>]*name="search-job-apply-url"[^>]*>/i)?.[0] || "";
  const encoded = tag.match(/\bcontent="([^"]*)"/i)?.[1] || "";
  const decoded = encoded.replace(/&amp;/g, "&");
  if (!decoded) return baseUrl;
  try {
    return new URL(decoded, baseUrl).toString();
  } catch (error) {
    return baseUrl;
  }
}

async function fetchPosting(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "public-job-feed-curated-submissions/1.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.httpStatus = response.status;
      throw error;
    }
    const jobPosting = parseJobPosting(html);
    if (!jobPosting) throw new Error("Missing JobPosting JSON-LD");
    return { html, jobPosting, finalUrl: response.url, httpStatus: response.status };
  } finally {
    clearTimeout(timer);
  }
}

function validateSubmission(submission, seenIds) {
  const id = cleanText(submission && submission.Id);
  const company = cleanText(submission && submission.Company);
  const url = cleanText(submission && submission.URL);
  if (!id || !company || !url) throw new Error("Each curated submission requires Id, Company, and URL.");
  if (seenIds.has(id)) throw new Error(`Duplicate curated submission Id: ${id}`);
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  } catch (error) {
    throw new Error(`Invalid curated submission URL for ${id}: ${url}`);
  }
  seenIds.add(id);
}

async function loadCuratedSubmissionRows(titleRecords, generatedAt = new Date().toISOString()) {
  let source;
  try {
    source = await readJsonFile(submissionsPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { rows: [], health: { GeneratedAt: generatedAt, ConfigPath: submissionsPath, ConfigPresent: false, Entries: [] } };
    }
    throw error;
  }
  if (!source || !Array.isArray(source.Submissions)) {
    throw new Error(`Curated submissions file must contain a Submissions array: ${submissionsPath}`);
  }

  let cache = {};
  try {
    cache = (await readJsonFile(cachePath)).Entries || {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const seenIds = new Set();
  const rows = [];
  const entries = [];
  for (const submission of source.Submissions) {
    validateSubmission(submission, seenIds);
    const status = cleanText(submission.Status).toUpperCase();
    if (status !== "APPROVED") {
      entries.push({ Id: submission.Id, Status: status || "PENDING", Included: false, Reason: "Not approved" });
      continue;
    }
    try {
      const fetched = await fetchPosting(submission.URL);
      const location = getLocations(fetched.jobPosting);
      const normalized = normalizeGenericAtsJob(
        {},
        {
          ats: "direct-employer",
          company: submission.Company,
          companyKey: cleanText(submission.CompanyKey) || submission.Company.toLowerCase().replace(/[^a-z0-9]+/g, ""),
          catalogSlug: cleanText(submission.Id),
          boardUrl: new URL(fetched.finalUrl).origin,
          fetchUrl: submission.URL,
          fetchedAt: generatedAt,
        },
        titleRecords,
        {
          title: cleanText(fetched.jobPosting.title),
          location,
          department: cleanText(fetched.jobPosting.occupationalCategory),
          description: cleanText(fetched.jobPosting.description),
          salary: "",
          datePosted: cleanText(fetched.jobPosting.datePosted),
          url: fetched.finalUrl,
          rawJobId: getJobId(fetched.finalUrl),
        }
      );
      const applyUrl = getApplyUrl(fetched.html, fetched.finalUrl);
      rows.push({
        ...normalized,
        Source: "Verified direct employer submission",
        SourceBatch: "curated-submission",
        ApplyURL: applyUrl,
        CuratedSubmissionId: submission.Id,
        CuratedSubmittedAt: cleanText(submission.SubmittedAt),
      });
      cache[submission.Id] = rows[rows.length - 1];
      entries.push({ Id: submission.Id, Status: "APPROVED", Included: true, HTTPStatus: fetched.httpStatus, VerifiedURL: fetched.finalUrl, ApplyURL: applyUrl });
    } catch (error) {
      const confirmedClosed = [404, 410].includes(Number(error.httpStatus));
      const cached = cache[submission.Id];
      if (!confirmedClosed && cached) {
        rows.push(cached);
        entries.push({ Id: submission.Id, Status: "APPROVED", Included: true, UsedLastVerifiedRecord: true, Reason: error.message });
      } else {
        entries.push({ Id: submission.Id, Status: "APPROVED", Included: false, ConfirmedClosed: confirmedClosed, Reason: error.message });
      }
    }
  }
  const health = { GeneratedAt: generatedAt, ConfigPath: submissionsPath, ConfigPresent: true, Entries: entries };
  await writeJsonFile(cachePath, { UpdatedAt: generatedAt, Entries: cache });
  await writeJsonFile(reportPath, health);
  return { rows, health };
}

module.exports = { loadCuratedSubmissionRows, parseJobPosting, submissionsPath };
