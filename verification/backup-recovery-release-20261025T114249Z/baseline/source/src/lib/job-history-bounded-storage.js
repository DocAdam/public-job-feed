// Isolated storage prototype. Writes only new or token-owned temporary databases.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const runWorker = require('node:util').promisify(require('node:child_process').execFile);
const assert = require('node:assert/strict');
const { owner, lease, pending } = require('./job-history-prototype-owner');
const { DuckDBInstance } = require('@duckdb/node-api');
const { scan, observedAt, normalizeUrl, query, snake } = require('./jobs-history');
const { parseRecordedTime } = require('./package-time');
const { parseCsvRecords } = require('./csv');
const { coverageChange } = require('./jobs-history-report');
const { FORMAT, PROJECTION, TOP, GOOD, TABLES, ExactCatalog, encodeRow, encodeContent, decode, sha256 } = require('./job-history-storage');
const q = value => `'${String(value).replace(/'/g, "''")}'`;
const FILES = [TOP, GOOD, 'gsheet-package-manifest.json', 'SOURCE_SUMMARY.md', '09_ats_health.csv', 'README_GSHEET_PACKAGE.md', '00_start_here.csv'];
const LIMITS = Object.freeze({ packageBytes: 32 * 1024 ** 2, recordBytes: 4 * 1024 ** 2, batchBytes: 512 * 1024,
  batchRows: 32, readRows: 8, databaseMemory: '192MB' });
// Release native allocator caches between bounded queries. The database limit
// alone does not bound allocator memory retained after a query completes.
const DATABASE_OPTIONS = Object.freeze({memory_limit:LIMITS.databaseMemory,threads:'1',max_temp_directory_size:'2GB',
  allocator_flush_threshold:'16MB',allocator_bulk_deallocation_flush_threshold:'16MB',preserve_insertion_order:'false',
  write_buffer_row_group_count:'1',write_buffer_row_group_memory_limit:'8MB'});
