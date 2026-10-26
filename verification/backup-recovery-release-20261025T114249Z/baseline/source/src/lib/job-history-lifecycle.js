// Derived lifecycle evidence for the isolated prototype; no employer closure inference.
const crypto = require('node:crypto');
const { query } = require('./jobs-history');
const { q, LIMITS } = require('./job-history-bounded-storage');
const { PROJECTION } = require('./job-history-storage');
const RULE = 'observed-presence-1';

async function installLifecycleViews(c) {
  await c.run(`
    CREATE OR REPLACE VIEW history_ordered_runs AS
    WITH previous AS (SELECT *, row_number() OVER(ORDER BY snapshot_id) ordinal,
      lag(observed_at) OVER(ORDER BY snapshot_id) previous_time,
      lag(time_source) OVER(ORDER BY snapshot_id) previous_clock,
      lag(strptime(substr(snapshot_id,1,8),'%Y%m%d')) OVER(ORDER BY snapshot_id) previous_day
      FROM history_v2_runs), flags AS (SELECT *,
      coverage_changes <> '[]' coverage_changed,
      time_source <> 'recorded_utc' OR (previous_clock='recorded_utc' AND observed_at<previous_time) time_problem,
      greatest(0,date_diff('day',previous_day,strptime(substr(snapshot_id,1,8),'%Y%m%d'))-1) calendar_gap_days
      FROM previous)
    SELECT *, sum(coverage_changed::INTEGER) OVER(ORDER BY snapshot_id) coverage_prefix,
      sum(coalesce(time_problem,false)::INTEGER) OVER(ORDER BY snapshot_id) time_prefix,
      sum(calendar_gap_days) OVER(ORDER BY snapshot_id) gap_prefix FROM flags;
    CREATE OR REPLACE VIEW history_presence AS
    WITH subjects AS (
      SELECT 'shortlist' stream, canonical_url_key subject_key, snapshot_id, selected_raw_row_number raw_row_number, content_id
      FROM history_v2_observations
      UNION ALL
      SELECT 'export' stream, subject_key, snapshot_id, min(raw_row_number), NULL::VARCHAR content_id
      FROM history_v2_export_rows WHERE subject_key IS NOT NULL GROUP BY subject_key,snapshot_id)
    SELECT s.*, r.* EXCLUDE(snapshot_id) FROM subjects s JOIN history_ordered_runs r USING(snapshot_id);
    CREATE OR REPLACE VIEW history_presence_neighbors AS
    SELECT *, lag(ordinal) OVER w previous_ordinal, lag(snapshot_id) OVER w previous_snapshot,
      lag(raw_row_number) OVER w previous_raw_row, lag(content_id) OVER w previous_content,
      lag(coverage_prefix) OVER w previous_coverage, lag(gap_prefix) OVER w previous_gap,
      lag(time_prefix) OVER w previous_time_prefix, lag(coalesce(time_problem,false)) OVER w previous_clock_problem
    FROM history_presence WINDOW w AS(PARTITION BY stream,subject_key ORDER BY ordinal);
    CREATE OR REPLACE VIEW history_numbered_presence AS
    SELECT *, sum(CASE WHEN previous_ordinal IS NULL OR ordinal>previous_ordinal+1 THEN 1 ELSE 0 END)
      OVER(PARTITION BY stream,subject_key ORDER BY ordinal) period_number FROM history_presence_neighbors;
    CREATE OR REPLACE VIEW history_presence_periods AS
    WITH periods AS (SELECT stream,subject_key,period_number,
      first(snapshot_id ORDER BY ordinal) first_snapshot, last(snapshot_id ORDER BY ordinal) last_snapshot,
      first(raw_row_number ORDER BY ordinal) first_raw_row, last(raw_row_number ORDER BY ordinal) last_raw_row,
      min(ordinal) first_ordinal,max(ordinal) last_ordinal,count(*) snapshots_seen,
      first(observed_at ORDER BY ordinal) first_seen,last(observed_at ORDER BY ordinal) last_seen,
      count(DISTINCT CAST(observed_at AS DATE)) distinct_observed_dates,
      max(coverage_prefix)-min(coverage_prefix)>0 coverage_changed,
      max(gap_prefix)-min(gap_prefix) missing_calendar_days,
      max(time_prefix)-first(time_prefix-coalesce(time_problem,false)::INTEGER ORDER BY ordinal)>0 time_uncertain,
      last(content_id ORDER BY ordinal) last_content
      FROM history_numbered_presence GROUP BY stream,subject_key,period_number)
    SELECT p.*, sha256(to_json(list_value('${RULE}',stream,subject_key,first_snapshot))) period_id,
      a.snapshot_id first_absent_after_period, first_ordinal=1 left_censored,
      last_ordinal=(SELECT max(ordinal) FROM history_ordered_runs) right_censored,
      CASE WHEN NOT time_uncertain THEN date_diff('microseconds',first_seen,last_seen)/3600000000.0 ELSE NULL END observed_span_hours
      FROM periods p LEFT JOIN history_ordered_runs a ON a.ordinal=p.last_ordinal+1;
    CREATE OR REPLACE VIEW history_event_boundaries AS
    SELECT stream,subject_key,snapshot_id,raw_row_number,previous_snapshot,previous_raw_row,
      previous_content,content_id,
      CASE WHEN previous_ordinal IS NULL THEN 'first_observed' ELSE 'reappeared' END event_type,
      coalesce(ordinal>previous_ordinal+1,false) after_gap,
      coalesce(coverage_prefix-previous_coverage>0,false) coverage_changed,
      coalesce(gap_prefix-previous_gap,0) missing_calendar_days,
      coalesce(time_prefix-previous_time_prefix+previous_clock_problem::INTEGER>0,coalesce(time_problem,false)) time_uncertain
      FROM history_presence_neighbors WHERE previous_ordinal IS NULL OR ordinal>previous_ordinal+1
    UNION ALL
    SELECT stream,subject_key,snapshot_id,raw_row_number,previous_snapshot,previous_raw_row,previous_content,content_id,
      'version_changed',ordinal>previous_ordinal+1,coverage_prefix-previous_coverage>0,gap_prefix-previous_gap,
      time_prefix-previous_time_prefix+previous_clock_problem::INTEGER>0 FROM history_presence_neighbors
      WHERE stream='shortlist' AND previous_content IS NOT NULL AND content_id<>previous_content
    UNION ALL
    SELECT p.stream,p.subject_key,a.snapshot_id,NULL::INTEGER,p.last_snapshot,p.last_raw_row,p.last_content,NULL::VARCHAR,
      CASE WHEN p.stream='export' THEN 'left_public_export' ELSE 'absent_from_snapshot' END,
      false,a.coverage_changed,a.calendar_gap_days,coalesce(a.time_problem,false) OR p.time_uncertain
      FROM history_presence_periods p JOIN history_ordered_runs a ON a.snapshot_id=p.first_absent_after_period;
  `);
}
function compareContent(before, after) {
  const [leftVersion, left] = JSON.parse(before), [rightVersion, right] = JSON.parse(after);
  if (leftVersion !== PROJECTION || rightVersion !== PROJECTION) throw new Error('Cannot compare different content projections');
  const a = new Map(left), b = new Map(right), changed = [], schema = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const prior = a.get(name) || ['missing'], next = b.get(name) || ['missing'];
    if (JSON.stringify(prior) === JSON.stringify(next)) continue;
    if (prior[0] === 'missing' || next[0] === 'missing') schema.push(name);
    else changed.push(name);
  }
  return { changed_fields: changed, schema_fields: schema };
}
function eventId(event) {
  return crypto.createHash('sha256').update(JSON.stringify([RULE, event.stream, event.subject_key, event.snapshot_id, event.event_type])).digest('hex');
}
// Keyset pages contain only boundary references. Text is never loaded for lifecycle queries.
async function* lifecycleEvents(c, { stream, subject, pageRows = LIMITS.readRows } = {}) {
  if (!Number.isSafeInteger(pageRows) || pageRows < 1 || pageRows > LIMITS.readRows) throw new Error('Invalid lifecycle page size');
  const filter = [stream ? `stream=${q(stream)}` : 'true', subject ? `subject_key=${q(subject)}` : 'true'].join(' AND ');
  // Materialize only narrow event references in DuckDB. This permits spill and
  // avoids rebuilding every window and join for each small output page.
  const table = `event_cursor_${crypto.randomUUID().replaceAll('-', '')}`;
  await c.run(`CREATE TEMP TABLE ${table} AS SELECT * FROM history_event_boundaries WHERE ${filter}`);
  let cursor = null;
  try {
  for (;;) {
    const after = cursor ? `AND (stream,subject_key,snapshot_id,event_type)>(${cursor.map(q)})` : '';
    const page = await query(c, `SELECT * FROM ${table} WHERE true ${after} ORDER BY stream,subject_key,snapshot_id,event_type LIMIT ${pageRows}`);
    if (!page.length) return;
    const ids = [...new Set(page.filter(e => e.event_type === 'version_changed').flatMap(e => [e.previous_content, e.content_id]))];
    const versions = ids.length ? await query(c, `SELECT content_id,encoding FROM history_v2_content_versions WHERE content_id IN (${ids.map(q)})`) : [];
    for (const event of page) {
      if (event.event_type === 'version_changed') {
        const before = versions.find(v => v.content_id === event.previous_content), now = versions.find(v => v.content_id === event.content_id);
        if (!before || !now) throw new Error('Missing lifecycle content reference');
        const diff = compareContent(before.encoding, now.encoding);
        for (const [kind, fields] of [['content_changed', diff.changed_fields], ['schema_changed', diff.schema_fields]]) {
          if (fields.length) { const item = { ...event, event_type: kind, fields }; yield { ...item, event_id: eventId(item) }; }
        }
      } else yield { ...event, event_id: eventId(event) };
      cursor = [event.stream, event.subject_key, event.snapshot_id, event.event_type];
    }
  }
  } finally { await c.run(`DROP TABLE ${table}`); }
}
async function lifecycleSummary(c, stream, subject) {
  const rows = await query(c, `SELECT stream,subject_key,count(*) snapshots_seen,
    first(snapshot_id ORDER BY ordinal) first_snapshot,last(snapshot_id ORDER BY ordinal) last_snapshot,
    first(observed_at ORDER BY ordinal) first_seen,last(observed_at ORDER BY ordinal) last_seen,
    count(DISTINCT CAST(observed_at AS DATE)) distinct_observed_dates,
    count(DISTINCT content_id) distinct_content_versions,
    min(ordinal)=1 left_censored,max(ordinal)=(SELECT max(ordinal) FROM history_ordered_runs) right_censored,
    max(time_prefix)-first(time_prefix-coalesce(time_problem,false)::INTEGER ORDER BY ordinal)>0 time_uncertain,
    CASE WHEN NOT time_uncertain THEN date_diff('microseconds',first_seen,last_seen)/3600000000.0 ELSE NULL END observed_span_hours
    FROM history_presence WHERE stream=${q(stream)} AND subject_key=${q(subject)} GROUP BY stream,subject_key`);
  if (!rows.length) return null;
  const periods = Number((await query(c, `SELECT count(*) n FROM history_presence_periods WHERE stream=${q(stream)} AND subject_key=${q(subject)}`))[0].n);
  let changes = 0, schema = 0;
  for await (const e of lifecycleEvents(c, { stream, subject })) { if (e.event_type === 'content_changed') changes++; if (e.event_type === 'schema_changed') schema++; }
  return { ...rows[0], presence_period_count: periods, reappearance_count: Math.max(0, periods - 1), content_change_count: changes, schema_change_count: schema,
    evidence_note: 'Presence in saved snapshots only; observed span is not confirmed days open.' };
}
module.exports = { RULE, installLifecycleViews, compareContent, lifecycleEvents, lifecycleSummary };
