const { fetchJson } = require("../http");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseWorkdaySlug(value) {
  const parts = cleanText(value).split("|").map(cleanText).filter(Boolean);
  if (parts.length < 3 || !/^wd\d+$/i.test(parts[1])) {
    return null;
  }

  return {
    tenant: parts[0],
    hostSegment: parts[1],
    site: parts[2],
  };
}

function getWorkdaySlugFromUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const hostMatch = url.hostname.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/i);
    const parts = url.pathname.split("/").filter(Boolean);

    if (!hostMatch) {
      return "";
    }

    if (parts[0] === "wday" && parts[1] === "cxs" && parts[2] && parts[3]) {
      return `${parts[2]}|${hostMatch[2]}|${parts[3]}`;
    }

    if (parts[0]) {
      return `${hostMatch[1]}|${hostMatch[2]}|${parts[0]}`;
    }

    return "";
  } catch (error) {
    return "";
  }
}

function getWorkdayFetchUrl(slug, sourceUrl = "") {
  const directUrl = cleanText(sourceUrl);
  if (directUrl && directUrl.includes("/wday/cxs/")) {
    return directUrl.split("?")[0];
  }

  const parsedFromUrl = getWorkdaySlugFromUrl(directUrl);
  const parsed = parseWorkdaySlug(parsedFromUrl || slug);
  if (!parsed) {
    return "";
  }

  return `https://${parsed.tenant}.${parsed.hostSegment}.myworkdayjobs.com/wday/cxs/${parsed.tenant}/${parsed.site}/jobs`;
}

function getWorkdayBoardUrl(slug, sourceUrl = "") {
  const directUrl = cleanText(sourceUrl);
  if (directUrl && !directUrl.includes("/wday/cxs/")) {
    return directUrl;
  }

  const parsed = parseWorkdaySlug(getWorkdaySlugFromUrl(directUrl) || slug);
  if (!parsed) {
    return directUrl;
  }

  return `https://${parsed.tenant}.${parsed.hostSegment}.myworkdayjobs.com/${parsed.site}`;
}

function extractJobs(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data && data.jobPostings)) return data.jobPostings;
  if (Array.isArray(data && data.jobs)) return data.jobs;
  if (Array.isArray(data && data.data && data.data.jobPostings)) return data.data.jobPostings;
  return [];
}

async function fetchWorkdayBoard(slug, sourceUrl = "") {
  const fetchUrl = getWorkdayFetchUrl(slug, sourceUrl);
  if (!fetchUrl) {
    const error = new Error("No usable Workday fetch URL");
    error.skip = true;
    throw error;
  }

  const jobs = [];
  let offset = 0;
  let httpStatus = 200;
  const limit = 20;
  const maximumJobs = 2000;

  while (offset < maximumJobs) {
    const result = await fetchJson(fetchUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: "" }),
    });
    httpStatus = result.status;
    const pageJobs = extractJobs(result.data);
    jobs.push(...pageJobs);
    const total = Number(result.data && result.data.total);
    offset += pageJobs.length;
    if (pageJobs.length === 0 || (Number.isFinite(total) && offset >= total) || pageJobs.length < limit) break;
  }

  return {
    fetchUrl,
    httpStatus,
    jobs,
    raw: { total: jobs.length, jobPostings: jobs },
  };
}

module.exports = {
  fetchWorkdayBoard,
  getWorkdayBoardUrl,
  getWorkdayFetchUrl,
  getWorkdaySlugFromUrl,
  parseWorkdaySlug,
};
