const { fetchJson } = require("../http");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getLeverSlugFromUrl(value) {
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

function getLeverFetchUrl(slug) {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
}

async function fetchLeverBoard(slug) {
  const fetchUrl = getLeverFetchUrl(slug);
  const result = await fetchJson(fetchUrl);
  const jobs = Array.isArray(result.data) ? result.data : [];

  return {
    fetchUrl,
    httpStatus: result.status,
    jobs,
    raw: result.data,
  };
}

module.exports = {
  fetchLeverBoard,
  getLeverFetchUrl,
  getLeverSlugFromUrl,
};
