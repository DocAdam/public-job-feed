const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { loadCuratedSubmissionRows, parseJobPosting } = require("../lib/curated-submissions");
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
    options.fetchPosting = async () => { throw new Error("Missing JobPosting JSON-LD"); };
    assert.equal((await loadCuratedSubmissionRows(titles, "2026-09-26T12:00:00Z", options)).rows.length, 0, "Closed cached job must not return after an access failure");
    await fs.writeFile(options.submissionsPath, JSON.stringify({ Submissions: [submission, submission] }));
    await assert.rejects(loadCuratedSubmissionRows(titles, undefined, options), /Duplicate/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  console.log("Curated submission fixtures passed; no live requests or production writes.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
