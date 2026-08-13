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

function getICIMSSlugFromUrl(value) {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const host = new URL(text).hostname.split(".")[0] || "";
    return host.replace(/^careers-/i, "");
  } catch (error) {
    return "";
  }
}

function getHostLabel(slug) {
  const value = cleanText(slug).replace(/\.icims\.com.*$/i, "");
  if (!value) return "";
  if (/^careers-/i.test(value)) return value;
  if (/^-careers-/i.test(value)) return value.slice(1);
  return `careers-${value}`;
}

function getICIMSFetchUrl(slug, sourceUrl = "") {
  const directUrl = cleanText(sourceUrl);
  if (directUrl) {
    try {
      const url = new URL(directUrl);
      url.pathname = "/jobs/search";
      url.search = "?ss=1&searchRelation=keyword_all&in_iframe=1";
      return url.toString();
    } catch (error) {
      return directUrl;
    }
  }
  const hostLabel = getHostLabel(slug);
  return hostLabel
    ? `https://${hostLabel}.icims.com/jobs/search?ss=1&searchRelation=keyword_all&in_iframe=1`
    : "";
}

function getICIMSBoardUrl(slug, sourceUrl = "") {
  const fetchUrl = getICIMSFetchUrl(slug, sourceUrl);
  return fetchUrl ? fetchUrl.replace(/\?.*$/, "") : "";
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function parseICIMSJobs(html) {
  const jobs = [];
  const cards = String(html || "").match(/<li[^>]*class="[^"]*iCIMS_JobCardItem[^"]*"[^>]*>[\s\S]*?<\/li>/gi) || [];
  for (const card of cards) {
    const linkMatch = card.match(/<a[^>]+href="([^"]*\/jobs\/(\d+)\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!linkMatch) continue;
    const locationBlock = card.match(/class="[^"]*header left[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const descriptionBlock = card.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const locationSpans = locationBlock
      ? Array.from(locationBlock[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)).map((match) => decodeHtml(match[1]))
      : [];
    jobs.push({
      id: linkMatch[2],
      title: decodeHtml(linkMatch[3]),
      url: decodeHtml(linkMatch[1]).replace(/([?&])in_iframe=1(&|$)/, "$1").replace(/[?&]$/, ""),
      location: locationSpans.filter(Boolean).at(-1) || "",
      description: descriptionBlock ? decodeHtml(descriptionBlock[1]) : "",
    });
  }
  return jobs;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html", "user-agent": "public-job-feed-icims/1.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return { text: await response.text(), status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchICIMSBoard(slug, sourceUrl = "") {
  const fetchUrl = getICIMSFetchUrl(slug, sourceUrl);
  if (!fetchUrl) {
    const error = new Error("No usable iCIMS fetch URL");
    error.skip = true;
    throw error;
  }
  const jobsById = new Map();
  let httpStatus = 200;
  const maximumPages = 20;
  for (let page = 0; page < maximumPages; page += 1) {
    const url = new URL(fetchUrl);
    url.searchParams.set("pr", String(page));
    const result = await fetchText(url.toString());
    httpStatus = result.status;
    const pageJobs = parseICIMSJobs(result.text);
    const before = jobsById.size;
    for (const job of pageJobs) jobsById.set(job.id || job.url, job);
    if (pageJobs.length === 0 || jobsById.size === before) break;
  }
  return {
    fetchUrl,
    httpStatus,
    jobs: Array.from(jobsById.values()),
    raw: { parsedFromHtml: true, jobCount: jobsById.size },
  };
}

module.exports = {
  fetchICIMSBoard,
  getICIMSBoardUrl,
  getICIMSFetchUrl,
  getICIMSSlugFromUrl,
  parseICIMSJobs,
};
