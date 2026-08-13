const removableTerms = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "technologies",
  "technology",
  "labs",
  "group",
  "holdings",
  "ai",
]);

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getCompanyKeySeed(row) {
  const company = cleanText(row.CatalogCompany);
  if (company) {
    return company;
  }

  const slug = cleanText(row.CatalogSlug);
  const value = cleanText(row.CatalogValue);
  let seed = slug || value;

  if (cleanText(row.ATS).toLowerCase() === "workday" && seed.includes("|")) {
    seed = seed.split("|")[0];
  }

  return seed;
}

function normalizeCompanyKey(value) {
  const text = cleanText(value)
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  return text
    .split(" ")
    .filter((word) => word && !removableTerms.has(word))
    .join("");
}

function titleCaseCompany(value) {
  const text = cleanText(value)
    .replace(/\|.*$/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  return text
    .split(" ")
    .map((word) => {
      if (/^\d/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function getCompanyKey(row) {
  return normalizeCompanyKey(getCompanyKeySeed(row));
}

function getPreferredCompanyNameSeed(row) {
  return cleanText(row.CatalogCompany) || getCompanyKeySeed(row);
}

module.exports = {
  getCompanyKey,
  getCompanyKeySeed,
  getPreferredCompanyNameSeed,
  normalizeCompanyKey,
  titleCaseCompany,
};
