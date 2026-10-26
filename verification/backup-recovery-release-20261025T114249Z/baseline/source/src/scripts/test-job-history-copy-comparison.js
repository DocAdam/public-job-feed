const assert=require('node:assert/strict');
const {DuckDBInstance}=require('@duckdb/node-api');
const {compareCopies,fingerprint}=require('../lib/job-history-prototype-files');
const {query}=require('../lib/jobs-history');
async function main(){
  const d=await DuckDBInstance.create(':memory:',{memory_limit:'192MB',threads:'1'}),c=await d.connect();
  try{
    for(const name of ['original','copied']){
      await c.run(`ATTACH ':memory:' AS ${name}; CREATE TABLE ${name}.history_v2_snapshots(snapshot_id VARCHAR PRIMARY KEY);
        INSERT INTO ${name}.history_v2_snapshots VALUES ('20260101-1200'),('20260102-1200');
        CREATE TABLE ${name}.posting_observations(snapshot_id VARCHAR,canonical_url_key VARCHAR,raw_values JSON,description VARCHAR,flag BOOLEAN,amount DOUBLE,${Array.from({length:20},(_,i)=>`field_${i} VARCHAR`).join(',')});
        INSERT INTO ${name}.posting_observations SELECT '20260101-1200',k,'{"a":1,"b":2}','text '||k,NULL,NULL,${Array.from({length:20},(_,i)=>`'value_${i}_'||k`).join(',')} FROM (VALUES ('a'),('b')) t(k)`);
    }
    for(const name of ['original','copied'])await c.run(`UPDATE ${name}.posting_observations SET description='' WHERE canonical_url_key='a'`);
    assert.equal(await compareCopies(c,'original','copied'),2);
    const baseline=await fingerprint(c,'original');
    assert.deepEqual(await fingerprint(c,'copied'),baseline);
    const cases=[
      ['cross-row value swap',"UPDATE copied.posting_observations SET field_17=CASE WHEN canonical_url_key='a' THEN 'value_17_b' ELSE 'value_17_a' END"],
      ['late column change',"UPDATE copied.posting_observations SET field_19='changed' WHERE canonical_url_key='b'"],
      ['JSON byte order',`UPDATE copied.posting_observations SET raw_values='{"b":2,"a":1}' WHERE canonical_url_key='a'`],
      ['NULL versus string',"UPDATE copied.posting_observations SET field_8=NULL WHERE canonical_url_key='a'"],
      ['NULL versus empty',"UPDATE copied.posting_observations SET description=NULL WHERE canonical_url_key='a'"],
      ['NULL versus false',"UPDATE copied.posting_observations SET flag=false WHERE canonical_url_key='a'"],
      ['NULL versus zero',"UPDATE copied.posting_observations SET amount=0 WHERE canonical_url_key='a'"],
      ['missing row',"DELETE FROM copied.posting_observations WHERE canonical_url_key='b'"],
      ['extra row',"INSERT INTO copied.posting_observations SELECT * FROM copied.posting_observations LIMIT 1"],
      ['duplicate key at same count',"UPDATE copied.posting_observations SET canonical_url_key='a'"],
      ['NULL key',"UPDATE copied.posting_observations SET canonical_url_key=NULL WHERE canonical_url_key='a'"],
      ['missing snapshot',"DELETE FROM copied.history_v2_snapshots WHERE snapshot_id='20260102-1200'"],
    ];
    for(const [label,sql] of cases){
      await c.run('BEGIN');try{await c.run(sql);await assert.rejects(compareCopies(c,'original','copied'),/Compaction|Invalid wide|Wide observation/,label);
        assert.notDeepEqual(await fingerprint(c,'copied'),baseline,`Fingerprint must detect ${label}`);
        assert.deepEqual(await query(c,"SELECT table_name FROM information_schema.tables WHERE table_catalog='temp' AND starts_with(table_name,'compact_compare_')"),[],'Temporary comparison table removed after failure');
      }finally{await c.run('ROLLBACK');}
    }
    assert.equal(await compareCopies(c,'original','copied'),2);
    for(const name of ['original','copied'])await c.run(`CREATE VIEW ${name}.derived_rows AS
      SELECT snapshot_id,canonical_url_key,lag(field_17) OVER(ORDER BY canonical_url_key) previous_value FROM ${name}.posting_observations`);
    assert.equal(await compareCopies(c,'original','copied'),3);
    const withView=await fingerprint(c,'original');
    assert.deepEqual(await fingerprint(c,'copied'),withView);
    await c.run(`CREATE OR REPLACE VIEW copied.derived_rows AS
      SELECT snapshot_id,canonical_url_key,'changed'::VARCHAR previous_value FROM copied.posting_observations`);
    await assert.rejects(compareCopies(c,'original','copied'),/Compaction data differs: derived_rows/);
    assert.notDeepEqual(await fingerprint(c,'copied'),withView);
    assert.deepEqual(await query(c,"SELECT table_name FROM information_schema.tables WHERE table_catalog='temp' AND starts_with(table_name,'compact_compare_')"),[]);
    return {status:'passed',cases:cases.map(r=>r[0]),field_fingerprints:'passed',empty_snapshot:'passed',temporary_stage_cleanup:'passed'};
  }finally{c.closeSync();d.closeSync();}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={main};