// Native appenders own buffers that are finalized outside the JavaScript heap.
// Reuse a fixed set instead of allocating one native appender for every batch.
const writers = new WeakMap();
// Reuse the existing parser one CSV record at a time, then flatten its strings.
// This prevents a package-sized set of per-character string ropes from remaining
// live. Sentinel rows preserve trailing field whitespace under the parser's trim.
function parseCsvFlat(input) {
  const text = String(input || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();
  if (!text) return { headers:[], rows:[] };
  const firstLine = text.split('\n',1)[0];
  const delimiter = (firstLine.match(/\t/g)||[]).length > (firstLine.match(/,/g)||[]).length ? '\t' : ',';
  let header = null, headers = [], rows = [], start = 0, quoted = false, cellStart = true;
  function accept(record) {
    if (header === null) { header = record; headers = parseCsvRecords(record).headers; return; }
    const parsed = parseCsvRecords(`${header}\n${record}\n__framing_sentinel__`).rows;
    for (const row of parsed.slice(0,-1)) rows.push(JSON.parse(JSON.stringify(row)));
  }
  for (let i=0;i<text.length;i++) {
    const char=text[i];
    if (char==='"' && quoted && text[i+1]==='"') { i++; cellStart=false; }
    else if (char==='"' && (quoted || cellStart)) { quoted=!quoted; cellStart=false; }
    else if (!quoted && char===delimiter) cellStart=true;
    else if (!quoted && char==='\n') { accept(text.slice(start,i)); start=i+1; cellStart=true; }
    else cellStart=false;
  }
  accept(text.slice(start));
  return { headers, rows };
}
async function append(c, table, rows) {
  if (!rows.length) return;
  if (!writers.has(c)) writers.set(c, new Map());
  const cache = writers.get(c);
  if (!cache.has(table)) cache.set(table, await c.createAppender(table));
  const writer = cache.get(table);
  for (const row of rows) {
    for (const value of row) {
      if (value === null) writer.appendNull();
      else if (typeof value === 'number') writer.appendInteger(value);
      else if (typeof value === 'boolean') writer.appendBoolean(value);
      else writer.appendVarchar(value);
    }
    writer.endRow();
  }
  writer.flushSync();
}
function closeWriters(c) {
  for (const writer of writers.get(c)?.values() || []) { writer.clear(); writer.closeSync(); }
  writers.delete(c);
}

// Each concurrent hash owns a buffer; sequential hashes reuse it.
const hashBuffers = [];
async function fileHash(file) {
  const h = crypto.createHash('sha256'), handle = await fs.open(file, 'r');
  const buffer = hashBuffers.pop() || Buffer.alloc(64 * 1024);
  try {
    // Reuse one buffer: hashing many files must not retain stream buffers.
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      h.update(buffer.subarray(0, bytesRead));
    }
    return h.digest('hex');
  } finally {
    try { await handle.close(); } finally { if (hashBuffers.length < 8) hashBuffers.push(buffer); }
  }
}
async function* records(file, limits = LIMITS) {
  let pending = '';
  for await (const chunk of createReadStream(file, { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      if (Buffer.byteLength(line) > limits.recordBytes) throw new Error('Staged record exceeds byte limit');
      if (line) yield JSON.parse(line);
    }
    if (Buffer.byteLength(pending) > limits.recordBytes) throw new Error('Staged record exceeds byte limit');
  }
  if (pending) yield JSON.parse(pending);
}
async function* batches(iterable, limits, stats) {
  let rows = [], bytes = 0;
  for await (const record of iterable) {
    const size = Buffer.byteLength(JSON.stringify(record));
    if (size > limits.recordBytes) throw new Error('Record exceeds byte limit');
    if (rows.length && (bytes + size > limits.batchBytes || rows.length >= limits.batchRows)) {
      yield rows; rows = []; bytes = 0;
    }
    rows.push(record); bytes += size;
    stats.max_batch_rows = Math.max(stats.max_batch_rows, rows.length);
    stats.max_batch_bytes = Math.max(stats.max_batch_bytes, bytes);
  }
  if (rows.length) yield rows;
}
async function preparePackage(root, id, directory, limits) {
  if (!observedAt(id)) throw new Error('Invalid snapshot ID');
  const input = path.join(root, id), isolated = path.join(directory, 'input'), folder = path.join(isolated, id);
  const stat = await fs.lstat(input);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Snapshot must be a real directory');
  await fs.mkdir(folder, { recursive: true });
  const manifest = []; let bytes = 0;
  for (const name of FILES) {
    const file = path.join(input, name); let info;
    try { info = await fs.lstat(file); }
    catch (error) { if (error.code === 'ENOENT' && ![TOP, GOOD].includes(name)) continue; throw error; }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Source must be a regular file');
    bytes += info.size;
    if (bytes > limits.packageBytes) throw new Error('Package exceeds byte limit; no import performed');
    manifest.push({ name, bytes: info.size, sha256: await fileHash(file) });
  }
  for (const f of manifest) {
    const copy = path.join(folder, f.name); await fs.copyFile(path.join(input, f.name), copy);
    if (await fileHash(copy) !== f.sha256) throw new Error('Source changed while copying');
  }
  const stage = path.join(directory, 'stage'); await fs.mkdir(stage);
  const scanned = await scan(isolated, stage, { parseCsv: parseCsvFlat });
  if (scanned.errors.length) throw new Error(scanned.errors.join('\n'));
  return { snapshot: scanned.snapshots[0], manifest, input, warnings: scanned.warnings };
}
async function verifySources(prepared) {
  for (const name of FILES) {
    const expected = prepared.manifest.find(f => f.name === name), file = path.join(prepared.input, name);
    let info;
    try { info = await fs.lstat(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!expected && !info) continue;
    if (!expected || !info?.isFile() || info.isSymbolicLink() || await fileHash(file) !== expected.sha256) throw new Error('Source hash mismatch before commit');
  }
}

// A batch-local catalog is compared byte-for-byte with the persistent catalog.
// No global JavaScript text, row, identity, or content-version cache is retained.
async function merge(c, table, rows, keys) {
  if (!rows.length) return;
  const temp = `batch_${table}`;
  await c.run(`CREATE TEMP TABLE IF NOT EXISTS ${temp} AS SELECT * FROM ${table} WHERE false`);
  await c.run(`DELETE FROM ${temp}`);
  try {
    await append(c, temp, rows);
    const columns = (await query(c, `PRAGMA table_info(${q(table)})`)).map(r => r.name);
    const mismatch = columns.filter(k => !keys.includes(k)).map(k => `a.${k} IS DISTINCT FROM b.${k}`).join(' OR ');
    if (mismatch && Number((await query(c, `SELECT count(*) n FROM ${temp} a JOIN ${table} b USING(${keys}) WHERE ${mismatch}`))[0].n)) throw new Error(`Hash collision or conflicting row: ${table}`);
    await c.run(`INSERT INTO ${table} SELECT DISTINCT a.* FROM ${temp} a WHERE NOT EXISTS (SELECT 1 FROM ${table} b WHERE ${keys.map(k => `a.${k}=b.${k}`).join(' AND ')})`);
  } finally { await c.run(`DELETE FROM ${temp}`); }
}
async function saveRawBatch(c, id, file, batch) {
  const texts = new ExactCatalog(), payloads = new ExactCatalog(), raw = [], exports = [], payloadTexts = [];
  for (const { raw_values, ...metadata } of batch) {
    const row = JSON.parse(raw_values), hash = payloads.put(encodeRow(row, texts));
    const entries = Object.entries(row), descriptionIndex = entries.findIndex(([key]) => key === 'Description');
    const member = ([key, value]) => JSON.stringify(key) + ':' + JSON.stringify(value);
    const hasText = typeof row.Description === 'string';
    const prefix = hasText ? '{' + entries.slice(0, descriptionIndex).map(member).concat(['"Description":']).join(',') : raw_values;
    const suffix = hasText ? (descriptionIndex + 1 < entries.length ? ',' + entries.slice(descriptionIndex + 1).map(member).join(',') : '') + '}' : null;
    payloadTexts.push([hash, hasText ? sha256(row.Description) : null, prefix, suffix]);
    raw.push([id, file, metadata.raw_row_number, hash, sha256(raw_values), JSON.stringify(metadata)]);
    if (file === GOOD) exports.push([id, metadata.raw_row_number, normalizeUrl(row['Apply Link']) || null]);
  }
  await merge(c, 'history_v2_text_blobs', [...texts.values], ['text_hash']);
  await merge(c, 'history_v2_row_payloads', [...payloads.values], ['payload_hash']);
  await merge(c, 'history_v2_payload_texts', payloadTexts, ['payload_hash']);
  await append(c, 'history_v2_raw_rows', raw);
  await append(c, 'history_v2_export_rows', exports);
}
async function saveObservationBatch(c, id, batch) {
  const texts = new ExactCatalog(), postings = new Map(), versions = new Map(), observations = [], attributes = [];
  for (const row of batch) {
    const source = JSON.parse(row.raw_values), canonical = source.CanonicalURLKey;
    const posting = sha256(JSON.stringify(['saved-canonical-1', canonical]));
    if (postings.has(posting) && postings.get(posting)[1] !== canonical) throw new Error('Posting hash collision');
    postings.set(posting, [posting, canonical]);
    const encoding = encodeContent(source, texts), hash = sha256(encoding);
    const version = sha256(JSON.stringify([posting, PROJECTION, hash]));
    if (versions.has(version) && versions.get(version)[4] !== encoding) throw new Error('Content hash collision');
    versions.set(version, [version, posting, PROJECTION, hash, encoding]);
    observations.push([id, canonical, posting, version, row.selected_raw_row_number, row.canonical_group_row_count, row.included_in_good_jobs]);
    attributes.push([id, canonical, row.CompanyKey, row.selection_rule]);
  }
  await merge(c, 'history_v2_text_blobs', [...texts.values], ['text_hash']);
  await merge(c, 'history_v2_postings', [...postings.values()], ['posting_id']);
  await merge(c, 'history_v2_content_versions', [...versions.values()], ['content_id']);
  await append(c, 'history_v2_observations', observations);
  await append(c, 'history_v2_observation_attributes', attributes);
}
function recordedTime(s) {
  const readme = s.artifacts.find(a => a.file === 'README_GSHEET_PACKAGE.md')?.body || '';
  const start = s.artifacts.find(a => a.file === '00_start_here.csv')?.body || '';
  const exact = parseRecordedTime(readme.match(/^Generated:\s*(.+)$/m)?.[1]);
  const fallback = parseRecordedTime(parseCsvRecords(start).rows[0]?.['Report Run Date']);
  return { timestamp: (exact || fallback)?.toISOString() || observedAt(s.id), clock: exact || fallback ? 'recorded_utc' : 'folder_time_no_zone' };
}
async function refreshRunContext(c, limits) {
  let last = '', previous = null;
  for (;;) {
    const page = await query(c, `SELECT * FROM history_v2_runs WHERE snapshot_id>${q(last)} ORDER BY snapshot_id LIMIT ${limits.readRows}`);
    if (!page.length) break;
    for (const run of page) {
      const changes = coverageChange(previous, run);
      await c.run(`UPDATE history_v2_runs SET coverage_changes=${q(JSON.stringify(changes))} WHERE snapshot_id=${q(run.snapshot_id)}`);
      previous = run; last = run.snapshot_id;
    }
  }
}
async function createBoundedPrototype(options = {}) {
  const limits = { ...LIMITS, ...options.limits };
  for (const name of ['packageBytes', 'recordBytes', 'batchBytes', 'batchRows', 'readRows']) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] <= 0 || limits[name] > LIMITS[name]) throw new Error(`Invalid or increased prototype limit: ${name}`);
  }
  if (limits.databaseMemory !== LIMITS.databaseMemory) throw new Error('Database memory limit is fixed for this prototype');
  const existing = options.ownedDirectory !== undefined;
  let directory, ownerToken;
  if (existing) {
    directory = await owner(options);
    ownerToken = options.ownerToken;
  } else {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-history-bounded-'));
    ownerToken = crypto.randomUUID();
    await fs.writeFile(path.join(directory, 'owner.json'), JSON.stringify({ token: ownerToken, format: FORMAT }), { mode: 0o600 });
  }
  const database = path.join(directory, 'prototype.duckdb');
  let instance, c, release, busy = false;
  const stats = { max_batch_rows: 0, max_batch_bytes: 0, imported: 0, no_op: 0 };
  try {
    release = await lease(directory);
    await pending(directory);
    if(existing)await fs.access(database);
    instance = await DuckDBInstance.create(database, { ...DATABASE_OPTIONS,memory_limit:limits.databaseMemory });
    c = await instance.connect();
    if (!existing) {
      for (const [table, definition] of Object.entries(TABLES)) await c.run(`CREATE TABLE ${table} (${definition})`);
      await append(c, 'history_metadata', [[FORMAT]]);
      await c.run(`CREATE TABLE history_v2_export_rows(snapshot_id VARCHAR, raw_row_number INTEGER, subject_key VARCHAR, PRIMARY KEY(snapshot_id,raw_row_number));
      CREATE TABLE history_v2_runs(snapshot_id VARCHAR PRIMARY KEY REFERENCES history_v2_snapshots(snapshot_id), observed_at TIMESTAMP, time_source VARCHAR, company_count INTEGER, catalog_slug_count INTEGER, ats_type_count INTEGER, coverage_changes VARCHAR);
      CREATE TABLE history_v2_manifests(snapshot_id VARCHAR PRIMARY KEY, manifest VARCHAR NOT NULL);`);
      await c.run(`CREATE TABLE history_v2_layout(version INTEGER PRIMARY KEY); INSERT INTO history_v2_layout VALUES (3);
        CREATE TABLE history_v2_columns(original_name VARCHAR NOT NULL, mapped_name VARCHAR PRIMARY KEY);
        CREATE TABLE history_v2_payload_texts(payload_hash VARCHAR PRIMARY KEY REFERENCES history_v2_row_payloads(payload_hash), text_hash VARCHAR REFERENCES history_v2_text_blobs(text_hash), json_prefix VARCHAR NOT NULL, json_suffix VARCHAR);
        CREATE TABLE history_v2_imports(snapshot_id VARCHAR PRIMARY KEY, imported_at TIMESTAMP NOT NULL, inclusion_rate DOUBLE);
        CREATE TABLE history_v2_observation_attributes(snapshot_id VARCHAR, canonical_url_key VARCHAR, company_key VARCHAR, selection_rule VARCHAR, PRIMARY KEY(snapshot_id,canonical_url_key));`);
    } else {
      if (!(await query(c, "SELECT 1 FROM information_schema.tables WHERE table_name='history_v2_layout'")).length ||
          JSON.stringify(await query(c, 'SELECT version FROM history_v2_layout')) !== '[{"version":3}]') throw new Error('Unsupported owned prototype layout; build a new temporary prototype');
      const metadata = await query(c, 'SELECT format FROM history_metadata');
      if (metadata.length !== 1 || metadata[0].format !== FORMAT) throw new Error('Unsupported owned prototype schema');
    }
    const api = { directory, database, ownerToken, connection: c, limits, stats,
      async importPackage(root, id, { status = 'complete', beforeCommit } = {}) {
        if (busy) throw new Error('Prototype writer already active');
        if (status !== 'complete') throw new Error('Failed or incomplete package stops advancement');
        busy = true;
        let working, inTransaction = false, stage='prepare source';
        try {
          working = await fs.mkdtemp(path.join(directory, 'package-'));
          let prepared;
          if(options.separatePreparation){
            const {nonce}=JSON.parse(await fs.readFile(path.join(directory,'writer.lock'),'utf8'));
            const {stdout}=await runWorker(process.execPath,['--max-old-space-size=128',path.join(__dirname,'../scripts/job-history-prepare-worker.js'),
              directory,ownerToken,path.resolve(root),id,working,nonce,JSON.stringify(limits)],{maxBuffer:8*1024**2});
            const output=JSON.parse(stdout);prepared=output.prepared;
            stats.preparation_bound_rss_bytes=Math.max(stats.preparation_bound_rss_bytes||0,process.resourceUsage().maxRSS*1024+output.peak_rss_bytes);
          }else prepared=await preparePackage(root,id,working,limits);
          const s = prepared.snapshot;
          memoryStage('source prepared');
          const saved = await query(c, `SELECT manifest FROM history_v2_manifests WHERE snapshot_id=${q(id)}`);
          if (saved.length && saved[0].manifest !== JSON.stringify(prepared.manifest)) throw new Error('Changed source hash: explicit rebuild required');
          if (saved.length) {
            await auditPackage(c, s, limits); await auditIntegrity(c); await verifySources(prepared); stats.no_op++;
            return { imported: false, warnings: prepared.warnings };
          }
          const hasMetrics=(await query(c,"SELECT 1 FROM information_schema.views WHERE table_name='snapshots'")).length>0;
          stage='prepare prospective metrics';
          const metricsPlan=hasMetrics?await require('./job-history-prototype-metrics').prepareMetrics(c,s,limits):undefined;
          await c.run('BEGIN TRANSACTION'); inTransaction = true;
          const { staged, rawStaged, goodStaged, exceptionStaged, ...metadata } = s;
          await append(c, 'history_v2_snapshots', [[id, JSON.stringify(metadata)]]);
          await c.run(`INSERT INTO history_v2_imports VALUES (${q(id)},current_timestamp,${s.top ? s.good / s.top : 'NULL'})`);
          await merge(c, 'history_v2_columns', s.sources.find(f => f.file === TOP).headers.map(h => [h,snake(h)]), ['mapped_name']);
          await append(c, 'history_v2_manifests', [[id, JSON.stringify(prepared.manifest)]]);
          const clock = recordedTime(s);
          await c.run(`INSERT INTO history_v2_runs VALUES (${q(id)},${q(clock.timestamp)}::TIMESTAMP,${q(clock.clock)},${s.companies},${s.slugs},${s.ats},'[]')`);
          for (const [file, stagedFile] of [[TOP, rawStaged], [GOOD, goodStaged]]) {
            stage=`store ${file}`;
            for await (const batch of batches(records(stagedFile, limits), limits, stats)) await saveRawBatch(c, id, file, batch);
          }
          stage='store observations';
          for await (const batch of batches(records(staged, limits), limits, stats)) await saveObservationBatch(c, id, batch);
          for await (const batch of batches(records(exceptionStaged, limits), limits, stats)) await append(c, 'history_v2_good_job_exceptions', batch.map(r => [id, GOOD, r.raw_row_number, r.reason]));
          // All appended rows are flushed. Release native write buffers before
          // the full audit and metric queries, while retaining the transaction.
          closeWriters(c);
          memoryStage('rows stored');
          stage='refresh run context'; await refreshRunContext(c, limits);
          stage='audit package';
          await auditPackage(c, s, limits);
          memoryStage('package audited');
          stage='audit integrity';
          await auditIntegrity(c);
          memoryStage('integrity audited');
          if (hasMetrics) {
            stage='refresh SQL compatibility and metrics';
            await require('./job-history-sql-compatibility').installCompatibility(c,{inTransaction:true,metricsPlan});
          }
          if (beforeCommit) await beforeCommit();
          await verifySources(prepared);
          await c.run('COMMIT'); inTransaction = false; stats.imported++;
          return { imported: true, warnings: prepared.warnings };
        } catch (error) {
          // A database error can invalidate native appenders. Cleanup must not
          // hide that error or prevent the transaction rollback.
          try { closeWriters(c); } catch { writers.delete(c); }
          if (inTransaction) await c.run('ROLLBACK');
          throw new Error(`${id} (${stage}): ${error.message}`, {cause:error});
        }
        finally { if (working) await fs.rm(working, { recursive: true, force: true }); busy = false; }
      },
      async importPackages(root, entries) {
        for (const entry of [...entries].sort((a, b) => a.id.localeCompare(b.id))) await this.importPackage(root, entry.id, entry);
      },
      async close() { if (busy) throw new Error('Prototype writer still active'); if (c) closeWriters(c); c?.closeSync(); c = null; instance?.closeSync(); instance = null; await release?.(); release = null; },
      async dispose() { await this.close(); await fs.rm(directory, { recursive: true, force: true }); },
    };
    return api;
  } catch (error) { if (c) closeWriters(c); c?.closeSync(); instance?.closeSync(); await release?.(); if (!existing) await fs.rm(directory, { recursive: true, force: true }); throw error; }
}
async function boundedReader(c, limits = LIMITS) {
  const metadata = await query(c, 'SELECT format FROM history_metadata');
  if (metadata.length !== 1 || metadata[0].format !== FORMAT) throw new Error('Unsupported prototype schema');
  function reconstruct(row, texts) {
    if (sha256(row.encoding) !== row.payload_hash) throw new Error('Payload hash mismatch');
    for (const [hash, text] of texts) if (sha256(text) !== hash) throw new Error('Text hash mismatch');
    const raw_values = JSON.stringify(decode(row.encoding, texts));
    if (sha256(raw_values) !== row.raw_hash) throw new Error('Raw reconstruction hash mismatch');
    return { ...JSON.parse(row.metadata), raw_values };
  }
  return {
    async *rawRecords(id, file) {
      let after = 0;
      for (;;) {
        // Limit raw references before looking up payloads. A LIMIT after a wide
        // join can still build a hash table from the entire payload history.
        const page = await query(c, `SELECT * FROM history_v2_raw_rows
          WHERE snapshot_id=${q(id)} AND file_name=${q(file)} AND raw_row_number>${after} ORDER BY raw_row_number LIMIT ${limits.readRows}`);
        if (!page.length) return;
        const payloads=new Map((await query(c,`SELECT payload_hash,encoding FROM history_v2_row_payloads
          WHERE payload_hash IN (${[...new Set(page.map(r=>r.payload_hash))].map(q)})`)).map(r=>[r.payload_hash,r.encoding]));
        const exports=new Map(file===GOOD?(await query(c,`SELECT raw_row_number,subject_key FROM history_v2_export_rows
          WHERE snapshot_id=${q(id)} AND raw_row_number IN (${page.map(r=>r.raw_row_number)})`)).map(r=>[r.raw_row_number,r.subject_key]):[]);
        for(const row of page){
          if(!payloads.has(row.payload_hash))throw new Error('Missing raw payload reference');
          row.encoding=payloads.get(row.payload_hash);
          if(file===GOOD){row.export_raw_row=exports.has(row.raw_row_number)?row.raw_row_number:null;row.subject_key=exports.get(row.raw_row_number)??null;}
        }
        const hashes = [...new Set(page.flatMap(row => JSON.parse(row.encoding)[1].filter(([, v]) => v[0] === 'text_ref').map(([, v]) => v[1])))];
        const texts = new Map(hashes.length ? (await query(c, `SELECT * FROM history_v2_text_blobs WHERE text_hash IN (${hashes.map(q)})`)).map(r => [r.text_hash, r.content]) : []);
        for (const row of page) {
          const result = reconstruct(row, texts);
          if (file === GOOD) {
            assert.equal(row.export_raw_row, row.raw_row_number, 'Missing export row');
            assert.equal(row.subject_key, normalizeUrl(JSON.parse(result.raw_values)['Apply Link']) || null, 'Export key mismatch');
          }
          yield result; after = row.raw_row_number;
        }
      }
    },
    // Compatibility adapter materializes one capped package, never the archive.
    async rawRows(id, file) { const rows = []; for await (const r of this.rawRecords(id, file)) rows.push(r); return rows; },
    async population(id) {
      const details = [], good = [], exceptions = [];
      for await (const r of this.rawRecords(id, TOP)) details.push(JSON.parse(r.raw_values));
      for await (const r of this.rawRecords(id, GOOD)) { const row = JSON.parse(r.raw_values); good.push(row); if (!r.matched_canonical_url_key) exceptions.push(row); }
      return { details, good, exceptions };
    },
  };
}
async function auditPackage(c, s, limits = LIMITS) {
  const read = await boundedReader(c, limits);
  for (const [file, staged] of [[TOP, s.rawStaged], [GOOD, s.goodStaged]]) {
    const expected = records(staged, limits)[Symbol.asyncIterator](); let n = 0;
    for await (const actual of read.rawRecords(s.id, file)) {
      const next = await expected.next(); assert.equal(next.done, false, 'Extra raw row');
      assert.deepEqual(actual, next.value, 'Raw row preservation failure'); n++;
    }
    assert.equal((await expected.next()).done, true, 'Lost raw row');
    assert.equal(n, file === TOP ? s.top : s.good);
  }
  let count = 0;
  const auditStats = { max_batch_rows: 0, max_batch_bytes: 0 };
  for await (const batch of batches(records(s.staged, limits), limits, auditStats)) {
    const expectedRows = [];
    for (const expected of batch) {
    const row = JSON.parse(expected.raw_values), posting = sha256(JSON.stringify(['saved-canonical-1', row.CanonicalURLKey]));
    const texts = new ExactCatalog(), encoding = encodeContent(row, texts), hash = sha256(encoding);
    const content = sha256(JSON.stringify([posting, PROJECTION, hash]));
    expectedRows.push({ snapshot_id: s.id, canonical_url_key: row.CanonicalURLKey, posting_id: posting, content_id: content,
      selected_raw_row_number: expected.selected_raw_row_number, canonical_group_row_count: expected.canonical_group_row_count,
      included_in_good_jobs: expected.included_in_good_jobs, encoding, version_posting: posting, projection: PROJECTION, content_hash: hash, posting_key: row.CanonicalURLKey, company_key: expected.CompanyKey, selection_rule: expected.selection_rule });
    count++;
    }
    const saved = await query(c, `SELECT o.*,v.encoding,v.posting_id AS version_posting,v.projection,v.content_hash,p.canonical_url_key AS posting_key,a.company_key,a.selection_rule FROM history_v2_observations o
      LEFT JOIN history_v2_content_versions v USING(content_id) LEFT JOIN history_v2_postings p ON p.posting_id=o.posting_id
      LEFT JOIN history_v2_observation_attributes a ON a.snapshot_id=o.snapshot_id AND a.canonical_url_key=o.canonical_url_key
      WHERE o.snapshot_id=${q(s.id)} AND o.canonical_url_key IN (${expectedRows.map(r => q(r.canonical_url_key))})`);
    const sort = rows => rows.sort((a,b) => a.canonical_url_key.localeCompare(b.canonical_url_key));
    assert.deepEqual(sort(saved), sort(expectedRows), 'Observation/content mismatch');
  }
  assert.equal(Number((await query(c, `SELECT count(*) n FROM history_v2_observations WHERE snapshot_id=${q(s.id)}`))[0].n), count);
  let exceptions = 0;
  for await (const r of records(s.exceptionStaged, limits)) {
    assert.deepEqual(await query(c, `SELECT * FROM history_v2_good_job_exceptions WHERE snapshot_id=${q(s.id)} AND raw_row_number=${r.raw_row_number}`),
      [{ snapshot_id: s.id, file_name: GOOD, raw_row_number: r.raw_row_number, reason: r.reason }], 'Exception mismatch'); exceptions++;
  }
  assert.equal(Number((await query(c, `SELECT count(*) n FROM history_v2_good_job_exceptions WHERE snapshot_id=${q(s.id)}`))[0].n), exceptions);
  assert.equal(Number((await query(c, `SELECT count(*) n FROM history_v2_export_rows WHERE snapshot_id=${q(s.id)}`))[0].n), s.good);
  const { staged, rawStaged, goodStaged, exceptionStaged, ...metadata } = s;
  assert.deepEqual(await query(c, `SELECT metadata FROM history_v2_snapshots WHERE snapshot_id=${q(s.id)}`), [{ metadata: JSON.stringify(metadata) }], 'Snapshot metadata mismatch');
  return { raw_rows: s.top + s.good, exceptions, observations: count };
}
function memoryStage(name){
  if(process.env.HISTORY_MEMORY_TRACE)console.error(JSON.stringify({stage:name,...process.memoryUsage(),peak_rss_bytes:process.resourceUsage().maxRSS*1024}));
}
async function auditIntegrity(c) {
  const checks = [
    ['import metadata', `SELECT count(*) n FROM history_v2_snapshots s FULL JOIN history_v2_imports i USING(snapshot_id) WHERE s.snapshot_id IS NULL OR i.snapshot_id IS NULL OR imported_at IS NULL`],
    ['observation attributes', `SELECT count(*) n FROM history_v2_observations o FULL JOIN history_v2_observation_attributes a USING(snapshot_id,canonical_url_key) WHERE o.snapshot_id IS NULL OR a.snapshot_id IS NULL OR a.selection_rule IS NULL`],
    ['payload text references', `WITH refs AS MATERIALIZED (
      SELECT payload_hash,json_extract_string(list_extract(list_filter(json_extract(encoding,'$[1]')::JSON[],
      e -> json_extract_string(e,'$[1][0]')='text_ref'),1),'$[1][1]') expected_text_hash FROM history_v2_row_payloads)
      SELECT count(*) n FROM refs p FULL JOIN history_v2_payload_texts x USING(payload_hash)
      WHERE p.payload_hash IS NULL OR x.payload_hash IS NULL OR x.text_hash IS DISTINCT FROM p.expected_text_hash`],
    ['text hash', 'SELECT count(*) n FROM history_v2_text_blobs WHERE sha256(content)<>text_hash'],
    ['payload hash', 'SELECT count(*) n FROM history_v2_row_payloads WHERE sha256(encoding)<>payload_hash'],
    ['content hash', `SELECT count(*) n FROM history_v2_content_versions WHERE sha256(encoding)<>content_hash OR projection<>${q(PROJECTION)}`],
    ['content identity', `SELECT count(*) n FROM history_v2_observations o JOIN history_v2_content_versions v USING(content_id)
      JOIN history_v2_postings p ON p.posting_id=o.posting_id WHERE v.posting_id<>o.posting_id OR p.canonical_url_key<>o.canonical_url_key`],
    ['selected raw reference', `SELECT count(*) n FROM history_v2_observations o LEFT JOIN history_v2_raw_rows r ON
      r.snapshot_id=o.snapshot_id AND r.file_name=${q(TOP)} AND r.raw_row_number=o.selected_raw_row_number WHERE
      r.snapshot_id IS NULL OR json_extract_string(r.metadata,'$.canonical_url_key') IS DISTINCT FROM o.canonical_url_key OR
      json_extract_string(r.metadata,'$.selected_for_observation') IS DISTINCT FROM 'true'`],
    ['export references', `SELECT count(*) n FROM history_v2_export_rows e LEFT JOIN history_v2_raw_rows r ON
      r.snapshot_id=e.snapshot_id AND r.file_name=${q(GOOD)} AND r.raw_row_number=e.raw_row_number WHERE r.snapshot_id IS NULL`],
    ['run references', 'SELECT count(*) n FROM history_v2_snapshots s LEFT JOIN history_v2_runs r USING(snapshot_id) WHERE r.snapshot_id IS NULL'],
    ['exception membership', `SELECT count(*) n FROM history_v2_raw_rows r LEFT JOIN history_v2_good_job_exceptions e ON
      e.snapshot_id=r.snapshot_id AND e.raw_row_number=r.raw_row_number WHERE r.file_name=${q(GOOD)} AND
      (json_extract_string(r.metadata,'$.matched_canonical_url_key') IS NULL)<>(e.snapshot_id IS NOT NULL)`],
  ];
  for (const [name, sql] of checks) {
    try { if (Number((await query(c, sql))[0].n)) throw new Error(`Integrity failure: ${name}`); }
    catch (error) { throw new Error(`Integrity check ${name}: ${error.message}`, { cause:error }); }
    memoryStage(name);
  }
  // Restrict both wide join inputs before reconstruction. The unfiltered join
  // retained historical text for every snapshot and exceeded the fixed limit.
  // Every raw row is still checked, including duplicate siblings and exceptions.
  for (const {snapshot_id:id} of await query(c,'SELECT snapshot_id FROM history_v2_snapshots ORDER BY snapshot_id')) {
    // Cross-check narrow reference counts and run scalars against preserved
    // source metadata one package at a time. The metric planner reads this
    // metadata before the write transaction; do not trust its counts alone.
    const metadata=JSON.parse((await query(c,`SELECT metadata FROM history_v2_snapshots WHERE snapshot_id=${q(id)}`))[0].metadata);
    const counts=(await query(c,`SELECT company_count companies,catalog_slug_count slugs,ats_type_count ats,
      (SELECT count(*) FROM history_v2_raw_rows WHERE snapshot_id=${q(id)} AND file_name=${q(TOP)}) top,
      (SELECT count(*) FROM history_v2_raw_rows WHERE snapshot_id=${q(id)} AND file_name=${q(GOOD)}) good,
      (SELECT count(*) FROM history_v2_observations WHERE snapshot_id=${q(id)}) resolved,
      (SELECT count(*) FROM history_v2_good_job_exceptions WHERE snapshot_id=${q(id)}) unmatched
      FROM history_v2_runs WHERE snapshot_id=${q(id)}`))[0];
    for(const key of ['top','good','resolved','unmatched'])counts[key]=Number(counts[key]);
    counts.duplicates=counts.top-counts.resolved;
    assert.deepEqual(counts,Object.fromEntries(Object.keys(counts).map(key=>[key,metadata[key]])),`Snapshot count/run metadata mismatch ${id}`);
    const mismatches=await query(c,`WITH payloads AS MATERIALIZED (
      SELECT p.* FROM history_v2_payload_texts p SEMI JOIN history_v2_raw_rows r
      ON p.payload_hash=r.payload_hash AND r.snapshot_id=${q(id)}),
      texts AS MATERIALIZED (SELECT t.* FROM history_v2_text_blobs t SEMI JOIN payloads p USING(text_hash))
      SELECT count(*) n FROM history_v2_raw_rows r JOIN payloads p USING(payload_hash) LEFT JOIN texts t USING(text_hash)
      WHERE r.snapshot_id=${q(id)} AND sha256(CASE WHEN p.json_suffix IS NULL THEN p.json_prefix
      ELSE p.json_prefix || to_json(t.content)::VARCHAR || p.json_suffix END) IS DISTINCT FROM r.raw_hash`);
    if(Number(mismatches[0].n))throw new Error(`Integrity failure: SQL reconstruction ${id}`);
    memoryStage('reconstruction '+id);
  }
}
module.exports = { LIMITS, DATABASE_OPTIONS, FILES, fileHash, records, batches, merge, createBoundedPrototype, boundedReader, auditPackage, auditIntegrity, parseCsvFlat, preparePackage, q };
