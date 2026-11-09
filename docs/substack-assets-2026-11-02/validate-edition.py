#!/usr/bin/env python3
"""Validate the November 2 draft against the two saved public packages.

Reads local files. Writes only validation-results.json beside this script.
No refresh, network, publication, or source mutation occurs.
"""
from pathlib import Path
import collections
import csv
import hashlib
import html
from html.parser import HTMLParser
import json
import math
import re
import subprocess
import xml.etree.ElementTree as ET

from PIL import Image

ASSETS = Path(__file__).resolve().parent
DOCS = ASSETS.parent
ROOT = DOCS.parent
EVIDENCE = json.loads((ASSETS / 'source-evidence.json').read_text())
VISUAL = json.loads((DOCS / 'substack-visual-data-2026-11-02.json').read_text())
ARTICLE = (DOCS / 'substack-draft-2026-11-02.md').read_text()
METADATA = (DOCS / 'substack-metadata-2026-11-02.md').read_text()
checks = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def read_csv(path):
    with path.open() as stream:
        return list(csv.DictReader(stream))


def application_links(row):
    return [row['Apply Link']] + [u.strip() for u in row['Additional Apply Links'].split(' | ') if u.strip()]


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', value))).strip()


def md(value):
    return value.replace('\\', '\\\\').replace('[', '\\[').replace(']', '\\]')


