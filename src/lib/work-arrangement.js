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

const greenhouseRemoteWorkDenialPatterns = [
  /\b(?:do|does|did|will)\s+not\s+(?:offer|allow|support|permit)\s+remote(?![- ]only)(?:\s+work(?:ing)?)?\b/i,
  /\bno\s+(?:option\s+for\s+)?remote(?![- ]only)(?:\s+work(?:ing)?)?\b/i,
  /\bremote(?:\s+work(?:ing)?)?\s+(?:is|are|will be)\s+not\s+(?:available|offered|allowed|supported|permitted)\b/i,
  /\bremote(?:\s+work(?:ing)?)?\s+options?\s+(?:is|are)\s+currently\s+unavailable\b/i,
  /\bnot\s+(?:a\s+)?remote\s+(?:role|position|job|opportunity)\b/i,
  /\bnot\s+remote\b(?![- ]only)/i,
];

const greenhouseRemoteNegationPatterns = [
  ...greenhouseRemoteWorkDenialPatterns,
  /\b(?:do|does|did|will)\s+not\s+(?:offer|allow|support|permit)\s+fully\s+remote(?:\s+work(?:ing)?)?\b/i,
  /\bno\s+(?:option\s+for\s+)?fully\s+remote(?:\s+work(?:ing)?)?\b/i,
  /\b(?:do|does|did|will)\s+not\s+(?:offer|allow|support|permit)\s+remote[- ]only(?:\s+(?:roles?|positions?|jobs?))?\b/i,
  /\bno\s+remote[- ]only(?:\s+(?:roles?|positions?|jobs?))?\b/i,
  /\bnot\s+fully\s+remote\b/i,
  /\bnot\s+remote[- ]only\b/i,
];

const greenhouseFullTimeOfficePatterns = [
  /\bmonday\s*(?:-|–|—|to|through)\s*friday\b[^.]{0,160}\b(?:we|you|employees?|team|this role|the role)\b[^.]{0,80}\b(?:work(?:s|ing)?|thrive(?:s|d|ing)?)\s+(?:from|in|at)\b[^.]{0,80}\boffice\b/i,
  /\bfull[- ]time\b[^.]{0,60}\bin[- ]office\s+(?:presence|attendance)\b/i,
  /\b(?:five|5)\s+days?\s+(?:a|per|each)\s+week\b[^.]{0,160}\b(?:in|at|from)\b[^.]{0,80}\boffice\b/i,
  /\b(?:in|at|from)\b[^.]{0,80}\boffice\b[^.]{0,100}\b(?:every\s+(?:workday|weekday)|(?:five|5)\s+days?\s+(?:a|per|each)\s+week)\b/i,
];

const greenhouseExplicitHybridPatterns = [
  /\bthis\s+(?:is\s+)?(?:a\s+)?hybrid\s+(?:role|position|job)\b/i,
  /\bthis\s+(?:role|position|job)\s+(?:is|will be)\s+(?:a\s+)?hybrid\b/i,
  /\bhybrid\s+(?:role|position|job|schedule|model|work(?:ing)?(?:\s+arrangement)?)\b/i,
  /\b[23]\s*x\s+(?:in|at)\s+(?:the\s+)?office\s*(?:,|;|\/|\band\b)\s*[23]\s*x\s+(?:wfh|(?:work(?:ing)?\s+)?from\s+home|remote)\b/i,
  /\b(?:two|three|2|3)\s+days?\b[^.]{0,100}\boffice\b[^.]{0,120}\b(?:two|three|2|3)\s+days?\b[^.]{0,80}\b(?:home|remote)\b/i,
  /\b(?:two|three|2|3)\s+days?\b[^.]{0,80}\b(?:home|remote)\b[^.]{0,120}\b(?:two|three|2|3)\s+days?\b[^.]{0,100}\boffice\b/i,
];

