const { fetchTalentBrewBoard, getTalentBrewSlugFromUrl } = require("../lib/ats/talentbrew");
const { normalizeTalentBrewJob } = require("../lib/jobs-normalize");
const { readJobTitles } = require("../lib/job-titles");
const { fromRoot } = require("../lib/files");

const defaultBoardUrl = "https://careers.netapp.com/search-jobs";

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? fallback : process.argv[index + 1];
}

async function main() {
  const boardUrl = getArgValue("--url", defaultBoardUrl);
  const maxPages = Number.parseInt(getArgValue("--max-pages", "1"), 10);
  const maxJobs = Number.parseInt(getArgValue("--max-jobs", "5"), 10);
  const titleRecords = await readJobTitles(fromRoot("data", "config", "job-titles.md"));
  const result = await fetchTalentBrewBoard(getTalentBrewSlugFromUrl(boardUrl), boardUrl, {
    maxPages,
    maxJobs,
    detailDelayMs: 250,
  });
  const fetchedAt = new Date().toISOString();
  const normalized = result.jobs.map((job) =>
    normalizeTalentBrewJob(
      job,
      {
        company: "NetApp",
        companyKey: "netapp",
        catalogSlug: getTalentBrewSlugFromUrl(boardUrl),
        boardUrl,
        fetchUrl: result.fetchUrl,
        fetchedAt,
      },
      titleRecords
    )
  );

  console.log(JSON.stringify({
    fetchUrl: result.fetchUrl,
    httpStatus: result.httpStatus,
    discovered: result.raw.totalResults,
    listingPagesFetched: result.raw.listingPagesFetched,
    detailPagesFetched: result.raw.detailPagesFetched,
    detailErrors: result.raw.detailErrors,
    partial: result.raw.partial,
    sample: normalized.map((job) => ({
      RawJobId: job.RawJobId,
      Title: job.Title,
      Location: job.Location,
      DatePosted: job.DatePosted,
      Salary: job.Salary,
      URL: job.URL,
      DescriptionLength: job.Description.length,
    })),
  }, null, 2));

  if (normalized.length === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
