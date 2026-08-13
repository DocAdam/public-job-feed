const atsPriority = {
  ashby: 1,
  greenhouse: 2,
  lever: 3,
  bamboohr: 4,
  workday: 5,
  icims: 6,
};

const tierPriority = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  F: 5,
};

const qualityPriority = {
  OK: 1,
  REVIEW: 2,
  BAD_ROW: 3,
};

const remotePriority = {
  Remote: 1,
  Hybrid: 2,
  Onsite: 3,
  Unknown: 4,
};

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isTrue(value) {
  return value === true || cleanText(value).toUpperCase() === "TRUE";
}

function normalizeBooleanRank(value) {
  const text = cleanText(value).toLowerCase();
  if (value === true || text === "true") return 1;
  if (text === "unknown" || text === "") return 2;
  return 3;
}

function parseDateTime(value) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareText(a, b) {
  const left = cleanText(a).toLowerCase();
  const right = cleanText(b).toLowerCase();

  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function companyLabelPenalty(value) {
  return /^(careers?|jobs?)\b/i.test(cleanText(value)) ? 1 : 0;
}

function compareRows(a, b) {
  const scoreDiff = (Number(b.WriterFitScore) || 0) - (Number(a.WriterFitScore) || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const tierDiff = (tierPriority[a.WriterFitTier] || 99) - (tierPriority[b.WriterFitTier] || 99);
  if (tierDiff !== 0) return tierDiff;

  const qualityDiff = (qualityPriority[a.ExportQualityFlag] || 99) - (qualityPriority[b.ExportQualityFlag] || 99);
  if (qualityDiff !== 0) return qualityDiff;

  const usRemoteDiff = normalizeBooleanRank(a.USRemoteEligible) - normalizeBooleanRank(b.USRemoteEligible);
  if (usRemoteDiff !== 0) return usRemoteDiff;

  const remoteDiff = (remotePriority[a.RemoteStatus] || 99) - (remotePriority[b.RemoteStatus] || 99);
  if (remoteDiff !== 0) return remoteDiff;

  const salaryDiff = Number(isTrue(b.SalaryDetected)) - Number(isTrue(a.SalaryDetected));
  if (salaryDiff !== 0) return salaryDiff;

  const atsDiff = (atsPriority[cleanText(a.ATS).toLowerCase()] || 99) - (atsPriority[cleanText(b.ATS).toLowerCase()] || 99);
  if (atsDiff !== 0) return atsDiff;

  const dateDiff = parseDateTime(b.DatePosted) - parseDateTime(a.DatePosted);
  if (dateDiff !== 0) return dateDiff;

  const companyLabelDiff = companyLabelPenalty(a.Company) - companyLabelPenalty(b.Company);
  if (companyLabelDiff !== 0) return companyLabelDiff;

  const companyDiff = compareText(a.Company, b.Company);
  if (companyDiff !== 0) return companyDiff;

  return compareText(a.Title, b.Title);
}

function getDedupeKeys(row, index) {
  const duplicateGroupKey = cleanText(row.DuplicateGroupKey);
  const canonicalUrlKey = cleanText(row.CanonicalURLKey);
  const strongKeys = [
    duplicateGroupKey ? `duplicate:${duplicateGroupKey}` : "",
    canonicalUrlKey ? `canonical:${canonicalUrlKey}` : "",
  ].filter(Boolean);

  if (strongKeys.length > 0) return strongKeys;

  const fallback =
    cleanText(row.CompanyTitleLocationKey) ||
    cleanText(row.JobKey) ||
    cleanText(row.URL) ||
    `row-${index}`;
  return [`fallback:${fallback}`];
}

function groupRows(rows) {
  const parents = rows.map((_, index) => index);
  const keyOwners = new Map();

  function find(index) {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  }

  function union(left, right) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  }

  rows.forEach((row, index) => {
    for (const key of getDedupeKeys(row, index)) {
      if (keyOwners.has(key)) union(index, keyOwners.get(key));
      else keyOwners.set(key, index);
    }
  });

  const groups = new Map();

  rows.forEach((row, index) => {
    const key = find(index);
    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({ row, index });
  });

  return groups;
}

function buildSelectionReason(selected, groupSize) {
  if (groupSize <= 1) {
    return "Unique row; no duplicate alternatives in this slice.";
  }

  return [
    `Selected from ${groupSize} rows`,
    `WriterFitScore ${cleanText(selected.WriterFitScore) || 0}`,
    `tier ${cleanText(selected.WriterFitTier) || "unknown"}`,
    `quality ${cleanText(selected.ExportQualityFlag) || "unknown"}`,
    `ATS ${cleanText(selected.ATS) || "unknown"}`,
  ].join(" | ");
}

function summarizeRejectedRows(rows) {
  return rows
    .map((row) =>
      [
        cleanText(row.ATS) || "unknown ATS",
        cleanText(row.Company) || "unknown company",
        cleanText(row.Title) || "unknown title",
        cleanText(row.WriterFitScore) || "0",
        cleanText(row.WriterFitTier) || "unknown tier",
        cleanText(row.URL),
      ]
        .filter(Boolean)
        .join(" / ")
    )
    .join(" || ");
}

function selectDedupedRows(rows, sliceName) {
  const groups = groupRows(rows);
  const selectedRows = [];
  const decisions = [];
  let duplicateGroupsResolved = 0;
  let removedDuplicateRows = 0;

  for (const [groupKey, entries] of groups.entries()) {
    const sortedEntries = [...entries].sort((a, b) => {
      const rowDiff = compareRows(a.row, b.row);
      if (rowDiff !== 0) return rowDiff;
      return a.index - b.index;
    });
    const selectedEntry = sortedEntries[0];
    const selected = selectedEntry.row;
    const groupSize = entries.length;
    const selectionReason = buildSelectionReason(selected, groupSize);
    const selectedOutputRow = {
      ...selected,
      DedupeSelected: true,
      DedupeSelectionReason: selectionReason,
      DedupeGroupSize: groupSize,
    };

    selectedRows.push(selectedOutputRow);

    if (groupSize > 1) {
      duplicateGroupsResolved += 1;
      removedDuplicateRows += groupSize - 1;

      const rejectedRows = sortedEntries.slice(1).map((entry) => ({
        ...entry.row,
        DedupeSelected: false,
        DedupeSelectionReason: `Rejected in favor of ${cleanText(selected.ATS)} ${cleanText(selected.URL)}`,
        DedupeGroupSize: groupSize,
      }));

      decisions.push({
        SliceName: sliceName,
        DuplicateGroupKey: groupKey,
        DedupeGroupSize: groupSize,
        SelectedCompany: selected.Company,
        SelectedTitle: selected.Title,
        SelectedATS: selected.ATS,
        SelectedURL: selected.URL,
        SelectedWriterFitScore: selected.WriterFitScore,
        SelectedWriterFitTier: selected.WriterFitTier,
        SelectionReason: selectionReason,
        RejectedRowsSummary: summarizeRejectedRows(rejectedRows),
      });
    }
  }

  return {
    rows: selectedRows,
    decisions,
    summary: {
      SliceName: sliceName,
      InputRows: rows.length,
      OutputRows: selectedRows.length,
      RemovedDuplicateRows: removedDuplicateRows,
      DuplicateGroupsResolved: duplicateGroupsResolved,
    },
  };
}

module.exports = {
  compareRows,
  groupRows,
  selectDedupedRows,
};
