function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function decodeHtml(value) {
  return cleanText(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function getTalentBrewSlugFromUrl(value) {
  try {
    return new URL(cleanText(value)).hostname;
  } catch (error) {
    return "";
  }
}

function getTalentBrewFetchUrl(slug, sourceUrl = "") {
  const source = cleanText(sourceUrl);
  if (source) {
    try {
      const url = new URL(source);
      return `${url.origin}/search-jobs`;
    } catch (error) {
      return "";
    }
  }

  const host = cleanText(slug).replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return host ? `https://${host}/search-jobs` : "";
}

function getTalentBrewBoardUrl(slug, sourceUrl = "") {
  return getTalentBrewFetchUrl(slug, sourceUrl);
}

function getAttribute(tag, attribute) {
  const match = String(tag || "").match(new RegExp(`\\b${attribute}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function getTotalPages(html) {
  const match = String(html || "").match(/\bdata-total-pages="(\d+)"/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function getTotalResults(html) {
  const match = String(html || "").match(/\bdata-total-job-results="(\d+)"/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getListingJobs(html, baseUrl) {
  const jobsById = new Map();
  const anchors = String(html || "").match(/<a\b[^>]*href="[^"]*\/job\/[^\"]+"[^>]*>[\s\S]*?<\/a>/gi) || [];

  for (const anchor of anchors) {
    const href = getAttribute(anchor, "href");
    const id = getAttribute(anchor, "data-job-id") || href.match(/\/(\d+)(?:[/?#]|$)/)?.[1] || "";
    const title = decodeHtml(anchor.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
    const location = decodeHtml(anchor.match(/<span[^>]*class="[^"]*job-location[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    if (!href || !id || !title) continue;

    jobsById.set(id, {
      id,
      title,
      location,
      url: new URL(href, baseUrl).toString(),
    });
  }

  return Array.from(jobsById.values());
}

function parseJobPosting(html) {
  const scripts = String(html || "").match(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const payload = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
      const job = candidates.find((candidate) => {
        const type = candidate && candidate["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (job) return job;
    } catch (error) {
      // A malformed JSON-LD block should not prevent parsing a later valid block.
    }
  }

  return null;
}

function getJobLocations(jobPosting) {
  const locations = Array.isArray(jobPosting && jobPosting.jobLocation)
    ? jobPosting.jobLocation
    : [jobPosting && jobPosting.jobLocation];
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

function getApplyUrl(html, baseUrl) {
  const meta = String(html || "").match(/<meta\b[^>]*name="search-job-apply-url"[^>]*>/i);
  const content = meta ? getAttribute(meta[0], "content") : "";
  return content ? new URL(content, baseUrl).toString() : "";
}

function toTalentBrewJob(listingJob, jobPosting, html, detailUrl) {
  return {
    id: listingJob.id,
    title: cleanText(jobPosting.title) || listingJob.title,
    location: getJobLocations(jobPosting) || listingJob.location,
    description: cleanText(jobPosting.description),
    datePosted: cleanText(jobPosting.datePosted),
    url: cleanText(jobPosting.url) || detailUrl,
    applicationUrl: getApplyUrl(html, detailUrl),
    department: cleanText(jobPosting.occupationalCategory),
    salary: cleanText(jobPosting.baseSalary && jobPosting.baseSalary.value && jobPosting.baseSalary.value.value),
  };
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "public-job-feed-talentbrew/0.1",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.body = text.slice(0, 500);
      throw error;
    }
    return { status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTalentBrewBoard(slug, sourceUrl = "", options = {}) {
  const fetchUrl = getTalentBrewFetchUrl(slug, sourceUrl);
  if (!fetchUrl) {
    const error = new Error("No usable TalentBrew fetch URL");
    error.skip = true;
    throw error;
  }

  const maximumPages = Math.min(Math.max(Number(options.maxPages) || 100, 1), 100);
  const maximumJobs = Math.min(Math.max(Number(options.maxJobs) || 1000, 1), 1000);
  const detailDelayMs = Math.max(Number(options.detailDelayMs) || 0, 0);
  const firstPage = await fetchText(fetchUrl, options.timeoutMs);
  const totalPages = Math.max(getTotalPages(firstPage.text), 1);
  const totalResults = getTotalResults(firstPage.text);
  const listingJobsById = new Map(getListingJobs(firstPage.text, fetchUrl).map((job) => [job.id, job]));
  const pagesToFetch = Math.min(totalPages, maximumPages);
  let httpStatus = firstPage.status;

  for (let page = 2; page <= pagesToFetch && listingJobsById.size < maximumJobs; page += 1) {
    const pageUrl = new URL(fetchUrl);
    pageUrl.searchParams.set("p", String(page));
    const result = await fetchText(pageUrl.toString(), options.timeoutMs);
    httpStatus = result.status;
    for (const job of getListingJobs(result.text, fetchUrl)) listingJobsById.set(job.id, job);
  }

  const listings = Array.from(listingJobsById.values()).slice(0, maximumJobs);
  const detailErrors = [];
  const jobs = [];
  for (let index = 0; index < listings.length; index += 1) {
    const listing = listings[index];
    try {
      const detail = await fetchText(listing.url, options.timeoutMs);
      httpStatus = detail.status;
      const jobPosting = parseJobPosting(detail.text);
      if (!jobPosting) {
        detailErrors.push({ id: listing.id, url: listing.url, error: "Missing JobPosting JSON-LD" });
      } else {
        jobs.push(toTalentBrewJob(listing, jobPosting, detail.text, listing.url));
      }
    } catch (error) {
      detailErrors.push({ id: listing.id, url: listing.url, error: error.message });
    }
    if (detailDelayMs > 0 && index < listings.length - 1) await sleep(detailDelayMs);
  }

  return {
    fetchUrl,
    httpStatus,
    jobs,
    raw: {
      totalResults,
      totalPages,
      listingPagesFetched: pagesToFetch,
      detailPagesRequested: listings.length,
      detailPagesFetched: jobs.length,
      detailErrors,
      partial: pagesToFetch < totalPages || listingJobsById.size > maximumJobs || listings.length < totalResults,
    },
  };
}

module.exports = {
  fetchTalentBrewBoard,
  getListingJobs,
  getTalentBrewBoardUrl,
  getTalentBrewFetchUrl,
  getTalentBrewSlugFromUrl,
  parseJobPosting,
};
