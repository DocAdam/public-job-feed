const { jobKey } = require('./us-remote-daily-report');
const { normalizeTitle } = require('./job-titles');
const { titleCategories } = require('./title-category');
const { company, contentTopics, matchTopics } = require('./daily-jobs-review');

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const percentage = (count, total) => total ? count / total * 100 : null;

// Inputs are already unique and enriched by the existing snapshot renderer.
function compareMembership(current, baseline) {
  const currentKeys = new Set(current.map(jobKey));
  const baselineKeys = new Set(baseline.map(jobKey));
  return {
    added: current.filter(row => !baselineKeys.has(jobKey(row))),
    removed: baseline.filter(row => !currentKeys.has(jobKey(row))),
  };
}

function roleChanges(current, baseline) {
  return titleCategories.map(name => {
    const before = baseline.filter(row => row.category === name).length;
    const now = current.filter(row => row.category === name).length;
    return { name, baseline: before, current: now, delta: now - before };
  }).filter(row => row.baseline || row.current);
}

function topCounts(rows, getNames) {
  const counts = new Map();
  for (const row of rows) {
    for (const name of new Set(getNames(row))) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || compareText(a.name, b.name)).slice(0, 10);
}

function buildContentMetrics({ rows, baseline, weekly, roles, remoteSummary }) {
  const total = rows.length;
  const arrangements = ['Remote', 'Hybrid', 'Onsite', 'Unknown'].map(name => {
    const count = rows.filter(row => (row['Work Arrangement'] || 'Unknown') === name).length;
    return { name, count, share: percentage(count, total) };
  });
  const searchable = rows.filter(row => row.description.trim());
  const growing = roles.filter(row => row.name !== 'Unknown' && row.delta > 0)
    .sort((a, b) => b.delta - a.delta || compareText(a.name, b.name));
  const declining = roles.filter(row => row.name !== 'Unknown' && row.delta < 0)
    .sort((a, b) => a.delta - b.delta || compareText(a.name, b.name));
  const churn = weekly.added.length + weekly.removed.length;
  return {
    marketOverview: { total, arrangements },
    remoteAvailability: remoteSummary ? {
      us: remoteSummary.us, international: remoteSummary.international,
      unique: remoteSummary.unique, overlap: remoteSummary.overlap.length,
      usShare: percentage(remoteSummary.us, total), uniqueShare: percentage(remoteSummary.unique, total),
    } : null,
    weeklyMovement: {
      baselineTotal: baseline.length, added: weekly.added.length, removed: weekly.removed.length,
      net: total - baseline.length, churn, churnRate: percentage(churn, baseline.length),
    },
    roleMovement: {
      largestGrowing: growing[0] || null, largestDeclining: declining[0] || null,
      growing: roles.filter(row => row.delta > 0).length,
      declining: roles.filter(row => row.delta < 0).length,
      unchanged: roles.filter(row => row.delta === 0).length,
    },
    textCoverage: { searchable: searchable.length, missing: total - searchable.length, share: percentage(searchable.length, total) },
    topics: matchTopics(searchable, contentTopics).map(topic => ({
      name: topic.label, count: topic.rows.length, total: searchable.length,
      share: percentage(topic.rows.length, searchable.length),
    })),
    titles: topCounts(rows, row => [normalizeTitle(row.Title) || '(missing title)']),
    companies: topCounts(rows, row => [company(row)]),
    geography: {
      resolved: rows.filter(row => row.places.some(place => place.code)).length,
      unresolved: rows.filter(row => row.places.some(place => place.region === 'Needs location review')).length,
      countries: topCounts(rows, row => row.places.filter(place => place.code).map(place => place.name)),
    },
  };
}

function renderContentMetrics(metrics) {
  const md = value => String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>|]/g, '\\$&');
  const percent = value => value === null ? 'N/A' : `${value.toFixed(1)}%`;
  const signed = value => `${value >= 0 ? '+' : ''}${value}`;
  const role = value => value ? `${value.name} (${signed(value.delta)})` : 'None';
  const table = (heading, rows, first = 'Metric', second = 'Value') => [
    `### ${heading}`, '', `| ${first} | ${second} |`, '| --- | ---: |',
    ...rows.map(([name, value]) => `| ${md(name)} | ${md(value)} |`), '',
  ];
  const { marketOverview: market, remoteAvailability: remote, weeklyMovement: weekly,
    roleMovement: roles, textCoverage: coverage, geography } = metrics;
  return [
    '## Content metrics', '',
    'Derived counts for this feed. Shares use all current jobs unless stated. N/A means the denominator is zero.', '',
    ...table('Corpus overview', [
      ['Total jobs', market.total],
      ...market.arrangements.flatMap(row => [[`${row.name} jobs`, row.count], [`${row.name} share`, percent(row.share)]]),
      ...(remote ? [
        ['Explicit U.S. remote jobs', remote.us], ['International remote jobs', remote.international],
        ['Unique qualifying remote jobs', remote.unique], ['Jobs in both remote lists', remote.overlap],
        ['Explicit U.S. remote share', percent(remote.usShare)], ['Unique qualifying remote share', percent(remote.uniqueShare)],
      ] : []),
    ]),
    ...table('Weekly movement', [
      ['Weekly baseline jobs', weekly.baselineTotal], ['Added since weekly baseline', weekly.added],
      ['Removed since weekly baseline', weekly.removed], ['Net inventory change', signed(weekly.net)],
      ['Weekly churn', weekly.churn], ['Weekly churn rate', percent(weekly.churnRate)],
      ['Largest growing role group', role(roles.largestGrowing)], ['Largest declining role group', role(roles.largestDeclining)],
      ['Role groups growing', roles.growing], ['Role groups declining', roles.declining], ['Role groups unchanged', roles.unchanged],
    ]),
    'Changes describe corpus membership, not posting or closure dates. Churn = added + removed; its rate uses weekly baseline jobs. Largest role changes exclude Unknown; ties use name order. Group counts include Unknown and only groups present in either package.', '',
    ...table('Topic signals', [
      ['Searchable job text', `${coverage.searchable} / ${market.total} (${percent(coverage.share)})`],
      ['Jobs without searchable posting text', coverage.missing],
      ...metrics.topics.map(row => [row.name, `${row.count} / ${row.total} (${percent(row.share)})`]),
    ]),
    'Topic shares use only jobs with posting text at the main application URL. Explicit phrase matches can include company background; they do not prove a job requirement. Missing text is not a negative match.', '',
    ...table('Most common titles', metrics.titles.map(row => [row.name, row.count]), 'Normalized title', 'Jobs'),
    ...table('Most common company/source labels', metrics.companies.map(row => [row.name, row.count]), 'Normalized company/source label', 'Jobs'),
    'Company/source labels may include intermediaries. These are normalized keys, not verified employer names.', '',
    ...table('Geography coverage', [
      ['Jobs with at least one resolved country', geography.resolved],
      ['Jobs with unresolved or incomplete country grouping', geography.unresolved],
    ]),
    ...table('Top resolved countries', geography.countries.map(row => [row.name, row.count]), 'Country', 'Jobs'),
    'Multi-country listings can count toward more than one country. Country presence does not establish hiring eligibility. Coverage reuses the existing location-review flag; region-only and worldwide labels need not have a resolved country.', '',
  ];
}

module.exports = { buildContentMetrics, renderContentMetrics, compareMembership, roleChanges };
