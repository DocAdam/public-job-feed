// Monthly files are monotonic event sets. A retry can finish a partial publish
// without removing old events. Board state is published only after every month.
const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { isDeepStrictEqual } = require('node:util');

const MONTH = /^(?:\d{4}-(?:0[1-9]|1[0-2])|unknown)$/;
const MAX_LINE_BYTES = 4 * 1024 * 1024;
const lockName = '.fetch-history.lock';
const recoveryName = '.fetch-history-recovery.lock';
async function exists(file) {
  try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
async function directory(dir) {
  // Check each component before creation; never follow an application symlink.
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { await fs.mkdir(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const s = await fs.lstat(current);
    const alias = process.platform === 'darwin' && ['/var', '/tmp'].includes(current) &&
      await fs.realpath(current) === '/private' + current;
    if ((!s.isDirectory() && !alias) || (s.isSymbolicLink() && !alias)) throw new Error('Unsafe history directory: ' + current);
  }
}
async function regular(file) {
  const s = await fs.lstat(file);
  if (!s.isFile() || s.isSymbolicLink()) throw new Error('Unsafe history file: ' + file);
}
async function syncDir(dir) {
  const h = await fs.open(dir, 'r');
  try { await h.sync(); } finally { await h.close(); }
}
async function readLock(file) {
  await regular(file);
  const owner = JSON.parse(await fs.readFile(file, 'utf8'));
  if (owner.version !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      owner.host !== os.hostname() || !/^[0-9a-f-]{36}$/.test(owner.nonce)) {
    throw new Error('Unknown history lock owner; manual review required');
  }
  return owner;
}
function mergeEvent(events, event) {
  if (events.has(event.EventId) && !isDeepStrictEqual(events.get(event.EventId), event)) {
    throw new Error('Conflicting history EventId: ' + event.EventId);
  }
  events.set(event.EventId, event);
}
async function readMonth(file, month, validate) {
  const events = new Map();
  if (!await exists(file)) return events;
  await regular(file);
  let pending = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function line(text) {
    if (Buffer.byteLength(text) > MAX_LINE_BYTES) throw new Error('History record exceeds size limit');
    const event = JSON.parse(text);
    validate(event, month);
    if (events.has(event.EventId)) throw new Error('Duplicate saved history EventId: ' + event.EventId);
    events.set(event.EventId, event);
  }
  await pipeline(nodeFs.createReadStream(file), zlib.createGunzip(), async chunks => {
    for await (const chunk of chunks) {
      pending += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        line(pending.slice(0, end)); pending = pending.slice(end + 1);
      }
      if (Buffer.byteLength(pending) > MAX_LINE_BYTES) throw new Error('History record exceeds size limit');
    }
    pending += decoder.decode();
    if (pending) line(pending);
  });
  return events;
}
async function stage(file, lines, compressed, owner, temps, onPhase) {
  const temp = path.join(path.dirname(file), `.fetch-history-${owner.nonce}-${path.basename(file)}.tmp`);
  const h = await fs.open(temp, 'wx', 0o600);
  temps.add(temp);
  try {
    await onPhase('temp-opened', { file, temp });
    const sink = async chunks => {
      let first = true;
      for await (const chunk of chunks) {
        await h.writeFile(chunk);
        if (first) { first = false; await onPhase('temp-chunk-written', { file, temp }); }
      }
    };
    if (compressed) await pipeline(Readable.from(lines), zlib.createGzip({ level: 9 }), sink);
    else await pipeline(Readable.from(lines), sink);
    await h.sync();
    await onPhase('staged', { file, temp });
  } finally { await h.close(); }
  return { file, temp };
}
async function publish(item, temps) {
  if (await exists(item.file)) await regular(item.file);
  await fs.rename(item.temp, item.file);
  temps.delete(item.temp);
  await syncDir(path.dirname(item.file));
}

async function writeFetchHistory({ outputDir, byMonth, state, validate, onPhase = async () => {} }) {
  outputDir = path.resolve(outputDir);
  await directory(outputDir);
  const historyRoot = path.join(outputDir, 'history', 'fetch-events');
  await directory(historyRoot);
  const lock = path.join(outputDir, lockName), recovery = path.join(outputDir, recoveryName);
  if (await exists(recovery)) throw new Error('History lock recovery is active; manual review required if interrupted');
  const h = await fs.open(lock, 'wx', 0o600).catch(e => {
    if (e.code === 'EEXIST') throw new Error('History writer lock exists; recover only after its owner stops');
    throw e;
  });
  const owner = { version: 1, pid: process.pid, host: os.hostname(), nonce: crypto.randomUUID() };
  const temps = new Set();
  let recorded = false;
  try {
    await h.writeFile(JSON.stringify(owner)); await h.sync(); recorded = true;
    await syncDir(outputDir);
    if (await exists(recovery)) throw new Error('History lock recovery is active');
    const months = new Set(byMonth.keys());
    for (const name of await fs.readdir(historyRoot)) {
      if (!name.endsWith('.jsonl.gz')) continue;
      const month = name.slice(0, -9);
      if (!MONTH.test(month)) throw new Error('Unexpected history month: ' + name);
      months.add(month);
    }
    let eventCount = 0, addedEventCount = 0;
    const staged = [], changedMonths = [];
    // Stage every changed month before publishing any file. Only one saved
    // month's decoded records are held at once; gzip output is streamed.
    for (const month of [...months].sort()) {
      if (!MONTH.test(month)) throw new Error('Invalid history month');
      const file = path.join(historyRoot, month + '.jsonl.gz');
      const events = await readMonth(file, month, validate), oldCount = events.size;
      for (const event of byMonth.get(month)?.values() || []) {
        validate(event, month); mergeEvent(events, event);
      }
      eventCount += events.size;
      addedEventCount += events.size - oldCount;
      if (events.size !== oldCount) {
        const rows = [...events.values()].sort((a, b) => a.EventId < b.EventId ? -1 : a.EventId > b.EventId ? 1 : 0);
        staged.push(await stage(file, (function* () {
          for (const row of rows) {
            const line = JSON.stringify(row) + '\n';
            if (Buffer.byteLength(line) > MAX_LINE_BYTES) throw new Error('History record exceeds size limit');
            yield line;
          }
        })(), true, owner, temps, onPhase));
        changedMonths.push(month);
      }
    }
    const stateFile = path.join(outputDir, 'board-latest-fetch.json');
    if (await exists(stateFile)) await regular(stateFile);
    const stagedState = await stage(stateFile, [JSON.stringify(state, null, 2) + '\n'], false, owner, temps, onPhase);
    for (const item of staged) {
      await publish(item, temps); await onPhase('month-published', { file: item.file });
    }
    await onPhase('before-state-publish', { file: stateFile });
    await publish(stagedState, temps);
    return { eventCount, addedEventCount, months: [...months].sort(), changedMonths };
  } finally {
    await h.close();
    for (const temp of temps) { await regular(temp); await fs.unlink(temp); }
    // Unknown or damaged ownership must never be silently cleared.
    if (recorded) {
      if ((await readLock(lock)).nonce !== owner.nonce) throw new Error('History lock changed');
      await fs.unlink(lock); await syncDir(outputDir);
    }
  }
}

async function recoverFetchHistory(outputDir) {
  outputDir = path.resolve(outputDir);
  await directory(outputDir);
  const guard = path.join(outputDir, recoveryName);
  const h = await fs.open(guard, 'wx', 0o600);
  try {
    const lock = path.join(outputDir, lockName);
    if (!await exists(lock)) return { recovered: false, removedTemps: 0 };
    const owner = await readLock(lock);
    try { process.kill(owner.pid, 0); throw new Error('History writer is still active'); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
    const candidates = [];
    for (const dir of [outputDir, path.join(outputDir, 'history', 'fetch-events')]) {
      if (!await exists(dir)) continue;
      await directory(dir);
      for (const name of await fs.readdir(dir)) {
        const prefix = `.fetch-history-${owner.nonce}-`;
        if (!name.startsWith(prefix)) continue;
        const suffix = name.slice(prefix.length);
        const valid = dir === outputDir ? suffix === 'board-latest-fetch.json.tmp' :
          suffix.endsWith('.jsonl.gz.tmp') && MONTH.test(suffix.slice(0, -13));
        if (!valid) throw new Error('Unknown history staging file; manual review required');
        const file = path.join(dir, name); await regular(file); candidates.push(file);
      }
    }
    if ((await readLock(lock)).nonce !== owner.nonce) throw new Error('History lock changed');
    for (const file of candidates) await fs.unlink(file);
    for (const dir of new Set(candidates.map(file => path.dirname(file)))) await syncDir(dir);
    await fs.unlink(lock); await syncDir(outputDir);
    return { recovered: true, removedTemps: candidates.length };
  } finally { await h.close(); await fs.unlink(guard); await syncDir(outputDir); }
}

module.exports = { writeFetchHistory, recoverFetchHistory, mergeEvent, MAX_LINE_BYTES, readMonth };