def main():
    current_path = ROOT / EVIDENCE['source_csv']
    baseline_path = ROOT / EVIDENCE['baseline_csv']
    current, previous = read_csv(current_path), read_csv(baseline_path)
    check(current_path.parent.name == VISUAL['current']['package_id'] == '20261102-0537', 'Current package identity')
    check(baseline_path.parent.name == VISUAL['baseline']['package_id'] == '20261026-0638', 'Baseline package identity')
    for path, name in [(current_path.parent, 'current'), (baseline_path.parent, 'baseline')]:
        readme = (path / 'README_GSHEET_PACKAGE.md').read_text()
        check('Generated: ' + VISUAL[name]['generated_at'] in readme, name + ' package timestamp')
        schema = json.loads((path / 'public-schema.json').read_text())
        actual = current if name == 'current' else previous
        check(schema['schemaVersion'] == 2 and schema['rowCount'] == len(actual), name + ' public schema version and count')
        check(schema['publicHeaders'] == list(actual[0]), name + ' public columns')
    check(list(current[0]) == list(previous[0]), 'Matching snapshot scope and columns')
    check(current_path.read_bytes() == (current_path.parent.parent / 'latest' / current_path.name).read_bytes(), 'Current CSV equals latest copy')

    # Use the existing repository identity function as an independent check.
    js = """
const fs = require('fs');
const {parseCsvRecords} = require('./src/lib/csv');
const {jobKey} = require('./src/lib/us-remote-daily-report');
const paths = process.argv.slice(1);
const rows = paths.map(p => parseCsvRecords(fs.readFileSync(p, 'utf8')).rows);
const [c,p] = rows.map(items => new Set(items.map(jobKey)));
console.log(JSON.stringify({currentKeys:[...c],previousKeys:[...p],added:[...c].filter(k=>!p.has(k)),removed:[...p].filter(k=>!c.has(k)),continuing:[...c].filter(k=>p.has(k))}));
"""
    comparison = json.loads(subprocess.check_output(['node', '-e', js, str(current_path), str(baseline_path)], cwd=ROOT))
    ck, pk = set(comparison['currentKeys']), set(comparison['previousKeys'])
    check(len(ck) == len(current) and len(pk) == len(previous), 'Unique nonblank primary URLs in both snapshots')
    arrangements = collections.Counter(r['Work Arrangement'] for r in current)
    expected = {
        'total_entries': len(current),
        'remote_entries': arrangements['Remote'],
        'hybrid_entries': arrangements['Hybrid'],
        'onsite_entries': arrangements['Onsite'],
        'unknown_entries': arrangements['Unknown'],
        'grouped_entries': sum(r['Location'].startswith('Multiple locations (') for r in current),
        'application_links': sum(len(application_links(r)) for r in current),
        'previous_total': len(previous),
        'additions': len(comparison['added']),
        'removals': len(comparison['removed']),
        'continuing': len(comparison['continuing']),
        'net_change': len(current) - len(previous),
        'remote_percent': 100 * arrangements['Remote'] / len(current),
    }
    check(expected == VISUAL['metrics'] == EVIDENCE['metrics'], 'All metrics independently match the saved CSVs')
    check(sum(arrangements.values()) == 748 and set(arrangements) == {'Remote', 'Hybrid', 'Onsite', 'Unknown'}, 'Arrangement reconciliation')
    check(735 + expected['additions'] - expected['removals'] == 748, 'Previous + additions - removals = current')
    check(expected['continuing'] + expected['additions'] == 748, 'Continuing + additions = current')
    check(expected['continuing'] + expected['removals'] == 735, 'Continuing + removals = previous')
    normalize = lambda s: re.sub(r'/+$', '', re.sub(r'\s+', ' ', s).strip().lower())
    for kind in ['added', 'removed', 'continuing']:
        check(set(map(normalize, EVIDENCE[kind + '_primary_urls'])) == set(comparison[kind]), kind + ' evidence URL set')
    all_current_links = {u for r in current for u in application_links(r)}
    retained = [r for r in previous if normalize(r['Apply Link']) in comparison['removed'] and r['Apply Link'] in all_current_links]
    check(retained == EVIDENCE['removed_primary_links_retained_as_additional'] and len(retained) == 3, 'Three removed primary keys retained as current additional links')

    details = {r['URL']: r for r in read_csv(current_path.parent / '03_top_matches_full.csv')}
    saved_checks = {r['Apply Link']: r for r in read_csv(current_path.parent / '01_good_documentation_jobs-url-review.csv')}
    bullets = [line for line in ARTICLE.splitlines() if re.match(r'^- \[.*\]\(<https://', line)]
    selection = EVIDENCE['selected_entries']
    check(len(bullets) == len(selection) == 40, '40 linked selections')
    check(len({s['record']['Apply Link'] for s in selection}) == 40, 'No repeated selected primary entries')
    check(dict(collections.Counter(s['section'] for s in selection)) == EVIDENCE['section_counts'], 'Section counts 6 / 12 / 12 / 10')
    selected_urls = []
    for s, line in zip(selection, bullets):
        r = s['record']
        check(current[s['csv_record_number'] - 2] == r, 'Exact CSV record: ' + r['Title'])
        employer_end = s['display_employer'] + ('' if s['display_employer'].endswith('.') else '.')
        check(line.startswith(f"- [{md(r['Title'])}](<{r['Apply Link']}>): {employer_end}"), 'Exact title, primary URL, and verified display employer: ' + r['Title'])
        check(r['Location'] + '. Work arrangement: ' + r['Work Arrangement'] + '.' in line, 'Exact location and arrangement: ' + r['Title'])
        urls = re.findall(r'\]\(<(https://[^>]+)>\)', line)
        check(urls == application_links(r), 'Every application link in source order: ' + r['Title'])
        selected_urls.extend(urls)
        description = plain(details[r['Apply Link']]['Description'])
        check(s['employer_evidence'].lower() in description.lower(), 'Saved employer-name evidence: ' + s['display_employer'])
        check(s['saved_description'] == details[r['Apply Link']]['Description'], 'Saved description preserved: ' + r['Title'])
        check(s['editorial_note'] in line, 'Editorial limit retained: ' + r['Title'])
        check(saved_checks[r['Apply Link']]['UrlCheckStatus'] == 'Good' and saved_checks[r['Apply Link']]['UrlCheckHttpStatus'] == '200', 'Saved successful primary URL check: ' + r['Title'])
        if s['section'].endswith('remote jobs'):
            check(r['Work Arrangement'] == 'Remote', 'Explicit remote classification: ' + r['Title'])
        for u, component in zip(urls, s['application_records']):
            check(component == {k: details[u][k] for k in component}, 'Exact component application record: ' + u)
    check(len(selected_urls) == EVIDENCE['selected_application_link_count'] == 45, '45 application links including 5 additional links')
    check('Arrangement needs review' in ARTICLE and 'Eligible U.S. states only' in ARTICLE, 'Arrangement conflict and geographic limits visible')
    check('Three removed primary links remain as additional links' in ARTICLE, 'Grouping comparison limit visible')
    check('130 remote, 123 hybrid, 462 onsite, and 33' in ARTICLE, 'Opening snapshot counts')
    for phrase in ['132 entries were added and 119 were removed', 'net increase of 13', '26 entries contain multiple postings', '830 application links', '616 entries continue', '17.4% of the 748-entry list']:
        check(phrase in ARTICLE, 'Article metric: ' + phrase)

    check(VISUAL['edition_date'] == '2026-11-02', 'Supplied edition date')
    check('# Writing and documentation jobs\n' in ARTICLE and '> Week of November 2, 2026\n' in ARTICLE, 'Exact article title and subtitle')
    headings = re.findall(r'^## (.+)$', ARTICLE, re.M)
    check(headings == ['A quick look at this week’s numbers', 'From the current feed', 'U.S. remote jobs', 'International remote jobs', 'Hybrid and onsite jobs', 'Find more jobs', 'Sources and dates'], 'Required article section order')
    seo = EVIDENCE['seo_description']
    check(len(seo) == EVIDENCE['seo_characters'] == 131 and 50 <= len(seo) <= 160 and seo in METADATA, 'SEO length and metadata match')
    for word in ['writing', 'documentation', 'technical writing', 'content design', 'Remote jobs']:
        check(word in seo, 'SEO term: ' + word)
    sheet = 'https://docs.google.com/spreadsheets/d/1rECWXCGhDKUiB3-LIwEEe1teaPWaGxgSK28AZADFF4g/edit?usp=sharing'
    footer = f'[Good Doc Jobs]({sheet}) is free to use and share. No signup needed.\n\nIf you find this work useful and can support it, [a paid subscription](https://docadam.substack.com/subscribe) helps fund my time maintaining the feed and writing these posts. The sheet stays free for everyone.'
    check(ARTICLE.rstrip().endswith(footer), 'Exact user-approved footer and links')
    footer_plain = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', footer)
    footer_plain = re.sub(r'\s+', ' ', footer_plain)
    class TextReader(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []
        def handle_data(self, value):
            self.parts.append(value)
        def handle_endtag(self, tag):
            if tag in {'p', 'li', 'h1', 'h2', 'h3'}:
                self.parts.append(' ')
    for day in ['19', '26']:
        reader = TextReader()
        reader.feed((ASSETS / f'published-reference-2026-10-{day}.html').read_text())
        check(footer_plain in re.sub(r'\s+', ' ', ''.join(reader.parts)), 'Footer matches October ' + day + ' published body')
    check('—' not in ARTICLE and '—' not in METADATA, 'No em dashes in new publication prose')
    check('Inc..' not in ARTICLE, 'No duplicate employer punctuation')

    bar = VISUAL['segmented_bar']
    offset = 136.0
    for segment, label in zip(bar['segments'], ['Remote', 'Hybrid', 'Onsite', 'Unknown']):
        count = arrangements[label]
        check(segment['label'] == label and segment['count'] == count, 'Visual category and count: ' + label)
        check(math.isclose(segment['fraction'], count / 748, abs_tol=1e-12), 'Visual fraction: ' + label)
        check(math.isclose(segment['x'], offset, abs_tol=1e-9) and math.isclose(segment['width_px'], count / 748 * 1360, abs_tol=1e-9), 'Proportional bar: ' + label)
        offset += segment['width_px']
    check(math.isclose(offset, 1496, abs_tol=1e-9), 'Segment widths sum to full 1360-pixel bar')
    svg_ns = {'s': 'http://www.w3.org/2000/svg'}
    for kind in ['cover', 'statistics']:
        svg_path = ASSETS / f'substack-{kind}-2026-11-02.svg'
        svg = ET.parse(svg_path).getroot()
        values = [''.join(t.itertext()) for t in svg.findall('.//s:text', svg_ns)]
        check(svg.attrib['width'] == '1600' and svg.attrib['height'] == '900', kind + ' editable SVG dimensions')
        for count in ['748', '130', '123', '462', '33']:
            check(count in values, kind + ' SVG value ' + count)
        for label in ['Remote', 'Hybrid', 'Onsite', 'Unknown', 'A', 'B', 'C', 'D', 'E']:
            check(label in values, kind + ' SVG label ' + label)
        if kind == 'cover':
            check('Week of November 2, 2026.' in values, 'Cover edition date')
        else:
            check(all(v in values for v in ['132', '119', '+13']), 'Statistics change labels')
            check(VISUAL['statistics']['source_label'] in values, 'Statistics source and comparison dates')
            rectangles = [r for r in svg.findall('.//s:rect', svg_ns) if r.attrib.get('y') == '450' and r.attrib.get('height') == '56']
            check(len(rectangles) == 4, 'Four actual SVG bar segments')
            for r, segment in zip(rectangles, bar['segments']):
                check(math.isclose(float(r.attrib['x']), segment['x'], abs_tol=1e-8) and math.isclose(float(r.attrib['width']), segment['width_px'], abs_tol=1e-8) and r.attrib['fill'] == segment['color'], 'Rendered SVG segment matches JSON: ' + segment['label'])
        with Image.open(ASSETS / f'substack-{kind}-2026-11-02.png') as image:
            check(image.format == 'PNG' and image.size == (1600, 900), kind + ' actual PNG format and 16:9 size')
            if kind == 'statistics':
                for segment in bar['segments']:
                    sample = image.convert('RGB').getpixel((int(segment['x'] + segment['width_px'] / 2), 478))
                    color = tuple(bytes.fromhex(segment['color'].lstrip('#')))
                    check(sample == color, 'PNG segment color: ' + segment['label'])

    for file, digest in EVIDENCE['source_hashes'].items():
        check(hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, 'Preserved source or existing work: ' + file)
    new_text = list(ASSETS.rglob('*.py')) + list(ASSETS.rglob('*.json')) + list(ASSETS.rglob('*.svg')) + list(ASSETS.rglob('*.md'))
    new_text += [DOCS / f'substack-{kind}-2026-11-02.{ext}' for kind, ext in [('draft', 'md'), ('review', 'md'), ('metadata', 'md'), ('visual-data', 'json')]]
    for file in new_text:
        check(all(line == line.rstrip() for line in file.read_text().splitlines()), 'No trailing whitespace: ' + str(file.relative_to(ROOT)))
    for file in [DOCS / 'substack-draft-2026-11-02.md', DOCS / 'substack-review-2026-11-02.md', DOCS / 'substack-metadata-2026-11-02.md']:
        for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
            if not target.startswith(('http', '<http')):
                check((file.parent / target).exists(), 'Local document link: ' + target)
    subprocess.run(['git', 'diff', '--check'], cwd=ROOT, check=True)
    checks.append('git diff --check')
    result = {'status': 'PASS', 'checks_passed': len(checks), 'selected_entries': 40, 'selected_application_links': 45, 'metrics': expected, 'checks': checks, 'scope': 'Local saved-data and artifact validation. No live job checks. Visual inspection is recorded separately in the review.'}
    (ASSETS / 'validation-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['status', 'checks_passed', 'selected_entries', 'selected_application_links', 'metrics']}, indent=2))


if __name__ == '__main__':
    main()
