const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { LOCK_NAME, safeDirectory, withBatchMaintenance, assertHistoryIdle } = require('./batch-maintenance');
const { getLatestLiveFetchByBoard, isUsableBoardState, toBoardStateRow, toHistoryEvent,
  getHistoryMonth, validateHistoryEvent } = require('./batch-history');
const { readMonth } = require('./batch-history-ledger');
const DAY = 86400000;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function safeBatchPath(root, name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' ||
      name.includes('/') || name.includes('\\') || name === LOCK_NAME) throw new Error('Unsafe batch name: ' + name);
  return path.join(root, name);
}
function metadata(s) { return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String); }
async function fileRecord(file, hash = true) {
  const before = await fs.lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Unsafe file: ' + file);
  const h = crypto.createHash('sha256');
  if (hash) for await (const chunk of nodeFs.createReadStream(file)) h.update(chunk);
  if (!isDeepStrictEqual(metadata(before), metadata(await fs.lstat(file, { bigint: true })))) throw new Error('Input changed while reading: ' + file);
  return { metadata: metadata(before), bytes: Number(before.size), ...(hash ? { sha256: h.digest('hex') } : {}) };
}
async function treeRecord(dir, hash) {
  await safeDirectory(dir);
  const records = [];
  let bytes = 0, files = 0;
  async function visit(folder, relative = '') {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.join(relative, entry.name), file = path.join(folder, entry.name);
      if (entry.isDirectory()) { records.push([rel, 'directory']); await visit(file, rel); }
      else {
        const record = await fileRecord(file, hash);
        records.push([rel, record]); bytes += record.bytes; files++;
      }
    }
  }
  await visit(dir);
  return { fingerprint: digest(records), bytes, files };
}
async function captureInputs({ batchesRoot, indexDir }, hash = true) {
  await safeDirectory(batchesRoot); await safeDirectory(indexDir);
  await assertHistoryIdle(indexDir);
  const files = {};
  for (const name of ['batch-index.json', 'board-latest-fetch.json']) files[name] = await fileRecord(path.join(indexDir, name), hash);
  const ledgerDir = path.join(indexDir, 'history', 'fetch-events');
  await safeDirectory(ledgerDir);
  for (const name of (await fs.readdir(ledgerDir)).sort()) {
    if (!/^(?:\d{4}-(?:0[1-9]|1[0-2])|unknown)\.jsonl\.gz$/.test(name)) throw new Error('Unexpected ledger file: ' + name);
    files['history/fetch-events/' + name] = await fileRecord(path.join(ledgerDir, name), hash);
  }
  const batches = {};
  for (const entry of (await fs.readdir(batchesRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === LOCK_NAME) continue;
    if (entry.name === '.DS_Store') { files['batches/.DS_Store'] = await fileRecord(path.join(batchesRoot, entry.name), hash); continue; }
    if (!entry.isDirectory()) throw new Error('Unexpected batch entry: ' + entry.name);
    batches[entry.name] = await treeRecord(safeBatchPath(batchesRoot, entry.name), hash);
  }
  await assertHistoryIdle(indexDir);
  return { files, batches };
}
async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
function classify(batch, referenced, now, days, hasRunningMarker) {
  const timestamp = Date.parse(batch.GeneratedAt), valid = Number.isFinite(timestamp);
  const AgeDays = valid ? Math.floor((now - timestamp) / DAY) : '';
  if (batch.IndexStatus !== 'OK' || hasRunningMarker) return { AgeDays, Action: 'REVIEW', Reason: hasRunningMarker ? 'Unfinished collection marker; review required' : `Batch index status: ${batch.IndexStatus}` };
  if (referenced.has(batch.BatchName)) return { AgeDays, Action: 'KEEP_CURRENT_SOURCE', Reason: 'Referenced by current board-state index' };
  if (!valid) return { AgeDays, Action: 'REVIEW', Reason: 'Missing generated timestamp' };
  if (AgeDays < days) return { AgeDays, Action: 'KEEP_RECENT', Reason: `Within ${days}-day raw retention window` };
  return { AgeDays, Action: 'RETIRE_CANDIDATE', Reason: 'Superseded source; fetch events verified in saved history' };
}
function mergeLatest(target, rows) {
  for (const [key, row] of getLatestLiveFetchByBoard(rows)) {
    const old = target.get(key);
    target.set(key, getLatestLiveFetchByBoard(old ? [old, row] : [row]).get(key));
  }
}
function stateRows(latest) { return [...latest.values()].map(toBoardStateRow).sort((a, b) => a.BoardKey.localeCompare(b.BoardKey)); }
async function evaluate(config, inputs, now, rawRetentionDays) {
  const index = await json(path.join(config.indexDir, 'batch-index.json'));
  const state = await json(path.join(config.indexDir, 'board-latest-fetch.json'));
  if (!Array.isArray(index) || !isUsableBoardState(state, index.filter(b => b.IndexStatus === 'OK').length)) throw new Error('Board state does not match index');
  const names = index.map(b => b.BatchName);
  for (const name of names) safeBatchPath(config.batchesRoot, name);
  if (new Set(names).size !== names.length || !isDeepStrictEqual([...names].sort(), Object.keys(inputs.batches).sort())) throw new Error('Batch inventory does not match index; review and reindex before planning');
  const referenced = new Set(state.Boards.map(b => b.SourceBatch));
  if ([...referenced].some(name => !names.includes(name))) throw new Error('Current source is absent from index');
  const required = new Map(), allLatest = new Map(), keptLatest = new Map(), rows = [];
  let rawFetchRows = 0, candidateFetchRows = 0;
  for (const batch of index) {
    const folder = safeBatchPath(config.batchesRoot, batch.BatchName);
    if (path.resolve(batch.BatchFolder) !== folder) throw new Error('Index batch path mismatch: ' + batch.BatchName);
    let running = false;
    for (const name of await fs.readdir(folder)) if (/^batch-run-.*\.json$/.test(name)) {
      const marker = await json(path.join(folder, name));
      if (!['complete', 'failed'].includes(marker.status)) running = true;
    }
    const row = { BatchName: batch.BatchName, ATS: batch.ATS, GeneratedAt: batch.GeneratedAt,
      ...classify(batch, referenced, now, rawRetentionDays, running), SizeBytes: inputs.batches[batch.BatchName].bytes };
    rows.push(row);
    if (batch.IndexStatus !== 'OK') continue;
    const summary = await json(path.join(folder, 'jobs-batch-summary.json'));
    if (summary.GeneratedAt !== batch.GeneratedAt) throw new Error('Batch timestamp changed since indexing: ' + batch.BatchName);
    const logs = await json(path.join(folder, 'jobs-batch-fetch-log.json'));
    if (!Array.isArray(logs)) throw new Error('Invalid fetch log: ' + batch.BatchName);
    const projected = logs.map(log => ({ ...log, SourceBatch: batch.BatchName }));
    mergeLatest(allLatest, projected);
    if (row.Action !== 'RETIRE_CANDIDATE') mergeLatest(keptLatest, projected);
    for (const log of projected) {
      const event = toHistoryEvent(log), month = getHistoryMonth(event.FetchedAt);
      validateHistoryEvent(event, month);
      if (!required.has(month)) required.set(month, new Map());
      const map = required.get(month), hash = digest(event);
      if (map.has(event.EventId) && map.get(event.EventId) !== hash) throw new Error('Conflicting raw event: ' + event.EventId);
      map.set(event.EventId, hash); rawFetchRows++;
      if (row.Action === 'RETIRE_CANDIDATE') candidateFetchRows++;
    }
  }
  const expected = [...state.Boards].sort((a, b) => a.BoardKey.localeCompare(b.BoardKey));
  if (state.BoardCount !== expected.length || !isDeepStrictEqual(expected, stateRows(allLatest))) throw new Error('Raw inputs do not reproduce current board state');
  if (!isDeepStrictEqual(expected, stateRows(keptLatest))) throw new Error('Protected subset does not reproduce current board state');
  let ledgerEvents = 0, matchedEvents = 0;
  const months = Object.keys(inputs.files).filter(n => n.startsWith('history/')).map(n => path.basename(n).slice(0, -9));
  for (const month of new Set([...months, ...required.keys()])) {
    const saved = await readMonth(path.join(config.indexDir, 'history', 'fetch-events', month + '.jsonl.gz'), month, validateHistoryEvent);
    ledgerEvents += saved.size;
    for (const [id, expectedHash] of required.get(month) || []) {
      if (!saved.has(id) || digest(saved.get(id)) !== expectedHash) throw new Error('Missing or conflicting saved fetch event: ' + id);
      matchedEvents++;
    }
    required.delete(month);
  }
  return { rows, checks: { boardCount: expected.length, rawFetchRows, candidateFetchRows, matchedEvents, ledgerEvents,
    fullState: 'PASS', protectedSubset: 'PASS', ledgerCoverage: 'PASS' } };
}
async function buildPlan(config, { now = Date.now(), rawRetentionDays = 30, onPhase = async () => {} } = {}) {
  if (!Number.isSafeInteger(rawRetentionDays) || rawRetentionDays < 1 || !Number.isFinite(now)) throw new Error('Invalid retention policy');
  const before = await captureInputs(config, false);
  await onPhase('before-hash');
  const inputs = await captureInputs(config);
  const result = await evaluate(config, inputs, now, rawRetentionDays);
  await onPhase('validated');
  if (!isDeepStrictEqual(before, await captureInputs(config, false))) throw new Error('Inputs changed during retention validation');
  const candidateRows = result.rows.filter(r => r.Action === 'RETIRE_CANDIDATE');
  return { version: 1, generatedAt: new Date(now).toISOString(), rawRetentionDays,
    batchesRoot: path.resolve(config.batchesRoot), indexDir: path.resolve(config.indexDir),
    inputFingerprint: digest(inputs), rowsHash: digest(result.rows), ...result,
    totals: { batches: result.rows.length, candidateCount: candidateRows.length,
      candidateBytes: candidateRows.reduce((n, r) => n + r.SizeBytes, 0) } };
}
async function planRetention(config, options = {}) {
  return withBatchMaintenance(config.batchesRoot, 'plan-retention', async () => {
    await options.onLocked?.();
    const plan = await buildPlan(config, options);
    await options.save?.(plan);
    return plan;
  });
}
async function retireBatches(config, plan, { apply = false, now = Date.now(), onPhase = async () => {} } = {}) {
  return withBatchMaintenance(config.batchesRoot, apply ? 'retire-batches' : 'validate-retention', async () => {
    await onPhase('locked');
    if (plan.version !== 1 || plan.rowsHash !== digest(plan.rows) || plan.batchesRoot !== path.resolve(config.batchesRoot) ||
        plan.indexDir !== path.resolve(config.indexDir) || !Number.isFinite(Date.parse(plan.generatedAt)) ||
        now < Date.parse(plan.generatedAt) || now - Date.parse(plan.generatedAt) > DAY) throw new Error('Invalid, changed, or expired retention plan; create a fresh plan');
    const fresh = await buildPlan(config, { now: Date.parse(plan.generatedAt), rawRetentionDays: plan.rawRetentionDays });
    if (!isDeepStrictEqual(plan, fresh)) throw new Error('Stale retention plan: inputs or decisions changed');
    const result = { GeneratedAt: new Date(now).toISOString(), Applied: apply, CandidateCount: plan.totals.candidateCount,
      DeletedCount: 0, Validation: 'PASS', DeletedBatches: [] };
    // The same lock spans validation and the last removal. No gap for an index run.
    await onPhase('before-removal');
    if (apply) for (const row of plan.rows.filter(r => r.Action === 'RETIRE_CANDIDATE')) {
      await fs.rm(safeBatchPath(config.batchesRoot, row.BatchName), { recursive: true, force: false });
      result.DeletedCount++; result.DeletedBatches.push(row.BatchName);
    }
    return result;
  });
}
module.exports = { planRetention, retireBatches, captureInputs, digest, safeBatchPath };
