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

function addUniqueSignals(...signalGroups) {
  return Array.from(new Set(signalGroups.flat().filter(Boolean)));
}

function getAshbyLocationCountrySignals(job) {
  const location = normalizeText(job.Location || job.RawLocation);
  const signals = getCountrySignal(location, getRemoteSignal(location));

  if (/(^|[^a-z0-9])us([^a-z0-9]|$)/.test(location)) {
    signals.push("United States");
  }

  if (/\bgermany\b/.test(location)) {
    signals.push("Germany");
  }

  if (
    /,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)\b/.test(location)
  ) {
    signals.push("United States");
  }

  if (/,\s*(ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt)\b/.test(location)) {
    signals.push("Canada");
  }

  return addUniqueSignals(signals);
}

function getStructuredCountrySignals(addressCountries) {
  const values = Array.isArray(addressCountries) ? addressCountries : [addressCountries];
  const signals = [];

  for (const value of values) {
    for (const rawPart of cleanText(value).split(/\s*(?:\||;|\/)\s*/)) {
      const part = cleanText(rawPart);
      const normalized = normalizeText(part).replace(/\./g, "");
      if (!normalized) continue;

      if (["us", "usa", "united states", "united states of america"].includes(normalized)) {
        signals.push("United States");
      } else if (["ca", "canada"].includes(normalized)) {
        signals.push("Canada");
      } else if (["uk", "gb", "gbr", "united kingdom"].includes(normalized)) {
        signals.push("United Kingdom");
      } else if (["eu", "europe", "european union", "emea"].includes(normalized)) {
        signals.push("Europe/EMEA");
      } else if (["de", "deu", "germany"].includes(normalized)) {
        signals.push("Germany");
      } else if (["au", "aus", "australia"].includes(normalized)) {
        signals.push("APAC");
      } else if (["in", "ind", "india"].includes(normalized)) {
        signals.push("India");
      } else {
        signals.push(part);
      }
    }
  }

  return addUniqueSignals(signals);
}

function getRoleDescriptionCountrySignals(job) {
  const description = cleanText(job.Description);
  if (!description) return [];

  const roleSpecificPattern = /\b(this|the)\s+(role|position|job)\b|\b(candidate|applicant)s?\b|\bmust\s+(be|reside|live|work)\b|\bopen to\b|\bavailable (to|in|only)\b|\beligib(le|ility)\b|\blocated in\b|\bbased in\b|\bwork(ing)? (from|in)\b/;
  const salaryPattern = /\bsalary\b|\bcompensation\b|\bpay range\b|\bbase pay\b|\bannual base\b|\bpay transparency\b|\b(?:usd|cad|gbp|eur)\b/;
  const signals = [];

  for (const sentence of description.split(/(?<=[.!?])\s+|\n+/)) {
    const normalized = normalizeText(sentence);
    if (!normalized || salaryPattern.test(normalized) || !roleSpecificPattern.test(normalized)) {
      continue;
    }

    signals.push(...getAshbyLocationCountrySignals({ Location: sentence }));
  }

  return addUniqueSignals(signals);
}

