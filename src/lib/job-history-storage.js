// Phase 1 experiment only. No production path, writer dispatch, or migration API.
// Input is the existing scanner's validated staging output. All databases are new
// temporary files. The production importer and metric definitions stay unchanged.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DuckDBInstance } = require('@duckdb/node-api');
const { query } = require('./jobs-history');

const FORMAT = 'history-storage-prototype-1';
const PROJECTION = 'exact-content-1';
const CONTENT_FIELDS = Object.freeze('Company Title Location Description Department DatePosted SalaryMin SalaryMax SalaryCurrency SalaryPeriod SalaryText RawLocation RawDepartment'.split(' '));
const TOP = '03_top_matches_full.csv', GOOD = '01_good_documentation_jobs.csv';
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const jsonLines = async file => (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
const q = text => `'${String(text).replace(/'/g, "''")}'`;

class ExactCatalog {
  constructor(hash = sha256) { this.hash = hash; this.values = new Map(); }
  put(bytes) {
    const key = this.hash(bytes);
    if (this.values.has(key) && this.values.get(key) !== bytes) throw new Error('Hash collision: unequal exact values');
    this.values.set(key, bytes);
    return key;
  }
}

function cell(name, value, texts) {
  if (value === null) return ['null'];
  if (typeof value !== 'string') throw new Error(`Unsupported parsed value for ${name}`);
  return name === 'Description' ? ['text_ref', texts.put(value)] : ['value', value];
}

function encodeRow(row, texts) {
  return JSON.stringify([FORMAT, Object.entries(row).map(([name, value]) => [name, cell(name, value, texts)])]);
}

function encodeContent(row, texts) {
  return JSON.stringify([PROJECTION, CONTENT_FIELDS.map(name => [name,
    Object.hasOwn(row, name) ? cell(name, row[name], texts) : ['missing']])]);
}

function decode(encoded, texts, expectedFormat = FORMAT) {
  const [format, fields] = JSON.parse(encoded);
  if (format !== expectedFormat) throw new Error('Unsupported storage format');
  const entries = [];
  const names = new Set();
  for (const [name, value] of fields) {
    if (names.has(name)) throw new Error('Duplicate encoded field');
    names.add(name);
    const [tag, data] = value;
    if (tag === 'missing' && expectedFormat === PROJECTION) continue;
    if (tag === 'null') entries.push([name, null]);
    else if (tag === 'value' && typeof data === 'string') entries.push([name, data]);
    else if (tag === 'text_ref' && texts.has(data)) entries.push([name, texts.get(data)]);
    else throw new Error('Missing text reference or invalid encoded cell');
  }
  // Object.fromEntries also preserves own fields such as __proto__ safely.
  return Object.fromEntries(entries);
}

async function prepareModel(scanned) {
  if (scanned.errors.length) throw new Error(scanned.errors.join('\n'));
  const texts = new ExactCatalog(), payloads = new ExactCatalog(), identities = new ExactCatalog(), versions = new ExactCatalog();
  const snapshots = [], raws = [], observations = [], exceptions = [], content = new Map(), selectedEvidence = [];
  for (const s of scanned.snapshots) {
    const { staged, rawStaged, goodStaged, exceptionStaged, ...metadata } = s;
    snapshots.push([s.id, JSON.stringify(metadata)]);
    for (const [file, stagedFile] of [[TOP, rawStaged], [GOOD, goodStaged]]) {
      for (const record of await jsonLines(stagedFile)) {
        const { raw_values, ...rowMetadata } = record;
        const payload = payloads.put(encodeRow(JSON.parse(raw_values), texts));
        raws.push([s.id, file, record.raw_row_number, payload, sha256(raw_values), JSON.stringify(rowMetadata)]);
      }
    }
    for (const record of await jsonLines(staged)) {
      const source = JSON.parse(record.raw_values), canonical = source.CanonicalURLKey;
      if (!canonical?.trim()) throw new Error('Missing canonical identity');
      const posting = identities.put(JSON.stringify(['saved-canonical-1', canonical]));
      const encoding = encodeContent(source, texts), contentHash = sha256(encoding);
      const version = versions.put(JSON.stringify([posting, PROJECTION, contentHash]));
      if (content.has(version) && content.get(version)[4] !== encoding) throw new Error('Content hash collision');
      content.set(version, [version, posting, PROJECTION, contentHash, encoding]);
      observations.push([s.id, canonical, posting, version, record.selected_raw_row_number,
        record.canonical_group_row_count, record.included_in_good_jobs]);
      selectedEvidence.push({ snapshot_id: s.id, canonical, raw_values: record.raw_values });
    }
    for (const record of await jsonLines(exceptionStaged)) {
      exceptions.push([s.id, GOOD, record.raw_row_number, record.reason]);
    }
  }
  return { texts, payloads, identities, versions, snapshots, raws, observations, exceptions, content, selectedEvidence };
}

const TABLES = {
  history_metadata: 'format VARCHAR PRIMARY KEY',
  history_v2_snapshots: 'snapshot_id VARCHAR PRIMARY KEY, metadata VARCHAR NOT NULL',
  history_v2_text_blobs: 'text_hash VARCHAR PRIMARY KEY, content VARCHAR NOT NULL',
  history_v2_row_payloads: 'payload_hash VARCHAR PRIMARY KEY, encoding VARCHAR NOT NULL',
  history_v2_postings: 'posting_id VARCHAR PRIMARY KEY, canonical_url_key VARCHAR NOT NULL UNIQUE',
  history_v2_content_versions: 'content_id VARCHAR PRIMARY KEY, posting_id VARCHAR NOT NULL REFERENCES history_v2_postings(posting_id), projection VARCHAR NOT NULL, content_hash VARCHAR NOT NULL, encoding VARCHAR NOT NULL, UNIQUE(posting_id, projection, content_hash)',
  history_v2_raw_rows: 'snapshot_id VARCHAR REFERENCES history_v2_snapshots(snapshot_id), file_name VARCHAR, raw_row_number INTEGER CHECK(raw_row_number > 0), payload_hash VARCHAR NOT NULL REFERENCES history_v2_row_payloads(payload_hash), raw_hash VARCHAR NOT NULL, metadata VARCHAR NOT NULL, PRIMARY KEY(snapshot_id, file_name, raw_row_number)',
  history_v2_good_job_exceptions: `snapshot_id VARCHAR, file_name VARCHAR NOT NULL CHECK(file_name='${GOOD}'), raw_row_number INTEGER, reason VARCHAR NOT NULL CHECK(reason='no_matching_top_match_url'), PRIMARY KEY(snapshot_id, raw_row_number), FOREIGN KEY(snapshot_id, file_name, raw_row_number) REFERENCES history_v2_raw_rows(snapshot_id, file_name, raw_row_number)`,
  history_v2_observations: 'snapshot_id VARCHAR REFERENCES history_v2_snapshots(snapshot_id), canonical_url_key VARCHAR, posting_id VARCHAR NOT NULL REFERENCES history_v2_postings(posting_id), content_id VARCHAR NOT NULL REFERENCES history_v2_content_versions(content_id), selected_raw_row_number INTEGER NOT NULL, canonical_group_row_count INTEGER NOT NULL CHECK(canonical_group_row_count > 0), included_in_good_jobs BOOLEAN NOT NULL, PRIMARY KEY(snapshot_id, canonical_url_key)',
};

async function append(c, table, rows) {
  const appender = await c.createAppender(table);
  try {
    for (const row of rows) {
      for (const value of row) {
        if (value === null) appender.appendNull();
        else if (typeof value === 'number') appender.appendInteger(value);
        else if (typeof value === 'boolean') appender.appendBoolean(value);
        else appender.appendVarchar(value);
      }
      appender.endRow();
    }
    appender.flushSync();
  } finally { appender.closeSync(); }
}

async function modelTables(model) {
  return {
    history_metadata: [[FORMAT]],
    history_v2_snapshots: model.snapshots,
    history_v2_text_blobs: [...model.texts.values],
    history_v2_row_payloads: [...model.payloads.values],
    history_v2_postings: [...model.identities.values].map(([id, encoded]) => [id, JSON.parse(encoded)[1]]),
    history_v2_content_versions: [...model.content.values()],
    history_v2_raw_rows: model.raws,
    history_v2_good_job_exceptions: model.exceptions,
    history_v2_observations: model.observations,
  };
}

async function createPrototype(scanned) {
  const model = await prepareModel(scanned);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'job-storage-prototype-'));
  const database = path.join(directory, 'prototype.duckdb');
  let instance, c;
  try {
    instance = await DuckDBInstance.create(database);
    c = await instance.connect();
    await c.run('BEGIN TRANSACTION');
    try {
      for (const [table, definition] of Object.entries(TABLES)) await c.run(`CREATE TABLE ${table} (${definition})`);
      for (const [table, rows] of Object.entries(await modelTables(model))) await append(c, table, rows);
      await c.run('COMMIT');
    } catch (error) { await c.run('ROLLBACK'); throw error; }
    return { database, directory, connection: c, model,
      async close() { c?.closeSync(); c = null; instance?.closeSync(); instance = null; },
      async dispose() { await this.close(); await fs.rm(directory, { recursive: true, force: true }); } };
  } catch (error) {
    c?.closeSync(); instance?.closeSync();
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function reader(c) {
  const metadata = await query(c, 'SELECT format FROM history_metadata');
  if (metadata.length !== 1 || metadata[0].format !== FORMAT) throw new Error('Unsupported prototype schema');
  const texts = new Map((await query(c, 'SELECT * FROM history_v2_text_blobs')).map(r => [r.text_hash, r.content]));
  const payloads = new Map((await query(c, 'SELECT * FROM history_v2_row_payloads')).map(r => [r.payload_hash, r.encoding]));
  return {
    async rawRows(id, file) {
      const rows = await query(c, `SELECT * FROM history_v2_raw_rows WHERE snapshot_id=${q(id)} AND file_name=${q(file)} ORDER BY raw_row_number`);
      return rows.map(r => {
        if (!payloads.has(r.payload_hash)) throw new Error('Missing row payload');
        const raw_values = JSON.stringify(decode(payloads.get(r.payload_hash), texts));
        if (sha256(raw_values) !== r.raw_hash) throw new Error('Raw reconstruction hash mismatch');
        return { ...JSON.parse(r.metadata), raw_values };
      });
    },
    async population(id) {
      const details = await this.rawRows(id, TOP), good = await this.rawRows(id, GOOD);
      const exceptions = await this.exceptionRows(id, good);
      return { details: details.map(r => JSON.parse(r.raw_values)), good: good.map(r => JSON.parse(r.raw_values)),
        exceptions: exceptions.map(r => JSON.parse(r.raw_values)) };
    },
    async exceptionRows(id, good = null) {
      good ||= await this.rawRows(id, GOOD);
      const saved = await query(c, `SELECT * FROM history_v2_good_job_exceptions WHERE snapshot_id=${q(id)} ORDER BY raw_row_number`);
      return saved.map(r => {
        const source = good.find(row => row.raw_row_number === r.raw_row_number);
        if (!source || source.matched_canonical_url_key) throw new Error('Invalid exception source');
        return { ...source, reason: r.reason };
      });
    },
  };
}

async function auditPrototype(c, scanned, model) {
  // Full expected-table comparison also detects altered references, extra rows,
  // lost exceptions and redundant/missing content values. No counts-only audit.
  for (const [table, rows] of Object.entries(await modelTables(model))) {
    const actual = (await c.runAndReadAll(`SELECT * FROM ${table}`)).getRows();
    assert.deepEqual(actual.map(row => JSON.stringify(row)).sort(), rows.map(row => JSON.stringify(row)).sort(), `${table}: stored content mismatch`);
  }
  const read = await reader(c);
  let rawRows = 0, exceptions = 0;
  for (const s of scanned.snapshots) {
    const top = await read.rawRows(s.id, TOP), good = await read.rawRows(s.id, GOOD);
    assert.deepEqual(top, await jsonLines(s.rawStaged), `${s.id}: raw 03 mismatch`);
    assert.deepEqual(good, await jsonLines(s.goodStaged), `${s.id}: raw 01 mismatch`);
    const actualExceptions = await read.exceptionRows(s.id, good);
    assert.deepEqual(actualExceptions, await jsonLines(s.exceptionStaged), `${s.id}: exception mismatch`);
    for (const observation of model.selectedEvidence.filter(r => r.snapshot_id === s.id)) {
      const selected = top.find(r => r.canonical_url_key === observation.canonical && r.selected_for_observation);
      assert.equal(selected?.raw_values, observation.raw_values, 'Selected raw row mismatch');
    }
    rawRows += top.length + good.length; exceptions += actualExceptions.length;
  }
  return { raw_rows_reconstructed: rawRows, exception_rows_reconstructed: exceptions, errors: [] };
}

module.exports = { FORMAT, PROJECTION, CONTENT_FIELDS, TOP, GOOD, ExactCatalog, encodeRow, encodeContent, decode,
  prepareModel, createPrototype, reader, auditPrototype, sha256, jsonLines, TABLES, append };