const greenhouseExplicitRemoteArrangementPatterns = [
  /\bfully\s+remote\b/i,
  /\bremote\s+(?:role|position|job|work|working|setting|environment)\b/i,
  /\bwork(?:ing)?\s+remotely\b/i,
];

const greenhouseConditionalOfficePattern =
  /\b(?:candidates?|employees?|team members?|people|new hires?)\b[^.]{0,100}\b(?:hired|based|located|living|working)\s+(?:in|within)\s+(?:these|those|the\s+(?:above|listed|named))\s+(?:locations|areas|metros|regions)\b[^.]{0,140}\b(?:will be\s+)?(?:expected|required)\s+to\s+(?:work|be)\b[^.]{0,100}\b(?:from|in|at)\b[^.]{0,80}\boffice\b[^.]{0,100}\b(?:at least\s+)?(?:one|two|three|four|1|2|3|4)\s+days?\s+(?:a|per|each)\s+week\b/i;

const greenhouseQualifyingGeographyPatterns = [
  /\b(?:primarily\s+)?(?:seeking|hiring|considering)\s+(?:qualified\s+)?candidates?\s+(?:who\s+are\s+)?(?:based|located|living)\s+in\b/i,
  /\bcandidates?\b[^.]{0,80}\b(?:must|should|need to)\s+be\s+(?:based|located|living)\s+in\b/i,
];

const greenhouseRemoteOutsideNamedLocationsPatterns = [
  /\b(?:candidates?|employees?|team members?|people)\s+(?:who\s+are\s+)?(?:based|located|living)\s+outside\s+(?:of\s+)?(?:these|those|the\s+(?:above|listed|named))\s+(?:locations|areas|metros|regions)\b[^.]{0,120}\b(?:may|can|are\s+(?:allowed|permitted|eligible)\s+to)\s+(?:work|be)\s+(?:fully\s+)?remote(?:ly)?\b/i,
  /\b(?:candidates?|employees?|team members?|people)\s+outside\s+(?:of\s+)?(?:these|those|the\s+(?:above|listed|named))\s+(?:locations|areas|metros|regions)\b[^.]{0,120}\b(?:may|can|are\s+(?:allowed|permitted|eligible)\s+to)\s+(?:work|be)\s+(?:fully\s+)?remote(?:ly)?\b/i,
  /\boutside\s+(?:of\s+)?(?:these|those|the\s+(?:above|listed|named))\s+(?:locations|areas|metros|regions)\b[^.]{0,120}\b(?:fully\s+remote|work\s+remotely)\b/i,
];

function getGreenhouseSentences(value) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [];
}

function getGreenhouseConditionalOfficeEvidence(description) {
  const sentences = getGreenhouseSentences(description);
  const officeIndex = sentences.findIndex((sentence) => greenhouseConditionalOfficePattern.test(sentence));

  if (officeIndex < 0) {
    return {
      hasConditionalOfficeRequirement: false,
      qualifyingGeography: "",
      officeRequirement: "",
      explicitlyPermitsRemoteOutside: false,
      remoteOutsideEvidence: "",
    };
  }

  const qualifyingGeography = sentences
    .slice(Math.max(0, officeIndex - 2), officeIndex)
    .reverse()
    .find((sentence) => greenhouseQualifyingGeographyPatterns.some((pattern) => pattern.test(sentence))) || "";

  if (!qualifyingGeography) {
    return {
      hasConditionalOfficeRequirement: false,
      qualifyingGeography: "",
      officeRequirement: "",
      explicitlyPermitsRemoteOutside: false,
      remoteOutsideEvidence: "",
    };
  }

  const remoteOutsideEvidence = sentences.find((sentence) =>
    greenhouseRemoteOutsideNamedLocationsPatterns.some((pattern) => pattern.test(sentence))
  ) || "";

  return {
    hasConditionalOfficeRequirement: true,
    qualifyingGeography,
    officeRequirement: sentences[officeIndex],
    explicitlyPermitsRemoteOutside: Boolean(remoteOutsideEvidence),
    remoteOutsideEvidence,
  };
}

