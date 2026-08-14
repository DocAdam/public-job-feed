function firstPresent(entry, keys) {
  for (const key of keys) {
    if (entry[key] !== null && entry[key] !== undefined && String(entry[key]).trim() !== "") {
      return String(entry[key]).trim();
    }
  }

  return "";
}

function getObjectValue(entry) {
  return firstPresent(entry, [
    "slug",
    "company",
    "name",
    "id",
    "url",
    "careerSiteUrl",
    "careersUrl",
  ]);
}

function getObjectUrl(entry) {
  return firstPresent(entry, ["url", "careerSiteUrl", "careersUrl"]);
}

function getBoardUrl(ats, slug, sourceUrl) {
  if (sourceUrl) {
    return sourceUrl;
  }

  if (!slug) {
    return "";
  }

  const encodedSlug = encodeURIComponent(slug);

  if (ats === "ashby") {
    return `https://jobs.ashbyhq.com/${encodedSlug}`;
  }

  if (ats === "lever") {
    return `https://jobs.lever.co/${encodedSlug}`;
  }

  if (ats === "greenhouse") {
    return `https://job-boards.greenhouse.io/${encodedSlug}`;
  }

  return "";
}

function normalizeEntry(entry, source) {
  const fetchedAt = source.fetchedAt || new Date().toISOString();
  let catalogSlug = "";
  let catalogCompany = "";
  let catalogValue = "";
  let sourceUrl = "";

  if (typeof entry === "string") {
    catalogSlug = entry.trim();
    catalogValue = catalogSlug;
  } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    catalogSlug = firstPresent(entry, ["slug", "id"]);
    catalogCompany = firstPresent(entry, ["company", "name"]);
    catalogValue = getObjectValue(entry);
    sourceUrl = getObjectUrl(entry);
  } else {
    catalogValue = JSON.stringify(entry);
  }

  return {
    Source: source.sourceUrl,
    ATS: source.ats,
    CatalogSlug: catalogSlug,
    CatalogCompany: catalogCompany,
    CatalogValue: catalogValue,
    BoardURL: getBoardUrl(source.ats, catalogSlug, sourceUrl),
    RawCatalogFile: source.rawCatalogFile,
    FetchedAt: fetchedAt,
  };
}

function normalizeCatalog(entries, source) {
  if (!Array.isArray(entries)) {
    throw new Error("Catalog JSON must be an array.");
  }

  return entries.map((entry) => normalizeEntry(entry, source));
}

module.exports = {
  getBoardUrl,
  normalizeCatalog,
  normalizeEntry,
};
