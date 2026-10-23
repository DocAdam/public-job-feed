// Read contracts for the owned temporary prototype. No production writer dispatch.
const { query, views, REQUIRED, RAW_TYPES, GOOD_TYPES, EXCEPTION_TYPES, type, snake, ident } = require('./jobs-history');
const { TOP, GOOD } = require('./job-history-storage');
const { refreshMetrics, auditMetrics } = require('./historical-content-metrics');
const q = value => `'${String(value).replace(/'/g, "''")}'`;
// A one-element VARCHAR[] is a JSON path list, not an object key. Use JSON Pointer
// so source column names containing punctuation cannot change the path meaning.
const extract = (source, name) => `json_extract_string(${source}, ${q('/' + name.replaceAll('~','~0').replaceAll('/','~1'))})`;
const PUBLIC_OBJECTS = ['snapshots','posting_observations','snapshot_files','source_artifacts','raw_top_match_rows',
  'raw_good_job_rows','good_job_exceptions','historical_content_metrics','historical_role_metrics',
  'snapshot_summary','posting_lifecycle','daily_market_metrics'];
async function install(c,{metricsPlan}={}) {
  // Ordered payload fields preserve the original JSON bytes. This view does not
  // store a second wide row or description. Filters can select source references
  // before reconstructing their payloads.
  await c.run(`CREATE OR REPLACE VIEW history_decoded_raw AS
    SELECT r.*,
      (CASE WHEN x.json_suffix IS NULL THEN x.json_prefix ELSE x.json_prefix || to_json(t.content)::VARCHAR || x.json_suffix END)::JSON raw_values,
      (CASE WHEN x.json_suffix IS NULL THEN x.json_prefix ELSE x.json_prefix || 'null' || x.json_suffix END)::JSON field_values,
      t.content AS description
    FROM history_v2_raw_rows r JOIN history_v2_payload_texts x USING(payload_hash)
    LEFT JOIN history_v2_text_blobs t ON t.text_hash=x.text_hash`);
  for (const [name, types, file] of [['raw_top_match_rows',RAW_TYPES,TOP],['raw_good_job_rows',GOOD_TYPES,GOOD]]) {
    await c.run(`CREATE OR REPLACE VIEW ${name} AS SELECT ${Object.entries(types).map(([key,t]) =>
      ['raw_values','snapshot_id','raw_row_number'].includes(key) ? ident(key) : `CAST(${extract('metadata',key)} AS ${t}) AS ${ident(key)}`).join(',')}
      FROM history_decoded_raw WHERE file_name=${q(file)}`);
  }
  await c.run(`CREATE OR REPLACE VIEW good_job_exceptions AS SELECT ${Object.keys(EXCEPTION_TYPES).map(k => k === 'reason' ? 'e.reason' : 'g.'+ident(k)).join(',')}
    FROM history_v2_good_job_exceptions e JOIN raw_good_job_rows g USING(snapshot_id,raw_row_number)`);
  const meta=key=>extract('s.metadata',key);
  await c.run(`CREATE OR REPLACE VIEW snapshots AS SELECT s.snapshot_id,
    strptime(s.snapshot_id,'%Y%m%d-%H%M')::TIMESTAMP observed_at,
    ${meta('top')}::INTEGER top_match_count,${meta('good')}::INTEGER good_job_count,i.inclusion_rate,
    ${meta('companies')}::INTEGER company_count,${meta('slugs')}::INTEGER catalog_slug_count,${meta('ats')}::INTEGER ats_type_count,
    i.imported_at,${meta('top')}::INTEGER raw_top_match_row_count,${meta('resolved')}::INTEGER resolved_observation_count,
    ${meta('duplicates')}::INTEGER duplicate_canonical_row_count,${meta('unmatched')}::INTEGER unmatched_good_job_count
    FROM history_v2_snapshots s JOIN history_v2_imports i USING(snapshot_id);
    CREATE OR REPLACE VIEW snapshot_files AS SELECT snapshot_id, ${extract('e.value','file')} file_name,
      ${extract('e.value','sha256')} sha256, ${extract('e.value','row_count')}::INTEGER row_count,
      json_extract(e.value,'/headers') headers FROM history_v2_snapshots, LATERAL json_each(metadata,'$.sources') e;
    CREATE OR REPLACE VIEW source_artifacts AS SELECT snapshot_id, ${extract('e.value','file')} file_name,
      ${extract('e.value','sha256')} sha256, ${extract('e.value','body')} AS content
      FROM history_v2_snapshots, LATERAL json_each(metadata,'$.artifacts') e`);
  let headers = new Set(REQUIRED);
  for (const row of await query(c, `SELECT headers FROM snapshot_files WHERE file_name=${q(TOP)} ORDER BY snapshot_id`)) {
    for (const header of typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers) headers.add(header);
  }
  await c.run('CREATE TABLE IF NOT EXISTS history_v2_sql_columns(original_name VARCHAR, mapped_name VARCHAR PRIMARY KEY, ordinal INTEGER UNIQUE)');
  const saved=await query(c,'SELECT * FROM history_v2_sql_columns ORDER BY ordinal');
  const names=new Map(saved.map(row=>[row.mapped_name,row.original_name]));
  for(const header of headers){
    const mapped=snake(header);
    if(names.has(mapped)){if(names.get(mapped)!==header)throw new Error('SQL schema collision');continue;}
    await c.run(`INSERT INTO history_v2_sql_columns VALUES (${q(header)},${q(mapped)},${names.size})`);names.set(mapped,header);
  }
  headers=new Set(names.values());
  // Common aggregate fields stay scalar. Other fields share small decode
  // groups, so wide comparisons do not parse the same JSON eight times or
  // retain one whole-schema struct for a narrow lifecycle query.
  const scalar=new Set(['Company','Title','Location','RemoteStatus','USRemoteEligible','JobKey']);
  const grouped=[...headers].filter(h=>!scalar.has(h)&&!['CanonicalURLKey','CompanyKey','Description'].includes(h));
  const groups=Array.from({length:Math.ceil(grouped.length/8)},(_,i)=>grouped.slice(i*8,i*8+8));
  const projections=groups.map((group,i)=>`json_transform(field_values,${q(JSON.stringify(Object.fromEntries(group.map(h=>[h,'VARCHAR']))))}) AS fields_${i}`);
  const value=h=>scalar.has(h)?extract('r.field_values',h):`r.fields_${Math.floor(grouped.indexOf(h)/8)}.${ident(h)}`;
  // Match the v1 table's column order, including its canonical-key base column.
  const wide = [...headers].filter(h => snake(h)!=='canonical_url_key').map(h =>
    `try_cast(nullif(${h==='CompanyKey' ? 'a.company_key' : h==='Description' ? 'r.description' : value(h)},'') AS ${type(h)}) AS ${ident(snake(h))}`);
  // Extract only requested fields. Expanding the full schema into a lateral
  // struct retained every field for count and lifecycle queries at full size.
  await c.run(`CREATE OR REPLACE VIEW posting_observations AS SELECT o.snapshot_id, o.canonical_url_key,
    o.included_in_good_jobs,r.raw_values,o.selected_raw_row_number,o.canonical_group_row_count,
    (o.canonical_group_row_count-1)::INTEGER duplicate_canonical_row_count,
    CASE WHEN o.canonical_group_row_count>1 THEN 'resolved_duplicate_canonical_rows' ELSE NULL END::VARCHAR source_anomaly,
    a.selection_rule,${wide.join(',')} FROM history_v2_observations o JOIN
    (SELECT *${projections.length?', '+projections.join(', '):''} FROM history_decoded_raw) r ON
    r.snapshot_id=o.snapshot_id AND r.file_name=${q(TOP)} AND r.raw_row_number=o.selected_raw_row_number
    JOIN history_v2_observation_attributes a ON a.snapshot_id=o.snapshot_id AND a.canonical_url_key=o.canonical_url_key`);
  await views(c);
  // Select endpoint identities before decoding source fields. Aggregating the
  // reconstructed wide history retains payload strings for every observation.
  // Valid snapshot IDs sort in the same order as the v1 observed_at timestamp.
  // Join the endpoint rows (including NULL values), rather than arg_min/arg_max,
  // which would skip NULLs and change the original first/last contract.
  await c.run(`CREATE OR REPLACE VIEW posting_lifecycle AS
    WITH spans AS MATERIALIZED (
      SELECT canonical_url_key,min(snapshot_id) first_snapshot,max(snapshot_id) last_snapshot,count(*) snapshots_seen
      FROM history_v2_observations GROUP BY canonical_url_key
    ), endpoints AS MATERIALIZED (
      SELECT o.canonical_url_key,o.snapshot_id,r.payload_hash
      FROM history_v2_observations o JOIN spans s USING(canonical_url_key)
      JOIN history_v2_raw_rows r ON r.snapshot_id=o.snapshot_id AND r.file_name=${q(TOP)} AND r.raw_row_number=o.selected_raw_row_number
      WHERE o.snapshot_id=s.first_snapshot OR o.snapshot_id=s.last_snapshot
    ), fields AS MATERIALIZED (
      SELECT x.payload_hash,json_transform(CASE WHEN x.json_suffix IS NULL THEN x.json_prefix ELSE x.json_prefix || 'null' || x.json_suffix END,
        '{"Title":"VARCHAR","Company":"VARCHAR","Location":"VARCHAR"}') f
      FROM history_v2_payload_texts x SEMI JOIN endpoints e USING(payload_hash)
    ), decoded AS MATERIALIZED (
      SELECT e.canonical_url_key,e.snapshot_id,nullif(f.Title,'') title,nullif(f.Company,'') company,nullif(f.Location,'') AS location
      FROM endpoints e JOIN fields USING(payload_hash)
    ) SELECT s.canonical_url_key,strptime(s.first_snapshot,'%Y%m%d-%H%M')::TIMESTAMP first_seen,
      strptime(s.last_snapshot,'%Y%m%d-%H%M')::TIMESTAMP last_seen,s.snapshots_seen,
      a.title first_observed_title,b.title latest_observed_title,
      a.company first_observed_company,b.company latest_observed_company,
      a.location first_observed_location,b.location latest_observed_location
      FROM spans s JOIN decoded a ON a.canonical_url_key=s.canonical_url_key AND a.snapshot_id=s.first_snapshot
      JOIN decoded b ON b.canonical_url_key=s.canonical_url_key AND b.snapshot_id=s.last_snapshot`);
  const metricsConnection={run:c.run.bind(c),runAndReadAll:async sql=>{
    try{return await c.runAndReadAll(sql);}
    catch(error){throw new Error(`Metric read ${sql.slice(0,180)}: ${error.message}`,{cause:error});}
  }};
  const metricsHelper=require('./job-history-prototype-metrics');
  let refreshed,errors;
  if(metricsPlan===undefined){
    await metricsHelper.withStoredMetricScope(c,async()=>{refreshed=await refreshMetrics(metricsConnection);errors=await auditMetrics(c);});
  }else{refreshed=await metricsHelper.storeMetrics(c,metricsPlan.changes);errors=await metricsHelper.auditPlannedMetrics(c,metricsPlan);}
  if (errors.length) throw new Error(errors.join('\n'));

  return { refreshed };
}
async function installCompatibility(c,{inTransaction=false,metricsPlan}={}) {
  if(inTransaction)return install(c,{metricsPlan});
  await c.run('BEGIN TRANSACTION');
  try{const result=await install(c,{metricsPlan});await c.run('COMMIT');return result;}
  catch(error){await c.run('ROLLBACK');throw error;}
}
module.exports = { installCompatibility, PUBLIC_OBJECTS };
