const { enrich, group, variedExamples, topics, companyCount, sheetUrl, countries, regions } = require('./daily-jobs-review');
const { jobKey } = require('./us-remote-daily-report');
const { categorizeTitle, titleCategories } = require('./title-category');
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const md = value => clean(value).replace(/[\\`*_[\]<>|]/g, '\\$&');
const short = (value, limit = 200) => { const s = clean(value); return s.length > limit ? `${s.slice(0, limit - 1)}…` : s; };
const groupNames = Object.fromEntries(titleCategories.map(name => [slug(name), name]));
function parseOptions(argv) {
  const options = { limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--topics', '--changes', '--open', '--help'].includes(key)) { options[key.slice(2)] = true; continue; }
    if (!['--region', '--country', '--group', '--work', '--limit'].includes(key)) throw new Error(`Unknown option: ${key}. Use --help.`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value.`);
    options[key.slice(2)] = value;
  }
  if (options.topics && options.changes) throw new Error('Use --topics or --changes, not both.');
  if (!/^\d+$/.test(String(options.limit)) || +options.limit < 1 || +options.limit > 100) throw new Error('--limit must be an integer from 1 to 100.');
  options.limit = +options.limit;
  if (options.region) {
    const name = [...Object.keys(regions), 'Worldwide', 'Multiple regions', 'Needs location review'].find(r => slug(r) === slug(options.region));
    if (!name) throw new Error(`Unknown region. Use: ${Object.keys(regions).map(slug).join(', ')}, worldwide, multiple-regions, needs-location-review.`);
    options.region = name;
  }
  if (options.country) {
    const aliases = { uk: 'GB', usa: 'US', 'united-states': 'US', 'united-kingdom': 'GB' };
    const code = aliases[slug(options.country)] || options.country.toUpperCase();
    const country = countries.find(c => c.code === code || slug(c.name) === slug(options.country));
    if (!country) throw new Error(`Unknown country: ${options.country}. Use a country name or two-letter code.`);
    options.country = country.code;
  }
  if (options.group) {
    const name = groupNames[slug(options.group)];
    if (!name) throw new Error(`Unknown group. Use: ${Object.keys(groupNames).join(', ')}.`);
    options.group = name;
  }
  if (options.work) {
    options.work = slug(options.work).replace('on-site', 'onsite');
    if (!['remote', 'hybrid', 'onsite', 'unknown'].includes(options.work)) throw new Error('--work must be remote, hybrid, onsite, or unknown.');
  }
  options.focused = Boolean(options.region || options.country || options.group || options.work || options.topics || options.changes);
  return options;
}
function reportFilename(options) {
  if (!options.focused) return 'all-remote-daily-report.md';
  const parts = ['jobs-view'];
  for (const key of ['region', 'country', 'group', 'work']) if (options[key]) parts.push(key, slug(options[key]));
  if (options.topics) parts.push('topics');
  if (options.changes) parts.push('changes');
  return `${parts.join('-')}.md`;
}
function filterRows(rows, options) {
  return rows.filter(r => (!options.region || r.places.some(p => p.region === options.region))
    && (!options.country || r.places.some(p => p.code === options.country))
    && (!options.group || r.category === options.group)
    && (!options.work || clean(r['Work Arrangement'] || 'Unknown').toLowerCase() === options.work));
}
const help = `Remote report with an opening snapshot (snapshot maximum 300 lines):
  npm run allremotediff
Focused views (20 examples by default):
  npm run allremotediff -- --region europe
  npm run allremotediff -- --country india
  npm run allremotediff -- --group technical-writing
  npm run allremotediff -- --region europe --work hybrid
  npm run allremotediff -- --topics
  npm run allremotediff -- --changes
Add --limit 10 (1–100) to change the total example limit in a focused view.
Focused views use separate files. All views reuse saved packages; no link checks.
For generation without opening a file: npm run jobs:report-all-remote -- [options]`;
function buildSnapshot(input, options = parseOptions([])) {
  const all = enrich(input.currentRows, input.details || []);
  const rows = filterRows(all, options);
  const previous = filterRows(enrich(input.previousRows, input.previousDetails || []), options);
  const baseline = filterRows(enrich(input.baselineRows, input.baselineDetails || []), options);
  const keys = jobs => new Set(jobs.map(jobKey));
  const previousKeys = keys(previous), baselineKeys = keys(baseline), currentKeys = keys(rows);
  const added = rows.filter(r => !previousKeys.has(jobKey(r)));
  const absent = previous.filter(r => !currentKeys.has(jobKey(r)));
  const weeklyAdded = rows.filter(r => !baselineKeys.has(jobKey(r)));
  const categories = group(rows, r => [r.category]);
  const matches = topics.map(([label, regex]) => ({ label, regex, rows: rows.filter(r => regex.test(r.description)) }))
    .filter(t => companyCount(t.rows) >= 3).sort((a, b) => companyCount(b.rows) - companyCount(a.rows));
  const selected = options.focused;
  const out = [selected ? '# Jobs: focused view' : '# Daily Jobs Snapshot', '',
    `Generated: ${input.generatedAt}`, `Packages: ${input.currentSnapshot} (current); ${input.previousSnapshot} (previous); ${input.baselineSnapshot} (weekly baseline).`, '',
    `[Good Documentation Jobs: full active list and other views](${sheetUrl})`, '',
    'Derived patterns in this feed. Uses saved daily data and existing link checks. Company counts use normalized source labels, including intermediaries. Location groups do not establish eligibility. Topic matches are not confirmed requirements.', ''];
  if (selected) out.push(`Filters: ${['region','country','group','work'].filter(k => options[k]).map(k => `${k}: ${options[k]}`).join('; ') || 'All locations and roles'}. View: ${options.topics ? 'posting topics' : options.changes ? 'changes' : 'grouped jobs'}.`, '');
  out.push('## Overview', '', `${rows.length} current jobs · ${companyCount(rows)} company labels · ${added.length} added · ${absent.length} removed since the previous package.`, '',
    ...group(rows, r => [r['Work Arrangement'] || 'Unknown']).map(([name, jobs]) => `- ${name}: ${jobs.length}`), '',
    'Added and removed describe list membership, not posting or closure dates. Country-based changes can also reflect location parsing. Weekly figures compare the named baseline with the current package.', '');
  const example = row => `- [${md(short(row.Title, 120))} - ${md(short(row.Company, 65))}](${clean(row['Apply Link'])}) · ${md(short(row.fullLocation, 160))} · ${md(row['Work Arrangement'] || 'Unknown')}${row.places.some(p => p.inferred) ? ' · Country derived from city/state' : ''}`;
  const movement = () => {
    out.push('## Weekly changes by role group', '', '| Role group | Baseline | Current | Change |', '| --- | ---: | ---: | ---: |');
    for (const name of titleCategories) {
      const before = baseline.filter(r => r.category === name).length, now = rows.filter(r => r.category === name).length;
      if (before || now) out.push(`| ${name} | ${before} | ${now} | ${now - before >= 0 ? '+' : ''}${now - before} |`);
    }
    out.push('', `${weeklyAdded.length} current jobs were absent from the weekly baseline.`, '');
  };
  if (!selected) {
    out.push('## Possible post subjects', '', 'Examples vary by country and company where possible. They are not ranked recommendations.', '');
    const ideas = categories.filter(([name, jobs]) => !['Adjacent Roles', 'Unknown'].includes(name) && companyCount(jobs) >= 3).slice(0,3);
    for (const [name, jobs] of ideas) {
      const countryCount = new Set(jobs.flatMap(r => r.places.filter(p => p.code).map(p => p.code))).size;
      out.push(`### ${name} across locations`, '', `${jobs.length} jobs · ${companyCount(jobs)} company labels · ${countryCount} resolved countries. Similar titles suggest a comparison; duties can differ.`, '',
        ...variedExamples(jobs, 3).map(example), '', `More: \`npm run allremotediff -- --group ${slug(name)}\``, '');
    }
    const region = group(rows, r => r.places.filter(p => p.region !== 'Americas' && Object.hasOwn(regions,p.region)).map(p => p.region))[0];
    if (region) out.push(`### ${region[0]}: compare work arrangements`, '', `${region[1].length} jobs · ${companyCount(region[1])} company labels. ${group(region[1], r => [r['Work Arrangement'] || 'Unknown']).map(([name, jobs]) => `${name}: ${jobs.length}`).join('; ')}.`, '', ...variedExamples(region[1],3).map(example), '', `More: \`npm run allremotediff -- --region ${slug(region[0])}\``, '');
    if (matches[0]) {
      const topic = matches[0];
      out.push(`### Posting topic: ${topic.label}`, '', `${topic.rows.length} jobs across ${companyCount(topic.rows)} company labels mention this topic. A phrase match is a subject to explore, not proof of a shared requirement.`, '', ...variedExamples(topic.rows,3).map(example), '', 'More: `npm run allremotediff -- --topics`', '');
    }
    if (!ideas.length && !region && !matches.length) out.push('Not enough evidence for post subjects in this package.', '');
    movement();
  } else {
    let pool = rows;
    if (options.changes) { movement(); pool = [...added, ...weeklyAdded.filter(r => !added.some(a => jobKey(a) === jobKey(r)))]; }
    if (options.topics) {
      out.push('## Repeated posting topics', '', `Posting text is available for ${rows.filter(r => r.description).length} of ${rows.length} matching jobs. Topics need three company labels. Excerpts can include background text; review context before stating a requirement.`, '',
        '| Topic | Jobs | Company labels |', '| --- | ---: | ---: |', ...matches.map(t => `| ${t.label} | ${t.rows.length} | ${companyCount(t.rows)} |`), '');
      pool = [...new Map(matches.flatMap(t => t.rows).map(r => [jobKey(r),r])).values()];
    } else if (!options.changes) {
      out.push('## Main role groups', '', ...categories.map(([name,jobs]) => `- ${name}: ${jobs.length} jobs, ${companyCount(jobs)} company labels.`), '');
    }
    const examples = variedExamples(pool, options.limit);
    // Fill any remaining slots even when several jobs share an employer.
    for (const row of pool) if (examples.length < options.limit && !examples.includes(row)) examples.push(row);
    out.push('## Selected examples', '', `Showing ${examples.length} of ${pool.length} candidate jobs. Limit: ${options.limit} total examples. Full list: use the sheet.`, '');
    if (!examples.length) out.push('No matching examples in this package.', '');
    for (const row of examples) {
      out.push(example(row), `  - Salary: ${md(short(row.Salary || 'Not published in package',180))}. Posted: ${md(row['Posted Date'] || 'Not recorded')}. Last seen: ${md(row['Last Checked'] || 'Not recorded')}.`);
      if (options.changes) out.push(`  - ${previousKeys.has(jobKey(row)) ? 'Present in previous package; absent from weekly baseline.' : 'Added since previous package.'}`);
      if (options.topics) {
        const topic = matches.find(t => t.regex.test(row.description));
        const match = topic.regex.exec(row.description);
        out.push(`  - Topic: ${topic.label}. Source excerpt: “…${md(row.description.slice(Math.max(0,match.index-45), match.index + match[0].length+100))}…”`);
      }
      out.push('');
    }
  }
  out.push('## Other views', '', '```sh', ...help.split('\n').filter(line => line.startsWith('  npm run')).map(line => line.trim()), '```', '',
    'Combine filters: `--region europe --work hybrid`. Focused views show 20 examples by default; add `--limit 10` to change this (1–100). Each view writes a separate file.', '',
    `Location review: ${rows.filter(r => r.places.some(p => p.region === 'Needs location review')).length} jobs have unresolved or incomplete country groups.`, '',
    `[Open the full active sheet](${sheetUrl})`, '');
  const result = out.join('\n');
  if (!selected && result.split('\n').length > 300) throw new Error('Daily snapshot exceeded the 300-line limit.');
  return result;
}
module.exports = { buildSnapshot, parseOptions, reportFilename, filterRows, help };
