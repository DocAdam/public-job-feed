const assert = require('assert/strict');
const { submissionStatus } = require('./review-package-evidence');
const role = { URL: 'https://example.com/job' };
const submissions = { Submissions: [{ Id: 'one', URL: role.URL }] };
const health = { GeneratedAt: '2026-09-24T11:00:00Z', Entries: [{ Id: 'one', Status: 'APPROVED', Included: true, HTTPStatus: 200, VerifiedURL: role.URL }] };
assert.equal(submissionStatus(role, [], null, submissions, health.GeneratedAt).SourceStatus, 'NOT_CHECKED');
assert.equal(submissionStatus(role, [], health, submissions, health.GeneratedAt).PackageStatus, 'NOT_INCLUDED');
assert.equal(submissionStatus(role, [{ 'Apply Link': role.URL }], health, submissions, health.GeneratedAt).PackageStatus, 'INCLUDED');
assert.equal(submissionStatus(role, [], health, submissions, 'new').SourceStatus, 'PREVIOUS_CHECK');
assert.equal(submissionStatus(role, [], { ...health, Entries: [{ Id: 'one', Status: 'APPROVED', Included: false }] }, submissions, health.GeneratedAt).SourceStatus, 'FAILED');
assert.equal(submissionStatus(role, [], { ...health, Entries: [{ ...health.Entries[0], UsedLastVerifiedRecord: true }] }, submissions, health.GeneratedAt).SourceStatus, 'CACHED_FALLBACK');
assert.equal(submissionStatus(role, [], { ...health, GeneratedAt: undefined }, submissions, undefined).SourceStatus, 'PREVIOUS_CHECK');
const { applyUserReview } = require('./review-package-evidence');
const row = { ApplyLink: role.URL, JobOpenStatus: 'UNVERIFIED' };
const old = { ApplyLink: role.URL, PackageRun: 'old', ReviewedAt: '2026-09-23', Status: 'USER_CONFIRMED_OPEN', Note: 'Opened' };
assert.equal(applyUserReview(row, [old], 'new').UserReviewStatus, 'PREVIOUS_REVIEW');
assert.equal(applyUserReview(row, [old], 'new').JobOpenStatus, 'UNVERIFIED');
assert.equal(applyUserReview(row, [old, { ...old, PackageRun: 'new', ReviewedAt: '2026-09-24' }], 'new').JobOpenStatus, 'USER_CONFIRMED_OPEN');
assert.equal(applyUserReview(row, [{ ...old, ApplyLink: 'other' }], 'new').UserReviewStatus, 'NOT_REVIEWED');
assert.equal(applyUserReview(row, [{ ...old, Status: 'USER_REPORTED_OUTAGE' }], 'new').JobOpenStatus, 'UNVERIFIED');
assert.equal(applyUserReview(row, [{ ...old, FlagForWritingReview: true }], 'new').FlagForWritingReview, true);

const { packageEligibility } = require('../lib/public-package-eligibility');
const carvana = { Title: 'Loan Document Specialist', Company: 'Carvana', URL: 'https://www.carvana.com/careers/apply?gh_jid=8144035' };
const other = { ...carvana, URL: carvana.URL.replace('8144035', '999') };
const selection = packageEligibility([carvana, { ...carvana }, other]);
assert.equal(selection.excluded.length, 2);
assert.deepEqual(selection.included, [other]);
assert.match(selection.excluded[0].Reason, /not writing/);
assert.equal(carvana.Title, 'Loan Document Specialist');
async function packageFixture() {
  const fs = require('fs/promises'), os = require('os'), path = require('path');
  const { buildSimpleTopFiles } = require('./build-gsheet-package');
  const { parseCsvRecords } = require('../lib/csv');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'eligibility-test-'));
  try {
    const manifest = await buildSimpleTopFiles(dir, '2026-09-25T12:00:00Z', { exists: true, rows: [carvana, carvana, other] }, {
      simpleFileName: 'jobs.csv', formulaFileName: 'formulas.csv', includeStartHere: true, coveragePercent: 100,
    });
    for (const name of ['jobs.csv', 'formulas.csv']) {
      const text = await fs.readFile(path.join(dir, name), 'utf8');
      assert.doesNotMatch(text, /8144035/);
      assert.match(text, /999/);
      assert.equal(parseCsvRecords(text).rows.length, 1);
    }
    assert.ok(manifest.find(row => row.FileName === 'public-package-exclusions.csv').Exists);
    assert.equal(parseCsvRecords(await fs.readFile(path.join(dir, 'public-package-exclusions.csv'), 'utf8')).rows.length, 2);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
packageFixture().then(() => console.log('Package exclusion fixture passed.')).catch(error => { console.error(error); process.exitCode = 1; });
const { reviewQueue } = require('./review-package-evidence');
const now = Date.parse('2026-09-25T12:00:00Z');
const dated = days => ({ Title: 'Writer', 'Apply Link': role.URL, 'Last Checked': new Date(now - days * 86400000).toISOString() });
const good = [{ 'Apply Link': role.URL, UrlCheckOk: 'Yes', UrlCheckStatus: 'Good' }];
assert.equal(reviewQueue([dated(7)], good, now).length, 0);
assert.equal(reviewQueue([dated(8)], good, now)[0].BoardAgeBand, 'OVER_7_DAYS');
assert.equal(reviewQueue([dated(15)], [], now).length, 1);
assert.equal(reviewQueue([dated(15)], [], now)[0].BoardAgeBand, 'OVER_14_DAYS');
assert.equal(reviewQueue([{ ...dated(0), 'Last Checked': '' }], good, now)[0].BoardAgeBand, 'UNKNOWN');

const { buildDashboard, buildMarkdown } = require('./build-status-dashboard');
const display = buildMarkdown(buildDashboard({ sourceReports: [{ Source: 'inventorySummary', GeneratedAt: '2026-08-24T12:00:00Z', Status: 'STALE' }], atsAnomaly: { Status: 'OK', AbsoluteStatus: 'HIGH', AlertCount: 0, ByATS: [] } }));
assert.match(display, /inventorySummary: 2026-08-24T12:00:00Z \(STALE\)/);
assert.match(display, /cleanupSummary: Unknown date/);
assert.match(display, /Absolute recent failure status: HIGH/);
assert.match(display, /No baseline alert does not mean low failures/);

assert.equal(reviewQueue([dated(14)], good, now)[0].BoardAgeBand, 'OVER_7_DAYS');
const newer = { ...old, ReviewedAt: '2026-09-24', Note: 'Latest observation' };
assert.equal(applyUserReview(row, [old, newer], 'new').UserReviewNote, newer.Note);
console.log('Review improvement fixtures passed.');
