const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {DuckDBInstance}=require('@duckdb/node-api');
const {createBoundedRunner}=require('../lib/job-history-bounded-runner');
const {fileHash,LIMITS}=require('../lib/job-history-bounded-storage');
const {runHistory,query,scan}=require('../lib/jobs-history');
const {compareSql}=require('./test-job-history-sql');
const {databaseOptions}=require('./job-history-validation-worker');
const {fixture,job,exported}=require('./test-job-history-lifecycle');
const run=promisify(execFile);
async function main(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'validation-guards-')),root=path.join(temp,'snapshots');let p,d,c;
  try{
    const id='20260101-1200',empty='20260102-1200';
    const rows=[{...job,Title:'One',ZuluField:'one'},{...job,CanonicalURLKey:'https://fixture/b',URL:'https://fixture/b',Title:'Two',ZuluField:'two'}];
    await fixture(root,id,rows,[exported,{...exported,'Apply Link':'https://fixture/exception'}]);
    await fixture(root,empty,[],[]);
    p=await createBoundedRunner();await p.importPackages(root,[{id},{id:empty}]);await p.prepareQueries();
    const {token}=JSON.parse(await fs.readFile(path.join(p.directory,'owner.json'),'utf8'));
    const worker=path.join(__dirname,'job-history-validation-worker.js');
    const invoke=async(operation,key=token,source=root)=>JSON.parse((await run(process.execPath,['--max-old-space-size=256',worker,p.directory,key,operation,...(operation==='compare'?[]:[source])],{maxBuffer:1024*1024})).stdout);
    const originalHash=await fileHash(p.database);
    await assert.rejects(invoke('scan','wrong'),/owner token mismatch/);
    await assert.rejects(invoke('unknown'),/Expected owned prototype/);
    await p.openQueries();await assert.rejects(invoke('scan'),/lease/);await p.close();
    await invoke('scan');
    const directStage=path.join(temp,'direct-stage');await fs.mkdir(directStage);
    const directScan=await scan(root,directStage);
    const phasedScan=JSON.parse(await fs.readFile(path.join(p.directory,'v1-stage','scan.json'),'utf8'));
    for(const key of ['ids','malformed','variants','warnings','errors'])assert.deepEqual(phasedScan[key],directScan[key],`Original scan ${key}`);
    assert.deepEqual(phasedScan.headers,[...directScan.headers]);
    for(let i=0;i<directScan.snapshots.length;i++){
      const a={...directScan.snapshots[i]},b={...phasedScan.snapshots[i]};
      for(const key of ['staged','rawStaged','goodStaged','exceptionStaged']){
        assert.equal(await fileHash(a[key]),await fileHash(b[key]),`Original staged ${key}`);delete a[key];delete b[key];
      }
      assert.deepEqual(a,b,'Original per-snapshot scan metadata');
    }
    const lock=path.join(p.directory,'writer.lock');
    await fs.writeFile(lock,JSON.stringify({pid:process.pid,nonce:'unrelated-parent'}),{flag:'wx'});
    try{
      await assert.rejects(run(process.execPath,[path.join(__dirname,'job-history-validation-scan-worker.js'),p.directory,token,root,id,'wrong-nonce']),/parent lease mismatch/);
      const working=await fs.mkdtemp(path.join(p.directory,'package-guard-'));
      try{
        const prepare=(folder,nonce)=>run(process.execPath,[path.join(__dirname,'job-history-prepare-worker.js'),p.directory,token,root,id,folder,nonce,JSON.stringify(LIMITS)]);
        await assert.rejects(prepare(working,'wrong-nonce'),/parent lease mismatch/);
        await assert.rejects(prepare(temp,'unrelated-parent'),/owned package directory/);
      }finally{await fs.rm(working,{recursive:true});}
    }
    finally{await fs.unlink(lock);}
    const file=path.join(root,id,'03_top_matches_full.csv'),bytes=await fs.readFile(file);
    await fs.appendFile(file,'\n');await assert.rejects(invoke('build'),/source hash changed/);await fs.writeFile(file,bytes);
    const optional=path.join(root,id,'SOURCE_SUMMARY.md');await fs.writeFile(optional,'added');
    await assert.rejects(invoke('build'),/source inventory changed/);await fs.unlink(optional);
    await fs.mkdir(path.join(root,'20260103-1200'));await assert.rejects(invoke('build'),/source inventory changed/);await fs.rmdir(path.join(root,'20260103-1200'));
    const staged=path.join(p.directory,'v1-stage',id+'.jsonl'),saved=await fs.readFile(staged);
    await fs.appendFile(staged,'corrupt');await assert.rejects(invoke('build'),/staged hash changed/);await fs.writeFile(staged,saved);
    await assert.rejects(fs.access(path.join(p.directory,'v1-control.duckdb')),/ENOENT/);
    const built=await invoke('build');assert.deepEqual(built.errors,[]);await assert.rejects(invoke('build'),/already exists/);
    await assert.rejects(fs.access(path.join(p.directory,'v1-stage')),/ENOENT/);
    const control=path.join(p.directory,'v1-control.duckdb'),controlHash=await fileHash(control);
    await invoke('compare');await invoke('compare');
    assert.equal(await fileHash(p.database),originalHash);assert.equal(await fileHash(control),controlHash);
    const size=(await fs.stat(control)).size;await fs.appendFile(control,'changed');await assert.rejects(invoke('compare'),/control hash changed/);await fs.truncate(control,size);
    const ready=path.join(p.directory,'v1-control.ready.json'),readyBytes=await fs.readFile(ready);
    await fs.unlink(ready);await assert.rejects(invoke('compare'),/ENOENT/);await fs.writeFile(ready,readyBytes);
    // Compare staged scanning against the unchanged default scanner/build path.
    const direct=path.join(temp,'direct.duckdb');await runHistory('build',{root,database:direct});
    d=await DuckDBInstance.create(control,{...databaseOptions,access_mode:'READ_ONLY'});c=await d.connect();
    await compareSql(c,direct);c.closeSync();c=null;d.closeSync();d=null;
    await p.openQueries();
    await p.connection.run('CREATE TABLE observation_fixture AS SELECT * FROM posting_observations');
    const originalView=(await query(p.connection,"SELECT sql FROM duckdb_views() WHERE view_name='posting_observations'"))[0].sql.replace(/^CREATE VIEW /,'CREATE OR REPLACE VIEW ');
    const cases=[
      ['late value column',"SELECT * REPLACE ('changed' AS zulu_field) FROM observation_fixture"],
      ['cross-row swap',"SELECT * REPLACE (CASE WHEN title='One' THEN 'Two' ELSE 'One' END AS title) FROM observation_fixture"],
      ['JSON bytes',"SELECT * REPLACE ((raw_values::VARCHAR||' ')::JSON AS raw_values) FROM observation_fixture"],
      ['NULL versus zero',"SELECT * REPLACE (0::DOUBLE AS salary_min) FROM observation_fixture"],
      ['NULL versus false',"SELECT * REPLACE (false AS salary_detected) FROM observation_fixture"],
      ['duplicate identity',"SELECT * REPLACE ('https://fixture/a' AS canonical_url_key) FROM observation_fixture"],
      ['NULL identity',"SELECT * REPLACE (NULL::VARCHAR AS canonical_url_key) FROM observation_fixture"],
      ['orphan snapshot',"SELECT * REPLACE ('20990101-1200' AS snapshot_id) FROM observation_fixture"],
      ['missing row',"SELECT * FROM observation_fixture LIMIT 1"],
      ['extra row',"SELECT * FROM observation_fixture UNION ALL SELECT * FROM observation_fixture LIMIT 3"],
      ['schema change',"SELECT * EXCLUDE(zulu_field) FROM observation_fixture"],
    ];
    for(const [name,select] of cases){
      try{
        await p.connection.run('CREATE OR REPLACE VIEW posting_observations AS '+select);
        await assert.rejects(compareSql(p.connection,control),/Wide observation|Invalid wide|posting_observations/,name);
        assert.deepEqual(await query(p.connection,"SELECT table_name FROM information_schema.tables WHERE table_catalog='temp' AND starts_with(table_name,'compact_compare_')"),[]);
        assert.deepEqual(await query(p.connection,"SELECT database_name FROM duckdb_databases() WHERE database_name='control'"),[]);
      }finally{await p.connection.run(originalView);}
    }
    await compareSql(p.connection,control);
    return {status:'passed',original_build_equivalence:'passed',original_scan_and_staged_bytes:'passed',scan_parent_lease:'passed',preparation_parent_and_path_guards:'passed',read_only_repeats:'passed',staging_cleanup:'passed',
      guards:['wrong_token','invalid_operation','live_writer','changed_source','new_optional_source','new_snapshot','changed_staged_data','no_partial_control','no_overwrite','changed_control','missing_completion_marker'],comparison_cases:cases.map(([name])=>name)};
  }finally{c?.closeSync();d?.closeSync();await p?.dispose();await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
