const fs = require("fs/promises");

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/]/g, " ")
    .replace(/[!"#$%'()*+,.:;<=>?@[\\\]^`{|}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokenList(normalizedTitle) {
  return cleanText(normalizedTitle).split(" ").filter(Boolean);
}

function parseJobTitlesMarkdown(markdown) {
  const records = [];
  let currentCategory = "";

  for (const line of markdown.split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      currentCategory = cleanText(headingMatch[1]);
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (!bulletMatch) {
      continue;
    }

    const title = cleanText(bulletMatch[1]);
    const normalizedTitle = normalizeTitle(title);

    if (!title || !normalizedTitle) {
      continue;
    }

    records.push({
      Category: currentCategory,
      Title: title,
      NormalizedTitle: normalizedTitle,
      TokenList: getTokenList(normalizedTitle),
    });
  }

  return records;
}

async function readJobTitles(filePath) {
  const markdown = await fs.readFile(filePath, "utf8");
  return parseJobTitlesMarkdown(markdown);
}

function getJobTitleSummary(records, generatedAt) {
  const categories = new Set(records.map((record) => record.Category).filter(Boolean));
  const normalizedTitles = new Set(records.map((record) => record.NormalizedTitle).filter(Boolean));
  const duplicateTitles = records.length - normalizedTitles.size;
  const summary = {
    GeneratedAt: generatedAt,
    TotalTitles: records.length,
    UniqueCategories: categories.size,
    UniqueNormalizedTitles: normalizedTitles.size,
    DuplicateNormalizedTitles: duplicateTitles,
  };

  for (const category of Array.from(categories).sort((a, b) => a.localeCompare(b))) {
    const key = `${category.replace(/[^A-Za-z0-9]+/g, "")}Count`;
    summary[key] = records.filter((record) => record.Category === category).length;
  }

  return summary;
}

function toCsvTitleRows(records) {
  return records.map((record) => ({
    ...record,
    TokenList: record.TokenList.join(" | "),
  }));
}

module.exports = {
  getJobTitleSummary,
  normalizeTitle,
  parseJobTitlesMarkdown,
  readJobTitles,
  toCsvTitleRows,
};
