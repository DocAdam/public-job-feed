const fs = require("fs/promises");
const path = require("path");
const { fromRoot, ensureDir, readJsonFile, writeJsonFile } = require("../lib/files");
const { readJobTitles } = require("../lib/job-titles");
const { matchTitle } = require("../lib/title-match");
const { getTitleReview } = require("../lib/title-review");
const { addExportValidationFields } = require("../lib/export-validation");
const { scoreWriterFit } = require("../lib/writer-fit-score");

const fixturePath = fromRoot("test", "writer-fit-regression.json");
const titleListPath = fromRoot("data", "config", "job-titles.md");
const reportsDir = fromRoot("data", "jobs", "reports");
const tierRank = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function tierMeetsMinimum(actual, expectedMinimum) {
  return (tierRank[actual] || 0) >= (tierRank[expectedMinimum] || 0);
}

function tierMeetsMaximum(actual, expectedMaximum) {
  return (tierRank[actual] || 0) <= (tierRank[expectedMaximum] || 0);
}

function buildTestRow(title, titleRecords) {
  const titleMatch = matchTitle(title, titleRecords);
  const titleReview = getTitleReview(title, titleMatch);
  const [validated] = addExportValidationFields([
    {
      Source: "writer-fit-regression",
      ATS: "test",
      Company: "Regression Test Company",
      CompanyKey: "regressiontestcompany",
      Title: title,
      Location: "Remote",
      Description:
        "Regression test role for documentation, technical writing, content, product education, knowledge systems, and developer documentation scoring behavior.",
      URL: `https://example.com/jobs/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"))}`,
      RemoteStatus: "Remote",
      USRemoteEligible: true,
      LocationRisk: "LOW",
      SalaryDetected: false,
      PossibleDuplicate: false,
      ...titleMatch,
      ...titleReview,
    },
  ]);

  return validated;
}

function buildMarkdown(result) {
  return [
    "# Writer Fit Regression Results",
    "",
    `Generated: ${result.GeneratedAt}`,
    "",
    `Status: ${result.Status}`,
    "",
    "## Results",
    "",
    "| Title | Tier | Score | Expected | Status |",
    "| --- | --- | ---: | --- | --- |",
    ...result.Results.map((row) => `| ${row.Title} | ${row.WriterFitTier} | ${row.WriterFitScore} | ${row.Expected} | ${row.Status} |`),
    "",
    "## Failures",
    "",
    ...(result.Failures.length ? result.Failures.map((item) => `- ${item}`) : ["None"]),
    "",
  ].join("\n");
}

async function main() {
  await ensureDir(reportsDir);

  const fixtures = await readJsonFile(fixturePath);
  const titleRecords = await readJobTitles(titleListPath);
  const result = {
    GeneratedAt: new Date().toISOString(),
    Status: "PASS",
    Results: [],
    Failures: [],
  };

  for (const fixture of fixtures) {
    const baseRow = buildTestRow(fixture.title, titleRecords);
    const writerFit = scoreWriterFit(baseRow);
    const expected = fixture.expectedMinimumTier
      ? `minimum ${fixture.expectedMinimumTier}`
      : `maximum ${fixture.expectedMaximumTier}`;
    let passed = true;

    if (fixture.expectedMinimumTier) {
      passed = tierMeetsMinimum(writerFit.WriterFitTier, fixture.expectedMinimumTier);
    } else if (fixture.expectedMaximumTier) {
      passed = tierMeetsMaximum(writerFit.WriterFitTier, fixture.expectedMaximumTier);
    }

    const row = {
      Title: fixture.title,
      Expected: expected,
      Status: passed ? "PASS" : "FAIL",
      ...writerFit,
      TitleReviewBucket: baseRow.TitleReviewBucket,
      TitleDomainSignal: baseRow.TitleDomainSignal,
      MatchedWatchlistTitle: baseRow.MatchedWatchlistTitle,
      TitleMatchType: baseRow.TitleMatchType,
    };

    result.Results.push(row);
    if (!passed) {
      result.Failures.push(
        `${fixture.title}: expected ${expected}, got ${cleanText(writerFit.WriterFitTier)} (${writerFit.WriterFitScore})`
      );
    }
  }

  result.Status = result.Failures.length > 0 ? "FAIL" : "PASS";

  await writeJsonFile(path.join(reportsDir, "test-scoring-results.json"), result);
  await fs.writeFile(path.join(reportsDir, "test-scoring-results.md"), buildMarkdown(result), "utf8");

  console.log(`Writer Fit regression: ${result.Status}`);
  for (const row of result.Results) {
    console.log(`${row.Status}: ${row.Title} -> ${row.WriterFitTier} (${row.WriterFitScore})`);
  }

  if (result.Failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