function locationMatchesQualifyingGeography(job, qualifyingGeography) {
  const rawLocation = cleanText(job.Location || job.RawLocation);
  if (!rawLocation || /\bremote\b|\banywhere\b|\bglobal\b|\bworldwide\b/i.test(rawLocation)) {
    return false;
  }

  const normalizeLocation = (value) => normalizeText(value)
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const geography = normalizeLocation(qualifyingGeography);
  const locationCandidates = Array.from(new Set([
    normalizeLocation(rawLocation),
    normalizeLocation(rawLocation.split(",")[0]),
  ])).filter((value) => value.length >= 5);

  return locationCandidates.some((location) => geography.includes(location));
}

function getGreenhouseRoleEvidence(job) {
  const description = normalizeText(job.Description);
  const conditionalOffice = getGreenhouseConditionalOfficeEvidence(job.Description);

  return {
    hasRemoteNegation: greenhouseRemoteNegationPatterns.some((pattern) => pattern.test(description)),
    deniesRemoteWork: greenhouseRemoteWorkDenialPatterns.some((pattern) => pattern.test(description)),
    hasExplicitHybrid: greenhouseExplicitHybridPatterns.some((pattern) => pattern.test(description)),
    hasExplicitRemoteArrangement: greenhouseExplicitRemoteArrangementPatterns.some((pattern) => pattern.test(description)),
    requiresFullTimeOffice: greenhouseFullTimeOfficePatterns.some((pattern) => pattern.test(description)),
    conditionalOffice,
  };
}

