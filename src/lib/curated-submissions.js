const { normalizeGenericAtsJob } = require("./jobs-normalize");
const { fromRoot, readJsonFile, writeJsonFile } = require("./files");

const submissionsPath = fromRoot("data", "config", "curated-submissions.json");
const reportPath = fromRoot("data", "jobs", "reports", "curated-submissions-health.json");
const cachePath = fromRoot("data", "jobs", "state", "curated-submissions-cache.json");

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/&#(\d+);/g, (match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

function htmlToText(value) {
  return decodeHtml(
    cleanText(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(
    new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  return decodeHtml(match && (match[1] ?? match[2] ?? match[3]));
}

function getElementInnerHtml(source, startIndex, tagName) {
  const openingEnd = source.indexOf(">", startIndex);
  if (openingEnd < 0) return null;
  const escapedTagName = String(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<\\/?${escapedTagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openingEnd + 1;
  let depth = 1;
  let match;
  while ((match = tagPattern.exec(source))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) return source.slice(openingEnd + 1, match.index);
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1;
    }
  }
  return null;
}

function findItempropValue(source, property, preserveHtml = false) {
  const tagPattern = /<([a-z][\w:-]*)\b[^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(source))) {
    const properties = getAttribute(match[0], "itemprop").split(/\s+/).filter(Boolean);
    if (!properties.includes(property)) continue;
    const content = getAttribute(match[0], "content");
    if (content) return content;
    const innerHtml = getElementInnerHtml(source, match.index, match[1]);
    if (innerHtml === null) continue;
    return preserveHtml ? innerHtml.trim() : htmlToText(innerHtml);
  }
  return "";
}

function normalizeDatePosted(value) {
  const text = cleanText(value);
  if (!text || /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) return text;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : text;
}

function parseJobPostingMicrodata(html) {
  const source = String(html || "");
  const tagPattern = /<([a-z][\w:-]*)\b[^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(source))) {
    const itemTypes = getAttribute(match[0], "itemtype").split(/\s+/).filter(Boolean);
    if (!itemTypes.some((itemType) => /^https?:\/\/schema\.org\/JobPosting\/?$/i.test(itemType))) continue;
    const body = getElementInnerHtml(source, match.index, match[1]);
    if (body === null) continue;
    const title = findItempropValue(body, "title");
    const description = findItempropValue(body, "description", true);
    if (!title || !htmlToText(description)) continue;
    const address = {
      addressLocality: findItempropValue(body, "addressLocality"),
      addressRegion: findItempropValue(body, "addressRegion"),
      addressCountry: findItempropValue(body, "addressCountry"),
    };
    const jobPosting = {
      "@type": "JobPosting",
      title,
      description,
      datePosted: normalizeDatePosted(findItempropValue(body, "datePosted")),
      occupationalCategory: findItempropValue(body, "industry"),
    };
    if (Object.values(address).some(Boolean)) {
      jobPosting.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", ...address } };
    }
    return jobPosting;
  }
  return null;
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
  return parseJobPostingMicrodata(html);
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
  const matches = Array.from(cleanText(url).matchAll(/\/(\d+)(?=[/?#]|$)/g));
  return matches.at(-1)?.[1] || "";
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
    if (!jobPosting) throw new Error("Missing JobPosting structured data");
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

async function loadCuratedSubmissionRows(titleRecords, generatedAt = new Date().toISOString(), options = {}) {
  const submissionsPath = options.submissionsPath || module.exports.submissionsPath;
  const reportPath = options.reportPath || fromRoot("data", "jobs", "reports", "curated-submissions-health.json");
  const cachePath = options.cachePath || fromRoot("data", "jobs", "state", "curated-submissions-cache.json");
  const fetchSource = options.fetchPosting || fetchPosting;
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
      const fetched = await fetchSource(submission.URL);
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
      if (confirmedClosed) delete cache[submission.Id];
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

module.exports = { getJobId, loadCuratedSubmissionRows, parseJobPosting, submissionsPath };
