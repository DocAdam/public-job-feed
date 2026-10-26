const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enrich, contentTopics, matchTopics, company } = require('../lib/daily-jobs-review');
const { compareRows: compareUs } = require('../lib/us-remote-daily-report');
const { compareRows: compareInternational } = require('../lib/international-remote-daily-report');
const { buildSnapshotWithRemote, buildMarkdown, remoteSummary } = require('../lib/all-remote-daily-report');
const { buildSnapshot, parseOptions } = require('../lib/jobs-snapshot');
const { buildContentMetrics, renderContentMetrics, compareMembership, roleChanges } = require('../lib/content-metrics');

function row(id, title = 'Technical Writer', location = 'US', work = 'Remote', companyName = 'Alpha Inc.') {
  return { Title: title, Company: companyName, Location: location,
    'Work Arrangement': work, 'Apply Link': id ? `https://example.test/${id}` : '' };
}

function fixture() {
  const currentRows = [
    row('us', ' Technical   Writer '),
    row('ca', 'technical-writer', 'Canada', 'Remote', 'ALPHA LLC'),
    row('both', 'Content Writer', 'US / Canada / US', 'Remote', 'Beta'),
    row('generic', 'Technical Writer', 'Remote', 'Remote', 'Gamma'),
    row('onsite', 'UX Writer', 'US', 'Onsite', 'Delta'),
    row('hybrid', 'Technical Content Manager', 'Germany', 'Hybrid', 'Epsilon'),
    row('', 'Mystery', 'Remote', 'Unknown', 'Fallback'),
  ];
  const baselineRows = [
    { ...currentRows[0], 'Apply Link': 'HTTPS://EXAMPLE.TEST/US/' },
    { ...currentRows[6], Company: ' fallback ', Title: ' mystery ' },
    row('removed'),
  ];
  const details = [
    { URL: 'HTTPS://EXAMPLE.TEST/US/', Description: '<p>AI, APIs and docs-as-code.</p>' },
    { URL: currentRows[1]['Apply Link'], Description: 'Maintain chair rails, rapid delivery and GitHub.' },
    { URL: currentRows[2]['Apply Link'], Description: 'Machine learning; application programming interfaces; documentation as code.' },
    { URL: currentRows[3]['Apply Link'], Description: '<p> &nbsp; </p><script>AI API</script>' },
  ];
  return { currentRows, previousRows: baselineRows, baselineRows, details,
    generatedAt: '2026-09-28 12:00:00 UTC', currentSnapshot: '20260928-0700',
    previousSnapshot: '20260927-0700', baselineSnapshot: '20260921-0700' };
}

function calculate(input) {
  const rows = enrich(input.currentRows, input.details || []);
  const baseline = enrich(input.baselineRows, input.baselineDetails || []);
  const us = compareUs(input.currentRows, input.previousRows);
  const international = compareInternational(input.currentRows, input.previousRows);
  return buildContentMetrics({ rows, baseline, weekly: compareMembership(rows, baseline),
    roles: roleChanges(rows, baseline), remoteSummary: remoteSummary(us.current, international.current) });
}

