/**
 * Core work arrangement detection engine
 *
 * Detects remote/onsite/hybrid status and geographic eligibility from job text.
 */

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function getHaystack(job) {
  return normalizeText([job.Title, job.Location, job.RawLocation, job.Description].join(" "));
}

function getRemoteSignal(text) {
  const signals = [];

  if (/\bremote\b/.test(text)) signals.push("remote");
  if (/\bremote\s*[-,]?\s*(us|u\.s\.|usa|united states)\b/.test(text)) signals.push("remote us");
  if (/\banywhere in (the )?(us|u\.s\.|usa|united states)\b/.test(text)) signals.push("anywhere in the us");
  if (/\bdistributed (team|company|workforce|organization|org)\b/.test(text)) signals.push("distributed");
  if (/\bwork from home\b|\bwork-from-home\b/.test(text)) signals.push("work from home");
  if (/\bhybrid\b/.test(text)) signals.push("hybrid");
  if (/\boffice days\b|\bin-office\b|\bin office\b|\bonsite days\b/.test(text)) signals.push("office days");
  if (/\bonsite\b|\bon-site\b|\boffice-based\b/.test(text)) signals.push("onsite");
  if (/\bmust be located in\b/.test(text)) signals.push("must be located in");
  if (/\bbased in\b/.test(text)) signals.push("based in");

  return Array.from(new Set(signals));
}

function getCountrySignal(text, remoteSignals) {
  const signals = [];

  if (/\bunited states\b|\bu\.s\.\b|\busa\b/.test(text)) signals.push("United States");
  if (remoteSignals.includes("remote us") || remoteSignals.includes("anywhere in the us")) {
    signals.push("United States");
  }
  if (/\bnorth america\b/.test(text)) signals.push("North America");
  if (/\bamericas\b/.test(text)) signals.push("Americas");
  if (/\bcanada\b/.test(text)) signals.push("Canada");
  if (/\bunited kingdom\b|\buk\b/.test(text)) signals.push("United Kingdom");
  if (/\beurope\b|\beu\b|\bemea\b/.test(text)) signals.push("Europe/EMEA");
  if (/\bindia\b|\bbengaluru\b|\bbangalore\b|\bdelhi\b|\bmumbai\b/.test(text)) signals.push("India");
  if (/\baustralia\b|\bnew zealand\b|\bapac\b|\bsingapore\b|\bjapan\b/.test(text)) signals.push("APAC");

  return Array.from(new Set(signals));
}

function hasCitySpecificLocation(job, text) {
  const location = normalizeText(job.Location || job.RawLocation);

  if (!location) {
    return false;
  }

  if (/\bremote\b|\banywhere\b|\bglobal\b|\bworldwide\b/.test(location)) {
    return false;
  }

  return /\bbased in\b|\bmust be located in\b/.test(text) || location.length > 0;
}

function getRemoteStatus(signals, job, text) {
  if (signals.some((signal) => ["hybrid", "office days"].includes(signal))) {
    return "Hybrid";
  }

  if (signals.some((signal) => ["remote", "remote us", "anywhere in the us", "distributed", "work from home"].includes(signal))) {
    return "Remote";
  }

  if (signals.some((signal) => ["onsite", "must be located in"].includes(signal))) {
    return "Onsite";
  }

  if (hasCitySpecificLocation(job, text)) {
    return "Onsite";
  }

  return "Unknown";
}

function getRemoteConfidence(remoteStatus, signals, countrySignals) {
  if (remoteStatus === "Unknown") {
    return "none";
  }

  if (remoteStatus === "Remote" && countrySignals.length > 0) {
    return "high";
  }

  if (remoteStatus === "Remote") {
    return "medium";
  }

  if (remoteStatus === "Hybrid" || remoteStatus === "Onsite") {
    return signals.length > 0 ? "high" : "medium";
  }

  return "low";
}

function getUSRemoteEligible(remoteStatus, countrySignals) {
  const hasUsSignal = countrySignals.some((signal) =>
    ["United States", "North America", "Americas"].includes(signal)
  );
  const hasNonUsOnlySignal =
    countrySignals.length > 0 &&
    !hasUsSignal &&
    countrySignals.every((signal) => signal !== "United States");

  if (remoteStatus === "Onsite" || remoteStatus === "Hybrid") {
    return false;
  }

  if (remoteStatus === "Remote" && hasUsSignal) {
    return true;
  }

  if (remoteStatus === "Remote" && hasNonUsOnlySignal) {
    return false;
  }

  if (remoteStatus === "Remote") {
    return "unknown";
  }

  return "unknown";
}

function getLocationRisk(remoteStatus, usRemoteEligible, countrySignals) {
  if (remoteStatus === "Remote" && usRemoteEligible === true) {
    return "LOW";
  }

  if (remoteStatus === "Remote" && usRemoteEligible === false) {
    return "HIGH";
  }

  if (
    remoteStatus === "Remote" &&
    (usRemoteEligible === "unknown" ||
      countrySignals.some((signal) => ["North America", "Americas"].includes(signal)))
  ) {
    return "MEDIUM";
  }

  if (remoteStatus === "Onsite" || remoteStatus === "Hybrid") {
    return "HIGH";
  }

  return "UNKNOWN";
}

function getReviewReason(remoteStatus, usRemoteEligible, signals, countrySignals) {
  if (remoteStatus === "Remote" && usRemoteEligible === true) {
    return "Remote role with US eligibility signal";
  }

  if (remoteStatus === "Remote" && usRemoteEligible === false) {
    return "Remote signal found, but location appears non-US or location-limited";
  }

  if (remoteStatus === "Remote") {
    return "Remote role but country eligibility is unclear";
  }

  if (remoteStatus === "Hybrid") {
    return "Hybrid or office-days signal found";
  }

  if (remoteStatus === "Onsite") {
    return signals.includes("must be located in") || signals.includes("based in")
      ? "Location-specific requirement found"
      : "City-specific or onsite location signal found";
  }

  if (countrySignals.length > 0) {
    return "Country or region signal found, but work arrangement is unclear";
  }

  return "Insufficient location/work arrangement signal";
}

/**
 * Detect work arrangement and geographic eligibility from job record.
 *
 * @param {Object} job - Job record with Title, Location, RawLocation, Description fields
 * @returns {Object} WorkArrangementResult object
 */
function detectWorkArrangement(job) {
  const text = getHaystack(job);
  const remoteSignals = getRemoteSignal(text);
  const countrySignals = getCountrySignal(text, remoteSignals);
  const remoteStatus = getRemoteStatus(remoteSignals, job, text);
  const usRemoteEligible = getUSRemoteEligible(remoteStatus, countrySignals);

  return {
    RemoteStatus: remoteStatus,
    RemoteSignal: remoteSignals.join(" | "),
    RemoteConfidence: getRemoteConfidence(remoteStatus, remoteSignals, countrySignals),
    LocationCountrySignal: countrySignals.join(" | "),
    USRemoteEligible: usRemoteEligible,
    LocationRisk: getLocationRisk(remoteStatus, usRemoteEligible, countrySignals),
    LocationReviewReason: getReviewReason(remoteStatus, usRemoteEligible, remoteSignals, countrySignals),
  };
}

module.exports = {
  detectWorkArrangement,
};
