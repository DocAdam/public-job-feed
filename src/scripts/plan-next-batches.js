const fs = require("fs/promises");
const path = require("path");
const { rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, readJsonFile, writeJsonFile } = require("../lib/files");

const recommendationsPath = fromRoot("data", "jobs", "reports", "ats-scale-recommendations.json");
const batchIndexPath = fromRoot("data", "jobs", "index", "batch-index.json");
const crawlQueuePath = fromRoot("data", "catalogs", "crawl", "crawl-queue.json");
const outputDir = fromRoot("data", "jobs", "plans");

const planHeaders = [
  "ATS",
  "Recommendation",
  "NextOffset",
  "Limit",
  "DelayMs",
  "BatchName",
  "Command",
  "Reason",
  "PlanStatus",
];

const atsRules = {
  ashby: {
    recommendations: ["SCALE_NOW"],
    batches: 2,
    limit: 500,
    delayMs: 250,
  },
  greenhouse: {
    recommendations: ["SAMPLE_MORE", "SCALE_NOW"],
    batches: 1,
    limit: 250,
    delayMs: 250,
  },
  lever: {
    recommendations: ["SAMPLE_MORE", "SCALE_NOW"],
    batches: 1,
    limit: 100,
    delayMs: 250,
  },
  bamboohr: {
    recommendations: ["SAMPLE_MORE", "SCALE_NOW"],
    batches: 1,
    limit: 100,
    delayMs: 300,
  },
  workday: {
    recommendations: ["CATALOG_ONLY_FOR_NOW"],
    batches: 0,
    limit: 0,
    delayMs: 0,
  },
  icims: {
    recommendations: ["CATALOG_ONLY_FOR_NOW"],
    batches: 0,
    limit: 0,
    delayMs: 0,
  },
};