function removeGreenhouseRemoteNegations(text) {
  return greenhouseRemoteNegationPatterns.reduce(
    (result, pattern) => result.replace(new RegExp(pattern.source, "gi"), " "),
    text
  );
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

function getRemoteStatus(signals, job, text, options = {}) {
  if (signals.some((signal) => ["hybrid", "office days"].includes(signal))) {
    return "Hybrid";
  }

  if (signals.some((signal) => ["remote", "remote us", "anywhere in the us", "distributed", "work from home"].includes(signal))) {
    return "Remote";
  }

  if (signals.some((signal) => ["onsite", "must be located in"].includes(signal))) {
    return "Onsite";
  }

  if (options.allowCityFallback !== false && hasCitySpecificLocation(job, text)) {
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

function detectWorkArrangement(job, structuredEvidence = {}, options = {}) {
  const text = getHaystack(job);
  const isGreenhouse = normalizeText(options.ats) === "greenhouse";
  const greenhouseEvidence = isGreenhouse
    ? getGreenhouseRoleEvidence(job)
    : {
      hasRemoteNegation: false,
      deniesRemoteWork: false,
      hasExplicitHybrid: false,
      hasExplicitRemoteArrangement: false,
      requiresFullTimeOffice: false,
      conditionalOffice: {
        hasConditionalOfficeRequirement: false,
        qualifyingGeography: "",
        officeRequirement: "",
        explicitlyPermitsRemoteOutside: false,
        remoteOutsideEvidence: "",
      },
    };
  const signalText = isGreenhouse && greenhouseEvidence.hasRemoteNegation
    ? removeGreenhouseRemoteNegations(text)
    : text;
  const remoteSignals = getRemoteSignal(signalText);
  if (isGreenhouse && greenhouseEvidence.hasExplicitHybrid && !remoteSignals.includes("hybrid")) {
    remoteSignals.push("hybrid");
  }
  const greenhouseFullWeekOnsite = (
    greenhouseEvidence.deniesRemoteWork &&
    greenhouseEvidence.requiresFullTimeOffice &&
    !greenhouseEvidence.hasExplicitHybrid
  );
  const greenhouseConditionalOfficeApplies = (
    greenhouseEvidence.conditionalOffice.hasConditionalOfficeRequirement &&
    locationMatchesQualifyingGeography(
      job,
      greenhouseEvidence.conditionalOffice.qualifyingGeography
    )
  );
  const greenhouseConditionalHybrid = (
    greenhouseConditionalOfficeApplies &&
    (greenhouseEvidence.hasExplicitRemoteArrangement || greenhouseEvidence.hasExplicitHybrid)
  );
  const greenhouseConditionalOfficeUnresolved = (
    greenhouseEvidence.conditionalOffice.hasConditionalOfficeRequirement &&
    !greenhouseEvidence.conditionalOffice.explicitlyPermitsRemoteOutside &&
    !greenhouseEvidence.hasExplicitHybrid &&
    !greenhouseConditionalOfficeApplies
  );
  const statusSignals = isGreenhouse && greenhouseEvidence.hasRemoteNegation && !greenhouseFullWeekOnsite
    ? remoteSignals.filter((signal) => !["onsite", "must be located in"].includes(signal))
    : remoteSignals;
  const textCountrySignals = getCountrySignal(signalText, remoteSignals);
  const textRemoteStatus = greenhouseFullWeekOnsite
    ? "Onsite"
    : greenhouseConditionalHybrid
      ? "Hybrid"
      : greenhouseConditionalOfficeUnresolved
        ? "Unknown"
        : getRemoteStatus(statusSignals, job, signalText, {
          allowCityFallback: !(isGreenhouse && greenhouseEvidence.hasRemoteNegation),
        });
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

  if (greenhouseFullWeekOnsite) {
    remoteSignals.push("full-time office attendance", "remote work denied");
    diagnostics.push("Greenhouse role evidence: full-time office attendance and remote work denied");
  } else if (
    greenhouseEvidence.deniesRemoteWork &&
    greenhouseEvidence.requiresFullTimeOffice &&
    greenhouseEvidence.hasExplicitHybrid
  ) {
    diagnostics.push(
      "Work arrangement conflict: explicit Hybrid evidence conflicts with full-time office attendance and remote-work denial; Hybrid retained"
    );
  } else if (greenhouseEvidence.hasRemoteNegation && textRemoteStatus === "Unknown") {
    diagnostics.push(
      "Work arrangement review: remote wording is negated, but full-week office attendance is not established"
    );
  }

  if (greenhouseEvidence.conditionalOffice.hasConditionalOfficeRequirement) {
    remoteSignals.push("conditional office requirement");
    const qualifyingGeography = greenhouseEvidence.conditionalOffice.qualifyingGeography;
    const officeRequirement = greenhouseEvidence.conditionalOffice.officeRequirement;

    if (greenhouseConditionalOfficeApplies) {
      remoteSignals.push("office days in qualifying location");
      diagnostics.push(
        `Greenhouse role evidence: recurring office requirement applies to this posting location (posting location: ${cleanText(job.Location || job.RawLocation)}; qualifying geography: ${qualifyingGeography}; office requirement: ${officeRequirement})`
      );
    } else if (greenhouseEvidence.conditionalOffice.explicitlyPermitsRemoteOutside) {
      remoteSignals.push("fully remote outside named locations");
      diagnostics.push(
        `Greenhouse role evidence: recurring office requirement applies to named candidate locations, and the source explicitly permits fully remote work outside them (qualifying geography: ${qualifyingGeography}; office requirement: ${officeRequirement}; remote evidence: ${greenhouseEvidence.conditionalOffice.remoteOutsideEvidence})`
      );
    } else if (greenhouseEvidence.hasExplicitHybrid) {
      diagnostics.push(
        `Work arrangement note: explicit Hybrid evidence retained; a recurring office requirement is tied to named candidate locations (qualifying geography: ${qualifyingGeography}; office requirement: ${officeRequirement})`
      );
    } else {
      diagnostics.push(
        `Work arrangement review: recurring office requirement applies to named candidate locations, but fully remote eligibility outside them is not stated (qualifying geography: ${qualifyingGeography}; office requirement: ${officeRequirement})`
      );
    }
  }

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
