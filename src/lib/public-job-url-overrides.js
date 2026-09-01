// Some employer career sites expose a stable first-party listing URL alongside
// the ATS URL returned by the board API. Keep verified exceptions here so the
// public Sheet links to the employer page rather than a stale ATS URL.
const overrides = [
  {
    ATS: "ashby",
    CompanyKey: "posthog",
    RawJobId: "56cc4793-348c-46c8-bba8-3337b990ecad",
    URL: "https://posthog.com/careers/member-of-the-technical-writing-staff",
  },
  {
    ATS: "ashby",
    CompanyKey: "posthog",
    RawJobId: "ec954b2d-5bb1-4d8a-b968-88002f78d62c",
    URL: "https://posthog.com/careers/technical-content-writer",
  },
];

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function getPublicJobUrl(row) {
  const fallback = cleanText(row.ApplyURL) || cleanText(row.URL);
  const match = overrides.find(
    (override) =>
      cleanText(override.ATS).toLowerCase() === cleanText(row.ATS).toLowerCase()
      && cleanText(override.CompanyKey).toLowerCase() === cleanText(row.CompanyKey).toLowerCase()
      && cleanText(override.RawJobId) === cleanText(row.RawJobId)
  );

  return cleanText(match && match.URL) || fallback;
}

module.exports = { getPublicJobUrl };
