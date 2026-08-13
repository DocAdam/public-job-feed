const { fetchJson } = require("../http");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getAshbySlugFromUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] || "";
  } catch (error) {
    return "";
  }
}

function getAshbyFetchUrl(slug) {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
}

async function fetchAshbyBoard(slug) {
  const fetchUrl = getAshbyFetchUrl(slug);
  const result = await fetchJson(fetchUrl);
  const jobs = result.data && Array.isArray(result.data.jobs) ? result.data.jobs : [];

  return {
    fetchUrl,
    httpStatus: result.status,
    jobs,
    raw: result.data,
  };
}

module.exports = {
  fetchAshbyBoard,
  getAshbyFetchUrl,
  getAshbySlugFromUrl,
};
