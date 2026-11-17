const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { getJobId, loadCuratedSubmissionRows, parseJobPosting } = require("../lib/curated-submissions");
const { buildJobExportArtifacts } = require("../lib/job-export");
const { buildSimplePublicRow } = require("../lib/simple-public-export");
const { parseJobTitlesMarkdown } = require("../lib/job-titles");
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "curated-test-"));
  try {
    const options = { submissionsPath: path.join(dir, "intake.json"), cachePath: path.join(dir, "cache.json"), reportPath: path.join(dir, "report.json") };
    const submission = { Id: "fixture", Company: "Example", URL: "https://example.test/jobs/123", Status: "APPROVED", SubmittedAt: "2026-09-23" };
    await fs.writeFile(options.submissionsPath, JSON.stringify({ Submissions: [submission, { ...submission, Id: "pending", Status: "PENDING" }] }));
    const titles = parseJobTitlesMarkdown("# IC Roles\n- Technical Writer\n");
    const job = { "@type": "JobPosting", title: "Technical Writer", description: "Write API documentation for developers.", datePosted: "2026-09-20", jobLocation: { address: { addressLocality: "Montreal", addressCountry: "Canada" } } };
    const html = `<script type="application/ld+json">${JSON.stringify(job)}</script><meta name="search-job-apply-url" content="https://example.test/apply/123">`;
    assert.equal(parseJobPosting(html).title, "Technical Writer");
    assert.equal(parseJobPosting("<title>Bot check</title>"), null);
    const microdataHtml = `
      <div itemscope itemtype="https://schema.org/JobPosting">
        <span itemprop="jobLocation" itemscope itemtype="https://schema.org/Place">
          <span itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
            <meta itemprop="addressLocality" content="Morrisville">
            <meta itemprop="addressRegion" content="NC">
            <meta itemprop="addressCountry" content="US">
          </span>
        </span>
        <meta itemprop="datePosted" content="Thu Nov 05 00:00:00 UTC 2026">
        <h1><span itemprop="title">Technical &amp; API Writer</span></h1>
        <span itemprop="description"><span>Write API documentation.</span><p>Maintain developer guides.</p></span>
        <span itemprop="industry">Technical Writing</span>
      </div>`;
    const microdataJob = parseJobPosting(microdataHtml);
    assert.equal(microdataJob.title, "Technical & API Writer");
    assert.equal(microdataJob.datePosted, "2026-11-05");
    assert.equal(microdataJob.jobLocation.address.addressLocality, "Morrisville");
    assert.equal(microdataJob.jobLocation.address.addressRegion, "NC");
    assert.equal(microdataJob.jobLocation.address.addressCountry, "US");
    assert.match(microdataJob.description, /Write API documentation/);
    assert.match(microdataJob.description, /Maintain developer guides/);
    assert.equal(microdataJob.occupationalCategory, "Technical Writing");
    assert.equal(getJobId("https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1448139200/"), "1448139200");
    assert.equal(getJobId("https://example.test/jobs/123?source=test"), "123");
    const netappUrls = [
      "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1448139200/",
      "https://jobs.netapp.com/job/Morrisville-Technical-Writer-NC-27560/1450475000/",
    ];
    const netappOptions = {
      submissionsPath: path.join(dir, "netapp-intake.json"),
      cachePath: path.join(dir, "netapp-cache.json"),
      reportPath: path.join(dir, "netapp-report.json"),
      fetchPosting: async (url) => ({ html: microdataHtml, jobPosting: microdataJob, finalUrl: url, httpStatus: 200 }),
    };
    await fs.writeFile(
      netappOptions.submissionsPath,
      JSON.stringify({
        Submissions: netappUrls.map((url, index) => ({
          Id: `netapp-${index + 1}`,
          Company: "NetApp",
          CompanyKey: "netapp",
          URL: url,
          Status: "APPROVED",
        })),
      })
    );
    const netappRows = (await loadCuratedSubmissionRows(titles, "2026-11-17T12:00:00Z", netappOptions)).rows;
    assert.deepEqual(netappRows.map((row) => row.RawJobId), ["1448139200", "1450475000"]);
    const netappExport = buildJobExportArtifacts(netappRows, [], titles, "2026-11-17T12:00:00Z").jobRows;
    assert.equal(new Set(netappExport.map((row) => row.JobKey)).size, 2, "Distinct NetApp postings must keep distinct job keys");
    let calls = 0;
    options.fetchPosting = async () => { calls++; return { html, jobPosting: parseJobPosting(html), finalUrl: submission.URL, httpStatus: 200 }; };
    const first = await loadCuratedSubmissionRows(titles, "2026-09-23T12:00:00Z", options);
    assert.equal(calls, 1);
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].ApplyURL, "https://example.test/apply/123");
    assert.equal(first.health.Entries[1].Included, false);
    const exported = buildJobExportArtifacts(first.rows, [], titles, "2026-09-23T12:00:00Z").jobRows[0];
    assert.equal(exported.WriterFitTier, "A");
    assert.equal(buildSimplePublicRow(exported, "2026-09-23T12:00:00Z")["Apply Link"], first.rows[0].ApplyURL);
    options.fetchPosting = async () => { throw Object.assign(new Error("HTTP 500"), { httpStatus: 500 }); };
    const retained = await loadCuratedSubmissionRows(titles, "2026-09-24T12:00:00Z", options);
    assert.equal(retained.health.Entries[0].UsedLastVerifiedRecord, true);
    assert.deepEqual(retained.rows[0], first.rows[0]);
    options.fetchPosting = async () => { throw Object.assign(new Error("HTTP 404"), { httpStatus: 404 }); };
    const closed = await loadCuratedSubmissionRows(titles, "2026-09-25T12:00:00Z", options);
    assert.equal(closed.rows.length, 0);
    assert.equal(closed.health.Entries[0].ConfirmedClosed, true);
    options.fetchPosting = async () => { throw new Error("Missing JobPosting structured data"); };
    assert.equal((await loadCuratedSubmissionRows(titles, "2026-09-26T12:00:00Z", options)).rows.length, 0, "Closed cached job must not return after an access failure");
    await fs.writeFile(options.submissionsPath, JSON.stringify({ Submissions: [submission, submission] }));
    await assert.rejects(loadCuratedSubmissionRows(titles, undefined, options), /Duplicate/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  console.log("Curated submission fixtures passed; no live requests or production writes.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
