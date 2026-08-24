const { getListingJobs, parseJobPosting } = require("../lib/ats/talentbrew");
const { normalizeTalentBrewJob } = require("../lib/jobs-normalize");

const html = `
  <section data-total-pages="2" data-total-job-results="1">
    <a href="/job/remote/technical-writer/27600/123" data-job-id="123">
      <h3>Technical Writer</h3>
      <span class="job-location job-default">Remote, United States</span>
    </a>
  </section>
  <script type="application/ld+json">{
    "@context":"https://schema.org",
    "@type":"JobPosting",
    "title":"Technical Writer",
    "datePosted":"2026-08-01",
    "description":"<p>Write documentation for customers.</p>",
    "url":"https://careers.example.com/job/remote/technical-writer/27600/123",
    "jobLocation":{"@type":"Place","address":{"addressLocality":"Remote","addressCountry":"United States"}}
  }</script>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const listingJobs = getListingJobs(html, "https://careers.example.com/search-jobs");
  const jobPosting = parseJobPosting(html);
  assert(listingJobs.length === 1, `expected one listing, got ${listingJobs.length}`);
  assert(listingJobs[0].id === "123", `expected listing ID 123, got ${listingJobs[0].id}`);
  assert(
    listingJobs[0].url === "https://careers.example.com/job/remote/technical-writer/27600/123",
    `unexpected listing URL: ${listingJobs[0].url}`
  );
  assert(jobPosting && jobPosting.title === "Technical Writer", "JobPosting JSON-LD was not parsed");

  const normalized = normalizeTalentBrewJob(
    {
      id: listingJobs[0].id,
      title: jobPosting.title,
      location: "Remote, United States",
      description: jobPosting.description,
      datePosted: jobPosting.datePosted,
      url: jobPosting.url,
    },
    {
      company: "Example Company",
      companyKey: "example-company",
      catalogSlug: "careers.example.com",
      boardUrl: "https://careers.example.com/search-jobs",
      fetchUrl: "https://careers.example.com/search-jobs",
      fetchedAt: "2026-08-21T12:00:00.000Z",
    },
    []
  );
  assert(normalized.ATS === "talentbrew", `unexpected ATS: ${normalized.ATS}`);
  assert(normalized.RawJobId === "123", `unexpected raw job ID: ${normalized.RawJobId}`);
  assert(normalized.Description === "Write documentation for customers.", "HTML description was not normalized");

  console.log("TalentBrew parser and normalization fixture: PASS");
}

try {
  main();
} catch (error) {
  console.error(`TalentBrew parser and normalization fixture: FAIL: ${error.message}`);
  process.exitCode = 1;
}
