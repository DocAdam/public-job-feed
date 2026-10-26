// Offline extraction only. No source requests are made by this module.
const EMPLOYMENT_FIELDS = ["EmploymentSchedule", "EmploymentTerms", "EmploymentTypeStatus", "EmploymentTypeEvidence"];
const SCHEDULES = ["Full-time", "Part-time", "Full-time or Part-time", "Variable", "Not stated"];
const TERMS = ["Contract", "Temporary", "Freelance", "Internship", "Permanent", "Regular", "Fixed-term", "Apprenticeship", "Seasonal"];
const LABEL_RULES = [
  ["schedule", "Full-time", /\bfull[\s_–—‑-]*time\b/gi],
  ["schedule", "Part-time", /\bpart[\s_–—‑-]*time\b/gi],
  ["schedule", "Variable", /\b(?:variable(?:[\s_–—‑-]+(?:hours?|schedules?|shifts?|time))?)\b/gi],
  ["terms", "Contract", /\b(?:contractor|contract)\b/gi],
  ["terms", "Temporary", /\b(?:temporary|temp)\b/gi],
  ["terms", "Freelance", /\bfreelance\b/gi],
  ["terms", "Internship", /\b(?:internship|intern)\b/gi],
  ["terms", "Permanent", /\bpermanent\b/gi],
  ["terms", "Regular", /\bregular\b/gi],
  ["terms", "Fixed-term", /\bfixed[\s_–—‑-]*term\b/gi],
  ["terms", "Apprenticeship", /\b(?:apprenticeship|apprentice)\b/gi],
  ["terms", "Seasonal", /\bseasonal\b/gi],
];
const text = value => value == null ? "" : String(value).trim();
function array(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function plain(value) {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "–").replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ").trim();
}
function labelValues(raw) {
  const value = plain(raw);
  if (/\b(?:not|no|non|without)\b/i.test(value)) return [];
  const found = LABEL_RULES.filter(([, , re]) => new RegExp(re.source, "i").test(value))
    .map(([Dimension, Value]) => ({ Dimension, Value }));
  if (found.some(e => e.Value === "Full-time") && found.some(e => e.Value === "Part-time") && /\bor\b|\//i.test(value)) {
    return [{ Dimension: "schedule", Value: "Full-time or Part-time" }, ...found.filter(e => e.Dimension !== "schedule")];
  }
  return found;
}
function structuredValues(raw) {
  if (Array.isArray(raw)) return raw.flatMap(structuredValues);
  const value = typeof raw === "object" ? raw?.label || raw?.name || raw?.descriptor || raw?.value : raw;
  if (Array.isArray(value)) return value.flatMap(structuredValues);
  if (value == null || text(value) === "") return [];
  // Restrict structured labels to a controlled vocabulary. Keep unknown labels as evidence.
  let rest = plain(value);
  for (const [, , re] of LABEL_RULES) rest = rest.replace(re, " ");
  rest = rest.replace(/\b(?:and|or)\b/gi, "").replace(/[\s,;|/&()+_–—‑-]/g, "");
  const values = rest ? [] : labelValues(value);
  return (values.length ? values : [{ Dimension: "unknown", Value: "" }]).map(e => ({ ...e, RawValue: text(value) }));
}
function fieldsFromEvidence(evidence) {
  const schedules = new Set(evidence.filter(e => e.Dimension === "schedule").map(e => e.Value));
  const terms = TERMS.filter(term => evidence.some(e => e.Dimension === "terms" && e.Value === term));
  // Variable hours or shifts can coexist with full-time or part-time hours.
  const resolvedSchedules = new Set([...schedules].filter(value => value !== "Variable"));
  if (!resolvedSchedules.size && schedules.has("Variable")) resolvedSchedules.add("Variable");
  const explicitAlternative = resolvedSchedules.has("Full-time or Part-time");
  const conflict = (resolvedSchedules.size > 1 && !explicitAlternative) || (terms.includes("Permanent") && terms.some(t => ["Contract", "Temporary", "Fixed-term", "Seasonal"].includes(t)));
  const unique = [...new Map(evidence.map(e => [JSON.stringify(e), e])).values()];
  return {
    EmploymentSchedule: explicitAlternative ? "Full-time or Part-time" : resolvedSchedules.size === 1 ? [...resolvedSchedules][0] : "Not stated",
    EmploymentTerms: terms,
    EmploymentTypeStatus: conflict ? "conflict" : schedules.size || terms.length ? "stated" : "not_stated",
    EmploymentTypeEvidence: unique,
  };
}
// Patterns require a role qualifier or a labeled statement. A bare keyword is insufficient.
function textEvidence(row, observedAt) {
  const evidence = [];
  const sourceURL = text(row.URL || row.RawJobURL || row.FetchURL);
  function add(passage, sourceField, sourceKind) {
    for (const item of labelValues(passage)) evidence.push({ ...item, RawValue: passage, SourceField: sourceField, SourceKind: sourceKind, SourceURL: sourceURL, ObservedAt: observedAt });
  }
  const title = plain(row.Title);
  for (const [dimension, , re] of LABEL_RULES) {
    for (const match of title.matchAll(new RegExp(re.source, "gi"))) {
      const before = title.slice(0, match.index), after = title.slice(match.index + match[0].length);
      if (/\b(?:not|non|no)\s*[-:]?\s*$/i.test(before)) continue;
      if (dimension === "terms" && /^\s+(?:management|manager|specialist|administrator|administration|review|negotiation|program|experience|recruitment)\b/i.test(after)) continue;
      if (dimension === "schedule" || !before || /[-–—‑(:,;/]\s*$/.test(before) || !after || /^\s*[-–—‑),;/]/.test(after) || /^\s*\(/.test(after)) {
        // Parse the whole qualifier once. This retains alternatives in one passage.
        const alternative = title.match(/\b(?:full[\s_–—‑-]*time\s*(?:or|\/)\s*part[\s_–—‑-]*time|part[\s_–—‑-]*time\s*(?:or|\/)\s*full[\s_–—‑-]*time)\b/i);
        const values = labelValues(dimension === "schedule" && alternative ? alternative[0] : match[0]).filter(item => item.Value !== "Variable" || /\bvariable[\s_–—‑-]+(?:hours?|schedules?|shifts?|time)\b/i.test(match[0]));
        for (const item of values) evidence.push({ ...item, RawValue: text(row.Title), SourceField: "Title", SourceKind: "title", SourceURL: sourceURL, ObservedAt: observedAt });
        break;
      }
    }
  }
  const description = plain(row.Description);
  const token = "(?:full[\\s_–—‑-]*time|part[\\s_–—‑-]*time|contractor|contract|temporary|temp|freelance|internship|intern|permanent|regular|fixed[\\s_–—‑-]*term|apprenticeship|apprentice|seasonal|variable(?:[\\s_–—‑-]+(?:hours?|schedules?|shifts?|time))?)";
  const label = new RegExp("\\b(?:employment\\s+(?:type|status)|position\\s+type|job\\s+type|schedule|commitment|contract)\\s*[:：]\\s*(" + token + "(?:\\s*(?:[,;/&-]|\\bor\\b|\\band\\b)\\s*" + token + ")*)", "gi");
  for (const match of description.matchAll(label)) {
    const before = description.slice(Math.max(0, match.index - 100), match.index);
    if (/\b(?:other|another|previous|past|preferred|preference|prefer|your|you|choose|select|desired|applicant|candidate|question|benefits?|eligible|conversion|convert|future)\b[^.!?]*$/i.test(before)) continue;
    if (/\b(?:not|no)\s*$/i.test(before)) continue;
    if (/^\s*\?/.test(description.slice(match.index + match[0].length))) continue;
    add(match[1], "Description", "description");
  }
  // Match complete local statements. Exclude future, past, negated, and benefit contexts.
  const statements = description.match(/[^.!?]+(?:[.!?]|$)/g) || [];
  for (const rawPassage of statements) {
    const passage = rawPassage.trim();
    if (!passage || /\b(?:not|no|never|non|without|past|previous|prior|experience|formerly|future|convert|conversion|could|may|might|possibility|potential|prefer|preference|benefits?|eligible|equal[ -]opportunity|other role|another (?:role|position|job))\b/i.test(passage)) continue;
    const direct = new RegExp("\\b(?:this\\s+is|(?:this|the)\\s+(?:role|position|job|opportunity)\\s+(?:is|will\\s+be))\\s+(?:(?:a|an)\\s+)?(?:(?:[a-z]+|\\d+)[ -](?:months?|years?|weeks?)\\s+)?(" + token + "(?:\\s*(?:[,;/&-]|\\bor\\b|\\band\\b)\\s*" + token + ")*)", "i");
    const hiring = new RegExp("\\b(?:we\\s+are\\s+(?:hiring|seeking|looking\\s+for)|we're\\s+(?:hiring|seeking|looking\\s+for))\\s+(?:a|an)\\s+(" + token + ")\\s+(?:technical\\s+writer|writer|editor|content\\s+designer|documentation\\s+engineer)\\b", "i");
    const match = passage.match(direct) || passage.match(hiring);
    if (match && !/^\s+(?:management|manager|specialist|administrator|administration|review|negotiation|program|experience)\b/i.test(passage.slice(match.index + match[0].length))) {
      const values = labelValues(match[1]).filter(item => item.Value !== "Variable" || /\bvariable[\s_–—‑-]+(?:hours?|schedules?|shifts?|time)\b/i.test(match[1]));
      // A duration or hours phrase can stand between schedule and terms.
      // Accept a term only when it directly qualifies the current position.
      for (const qualifier of passage.matchAll(/\b(contract|temporary|freelance|internship|permanent|regular|fixed[ -]term|apprenticeship|seasonal)\s+(?:position|role|job|engagement|basis)\b/gi)) values.push(...labelValues(qualifier[1]));
      for (const item of values) evidence.push({ ...item, RawValue: passage, SourceField: "Description", SourceKind: "description", SourceURL: sourceURL, ObservedAt: observedAt });
    }
  }
  return evidence;
}

function extractEmploymentType(raw, row = raw, context = {}) {
  const ats = text(context.ats || row.ATS).toLowerCase();
  const sourceURL = text(context.fetchUrl || row.FetchURL || row.URL);
  const observedAt = text(context.fetchedAt || row.FetchedAt);
  const evidence = [];
  function field(name, value) {
    for (const item of structuredValues(value)) evidence.push({ ...item, SourceField: name, SourceKind: "structured_field", SourceURL: sourceURL, ObservedAt: observedAt });
  }
  if (ats === "ashby") field("employmentType", raw.employmentType);
  if (ats === "lever") field("categories.commitment", raw.categories?.commitment);
  if (ats === "bamboohr") {
    field("employmentStatusLabel", raw.employmentStatusLabel);
    field("employmentType", raw.employmentType);
  }
  if (ats === "workday") {
    // Only the individual search record is supported. Never inspect facets or similarJobs.
    field("timeType", raw.timeType);
    field("workerType", raw.workerType);
    field("employmentType", raw.employmentType);
  }
  if (ats === "greenhouse") {
    for (const meta of Array.isArray(raw.metadata) ? raw.metadata : []) {
      if (/^(?:employment type|employment status|job type|position type|contract type|schedule|time type|commitment)$/i.test(text(meta.name))) field(`metadata.${meta.name}`, meta.value);
    }
  }
  if (ats === "icims") {
    for (const key of ["employmentType", "employmentStatus", "positionType", "Position Type", "type", "Type"]) field(key, raw[key]);
  }
  evidence.push(...textEvidence(row, observedAt));
  return fieldsFromEvidence(evidence);
}
function ensureEmploymentType(row) {
  if (row.EmploymentTypeStatus) {
    let corrected = false;
    const evidence = array(row.EmploymentTypeEvidence).map(item => {
      const explicitLabel = /\b(?:employment\s+(?:type|status)|position\s+type|job\s+type|schedule|commitment)\s*[:：]\s*variable\b/i.test(item.RawValue || "");
      const qualified = /\bvariable[\s_–—‑-]+(?:hours?|schedules?|shifts?|time)\b/i.test(item.RawValue || "");
      if (item.Value === "Variable" && item.Dimension === "schedule" && item.SourceKind !== "structured_field" && !qualified && !(item.SourceKind === "description" && (explicitLabel || /^variable$/i.test(item.RawValue || "")))) {
        corrected = true;
        return { ...item, Dimension: "unknown", Value: "", RejectedValue: "Variable", ReviewReason: "Text does not explicitly state a variable work schedule." };
      }
      return item;
    });
    if (corrected || evidence.some(item => item.Value === "Variable" && item.Dimension === "schedule")) return fieldsFromEvidence(evidence);
    return {
      EmploymentSchedule: row.EmploymentSchedule || "Not stated",
      EmploymentTerms: TERMS.filter(t => array(row.EmploymentTerms).includes(t)),
      EmploymentTypeStatus: row.EmploymentTypeStatus,
      EmploymentTypeEvidence: evidence,
    };
  }
  return extractEmploymentType(row, row);
}
function displayEmploymentType(row) {
  const fields = ensureEmploymentType(row);
  if (fields.EmploymentTypeStatus === "conflict") return "Needs review";
  return [fields.EmploymentSchedule === "Not stated" ? "" : fields.EmploymentSchedule, ...fields.EmploymentTerms].filter(Boolean).join("; ") || "Not stated";
}
function employmentVariant(row) {
  const fields = ensureEmploymentType(row);
  // Include the underlying values so separate conflicts cannot collapse into one group.
  return JSON.stringify([fields.EmploymentSchedule, fields.EmploymentTerms, fields.EmploymentTypeStatus,
    fields.EmploymentTypeStatus === "conflict" ? fields.EmploymentTypeEvidence.map(e => [e.Dimension, e.Value]).sort() : []]);
}
function mergeEmploymentEvidence(rows) {
  return fieldsFromEvidence(rows.flatMap(row => ensureEmploymentType(row).EmploymentTypeEvidence));
}
function validatePublicEmploymentLabel(label) {
  if (["Not stated", "Needs review"].includes(label)) return true;
  if (typeof label !== "string" || !label) return false;
  const values = label.split("; ");
  const schedule = SCHEDULES.slice(0, -1).includes(values[0]) ? values.shift() : "Not stated";
  if (values.includes("Permanent") && values.some(t => ["Contract", "Temporary", "Fixed-term", "Seasonal"].includes(t))) return false;
  return (schedule !== "Not stated" || values.length > 0) && values.every(t => TERMS.includes(t))
    && JSON.stringify(values) === JSON.stringify(TERMS.filter(t => values.includes(t)));
}

function validateEmploymentType(row, options = {}) {
  if (!EMPLOYMENT_FIELDS.some(key => row[key] !== undefined)) return []; // Historical contract.
  const errors = [];
  if (!SCHEDULES.includes(row.EmploymentSchedule)) errors.push("Invalid EmploymentSchedule");
  if (!Array.isArray(row.EmploymentTerms) || row.EmploymentTerms.some(t => !TERMS.includes(t)) || JSON.stringify(row.EmploymentTerms) !== JSON.stringify(TERMS.filter(t => row.EmploymentTerms.includes(t)))) errors.push("Invalid EmploymentTerms");
  if (!["stated", "not_stated", "conflict"].includes(row.EmploymentTypeStatus)) errors.push("Invalid EmploymentTypeStatus");
  if (!Array.isArray(row.EmploymentTypeEvidence) || row.EmploymentTypeEvidence.some(e => !e || !["schedule", "terms", "unknown"].includes(e.Dimension) || !["Value", "RawValue", "SourceField", "SourceKind", "SourceURL", "ObservedAt"].every(k => typeof e[k] === "string") || !["structured_field", "title", "description"].includes(e.SourceKind) || (e.Dimension === "schedule" && (!SCHEDULES.includes(e.Value) || e.Value === "Not stated")) || (e.Dimension === "terms" && !TERMS.includes(e.Value)) || (e.Dimension === "unknown" && e.Value !== "") || (e.ObservedAt && !Number.isFinite(Date.parse(e.ObservedAt))))) errors.push("Invalid EmploymentTypeEvidence");
  if (!errors.length && options.checkConsistency !== false) {
    const derived = fieldsFromEvidence(row.EmploymentTypeEvidence);
    for (const key of ["EmploymentSchedule", "EmploymentTerms", "EmploymentTypeStatus"]) {
      if (JSON.stringify(derived[key]) !== JSON.stringify(row[key])) errors.push(`Employment evidence does not support ${key}`);
    }
  }
  return errors;
}
module.exports = { EMPLOYMENT_FIELDS, SCHEDULES, TERMS, extractEmploymentType, ensureEmploymentType, displayEmploymentType, employmentVariant, mergeEmploymentEvidence, validateEmploymentType, validatePublicEmploymentLabel, fieldsFromEvidence, plain, labelValues };
