const { jobKey } = require('./us-remote-daily-report');
const { categorizeTitle } = require('./title-category');
const { normalizeCompanyKey } = require('./company-key');

const sheetUrl = 'https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing';
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const md = value => text(value).replace(/[\\`*_[\]<>|]/g, '\\$&');
const unique = rows => [...new Map(rows.map(row => [jobKey(row), row])).values()];
const company = row => normalizeCompanyKey(row.Company) || jobKey(row);
const companyCount = rows => new Set(rows.map(company)).size;
const regions = {
  Americas: 'US CA MX AR BO BR CL CO CR CU DO EC GT HN JM NI PA PE PR PY SV UY VE',
  Europe: 'AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LT LU LV MD ME MK MT NL NO PL PT RO RS RU SE SI SK UA',
  'Asia and Oceania': 'AF AM AU AZ BD BN BT CN FJ GE HK ID IN JP KG KH KZ LA LK MM MN MO MY NP NZ PH PK SG TH TJ TL TM TW UZ VN VU WS KR',
  'Africa and Middle East': 'AE AO BF BH BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW IL IQ IR JO KE KM KW LB LR LS LY MA MG ML MR MU MW MZ NA NE NG OM PS QA RW SA SC SD SL SN SO SS ST SZ TD TG TN TR TZ UG YE ZA ZM ZW',
};
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = Object.entries(regions).flatMap(([region, codes]) => codes.split(' ').map(code => ({ code, region, name: displayNames.of(code) })));
const aliases = { US: ['USA', 'U.S.', 'US'], GB: ['UK', 'U.K.', 'Great Britain'], CZ: ['Czech Republic'], KR: ['South Korea'], TR: ['Turkey'], AE: ['UAE'], VN: ['Viet Nam'] };
const cityRules = [
  ['US', /\b(?:New York|San Francisco|Los Angeles|Chicago|Seattle|Boston|Washington,? DC|California|Virginia|Massachusetts|Texas|Missouri)\b/i],
  ['GB', /\b(?:London|Edinburgh|Manchester|Bristol)\b/i],
  ['CA', /\b(?:Toronto|Montreal|Vancouver|Ottawa|Ontario|Quebec|British Columbia)\b/i],
  ['IN', /\b(?:Bangalore|Bengaluru|Hyderabad|Pune|Mumbai|New Delhi|Chennai|Gurugram|Noida)\b/i],
  ['SE', /\bStockholm\b/i], ['DE', /\b(?:Berlin|Munich|Hamburg)\b/i], ['NL', /\bAmsterdam\b/i],
  ['AU', /\b(?:Sydney|Melbourne|Brisbane)\b/i], ['FR', /\bParis\b/i],
];
function contains(value, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z])${escaped}(?=$|[^a-z])`, 'i').test(value);
}
function locate(value) {
  const location = text(value);
  // Truncated grouped text must never be treated as a complete country list.
  if (/\+\d+ more/.test(location)) return [{ region: 'Needs location review', name: 'Incomplete location list' }];
  if (/\b(worldwide|anywhere in the world)\b/i.test(location)) return [{ region: 'Worldwide', name: 'Worldwide (source label)' }];
  const hits = countries.filter(c => [c.name, ...(aliases[c.code] || [])].some(name => contains(location, name)));
  for (const [code, pattern] of cityRules) {
    if (pattern.test(location) && !hits.some(c => c.code === code)) hits.push({ ...countries.find(c => c.code === code), inferred: true });
  }
  if (hits.length) {
    if (/\b(Europe|European Union)\b/i.test(location)) hits.push({ region: 'Europe', name: 'Europe / EU (country not specified)' });
    return hits;
  }
  if (/\bUS-[A-Z]{2}\b|,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)(?:\s|,|$)/.test(location)) return [{ ...countries.find(c => c.code === 'US'), inferred: true }];
  for (const [pattern, region, name] of [
    [/\b(Europe|European Union)\b/i, 'Europe', 'Europe / EU (country not specified)'],
    [/\b(LATAM|Latin America)\b/i, 'Americas', 'Latin America (country not specified)'],
    [/\b(APAC|Asia Pacific)\b/i, 'Asia and Oceania', 'APAC (country not specified)'],
    [/\bEMEA\b/i, 'Multiple regions', 'EMEA (country not specified)'],
    [/\bAfrica\b/i, 'Africa and Middle East', 'Africa (country not specified)'],
    [/\bMiddle East\b/i, 'Africa and Middle East', 'Middle East (country not specified)'],
  ]) if (pattern.test(location)) return [{ region, name }];
  return [{ region: 'Needs location review', name: 'Country not resolved' }];
}
function plainDescription(value) {
  return text(String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"));
}
const topics = [
  ['API documentation', /\b(?:API documentation|document(?:ing)? APIs?|API reference)\b/i],
  ['Docs as code', /\b(?:docs[ -]as[ -]code|documentation[ -]as[ -]code)\b/i],
  ['Knowledge bases', /\bknowledge bases?\b/i],
  ['Content design and UX writing', /\b(?:content design|UX writing|user experience writing)\b/i],
  ['Developer education', /\b(?:developer education|developer tutorials?|developer training)\b/i],
  ['Localization', /\b(?:localization|localisation|multilingual content)\b/i],
  ['Structured authoring', /\b(?:DITA|structured authoring|structured content)\b/i],
  ['Accessibility', /\b(?:WCAG|accessible content|content accessibility)\b/i],
];
function enrich(rows, details) {
  const byUrl = new Map(details.map(row => [jobKey({ 'Apply Link': row.URL }), row]));
  return unique(rows).map((row, index) => {
    const urls = [row['Apply Link'], ...(String(row['Additional Apply Links'] || '').match(/https?:\/\/[^\s|]+/g) || [])];
    const sources = urls.map(url => byUrl.get(jobKey({ 'Apply Link': url }))).filter(Boolean);
    const locations = /\+\d+ more/.test(row.Location) && sources.length === urls.length
      ? [...new Set(sources.map(r => text(r.Location)).filter(Boolean))].join(' | ') : row.Location;
    return { ...row, id: `job-${index + 1}`, category: categorizeTitle(row.Title), sources,
      places: locate(locations), fullLocation: locations,
      description: plainDescription(byUrl.get(jobKey(row))?.Description),
    };
  });
}
function group(rows, getKeys) {
  const result = new Map();
  for (const row of rows) for (const key of new Set(getKeys(row))) {
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return [...result].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
function variedExamples(rows, limit = 5) {
  const selected = [], seenCountries = new Set(), seenCompanies = new Set();
  for (const row of rows) {
    const codes = row.places.filter(p => p.code).map(p => p.code);
    if (codes.some(code => !seenCountries.has(code)) && !seenCompanies.has(company(row))) {
      selected.push(row); codes.forEach(code => seenCountries.add(code)); seenCompanies.add(company(row));
      if (selected.length === limit) return selected;
    }
  }
  for (const row of rows) {
    if (!seenCompanies.has(company(row))) { selected.push(row); seenCompanies.add(company(row)); }
    if (selected.length === limit) break;
  }
  return selected;
}
const refs = rows => rows.map(r => `- [${md(r.Title)} - ${md(r.Company)}](#${r.id}) · ${md(r.fullLocation)} · ${md(r['Work Arrangement'] || 'Unknown')}`).join('\n');
function buildDailyReview({ generatedAt, currentSnapshot, previousSnapshot, currentRows, previousRows, baselineRows, baselineSnapshot, details = [] }) {
  const rows = enrich(currentRows, details);
  const previous = unique(previousRows), baseline = unique(baselineRows);
  const previousKeys = new Set(previous.map(jobKey)), baselineKeys = new Set(baseline.map(jobKey));
  const currentKeys = new Set(rows.map(jobKey));
  const added = rows.filter(r => !previousKeys.has(jobKey(r)));
  const removed = previous.filter(r => !currentKeys.has(jobKey(r)));
  const categoryGroups = group(rows, r => [r.category]);
  const regionGroups = group(rows, r => r.places.map(p => p.region));
  const candidates = categoryGroups.filter(([name, jobs]) => !['Adjacent Roles', 'Unknown'].includes(name) && companyCount(jobs) >= 3);
  const countryCount = jobs => new Set(jobs.flatMap(r => r.places.filter(p => p.code).map(p => p.code))).size;
  const topicGroups = topics.map(([label, regex]) => ({ label, regex, jobs: rows.filter(r => regex.test(r.description)) })).filter(t => companyCount(t.jobs) >= 3);
  const out = ['# Daily Jobs Review', '', `Generated: ${generatedAt}`, '',
    `Current package: \`${currentSnapshot}\` · Previous package: \`${previousSnapshot}\``,
    `Weekly comparison baseline: \`${baselineSnapshot}\` (actual saved package; not a claim of first posting date).`, '',
    `[Open Good Documentation Jobs: full active list and other views](${sheetUrl})`, '',
    'Derived review material for choosing Substack subjects. Uses the saved daily package and its existing link checks; this command does not fetch jobs or recheck links.', '',
    '## Contents', '',
    '- [Possible post subjects](#post-subjects)', '- [Similar roles across countries](#similar-roles)',
    '- [Regional view](#regional-view)', '- [Common topics in posting text](#common-topics)',
    '- [Changes this week](#weekly-changes)', '- [All supporting jobs](#supporting-jobs)',
    '- [Remote comparison](#remote-comparison)', '',
    '## At a glance', '',
    `${rows.length} unique current application URLs · ${companyCount(rows)} normalized company labels · ${added.length} added since previous package · ${removed.length} removed from this output.`, '',
    ...group(rows, r => [r['Work Arrangement'] || 'Unknown']).map(([name, jobs]) => `- ${name}: ${jobs.length}`), '',
    'Counts describe this feed, not the whole job market. Company counts use normalized source labels; an intermediary is not proof of a distinct end employer. Multi-country jobs can occur in several groups. Overall counts count each primary application URL once.', '',
    'Country groups are browsing aids, not eligibility claims. City/state mappings are marked as derived. Source restrictions remain in each entry. Unknown or incomplete locations stay in review. Title groups suggest similar roles, not identical duties.', '',
    '<a id="post-subjects"></a>', '## Possible post subjects', '',
  ];
  for (const [name, jobs] of candidates.slice(0,6)) {
    const categoryIndex = categoryGroups.findIndex(([label]) => label === name);
    out.push(`### ${name}: roles to compare`, '',
      `**Pattern:** ${jobs.length} jobs across ${companyCount(jobs)} company labels and ${countryCount(jobs)} resolved countries.`, '',
      `**Possible post:** Compare ${name.toLowerCase()} openings by location and work arrangement.`, '',
      `**Evidence:** [Browse this role group](#role-${categoryIndex + 1}).`, '', refs(variedExamples(jobs)), '');
  }
  for (const [region, jobs] of regionGroups.filter(([name]) => Object.hasOwn(regions, name)).slice(0,4)) {
    const index = regionGroups.findIndex(([name]) => name === region);
    out.push(`### ${region}: compare work arrangements`, '',
      `**Pattern:** ${jobs.length} jobs across ${companyCount(jobs)} company labels. ${group(jobs, r => [r['Work Arrangement'] || 'Unknown']).map(([name, matches]) => `${name}: ${matches.length}`).join('; ')}.`, '',
      `**Possible post:** A selection of writing and related jobs in ${region}, grouped by country and work arrangement.`, '',
      `[Browse supporting jobs](#region-${index + 1}).`, '');
  }
  for (const t of topicGroups.slice(0,3)) out.push(`- **Posting-text subject:** ${t.label} appears in ${t.jobs.length} jobs across ${companyCount(t.jobs)} company labels. [See excerpts](#common-topics).`);
  if (!candidates.length) out.push('No role group meets the three-company threshold.');
  out.push('', '<a id="similar-roles"></a>', '## Similar roles across countries', '', 'Groups use the existing automated title categories, which can include false matches. Original titles and seniority remain visible. Counts include unresolved locations.', '');
  categoryGroups.forEach(([name, jobs], index) => {
    out.push(`<a id="role-${index + 1}"></a>`, `### ${name}`, '', `${jobs.length} jobs · ${companyCount(jobs)} company labels · ${countryCount(jobs)} resolved countries.`, '');
    const repeated = group(jobs, r => [text(r.Title).toLowerCase()]).filter(([, matches]) => companyCount(matches) >= 2);
    if (repeated.length) out.push('Repeated titles across company labels:', '', ...repeated.slice(0,8).map(([title, matches]) => `- ${md(title)}: ${matches.length} jobs, ${companyCount(matches)} company labels.`), '');
    for (const [place, matches] of group(jobs, r => r.places.map(p => p.name))) out.push(`#### ${place}`, '', refs(matches), '');
  });
  out.push('<a id="regional-view"></a>', '## Regional view', '', 'Within each region: country, then work arrangement. Jobs in several countries are repeated for browsing.', '');
  for (const [region, jobs] of regionGroups) {
    out.push(`<a id="region-${regionGroups.findIndex(([name]) => name === region) + 1}"></a>`, `### ${region}`, '', `${jobs.length} jobs · ${companyCount(jobs)} company labels. Main title groups: ${group(jobs, r => [r.category]).slice(0,3).map(([name, matches]) => `${name} (${matches.length})`).join('; ')}.`, '');
    for (const [country, matches] of group(jobs, r => r.places.filter(p => p.region === region).map(p => p.name))) {
      out.push(`#### ${country}`, '');
      for (const [arrangement, subset] of group(matches, r => [r['Work Arrangement'] || 'Unknown'])) out.push(`##### ${arrangement} (${subset.length})`, '', refs(subset), '');
    }
  }
  out.push('<a id="common-topics"></a>', '## Common topics in posting text', '',
    `Posting text matched to ${rows.filter(r => r.description).length} of ${rows.length} current jobs by primary application URL in the same saved package.`, '',
    'These are phrase matches in posting text, not confirmed requirements or a claim of growing demand. Each group needs at least three normalized company labels. Excerpts are short, HTML-stripped source text; context can include company background. Read the linked entry before making a stronger claim.', '');
  for (const {label, regex, jobs} of topicGroups) {
    out.push(`### ${label}`, '', `${jobs.length} jobs · ${companyCount(jobs)} company labels.`, '');
    for (const row of jobs) {
      const match = regex.exec(row.description), start = Math.max(0, match.index - 65);
      const excerpt = row.description.slice(start, match.index + match[0].length + 100);
      out.push(`- [${md(row.Title)} - ${md(row.Company)}](#${row.id}) · ${md(row.fullLocation)}`, `  > …${md(excerpt)}…`, '');
    }
  }
  if (!topicGroups.length) out.push('No supported topic meets the three-company threshold.', '');
  out.push('<a id="weekly-changes"></a>', '## Changes this week', '',
    `Comparison: ${baselineSnapshot} to ${currentSnapshot}. Counts compare membership in these two packages. They do not measure hiring, closure, or first publication.`, '',
    '| Title group | Baseline | Current | Net change |', '| --- | ---: | ---: | ---: |');
  const categories = new Set([...categoryGroups.map(([name]) => name), ...baseline.map(r => categorizeTitle(r.Title))]);
  for (const name of categories) {
    const before = baseline.filter(r => categorizeTitle(r.Title) === name).length, now = rows.filter(r => r.category === name).length;
    out.push(`| ${name} | ${before} | ${now} | ${now - before >= 0 ? '+' : ''}${now - before} |`);
  }
  out.push('', '### In the current package, absent from the weekly baseline', '', refs(rows.filter(r => !baselineKeys.has(jobKey(r)))) || 'None.', '',
    '### Added since the previous package', '', refs(added) || 'None.', '',
    '### Continuing jobs to consider', '', 'One example per title group, in existing sheet order. These are not ranked recommendations.', '',
    refs(categoryGroups.map(([, jobs]) => jobs.find(r => baselineKeys.has(jobKey(r)))).filter(Boolean)), '',
    '<a id="supporting-jobs"></a>', '## All supporting jobs', '', 'Full current candidate list in sheet order. Metadata comes from the saved package.', '');
  for (const row of rows) {
    out.push(`<a id="${row.id}"></a>`, `### ${md(row.Title)} - ${md(row.Company)}`, '',
      `- **Location:** ${md(row.fullLocation) || 'Not stated'}`,
      `- **Work arrangement:** ${md(row['Work Arrangement']) || 'Unknown'} · **Title group:** ${row.category}`,
      `- **Salary:** ${md(row.Salary) || 'Not published in package'}`,
      `- **Posted:** ${md(row['Posted Date']) || 'Not published in package'} · **Last seen in feed:** ${md(row['Last Checked']) || 'Not recorded'}`,
      `- **List status:** ${previousKeys.has(jobKey(row)) ? 'Continuing since previous package' : 'Added since previous package'}`,
      `- [Apply](${text(row['Apply Link'])})`);
    if (row['Additional Apply Links']) out.push(`- **Other location links:** ${md(row['Additional Apply Links'])}`);
    if (row.places.some(p => p.inferred)) out.push('- **Derived location:** Country mapped from city/state text. Source location above remains authoritative.');
    if (row.places.some(p => p.region === 'Needs location review')) out.push('- **Location review:** Country grouping is unresolved or incomplete.');
    out.push('');
  }
  out.push(`[Open Good Documentation Jobs: full active list and other views](${sheetUrl})`, '');
  return out.join('\n');
}
module.exports = { buildDailyReview, locate, enrich, plainDescription, group, variedExamples, topics, companyCount, sheetUrl, countries, regions };
