const { fetchJson } = require("../http");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getBambooHRSlugFromUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const match = url.hostname.match(/^([^.]+)\.bamboohr\.com$/i);
    return match ? match[1] : "";
  } catch (error) {
    return "";
  }
}

function getBambooHRFetchUrl(slug, sourceUrl = "") {
  const directUrl = cleanText(sourceUrl);
  if (directUrl) {
    return directUrl;
  }

  if (!cleanText(slug)) {
    return "";
  }

  return `https://${slug}.bamboohr.com/careers/list`;
}

function getBambooHRBoardUrl(slug, sourceUrl = "") {
  return getBambooHRFetchUrl(slug, sourceUrl);
}

function extractJobs(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data && data.result)) return data.result;
  if (Array.isArray(data && data.jobs)) return data.jobs;
  if (Array.isArray(data && data.jobOpenings)) return data.jobOpenings;
  if (Array.isArray(data && data.openings)) return data.openings;
  return [];
}

async function fetchBambooHRBoard(slug, sourceUrl = "") {
  const fetchUrl = getBambooHRFetchUrl(slug, sourceUrl);
  if (!fetchUrl) {
    const error = new Error("No usable BambooHR fetch URL");
    error.skip = true;
    throw error;
  }

  const result = await fetchJson(fetchUrl);

  return {
    fetchUrl,
    httpStatus: result.status,
    jobs: extractJobs(result.data),
    raw: result.data,
  };
}

module.exports = {
  fetchBambooHRBoard,
  getBambooHRBoardUrl,
  getBambooHRFetchUrl,
  getBambooHRSlugFromUrl,
};
