const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DuckDBInstance } = require('@duckdb/node-api');
const { rowsToCsv } = require('../lib/csv');
const { fetchedTime, discover, observedAt, normalizeUrl, runHistory, query } = require('../lib/jobs-history');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'history-test-'));
  const root = path.join(temp, 'snapshots'), database = path.join(temp, 'history.duckdb');
  await fs.mkdir(root);
  const base = { CanonicalURLKey: 'https://example.com/a', URL: 'https://example.com/a', JobKey: 'bamboohr:118', Company: 'Example', Title: 'Writer', Location: 'US', RemoteStatus: 'Remote', USRemoteEligible: 'unknown', SalaryMin: 'not specified' };
  async function fixture(id, rows, links) {
    const folder = path.join(root, id); await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, '03_top_matches_full.csv'), rowsToCsv([...new Set([...Object.keys(base), ...rows.flatMap(Object.keys)])], rows));
    const goodRows = links.map(link => typeof link === 'string' ? { 'Apply Link': link } : link);
    await fs.writeFile(path.join(folder, '01_good_documentation_jobs.csv'), rowsToCsv([...new Set(['Apply Link', ...goodRows.flatMap(Object.keys)])], goodRows));
  }
  async function read(statement) {
    const instance = await DuckDBInstance.create(database, { access_mode: 'READ_ONLY' });
    const c = await instance.connect();
    try { return await query(c, statement); } finally { c.closeSync(); instance.closeSync(); }
  }
  try {
    for (const name of ['latest', 'latest-clean', 'top-matches-only', '2026010-0100', '20260230-1200']) await fs.mkdir(path.join(root,name));
    await fixture('20260101-0100', [base, { ...base, CanonicalURLKey: 'https://example.com/b', URL: 'https://example.com/b' }], ['HTTPS://EXAMPLE.COM/A/']);
    assert.deepEqual((await discover(root)).ids, ['20260101-0100']);
    assert.equal((await discover(root)).malformed.length, 2);
    assert.equal(observedAt('20260230-1200'), null);
    assert.equal(normalizeUrl(' HTTPS://EXAMPLE.COM/A/// '), 'https://example.com/a');
    await assert.rejects(runHistory('build', { root, database }), /Malformed/);
    for (const name of ['2026010-0100', '20260230-1200']) await fs.rmdir(path.join(root,name));
    let result = await runHistory('build', { root, database });
    assert.equal(Number(result.observations), 2); assert.equal(Number(result.job_keys), 1);
    assert.deepEqual((await read('SELECT included_in_good_jobs FROM posting_observations ORDER BY url')).map(r=>r.included_in_good_jobs), [true,false]);
    assert.equal((await read('SELECT us_remote_eligible FROM posting_observations LIMIT 1'))[0].us_remote_eligible, null);
    result = await runHistory('update', { root, database }); assert.equal(result.imported, 0); assert.equal(Number(result.observations), 2);
    await fixture('20260102-0100', [{ ...base, Title: 'Senior Writer', ExtraHistory: 'kept' }], []);
    result = await runHistory('update', { root, database }); assert.equal(result.imported, 1); assert.equal(Number(result.observations), 3);
    await fixture('20260103-0100', [base], [base.URL]);
    await fixture('20260104-0100', [], []);
    await runHistory('update', { root, database });
    result = await runHistory('update', { root, database }); assert.equal(result.imported, 0); assert.equal(Number(result.observations), 4);
    const life = (await read("SELECT * FROM posting_lifecycle WHERE canonical_url_key = 'https://example.com/a'"))[0];
    assert.equal(Number(life.snapshots_seen), 3); assert.match(life.first_seen, /2026-01-01/); assert.match(life.last_seen, /2026-01-03/);
    assert.deepEqual((await read("SELECT included_in_good_jobs FROM posting_observations WHERE canonical_url_key='https://example.com/a' ORDER BY snapshot_id")).map(r=>r.included_in_good_jobs), [true,false,true]);
    assert.deepEqual((await read("SELECT extra_history FROM posting_observations WHERE canonical_url_key='https://example.com/a' ORDER BY snapshot_id")).map(r=>r.extra_history), [null,'kept',null]);
    assert.equal((await read("SELECT inclusion_rate FROM snapshots WHERE snapshot_id='20260104-0100'"))[0].inclusion_rate, null);
    assert.equal((await runHistory('audit', { root, database })).errors.length, 0);
    assert.equal(fetchedTime('2026-02-30T12:00:00Z'), -Infinity);
    assert.equal(fetchedTime('not a date'), -Infinity);
    const siblings = [
      {...base, FetchedAt:'invalid', Title:'Invalid'},
      {...base, FetchedAt:'2026-01-01T01:00:00Z', Title:'Older'},
      {...base, FetchedAt:'2026-01-02T01:00:00Z', Title:'Selected'},
      {...base, FetchedAt:'2026-01-02T02:00:00+01:00', Title:'Tie loses'},
    ];
    await fixture('20260105-0100', siblings, [base.URL, { 'Apply Link':'https://example.com/missing', Title:'Exception writer', Company:'Saved company', Location:'Remote', 'Work Arrangement':'Remote', 'Writer Fit Score':'85', 'Additional Apply Links':'https://example.com/also-missing' }]);
    result = await runHistory('update', { root, database });
    assert.equal(result.errors.length, 0); assert.ok(result.warnings.some(w=>w.includes('duplicate canonical')));
    assert.ok(result.warnings.some(w=>w.includes('unmatched good-job')));
    assert.equal(Number(result.raw_top_match_rows), 8); assert.equal(Number(result.observations), 5);
    const selected = (await read("SELECT * FROM posting_observations WHERE snapshot_id='20260105-0100'"))[0];
    assert.equal(selected.title, 'Selected'); assert.equal(selected.selected_raw_row_number, 3);
    assert.equal(selected.canonical_group_row_count, 4); assert.equal(selected.duplicate_canonical_row_count, 3);
    assert.deepEqual((await read("SELECT selected_for_observation FROM raw_top_match_rows WHERE snapshot_id='20260105-0100' ORDER BY raw_row_number")).map(r=>r.selected_for_observation), [false,false,true,false]);
    const exception = (await read('SELECT * FROM good_job_exceptions'))[0];
    assert.equal(exception.reason,'no_matching_top_match_url'); assert.equal(exception.apply_link,'https://example.com/missing');
    assert.equal(exception.title,'Exception writer'); assert.equal(exception.company,'Saved company'); assert.equal(exception.location,'Remote');
    assert.equal(JSON.parse(exception.raw_values)['Writer Fit Score'],'85');
    assert.equal(exception.raw_row_number,2); assert.equal(JSON.parse(exception.raw_values)['Apply Link'],exception.apply_link);
    for (let i=0;i<2;i++) {
      const update=await runHistory('update',{root,database});
      assert.equal(update.imported,0); assert.equal(update.raw_top_match_rows,result.raw_top_match_rows);
      assert.equal(update.observations,result.observations); assert.equal(update.good_job_exceptions,result.good_job_exceptions);
    }
    // Independent corruption checks: an accounted-for warning must never hide loss.
    for (const statement of [
      "DELETE FROM raw_top_match_rows WHERE snapshot_id='20260105-0100' AND raw_row_number=1",
      'DELETE FROM good_job_exceptions',
      "UPDATE posting_observations SET selected_raw_row_number=1 WHERE snapshot_id='20260105-0100'",
      "UPDATE posting_observations SET title='corrupt' WHERE snapshot_id='20260105-0100'",
      "UPDATE snapshot_files SET sha256='wrong' WHERE snapshot_id='20260105-0100'",
      // Remove the PK to simulate an externally damaged database.
      "CREATE TABLE broken AS SELECT * FROM posting_observations; DROP TABLE posting_observations; ALTER TABLE broken RENAME TO posting_observations; INSERT INTO posting_observations SELECT * FROM posting_observations LIMIT 1",
    ]) {
      const instance=await DuckDBInstance.create(database), connection=await instance.connect();
      try { await connection.run(statement); } finally { connection.closeSync(); instance.closeSync(); }
      await assert.rejects(runHistory('audit',{root,database}), /mismatch|duplicate/);
      await runHistory('build',{root,database});
    }
    await fixture('20260106-0100', [{...base,FetchedAt:'bad',Title:'First'}, {...base,FetchedAt:'',Title:'Second'}], []);
    await runHistory('update',{root,database});
    assert.equal((await read("SELECT title FROM posting_observations WHERE snapshot_id='20260106-0100'"))[0].title,'First');
    const beforeFailure = await fs.readFile(database);
    await fixture('20260107-0100', [{...base,CanonicalURLKey:''}], []);
    await assert.rejects(runHistory('update', { root, database }), /Missing canonical/);
    await assert.rejects(runHistory('build', { root, database }), /Missing canonical/);
    assert.deepEqual(await fs.readFile(database), beforeFailure);
    await fixture('20260107-0100', [{...base, snapshot_id:'collision'}], []);
    await assert.rejects(runHistory('build', { root, database }), /collide/);
    await fs.rm(path.join(root,'20260107-0100'), { recursive:true });
    await fixture('20260101-0100', [base], []);
    await assert.rejects(runHistory('update', { root, database }), /mismatch/);
    await fs.unlink(path.join(root,'20260101-0100','01_good_documentation_jobs.csv'));
    await assert.rejects(runHistory('audit', { root, database }), /ENOENT/);

    console.log('PASS: discovery, integrity failures, URL membership, identity, types, schema union, empty snapshot, lifecycle, inclusion history, atomic rebuild, incremental update, idempotency, duplicate selection, raw preservation, exceptions, and corruption detection');
  } finally { await fs.rm(temp, { recursive:true, force:true }); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
