const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { rowsToCsv, parseCsvRecords } = require('../lib/csv');
const { query } = require('../lib/jobs-history');
const { TOP, GOOD } = require('../lib/job-history-storage');
const { createBoundedPrototype, boundedReader, merge, auditIntegrity, parseCsvFlat, q } = require('../lib/job-history-bounded-storage');
const { installLifecycleViews, lifecycleEvents, lifecycleSummary } = require('../lib/job-history-lifecycle');
const job = { CanonicalURLKey: 'https://fixture/a', URL: 'https://fixture/a', JobKey: 'same-key', Company: 'One', Title: 'Technical Writer', Description: 'A' };
const exported = { 'Apply Link': job.URL, Title: job.Title, Company: 'One', Location: 'US', 'Work Arrangement': 'Remote' };
async function fixture(root, id, top, good, { time, recorded = true } = {}) {
  const folder = path.join(root, id); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, TOP), rowsToCsv([...new Set([...Object.keys(job), ...top.flatMap(Object.keys)])], top));
  await fs.writeFile(path.join(folder, GOOD), rowsToCsv([...new Set([...Object.keys(exported), ...good.flatMap(Object.keys)])], good));
  if (recorded) await fs.writeFile(path.join(folder, 'README_GSHEET_PACKAGE.md'), `Generated: ${time || `${id.slice(0,4)}-${id.slice(4,6)}-${id.slice(6,8)}T${id.slice(9,11)}:${id.slice(11)}:00Z`}\n`);
}
async function events(c, filter) { const rows = []; for await (const e of lifecycleEvents(c, filter)) rows.push(e); return rows; }
async function state(c) { return { events: await events(c), periods: await query(c, 'SELECT * FROM history_presence_periods ORDER BY stream,subject_key,first_snapshot') }; }
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'history-lifecycle-test-')), root = path.join(temp, 'snapshots');
  let p, rebuilt, small, clocks, empty, columns;
  try {
    for(const text of ['', 'a,b\n1,  tail  \n2,done\n', 'a,b\n"line\nnext","quote ""here"""\n,\n', 'a\tb\n1\ttwo  \n2\tdone', 'a,b\r\n"A\r\nB",x\r\n', 'a\n\n  \nvalue\n', 'a,b\nmid"quote, x \nend,done\n']) {
      assert.deepEqual(parseCsvFlat(text),parseCsvRecords(text),'Record-at-a-time parser must preserve existing values');
    }
    const ids = ['20260101-1200','20260101-1800','20260103-1200','20260104-1200','20260105-1200','20260106-1200','20260107-1200'];
    const extra = { ...job, CanonicalURLKey:'https://fixture/other', URL:'https://fixture/other', Company:'Two' };
    const x = { ...exported, 'Apply Link':'https://fixture/export-only' };
    await fixture(root, ids[0], [job], [exported, exported]);
    await fixture(root, ids[1], [{...job,Description:'B'}], []);
    await fixture(root, ids[2], [{...job,Department:'Docs'},extra], [exported,x]);
    await fixture(root, ids[3], [], []); await fixture(root, ids[4], [], []);
    await fixture(root, ids[5], [{...job,Description:'C',Department:'Docs'}], [x]);
    await fixture(root, ids[6], [{...job,Description:'C',Department:'Docs'}], [exported]);
    p = await createBoundedPrototype({ limits:{batchRows:2,readRows:2} });
    await p.importPackages(root, ids.map(id=>({id}))); await installLifecycleViews(p.connection);
    let list = await events(p.connection,{stream:'shortlist',subject:job.URL});
    assert.deepEqual(list.filter(e=>e.event_type==='content_changed').map(e=>[e.snapshot_id,e.fields]), [[ids[1],['Description']],[ids[2],['Description']],[ids[5],['Description']]]);
    assert.deepEqual(list.filter(e=>e.event_type==='schema_changed').map(e=>[e.snapshot_id,e.fields]), [[ids[2],['Department']]]);
    assert.equal(list.filter(e=>e.event_type==='absent_from_snapshot').length,1);
    assert.equal(list.find(e=>e.event_type==='absent_from_snapshot').snapshot_id,ids[3]);
    assert.equal(list.find(e=>e.event_type==='absent_from_snapshot').raw_row_number,null);
    assert.equal(list.find(e=>e.event_type==='reappeared').after_gap,true);
    assert.equal(list.find(e=>e.snapshot_id===ids[5]&&e.event_type==='content_changed').previous_snapshot,ids[2]);
    assert.equal(list.find(e=>e.snapshot_id===ids[5]&&e.event_type==='content_changed').coverage_changed,true,'Intervening coverage changes remain visible when endpoint counts match');
    assert.equal(list.find(e=>e.snapshot_id===ids[2]&&e.event_type==='content_changed').coverage_changed,true);
    assert.equal(Number(list.find(e=>e.snapshot_id===ids[2]&&e.event_type==='content_changed').missing_calendar_days),1);
    const summary = await lifecycleSummary(p.connection,'shortlist',job.URL);
    assert.equal(summary.observed_span_hours,144); assert.equal(summary.presence_period_count,2);
    assert.equal(summary.reappearance_count,1); assert.equal(summary.content_change_count,3);
    assert.equal(summary.schema_change_count,1); assert.equal(summary.left_censored,true); assert.equal(summary.right_censored,true);
    assert.equal(Number(summary.snapshots_seen),5); assert.equal(Number(summary.distinct_observed_dates),4);
    const periods = await query(p.connection, `SELECT * FROM history_presence_periods WHERE stream='shortlist' AND subject_key=${q(job.URL)} ORDER BY first_snapshot`);
    assert.deepEqual(periods.map(r=>r.observed_span_hours),[48,24]);
    assert.equal(Number(periods[0].missing_calendar_days),1);
    const one = await lifecycleSummary(p.connection,'shortlist',extra.URL);
    assert.equal(one.observed_span_hours,0); assert.equal(one.left_censored,false); assert.equal(one.right_censored,false);
    assert.equal(await lifecycleSummary(p.connection,'shortlist',x['Apply Link']),null);
    assert.equal(Number((await lifecycleSummary(p.connection,'export',x['Apply Link'])).snapshots_seen),2);
    assert.ok((await events(p.connection,{stream:'export',subject:job.URL})).some(e=>e.event_type==='left_public_export'&&e.snapshot_id===ids[1]));
    assert.equal(Number((await query(p.connection,"SELECT count(*) n FROM history_presence WHERE stream='export' AND snapshot_id='20260101-1200'"))[0].n),1);
    const initial = await state(p.connection);
    for await(const event of lifecycleEvents(p.connection)){assert.ok(event.event_id);break;}
    assert.equal(Number((await query(p.connection,"SELECT count(*) n FROM duckdb_tables() WHERE table_name LIKE 'event_cursor_%'"))[0].n),0,'Early exit must release the temporary event cursor');
    await assert.rejects(createBoundedPrototype({ownedDirectory:p.directory,ownerToken:'wrong'}),/owner token mismatch/);
    await assert.rejects(createBoundedPrototype({ownedDirectory:temp,ownerToken:'wrong'}),/Not an owned temporary prototype/);
    for(const sql of ["DELETE FROM history_v2_good_job_exceptions", "UPDATE history_v2_text_blobs SET content='corrupt'", 'UPDATE history_v2_observations SET selected_raw_row_number=99999']) {
      await p.connection.run('BEGIN TRANSACTION');
      try { await p.connection.run(sql); await assert.rejects(auditIntegrity(p.connection),/Integrity failure/); }
      finally { await p.connection.run('ROLLBACK'); }
    }
    // The partitioned reconstruction audit must reach both ends of history.
    for(const id of [ids[0],ids.at(-1)]) {
      await p.connection.run('BEGIN TRANSACTION');
      try {
        await p.connection.run(`UPDATE history_v2_raw_rows SET raw_hash='corrupt' WHERE snapshot_id=${q(id)}`);
        await assert.rejects(auditIntegrity(p.connection),new RegExp(`SQL reconstruction ${id}`));
      } finally { await p.connection.run('ROLLBACK'); }
    }
    await p.connection.run('BEGIN TRANSACTION');
    try {
      await p.connection.run("UPDATE history_v2_payload_texts SET json_prefix='corrupt'");
      await assert.rejects(auditIntegrity(p.connection),/SQL reconstruction/);
    } finally { await p.connection.run('ROLLBACK'); }
    for(const sql of ['UPDATE history_v2_payload_texts SET text_hash=NULL','DELETE FROM history_v2_payload_texts']){
      await p.connection.run('BEGIN TRANSACTION');
      try {await p.connection.run(sql);await assert.rejects(auditIntegrity(p.connection),/payload text references/);}
      finally {await p.connection.run('ROLLBACK');}
    }
    for(const sql of [
      'UPDATE history_v2_runs SET company_count=company_count+1',
      'UPDATE history_v2_runs SET catalog_slug_count=NULL',
      `UPDATE history_v2_snapshots SET metadata=json_merge_patch(metadata,'{"top":99999}')::VARCHAR`,
      `UPDATE history_v2_snapshots SET metadata=json_merge_patch(metadata,'{"unmatched":99999}')::VARCHAR`,
    ]){
      await p.connection.run('BEGIN TRANSACTION');
      try{await p.connection.run(sql);await assert.rejects(auditIntegrity(p.connection),/Snapshot count\/run metadata mismatch/);}
      finally{await p.connection.run('ROLLBACK');}
    }
    await p.importPackage(root,ids[0]); await p.importPackage(root,ids[0]);
    assert.deepEqual(await state(p.connection),initial,'No-op must not change lifecycle or event keys');
    const source = path.join(root,ids[0],TOP), original = await fs.readFile(source);
    await fs.appendFile(source,'\n'); await assert.rejects(p.importPackage(root,ids[0]),/Changed source hash/); await fs.writeFile(source,original);
    assert.deepEqual(await state(p.connection),initial);
    await assert.rejects(p.importPackage(root,'20260108-1200',{status:'failed'}),/stops advancement/);
    await assert.rejects(p.importPackage(root,'20260108-1200'),/ENOENT/);
    assert.deepEqual(await state(p.connection),initial,'Failed or missing package must not advance absence');
    await fixture(root,'20260108-1200',[],[]);
    await assert.rejects(p.importPackage(root,'20260108-1200',{beforeCommit:()=>fs.appendFile(path.join(root,'20260108-1200',GOOD),'\n')}),/Source hash mismatch/);
    assert.deepEqual(await state(p.connection),initial,'Source mutation rolls back all lifecycle evidence');
    // The writer guard prevents overlapping use of one connection/transaction.
    let release, entered;
    const ready = new Promise(resolve=>{entered=resolve;}); const hold = new Promise(resolve=>{release=resolve;});
    const pending = p.importPackage(root,'20260108-1200',{beforeCommit:async()=>{entered();await hold;throw new Error('Injected failure');}});
    await ready; await assert.rejects(p.importPackage(root,ids[0]),/writer already active/); release();
    await assert.rejects(pending,/Injected failure/); assert.deepEqual(await state(p.connection),initial);
    await assert.rejects(p.importPackage(root,'20260108-1200',{beforeCommit:()=>p.connection.run(`INSERT INTO history_v2_snapshots SELECT * FROM history_v2_snapshots WHERE snapshot_id=${q(ids[0])}`)}),/Constraint/);
    assert.deepEqual(await state(p.connection),initial,'Database error must roll back without masking the original error');
    // Insert an older valid empty package: period boundaries must be derived again.
    const late='20260102-1200'; await fixture(root,late,[],[]); await p.importPackage(root,late);
    assert.equal((await lifecycleSummary(p.connection,'shortlist',job.URL)).presence_period_count,3);
    assert.ok((await events(p.connection,{stream:'shortlist',subject:job.URL})).some(e=>e.event_type==='absent_from_snapshot'&&e.snapshot_id===late));
    rebuilt=await createBoundedPrototype(); await rebuilt.importPackages(root,[...ids,late].map(id=>({id}))); await installLifecycleViews(rebuilt.connection);
    assert.deepEqual(await state(p.connection),await state(rebuilt.connection),'Late insert equals chronological rebuild');
    // Batch collision checks compare exact bytes with the persistent catalog.
    const text=(await query(p.connection,'SELECT * FROM history_v2_text_blobs LIMIT 1'))[0];
    await assert.rejects(merge(p.connection,'history_v2_text_blobs',[[text.text_hash,'unequal']],['text_hash']),/Hash collision/);
    small=await createBoundedPrototype({limits:{packageBytes:64}});
    await assert.rejects(small.importPackage(root,ids[0]),/Package exceeds byte limit/);
    assert.equal(Number((await query(small.connection,'SELECT count(*) n FROM history_v2_snapshots'))[0].n),0);
    await small.dispose(); small=await createBoundedPrototype({limits:{recordBytes:64}});
    await assert.rejects(small.importPackage(root,ids[0]),/record exceeds byte limit/i);
    assert.equal(Number((await query(small.connection,'SELECT count(*) n FROM history_v2_snapshots'))[0].n),0);
    await assert.rejects(createBoundedPrototype({limits:{readRows:100}}),/increased prototype limit/);
    // Unknown clock and backward recorded clock must not yield a confident span.
    const clockRoot=path.join(temp,'clocks');
    await fixture(clockRoot,ids[0],[job],[exported],{recorded:false});
    await fixture(clockRoot,ids[1],[job],[exported],{time:'2026-01-01T18:00:00Z'});
    await fixture(clockRoot,ids[2],[job],[exported],{time:'2026-01-01T17:00:00Z'});
    clocks=await createBoundedPrototype(); await clocks.importPackages(clockRoot,ids.slice(0,3).map(id=>({id}))); await installLifecycleViews(clocks.connection);
    assert.equal((await lifecycleSummary(clocks.connection,'shortlist',job.URL)).observed_span_hours,null);
    assert.equal((await query(clocks.connection,'SELECT time_problem FROM history_ordered_runs ORDER BY snapshot_id DESC LIMIT 1'))[0].time_problem,true);
    const pop=await (await boundedReader(p.connection)).population(ids[0]); assert.equal(pop.good.length,2); assert.equal(pop.details.length,1);
    const emptyRoot=path.join(temp,'empty');await fixture(emptyRoot,ids[0],[],[]);
    empty=await createBoundedPrototype();await empty.importPackage(emptyRoot,ids[0]);await installLifecycleViews(empty.connection);
    assert.deepEqual(await events(empty.connection),[]);assert.equal(await lifecycleSummary(empty.connection,'shortlist',job.URL),null);
    const columnRoot=path.join(temp,'columns');
    await fixture(columnRoot,ids[0],[{...job,ExtraHistory:'a'}],[]);
    await fixture(columnRoot,ids[1],[{...job,Extra_History:'b'}],[]);
    columns=await createBoundedPrototype();await columns.importPackage(columnRoot,ids[0]);
    await assert.rejects(columns.importPackage(columnRoot,ids[1]),/conflicting row: history_v2_columns/);
    console.log(JSON.stringify({status:'passed', checks:['content changes and schema changes','two independent streams','duplicate export membership','one absence boundary','reappearance with prior content','calendar gaps and multiple runs per day','coverage warning including intervening changes','censoring and zero span','unknown and conflicting clocks','two no-op updates','changed old source rejection','failed and missing package','source mutation rollback','overlapping writer rejection','late insert equals rebuild','persistent hash collision','package and row size limits','corruption detection','empty history'], summary, stats:p.stats},null,2));
  } finally { for(const item of [p,rebuilt,small,clocks,empty,columns]) await item?.dispose(); await fs.rm(temp,{recursive:true,force:true}); }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fixture,job,exported};
