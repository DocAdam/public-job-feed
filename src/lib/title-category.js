const titleCategories = [
  "Technical Writing",
  "Documentation Engineering",
  "Content Writing",
  "Content Design / UX Writing",
  "Developer Relations",
  "Knowledge Management",
  "Technical Content",
  "Management / Leadership",
  "Adjacent Roles",
  "Unknown",
];

function normalizeTitleText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function categorizeTitle(title) {
  const text = normalizeTitleText(title);
  if (!text) return "Unknown";

  if (hasAny(text, [
    /\b(documentation|docs?)\s+(engineer|engineering|developer|architect|platform|systems?)\b/,
    /\bdeveloper documentation\b/,
    /\bapi documentation\b/,
    /\bdocs platform\b/,
  ])) {
    return "Documentation Engineering";
  }

  if (hasAny(text, [
    /\b(head|director|manager|lead|principal)\b.*\b(technical publications|documentation|technical writing)\b/,
    /\b(technical publications|documentation|technical writing)\b.*\b(head|director|manager|lead|principal)\b/,
  ])) {
    return "Management / Leadership";
  }

  if (hasAny(text, [
    /\btechnical writers?\b/,
    /\btech writer\b/,
    /\btechnical author\b/,
    /\btechnical communicator\b/,
    /\btechnical publications?\b/,
    /\btechnical writing\b/,
    /\btechnical documentation\b/,
    /\bproduct engineering writer\b/,
    /\bdocumentation (specialist|writer|author|lead)\b/,
    /\binformation developer\b/,
    /\bproposal writer\b/,
    /\bsop technical writer\b/,
  ])) {
    return "Technical Writing";
  }

  if (hasAny(text, [
    /\bux writer\b/,
    /\bcontent designer\b/,
    /\bproduct content designer\b/,
    /\bconversation designer\b/,
    /\bcontent design\b/,
    /\bproduct writer\b.*\bux\b/,
    /\bcontent architect\b/,
  ])) {
    return "Content Design / UX Writing";
  }

  if (hasAny(text, [
    /\bdeveloper advocate\b/,
    /\bdeveloper relations\b/,
    /\bdevrel\b/,
    /\bdeveloper experience\b/,
    /\bdeveloper community\b/,
    /\bdeveloper advocacy\b/,
    /\bdeveloper ecosystem\b/,
    /\bdeveloper success\b/,
    /\bdeveloper events\b/,
    /\bdeveloper marketing\b/,
    /\bdeveloper (enablement|growth|conference)\b/,
    /\bcommunity developer\b/,
  ])) {
    return "Developer Relations";
  }

  if (hasAny(text, [
    /\bknowledge manager\b/,
    /\bknowledge management\b/,
    /\bknowledge base\b/,
    /\bknowledge content\b/,
    /\benablement manager\b/,
  ])) {
    return "Knowledge Management";
  }

  if (hasAny(text, [
    /\btechnical content\b/,
    /\bcontent engineer\b/,
    /\btechnical editor\b/,
    /\btechnical curriculum\b/,
    /\btechnical trainer\b/,
    /\btechnical courseware\b/,
    /\btechnical training\b/,
    /\btraining content developer\b/,
    /\blearning content developer\b/,
    /\bcurriculum content developer\b/,
    /\belearning content developer\b/,
    /\bassessment developer\b/,
  ])) {
    return "Technical Content";
  }

  if (hasAny(text, [
    /\bcontent writer\b/,
    /\bcopywriter\b/,
    /\bwriter editor\b/,
    /\bcontent editor\b/,
    /\bseo content\b/,
    /\bcontent manager\b/,
    /\bmarketing content\b/,
    /\bcontent marketing\b/,
    /\bbranded content\b/,
    /\bsocial media content\b/,
    /\bcontent developer\b/,
    /\bwriter\s*(?:\/|and|&)\s*editor\b/,
    /\beditor\s*(?:\/|and|&)\s*writer\b/,
    /\bscript writer\b/,
    /\bwriter\b.*\beditor\b/,
    /\beditor\b.*\bwriter\b/,
  ])) {
    return "Content Writing";
  }

  if (hasAny(text, [
    /\b(head|director|manager|lead|principal)\b.*\b(documentation|content|knowledge|developer experience|technical writing|technical writer)\b/,
    /\b(documentation|content|knowledge|developer experience|technical writing|technical writer)\b.*\b(head|director|manager|lead|principal)\b/,
  ])) {
    return "Management / Leadership";
  }

  if (hasAny(text, [
    /\btechnical product manager\b/,
    /\bproduct manager\b/,
    /\bsolutions architect\b/,
    /\bsolution architect\b/,
    /\bmember of technical staff\b/,
    /\bsoftware engineer\b/,
    /\bsearch engineer\b/,
    /\bclinical context engineer\b/,
    /\bai enablement engineer\b/,
    /\bcontext engineer\b/,
    /\btechnical developer\b/,
    /\btechnical consultant\b/,
    /\btechnical support\b/,
    /\btechnical program manager\b/,
    /\binformation (?:security )?architect\b/,
    /\binformation architecture\b/,
    /\bdocument specialist\b/,
    /\bdocument analyst\b/,
    /\bdeveloper\b/,
    /\bengineer\b/,
    /\barchitect\b/,
    /\btechnical\b/,
  ])) {
    return "Adjacent Roles";
  }

  return "Unknown";
}

module.exports = {
  categorizeTitle,
  titleCategories,
};