function getAshbyCountryEvidence(job, addressCountries) {
  const structuredSignals = getStructuredCountrySignals(addressCountries);
  const locationSignals = getAshbyLocationCountrySignals(job);
  const descriptionSignals = structuredSignals.length === 0 && locationSignals.length === 0
    ? getRoleDescriptionCountrySignals(job)
    : [];
  const diagnostics = [];

  if (
    structuredSignals.length > 0 &&
    locationSignals.length > 0 &&
    !structuredSignals.some((signal) => locationSignals.includes(signal))
  ) {
    diagnostics.push(
      `Country evidence conflict: structured address=${structuredSignals.join("|")} differs from posting location=${locationSignals.join("|")}`
    );
  }

  return {
    countrySignals: addUniqueSignals(structuredSignals, locationSignals, descriptionSignals),
    diagnostics,
  };
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

function getRecognizedWorkplaceType(value) {
  const normalized = normalizeText(value).replace(/[\s_-]+/g, "");

  if (normalized === "remote") return "Remote";
  if (normalized === "hybrid") return "Hybrid";
  if (normalized === "onsite") return "Onsite";
  return "";
}

function getStructuredWorkArrangement(workplaceType, isRemote) {
  const rawWorkplaceType = cleanText(workplaceType);
  const recognizedWorkplaceType = getRecognizedWorkplaceType(rawWorkplaceType);
  const hasIsRemote = typeof isRemote === "boolean";
  const remoteStatus = recognizedWorkplaceType;
  const evidence = [];
  const diagnostics = [];

  if (rawWorkplaceType) evidence.push(`workplaceType=${rawWorkplaceType}`);
  if (hasIsRemote) evidence.push(`isRemote=${isRemote}`);

  if (rawWorkplaceType && !recognizedWorkplaceType) {
    diagnostics.push(`Unrecognized workplaceType=${rawWorkplaceType}`);
  }

  const expectedIsRemote = recognizedWorkplaceType
    ? recognizedWorkplaceType !== "Onsite"
    : null;

  if (hasIsRemote && expectedIsRemote !== null && expectedIsRemote !== isRemote) {
    diagnostics.push(`Work arrangement conflict: workplaceType=${rawWorkplaceType} conflicts with isRemote=${isRemote}`);
  }

  return {
    remoteStatus,
    evidence,
    diagnostics,
  };
}

function hasExplicitRoleOfficeRequirement(job) {
  const description = normalizeText(job.Description);
  if (!description) return false;

  return (
    /\bthis (is )?(a )?hybrid (role|position|job)\b/.test(description) ||
    /\bthis (role|position|job) (is|will be) hybrid\b/.test(description) ||
    /\b(this (role|position|job)|you) (requires?|will be required|will be expected|are expected)\b[^.]{0,160}\b(in[- ]office|from [^.]{0,80}\boffice|at [^.]{0,80}\boffice)\b/.test(description) ||
    /\b\d+\s+days?\s+(a|per|each)\s+week\b[^.]{0,100}\b(in|at|from)\b[^.]{0,80}\boffice\b/.test(description)
  );
}

function getArrangementConflictDiagnostic(job, structuredStatus, textStatus) {
  if (structuredStatus === "Remote" && ["Hybrid", "Onsite"].includes(textStatus)) {
    if (hasExplicitRoleOfficeRequirement(job)) {
      return `Work arrangement review: explicit role-specific office requirement conflicts with structured Remote (text classification=${textStatus})`;
    }

    if (textStatus === "Hybrid") {
      return "Work arrangement note: structured Remote overrides hybrid text with no explicit role-specific office-day requirement";
    }
  }

  return `Work arrangement conflict: structured ${structuredStatus} overrides text classification=${textStatus}`;
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
    countrySignals.length > 0 && !hasUsSignal && countrySignals.every((signal) => signal !== "United States");

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

function detectWorkArrangement(job, structuredEvidence = {}) {
  const text = getHaystack(job);
  const remoteSignals = getRemoteSignal(text);
  const textCountrySignals = getCountrySignal(text, remoteSignals);
  const textRemoteStatus = getRemoteStatus(remoteSignals, job, text);
  const structured = getStructuredWorkArrangement(
    structuredEvidence.workplaceType,
    structuredEvidence.isRemote
  );
  const remoteStatus = structured.remoteStatus || textRemoteStatus;
  const hasAshbyCountryEvidence = Object.prototype.hasOwnProperty.call(
    structuredEvidence,
    "addressCountries"
  );
  const countryEvidence = hasAshbyCountryEvidence
    ? getAshbyCountryEvidence(job, structuredEvidence.addressCountries)
    : { countrySignals: textCountrySignals, diagnostics: [] };
  const countrySignals = countryEvidence.countrySignals;
  const usRemoteEligible = getUSRemoteEligible(remoteStatus, countrySignals);
  const diagnostics = [...structured.diagnostics, ...countryEvidence.diagnostics];

  if (structured.remoteStatus && textRemoteStatus !== "Unknown" && textRemoteStatus !== structured.remoteStatus) {
    diagnostics.push(getArrangementConflictDiagnostic(job, structured.remoteStatus, textRemoteStatus));
  }

  const locationReviewReason = getReviewReason(remoteStatus, usRemoteEligible, remoteSignals, countrySignals);

  return {
    RemoteStatus: remoteStatus,
    RemoteSignal: [...structured.evidence, ...remoteSignals].join(" | "),
    RemoteConfidence: structured.remoteStatus
      ? "high"
      : getRemoteConfidence(remoteStatus, remoteSignals, countrySignals),
    LocationCountrySignal: countrySignals.join(" | "),
    USRemoteEligible: usRemoteEligible,
    LocationRisk: getLocationRisk(remoteStatus, usRemoteEligible, countrySignals),
    LocationReviewReason: [locationReviewReason, ...diagnostics].join("; "),
  };
}

module.exports = {
  detectWorkArrangement,
};
