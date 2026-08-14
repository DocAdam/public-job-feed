const { fetchJson } = require("../http");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getGreenhouseSlugFromUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const boardIndex = parts.indexOf("boards");

    if (boardIndex !== -1 && parts[boardIndex + 1]) {
      return parts[boardIndex + 1];
    }

    return parts[0] || "";
  } catch (error) {
    return "";
  }
}

function getGreenhouseFetchUrl(slug) {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
}

async function fetchGreenhouseBoard(slug) {
  const fetchUrl = getGreenhouseFetchUrl(slug);
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
  fetchGreenhouseBoard,
  getGreenhouseFetchUrl,
  getGreenhouseSlugFromUrl,
};
