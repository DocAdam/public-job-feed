const { getPublicJobUrl } = require('./public-job-url-overrides');
const roleReview = require('../config/public-package-role-exclusions.json');
// Exact role decisions only. Do not match a whole company, title, or URL prefix.
const exclusions = [{
  URL: 'https://www.carvana.com/careers/apply?gh_jid=8144035',
  ReviewedAt: '2026-09-23',
  Reason: 'User review: loan-documentation review, not writing.',
}, ...roleReview.ExcludedListings.map(listing => ({
  ...listing,
  ReviewedAt: roleReview.ReviewedAt,
  SourcePackage: roleReview.SourcePackage,
}))];
function packageEligibility(rows) {
  const included = [], excluded = [];
  for (const row of rows) {
    const urls = [getPublicJobUrl(row), row.URL, row.ApplyURL, row.RawJobURL];
    const decision = exclusions.find(item => urls.includes(item.URL));
    if (decision) excluded.push({ Title: row.Title, Company: row.Company, ...decision });
    else included.push(row);
  }
  return { included, excluded };
}
module.exports = { packageEligibility };