const atsOrder = ["ashby", "greenhouse", "lever", "bamboohr", "workday", "icims"];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function requireJson(filePath, message) {
  if (!(await fileExists(filePath))) {
    console.log(message);
    return null;
  }

  return readJsonFile(filePath);
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeAts(value) {
  return cleanText(value).toLowerCase();
}

function asBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return cleanText(value).toLowerCase() === "true";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseOffsetFromBatchName(batchName, ats) {
  const parts = cleanText(batchName).split("-").filter(Boolean);
  if (normalizeAts(parts[0]) !== ats) {
    return null;
  }

  const offsetPart = parts.find((part) => /^\d{4,}$/.test(part));
  if (offsetPart) {
    return Number(offsetPart);
  }

  return null;
}

function getBatchOffset(row, ats) {
  const explicitOffset = numberOrNull(row.Offset);
  if (explicitOffset !== null) {
    return explicitOffset;
  }

  const parsedOffset = parseOffsetFromBatchName(row.BatchName, ats);
  if (parsedOffset !== null) {
    return parsedOffset;
  }

  return 0;
}

function getBatchLimit(row) {
  return (
    numberOrNull(row.Limit) ||
    numberOrNull(row.BoardsSelected) ||
    numberOrNull(row.BoardsAttempted) ||
    numberOrNull(row.PublicFeedRows) ||
    0
  );
}

function getNextOffset(batchIndexRows, ats) {
  const atsRows = batchIndexRows.filter((row) => normalizeAts(row.ATS) === ats);
  let nextOffset = 0;

  for (const row of atsRows) {
    const offset = getBatchOffset(row, ats);
    const limit = getBatchLimit(row);

    if (offset === null) {
      continue;
    }

    nextOffset = Math.max(nextOffset, offset + limit);
  }

  return nextOffset;
}

function hasAts(row, ats) {
  const fieldMap = {
    ashby: "HasAshby",
    greenhouse: "HasGreenhouse",
    lever: "HasLever",
    workday: "HasWorkday",
    bamboohr: "HasBambooHR",
    icims: "HasICIMS",
  };

  if (asBoolean(row[fieldMap[ats]])) {
    return true;
  }

  const atsValues = Array.isArray(row.ATSList)
    ? row.ATSList
    : cleanText(row.ATSList)
        .split("|")
        .map(cleanText)
        .filter(Boolean);

  return atsValues.map(normalizeAts).includes(ats);
}

function getEligibleRows(crawlQueueRows, ats) {
  return crawlQueueRows.filter((row) => {
    if (cleanText(row.CrawlPriority).toUpperCase() !== "HIGH") {
      return false;
    }

    if (["workday", "bamboohr", "icims"].includes(ats)) {
      return hasAts(row, ats);
    }

    return asBoolean(row.CrawlReady) && normalizeAts(row.BestATS) === ats;
  });
}

function formatOffset(offset) {
  return String(offset).padStart(4, "0");
}

function buildBatchName(ats, offset) {
  return `${ats}-high-${formatOffset(offset)}`;
}

function buildCommand(ats, limit, offset, batchName, delayMs) {
  return `npm run jobs:fetch-batch -- --ats ${ats} --priority HIGH --limit ${limit} --offset ${offset} --batch-name ${batchName} --delay-ms ${delayMs}`;
}

function getExistingBatchNames(batchIndexRows) {
  return new Set(batchIndexRows.map((row) => cleanText(row.BatchName)).filter(Boolean));
}

function getRecommendation(recommendations, ats) {
  return recommendations.find((row) => normalizeAts(row.ATS) === ats) || {
    ATS: ats,
    ScaleRecommendation: "",
    Reason: "No health recommendation found.",
  };
}

function skippedPlan(ats, recommendation, reason) {
  return {
    ATS: ats,
    Recommendation: recommendation.ScaleRecommendation || "",
    NextOffset: "",
    Limit: "",
    DelayMs: "",
    BatchName: "",
    Command: "",
    Reason: reason,
    PlanStatus: "SKIPPED",
  };
}

function buildReadyPlan(ats, recommendation, offset, limit, delayMs, eligibleCount) {
  const batchName = buildBatchName(ats, offset);

  return {
    ATS: ats,
    Recommendation: recommendation.ScaleRecommendation,
    NextOffset: offset,
    Limit: limit,
    DelayMs: delayMs,
    BatchName: batchName,
    Command: buildCommand(ats, limit, offset, batchName, delayMs),
    Reason: `${recommendation.Reason || "Recommended by ATS health report"} Eligible HIGH rows: ${eligibleCount}.`,
    PlanStatus: "READY",
  };
}

function planAts(ats, recommendations, batchIndexRows, crawlQueueRows) {
  const rule = atsRules[ats];
  const recommendation = getRecommendation(recommendations, ats);
  const eligibleCount = getEligibleRows(crawlQueueRows, ats).length;

  if (!rule || !rule.recommendations.includes(recommendation.ScaleRecommendation)) {
    return [
      skippedPlan(
        ats,
        recommendation,
        `No batch suggested because recommendation is ${recommendation.ScaleRecommendation || "missing"}.`
      ),
    ];
  }

  if (rule.batches === 0) {
    return [skippedPlan(ats, recommendation, "Catalog-only for now.")];
  }

  const startingOffset = getNextOffset(batchIndexRows, ats);
  const existingBatchNames = getExistingBatchNames(batchIndexRows);
  const rows = [];
  let offset = startingOffset;

  for (let index = 0; index < rule.batches; index += 1) {
    let batchName = buildBatchName(ats, offset);

    while (existingBatchNames.has(batchName)) {
      offset += rule.limit;
      batchName = buildBatchName(ats, offset);
    }

    if (offset >= eligibleCount) {
      rows.push(
        skippedPlan(
          ats,
          recommendation,
          `No batch suggested because next offset ${offset} is beyond ${eligibleCount} eligible HIGH rows.`
        )
      );
      continue;
    }

    rows.push(buildReadyPlan(ats, recommendation, offset, rule.limit, rule.delayMs, eligibleCount));
    offset += rule.limit;
  }

  return rows;
}

function buildShellScript(readyRows) {
  const lines = [
    "#!/bin/bash",
    "set -e",
    "",
    "# Suggested next controlled batch commands.",
    "# Review before running. You can run these one at a time if preferred.",
    "",
    ...readyRows.map((row) => row.Command),
    "",
  ];

  return lines.join("\n");
}

function buildMarkdown(generatedAt, rows) {
  const readyRows = rows.filter((row) => row.PlanStatus === "READY");
  const skippedRows = rows.filter((row) => row.PlanStatus === "SKIPPED");
  const lines = [
    "# Next Batch Plan",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Recommended Order",
    "",
  ];

  if (readyRows.length === 0) {
    lines.push("No READY commands were generated.", "");
  } else {
    readyRows.forEach((row, index) => {
      lines.push(`${index + 1}. ${row.ATS} offset ${row.NextOffset}, limit ${row.Limit}`);
    });
    lines.push("");
  }

  lines.push("## Commands", "");

  if (readyRows.length > 0) {
    lines.push("```sh");
    for (const row of readyRows) {
      lines.push(row.Command);
    }
    lines.push("```", "");
  } else {
    lines.push("No commands to run.", "");
  }

  lines.push("## Skipped ATS", "");

  if (skippedRows.length === 0) {
    lines.push("No ATS were skipped.", "");
  } else {
    for (const row of skippedRows) {
      lines.push(`- ${row.ATS}: ${row.Reason}`);
    }
    lines.push("");
  }

  lines.push("## After Batches Complete", "");
  lines.push("Run:");
  lines.push("");
  lines.push("```sh");
  lines.push("npm run jobs:public-release");
  lines.push("```");
  lines.push("");
  lines.push("This planner only writes suggested commands. It does not run fetch batches automatically.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const recommendations = await requireJson(
    recommendationsPath,
    "Health recommendations are missing.\nRun:\nnpm run jobs:ats-health"
  );
  if (!recommendations) return;

  const batchIndexRows = await requireJson(batchIndexPath, "Batch index is missing.\nRun:\nnpm run jobs:index-batches");
  if (!batchIndexRows) return;

  const crawlQueueRows = await requireJson(crawlQueuePath, "Crawl queue is missing.\nRun:\nnpm run catalogs:crawl-queue");
  if (!crawlQueueRows) return;

  const generatedAt = new Date().toISOString();
  const rows = atsOrder.flatMap((ats) => planAts(ats, recommendations, batchIndexRows, crawlQueueRows));
  const readyRows = rows.filter((row) => row.PlanStatus === "READY");
  const skippedRows = rows.filter((row) => row.PlanStatus === "SKIPPED");

  await ensureDir(outputDir);
  await Promise.all([
    fs.writeFile(path.join(outputDir, "next-batch-plan.csv"), rowsToCsv(planHeaders, rows), "utf8"),
    writeJsonFile(path.join(outputDir, "next-batch-plan.json"), rows),
    fs.writeFile(path.join(outputDir, "next-batch-commands.sh"), buildShellScript(readyRows), "utf8"),
    fs.writeFile(path.join(outputDir, "next-batch-plan.md"), buildMarkdown(generatedAt, rows), "utf8"),
  ]);

  await fs.chmod(path.join(outputDir, "next-batch-commands.sh"), 0o755);

  console.log("Next batch plan complete.");
  console.log("Plan folder:");
  console.log(outputDir);
  console.log(`READY command count: ${readyRows.length}`);
  console.log(`Skipped ATS count: ${skippedRows.length}`);
  console.log("Next recommended commands:");
  if (readyRows.length === 0) {
    console.log("- none");
  } else {
    for (const row of readyRows) {
      console.log(`- ${row.Command}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
