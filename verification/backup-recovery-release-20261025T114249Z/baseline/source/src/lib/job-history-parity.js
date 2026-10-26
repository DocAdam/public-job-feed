// Exact public SQL and report comparison, shared by qualification and tests.
const assert=require('node:assert/strict');
const {query,ident}=require('./jobs-history');
const {q}=require('./job-history-bounded-storage');
const {PUBLIC_OBJECTS}=require('./job-history-sql-compatibility');
const {compareObservationRows}=require('./job-history-prototype-files');
const {renderReport}=require('./jobs-history-report');
async function compareSql(c, database) {
  await c.run(`ATTACH ${q(database)} AS control (READ_ONLY)`);
  const results = [];
  try {
    assert.deepEqual(await query(c,'SELECT snapshot_id FROM main.snapshots ORDER BY snapshot_id'),await query(c,'SELECT snapshot_id FROM control.snapshots ORDER BY snapshot_id'),'Complete snapshot inventory');
    for (const name of PUBLIC_OBJECTS) {
      if(process.env.HISTORY_TEST_TRACE)console.error(name);
      const shape = async prefix => (await query(c, `DESCRIBE SELECT * FROM ${prefix}.${ident(name)}`)).map(r=>[r.column_name,r.column_type]);
      assert.equal((await query(c,`SELECT count(*) n FROM main.${ident(name)}`))[0].n,(await query(c,`SELECT count(*) n FROM control.${ident(name)}`))[0].n,`${name} total row count`);
      const expected=await shape('control'), actual=await shape('main');
      assert.deepEqual(actual,expected,`${name} column names, order and types`);
      if(expected.some(r=>r[0]==='snapshot_id'))for(const prefix of ['main','control']){
        assert.equal((await query(c,`SELECT 1 FROM ${prefix}.${ident(name)} t ANTI JOIN ${prefix}.snapshots s USING(snapshot_id) LIMIT 1`)).length,0,`${name} orphan snapshot`);
      }
      // Import times are recorded independently. Compare their type/non-null
      // contract here; later no-op and compaction tests compare exact values.
      const columns=expected.map(r=>r[0]).filter(k=>!(name==='snapshots'&&k==='imported_at')).map(ident).join(',');
      const partitions=expected.some(r=>r[0]==='snapshot_id') ? (await query(c,'SELECT snapshot_id FROM control.snapshots ORDER BY snapshot_id')).map(r=>` WHERE snapshot_id=${q(r.snapshot_id)}`) : [''];
      let differences=0;
      if(name==='posting_observations'){
        const snapshots=(await query(c,'SELECT snapshot_id FROM control.snapshots ORDER BY snapshot_id')).map(r=>r.snapshot_id);
        await compareObservationRows(c,'main.posting_observations','control.posting_observations',snapshots,expected.map(r=>r[0]));
      }else for(const where of partitions){
        const left=`SELECT ${columns} FROM main.${ident(name)}${where}`, right=`SELECT ${columns} FROM control.${ident(name)}${where}`;
        for(const [a,b] of [[left,right],[right,left]])differences+=Number((await query(c,`SELECT count(*) n FROM (${a} EXCEPT ALL ${b})`))[0].n);
      }
      assert.equal(differences,0,`${name} every row and value (including JSON bytes)`);
      results.push({object:name,columns:expected.length,rows:Number((await query(c,`SELECT count(*) n FROM main.${ident(name)}`))[0].n),differences});
    }
    for(const prefix of ['main','control'])assert.equal(Number((await query(c,`SELECT count(*) n FROM ${prefix}.snapshots WHERE imported_at IS NULL`))[0].n),0);
    const report=async prefix=>renderReport({metrics:await query(c,`SELECT * FROM ${prefix}.historical_content_metrics`),roles:await query(c,`SELECT * FROM ${prefix}.historical_role_metrics`),generatedAt:'fixed'}).markdown;
    assert.equal(await report('main'),await report('control'),'Full report through SQL contracts');
    return {objects:results,report:'passed',imported_at:'Type and non-null parity; independent import timestamps'};
  } finally {await c.run('DETACH control');}
}
module.exports={compareSql};
