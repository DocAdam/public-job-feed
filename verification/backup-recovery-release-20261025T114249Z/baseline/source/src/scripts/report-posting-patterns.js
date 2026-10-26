const fs = require("fs/promises");
const path = require("path");
const { parseCsvRecords, rowsToCsv } = require("../lib/csv");
const { ensureDir, fromRoot, writeJsonFile } = require("../lib/files");

// This deliberately reads only the small, timestamped public-job snapshots. A
// "first seen" time is when this feed observed a job, not a claim about when the
// employer actually created it.
const packageRoot = fromRoot("data", "jobs", "gsheet-package");
const outputRoot = fromRoot("data", "jobs", "posting-patterns");
const jobCsvName = "01_good_documentation_jobs.csv";
const snapshotNamePattern = /^\d{8}-\d{4}$/;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function parseSnapshotId(snapshotId) {
  const match = snapshotId.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(match[1], Number(match[2]) - 1, match[3], match[4], match[5]));
}

function formatTimestamp(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function dayName(index) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index];
}

function jobKey(row) {
  const url = normalize(row["Apply Link"]).replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (url) return `url:${url}`;
  return `fallback:${[row.Company, row.Title, row.Location].map(normalize).join("|")}`;
}

function parsePostedDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function listSnapshots() {
  const entries = await fs.readdir(packageRoot, { withFileTypes: true });
  const snapshots = entries
    .filter((entry) => entry.isDirectory() && snapshotNamePattern.test(entry.name))
    .map((entry) => ({
      id: entry.name,
      date: parseSnapshotId(entry.name),
      dir: path.join(packageRoot, entry.name),
    }))
    .filter((snapshot) => snapshot.date)
    .sort((left, right) => left.date - right.date);

  const readable = [];
  for (const snapshot of snapshots) {
    const csvPath = path.join(snapshot.dir, jobCsvName);
    try {
      const csv = parseCsvRecords(await fs.readFile(csvPath, "utf8"));
      readable.push({ ...snapshot, rows: csv.rows });
    } catch (error) {
      console.warn(`Skipping ${snapshot.id}: cannot read ${jobCsvName} (${error.message}).`);
    }
  }
  return readable;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return "";
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function percent(part, whole) {
  return whole ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

function buildAnalysis(snapshots) {
  const jobs = new Map();
  const overviewRows = [];
  let previousKeys = new Set();

  for (const snapshot of snapshots) {
    const keys = new Set();
    let added = 0;
    for (const row of snapshot.rows) {
      const key = jobKey(row);
      if (keys.has(key)) continue;
      keys.add(key);
      const existing = jobs.get(key);
      if (!existing) {
        jobs.set(key, {
          key,
          row,
          firstSnapshot: snapshot,
          lastSnapshot: snapshot,
          snapshotCount: 1,
        });
      } else {
        existing.lastSnapshot = snapshot;
        existing.snapshotCount += 1;
        existing.row = row;
      }
      if (!previousKeys.has(key)) added += 1;
    }
    const removed = [...previousKeys].filter((key) => !keys.has(key)).length;
    overviewRows.push({
      Snapshot: snapshot.id,
      "Snapshot Time": formatTimestamp(snapshot.date),
      "Jobs Present": keys.size,
      "Jobs First Seen Since Prior Snapshot": added,
      "Jobs No Longer Present Since Prior Snapshot": removed,
      "Companies Present": new Set(snapshot.rows.map((row) => normalize(row.Company)).filter(Boolean)).size,
    });
    previousKeys = keys;
  }

  const grouped = new Map();
  const postedWeekdays = new Map();
  const lifecycleRows = [];
  for (const job of jobs.values()) {
    const source = clean(job.row.Source) || "Unknown";
    const company = clean(job.row.Company) || "Unknown";
    const groupSpecs = [["ATS / Source", source], ["Company", company]];
    for (const [type, name] of groupSpecs) {
      const key = `${type}\u0000${normalize(name)}`;
      if (!grouped.has(key)) grouped.set(key, { type, name, jobs: [], snapshotCounts: new Map() });
      const group = grouped.get(key);
      group.jobs.push(job);
      increment(group.snapshotCounts, job.firstSnapshot.id);
    }

    const posted = parsePostedDate(job.row["Posted Date"]);
    if (posted) increment(postedWeekdays, `${source}\u0000${posted.getUTCDay()}`);
    lifecycleRows.push({
      Company: company,
      "ATS / Source": source,
      Title: clean(job.row.Title),
      "First Seen": formatTimestamp(job.firstSnapshot.date),
      "Last Seen": formatTimestamp(job.lastSnapshot.date),
      "Snapshots Present": job.snapshotCount,
      "Posted Date": clean(job.row["Posted Date"]),
      "Apply Link": clean(job.row["Apply Link"]),
    });
  }

  const patternRows = [...grouped.values()].map((group) => {
    const firstSeenTimes = group.jobs.map((job) => job.firstSnapshot.date);
    const snapshotJobCounts = [...group.snapshotCounts.values()];
    const weekdayCounts = new Map();
    const hourCounts = new Map();
    for (const date of firstSeenTimes) {
      increment(weekdayCounts, dayName(date.getUTCDay()));
      increment(hourCounts, date.getUTCHours());
    }
    const mode = (counts) => [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))[0];
    const topWeekday = mode(weekdayCounts) || ["", 0];
    const topHour = mode(hourCounts) || ["", 0];
    const dateCoverage = group.jobs.filter((job) => parsePostedDate(job.row["Posted Date"])).length;
    return {
      "Grouping": group.type,
      Name: group.name,
      "Unique Jobs First Seen": group.jobs.length,
      "Snapshots With New Jobs": group.snapshotCounts.size,
      "Median New Jobs Per Active Snapshot": median(snapshotJobCounts),
      "Most Common First-Seen Weekday (UTC)": topWeekday[0],
      "First-Seen Weekday Share (%)": percent(topWeekday[1], group.jobs.length),
      "Most Common First-Seen Hour (UTC)": topHour[0] === "" ? "" : `${String(topHour[0]).padStart(2, "0")}:00`,
      "First-Seen Hour Share (%)": percent(topHour[1], group.jobs.length),
      "Jobs With ATS Posted Date": dateCoverage,
      "Posted-Date Coverage (%)": percent(dateCoverage, group.jobs.length),
    };
  }).sort((left, right) => left.Grouping.localeCompare(right.Grouping)
    || right["Unique Jobs First Seen"] - left["Unique Jobs First Seen"]
    || left.Name.localeCompare(right.Name));

  const postedWeekdayRows = [...postedWeekdays.entries()].map(([key, count]) => {
    const [source, weekday] = key.split("\u0000");
    const sourceTotal = [...postedWeekdays.entries()]
      .filter(([candidate]) => candidate.startsWith(`${source}\u0000`))
      .reduce((total, [, value]) => total + value, 0);
    return {
      "ATS / Source": source,
      "Posted-Date Weekday (UTC)": dayName(Number(weekday)),
      Jobs: count,
      "Share of Dated Jobs (%)": percent(count, sourceTotal),
    };
  }).sort((left, right) => left["ATS / Source"].localeCompare(right["ATS / Source"])
    || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(left["Posted-Date Weekday (UTC)"])
      - ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(right["Posted-Date Weekday (UTC)"]));

  lifecycleRows.sort((left, right) => left["First Seen"].localeCompare(right["First Seen"])
    || left.Company.localeCompare(right.Company) || left.Title.localeCompare(right.Title));
  return { overviewRows, patternRows, postedWeekdayRows, lifecycleRows, uniqueJobs: jobs.size };
}

function markdown({ snapshots, analysis }) {
  const sources = analysis.patternRows.filter((row) => row.Grouping === "ATS / Source").slice(0, 12);
  return [
    "# Posting Patterns from GSheet History",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Snapshots analyzed: ${snapshots.length} (${formatTimestamp(snapshots[0].date)} to ${formatTimestamp(snapshots.at(-1).date)}).`,
    `Unique jobs observed: ${analysis.uniqueJobs}.`,
    "",
    "## Interpretation",
    "",
    "`First Seen` means the first timestamped feed snapshot containing a job. It measures observed availability and is affected by refresh cadence, source coverage, ranking thresholds, deduplication, and URL cleanup. It is not evidence of an employer's actual publication time. `Posted Date` is ATS-supplied when available and is date-only in the primary CSV, so it can support weekday—not time-of-day—patterns.",
    "",
    "## Largest source cohorts",
    "",
    "| Source | Jobs first seen | Active snapshots | Typical observed weekday | Typical observed hour (UTC) | Posted-date coverage |",
    "| --- | ---: | ---: | --- | --- | ---: |",
    ...sources.map((row) => `| ${row.Name} | ${row["Unique Jobs First Seen"]} | ${row["Snapshots With New Jobs"]} | ${row["Most Common First-Seen Weekday (UTC)"]} | ${row["Most Common First-Seen Hour (UTC)"]} | ${row["Posted-Date Coverage (%)"]}% |`),
    "",
    "See `snapshot-overview.csv`, `posting-patterns.csv`, `posted-date-weekdays.csv`, and `job-lifecycle.csv` for the underlying rows.",
    "",
  ].join("\n");
}

async function writeOutputs(outputDir, snapshots, analysis) {
  await ensureDir(outputDir);
  await fs.writeFile(path.join(outputDir, "snapshot-overview.csv"), rowsToCsv(Object.keys(analysis.overviewRows[0] || {}), analysis.overviewRows), "utf8");
  await fs.writeFile(path.join(outputDir, "posting-patterns.csv"), rowsToCsv(Object.keys(analysis.patternRows[0] || {}), analysis.patternRows), "utf8");
  await fs.writeFile(path.join(outputDir, "posted-date-weekdays.csv"), rowsToCsv(Object.keys(analysis.postedWeekdayRows[0] || {}), analysis.postedWeekdayRows), "utf8");
  await fs.writeFile(path.join(outputDir, "job-lifecycle.csv"), rowsToCsv(Object.keys(analysis.lifecycleRows[0] || {}), analysis.lifecycleRows), "utf8");
  await fs.writeFile(path.join(outputDir, "README.md"), markdown({ snapshots, analysis }), "utf8");
  await writeJsonFile(path.join(outputDir, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    source: "timestamped gsheet-package/01_good_documentation_jobs.csv snapshots",
    snapshotCount: snapshots.length,
    firstSnapshot: snapshots[0].id,
    lastSnapshot: snapshots.at(-1).id,
    uniqueJobsObserved: analysis.uniqueJobs,
  });
}

async function main() {
  const snapshots = await listSnapshots();
  if (snapshots.length < 2) throw new Error(`At least two readable timestamped packages are required in ${packageRoot}.`);
  const analysis = buildAnalysis(snapshots);
  const runDir = path.join(outputRoot, snapshots.at(-1).id);
  const latestDir = path.join(outputRoot, "latest");
  await writeOutputs(runDir, snapshots, analysis);
  await writeOutputs(latestDir, snapshots, analysis);
  console.log(`Posting-pattern report written to: ${runDir}`);
  console.log(`Latest posting-pattern report: ${latestDir}`);
  console.log(`Snapshots: ${snapshots.length}; unique jobs observed: ${analysis.uniqueJobs}.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