function main() {
  const input = fixture();
  const metrics = calculate(input);
  assert.equal(metrics.marketOverview.total, 7);
  assert.deepEqual(metrics.marketOverview.arrangements.map(value => value.count), [4, 1, 1, 1]);
  assert.equal(metrics.marketOverview.arrangements[0].share, 4 / 7 * 100);
  assert.deepEqual(metrics.remoteAvailability, {
    us: 2, international: 2, unique: 3, overlap: 1, usShare: 2 / 7 * 100, uniqueShare: 3 / 7 * 100,
  });
  assert.deepEqual(metrics.weeklyMovement, { baselineTotal: 3, added: 5, removed: 1, net: 4, churn: 6, churnRate: 200 });
  assert.deepEqual(metrics.textCoverage, { searchable: 3, missing: 4, share: 3 / 7 * 100 });
  assert.deepEqual(metrics.topics.map(value => [value.count, value.total, value.share]), Array(3).fill([2, 3, 2 / 3 * 100]));
  assert.deepEqual(metrics.titles[0], { name: 'technical writer', count: 3 });
  assert.deepEqual(metrics.companies[0], { name: 'alpha', count: 2 });
  assert.equal(metrics.geography.resolved, 5);
  assert.equal(metrics.geography.unresolved, 2);
  assert.deepEqual(metrics.geography.countries, [
    { name: 'United States', count: 3 }, { name: 'Canada', count: 2 }, { name: 'Germany', count: 1 },
  ]);
  // The existing classifier puts the hyphenated title in Adjacent Roles.
  // Title-count normalization must not change that classification.
  assert.equal(metrics.roleMovement.largestGrowing.name, 'Adjacent Roles');
  assert.equal(metrics.roleMovement.largestDeclining, null);
  assert.deepEqual([metrics.roleMovement.growing, metrics.roleMovement.declining, metrics.roleMovement.unchanged], [4, 0, 2]);

  const empty = calculate({ ...input, currentRows: [], previousRows: [], baselineRows: [] });
  assert.equal(empty.marketOverview.total, 0);
  assert(empty.marketOverview.arrangements.every(value => value.count === 0 && value.share === null));
  assert.equal(empty.remoteAvailability.uniqueShare, null);
  assert.equal(empty.weeklyMovement.churnRate, null);
  assert.equal(empty.textCoverage.share, null);
  assert(empty.topics.every(value => value.total === 0 && value.count === 0 && value.share === null));
  const emptyText = renderContentMetrics(empty).join('\n');
  assert(emptyText.includes('0 / 0 (N/A)'));
  assert(!/NaN|Infinity/.test(emptyText));

  const duplicateInput = { ...input, currentRows: [...input.currentRows, { ...input.currentRows[0], 'Apply Link': 'HTTPS://EXAMPLE.TEST/US/' }] };
  assert.equal(calculate(duplicateInput).marketOverview.total, 7);
  assert.deepEqual(calculate(duplicateInput).weeklyMovement, metrics.weeklyMovement);

  const many = Array.from({ length: 12 }, (_, index) => row(`title-${index}`, `Title ${String(index).padStart(2, '0')}`, 'US', 'Remote', `Label ${String(index).padStart(2, '0')}`));
  const manyInput = { ...input, currentRows: many };
  const manyMetrics = calculate(manyInput);
  assert.equal(manyMetrics.titles.length, 10);
  assert.equal(manyMetrics.companies.length, 10);
  assert.deepEqual(manyMetrics.titles.map(value => value.name), many.slice(0, 10).map(value => value.Title.toLowerCase()));
  assert.deepEqual(manyMetrics.companies.map(value => value.name), many.slice(0, 10).map(company));
  assert.deepEqual(calculate({ ...manyInput, currentRows: [...many].reverse() }), manyMetrics);
  assert.deepEqual(calculate({ ...input, currentRows: [...input.currentRows].reverse() }), metrics);
  const missingWork = calculate({ ...input, currentRows: [{ ...input.currentRows[0], 'Work Arrangement': '' }] });
  assert.equal(missingWork.marketOverview.arrangements[3].count, 1);
  assert.equal(missingWork.marketOverview.arrangements[3].share, 100);
  const removedAll = calculate({ ...input, currentRows: [] });
  assert.deepEqual(removedAll.weeklyMovement, { baselineTotal: 3, added: 0, removed: 3, net: -3, churn: 3, churnRate: 100 });

  const roles = [
    { name: 'Technical Writing', baseline: 4, current: 2, delta: -2 },
    { name: 'Content Writing', baseline: 4, current: 2, delta: -2 },
    { name: 'Documentation Engineering', baseline: 1, current: 3, delta: 2 },
    { name: 'Content Design / UX Writing', baseline: 1, current: 3, delta: 2 },
    { name: 'Unknown', baseline: 1, current: 20, delta: 19 },
    { name: 'Technical Content', baseline: 1, current: 1, delta: 0 },
  ];
  const roleMetrics = buildContentMetrics({ rows: [], baseline: [], weekly: { added: [], removed: [] }, roles });
  assert.equal(roleMetrics.roleMovement.largestGrowing.name, 'Content Design / UX Writing');
  assert.equal(roleMetrics.roleMovement.largestDeclining.name, 'Content Writing');
  assert.deepEqual([roleMetrics.roleMovement.growing, roleMetrics.roleMovement.declining, roleMetrics.roleMovement.unchanged], [3, 2, 1]);
  assert.deepEqual(buildContentMetrics({ rows: [], baseline: [], weekly: { added: [], removed: [] }, roles: [...roles].reverse() }).roleMovement, roleMetrics.roleMovement);
  const unknownDecline = buildContentMetrics({ rows: [], baseline: [], weekly: { added: [], removed: [] }, roles: [{ name: 'Unknown', delta: -100 }] });
  assert.equal(unknownDecline.roleMovement.largestDeclining, null);
  assert.equal(unknownDecline.roleMovement.declining, 1);

  const topicCases = [
    ['AI mentions', ['AI', 'artificial intelligence', 'generative AI', 'gen AI', 'genAI', 'large language model', 'large language models', 'LLM', 'LLMs', 'conversational AI', 'machine learning'], ['chair', 'maintain', 'paid', 'said', 'email', 'xAIx']],
    ['API mentions', ['API', 'APIs', 'application programming interface', 'application programming interfaces', 'REST API', 'GraphQL API'], ['rapid', 'capital', 'capillary', 'APIary', 'xAPIx']],
    ['Docs-as-code mentions', ['docs-as-code', 'docs as code', 'documentation-as-code', 'documentation as code'], ['Git', 'GitHub', 'source code', 'documentation']],
  ];
  for (const [label, positives, negatives] of topicCases) {
    const definition = contentTopics.filter(([name]) => name === label);
    for (const description of positives) assert.equal(matchTopics([{ description }], definition)[0].rows.length, 1, description);
    for (const description of negatives) assert.equal(matchTopics([{ description }], definition)[0].rows.length, 0, description);
  }
  const noText = calculate({ ...input, details: [] });
  assert.equal(noText.textCoverage.missing, 7);
  assert(noText.topics.every(value => value.total === 0 && value.share === null));
  // Additional links can recover locations, but must not silently expand text coverage.
  const grouped = { ...input.currentRows[0], 'Apply Link': 'https://example.test/no-main',
    Location: 'US; +1 more', 'Additional Apply Links': input.currentRows[1]['Apply Link'] };
  const groupedInput = { ...input, currentRows: [grouped], details: [
    { URL: grouped['Apply Link'], Location: 'US', Description: '' },
    { URL: input.currentRows[1]['Apply Link'], Location: 'Canada', Description: 'AI API' },
  ] };
  assert.equal(calculate(groupedInput).textCoverage.searchable, 0);
  assert.equal(calculate(groupedInput).geography.countries.length, 2);
  assert.equal(calculate({ ...groupedInput, details: [] }).geography.unresolved, 1);
  const duplicateCountry = enrich([input.currentRows[0]], []);
  duplicateCountry[0].places.push(duplicateCountry[0].places[0]);
  const geography = buildContentMetrics({ rows: duplicateCountry, baseline: [], weekly: { added: duplicateCountry, removed: [] }, roles: [] }).geography;
  assert.deepEqual(geography.countries, [{ name: 'United States', count: 1 }]);
  const countryRows = enrich(many, []).map((value, index) => ({ ...value,
    places: [{ code: String(index), name: `Country ${String(index).padStart(2, '0')}` }],
  }));
  const countryMetrics = buildContentMetrics({ rows: countryRows, baseline: [], weekly: { added: countryRows, removed: [] }, roles: [] });
  assert.equal(countryMetrics.geography.countries.length, 10);
  assert.deepEqual(countryMetrics.geography.countries.map(value => value.name), countryRows.slice(0, 10).map(value => value.places[0].name));

  const combined = buildSnapshotWithRemote(input);
  const section = combined.split('### Content metrics\n')[1].split('### Possible post subjects')[0];
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/content-metrics.md'), 'utf8');
  assert.equal(`### Content metrics\n${section}`.trimEnd() + '\n', expected);
  for (const heading of ['### Overview', '### Possible post subjects', '### Weekly changes by role group', '## US Remote Jobs', '## International Remote Jobs']) assert(combined.includes(heading), heading);
  assert(combined.indexOf('### Overview') < combined.indexOf('### Content metrics'));
  assert(combined.indexOf('### Content metrics') < combined.indexOf('### Possible post subjects'));
  const makeReport = comparison => ({ GeneratedAt: input.generatedAt, CurrentSnapshot: input.currentSnapshot, PreviousSnapshot: input.previousSnapshot,
    Filter: '', Counts: { Current: comparison.current.length, Previous: comparison.previous.length, Added: comparison.added.length, Removed: comparison.removed.length, Continuing: comparison.continuing.length },
    Added: comparison.added, Removed: comparison.removed, Current: comparison.current });
  const remoteOnly = buildMarkdown({ generatedAt: input.generatedAt,
    usReport: makeReport(compareUs(input.currentRows, input.previousRows)),
    internationalReport: makeReport(compareInternational(input.currentRows, input.previousRows)) });
  for (const heading of ['## US Remote Jobs', '## International Remote Jobs']) {
    const lists = markdown => markdown.split(heading)[1].split('\n## ')[0].split('### Summary')[1];
    assert.equal(lists(combined), lists(remoteOnly), `${heading}: counts and complete lists must stay intact`);
  }
  assert(!buildSnapshot(input, parseOptions(['--country', 'canada'])).includes('Content metrics'));
  assert(combined.split('<a id="remote-comparison">')[0].split('\n').length <= 300);
  assert.throws(() => buildSnapshot({ ...input, generatedAt: '\n'.repeat(301) }), /300-line limit/);
  console.log('Content metrics calculation and report fixture tests: PASS');
}

if (require.main === module) main();
module.exports = { main, fixture };
