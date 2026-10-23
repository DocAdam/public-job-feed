const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { fork, execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { writeDerivedBatchHistory: write, recoverFetchHistory: recover, toHistoryEvent } = require('../lib/batch-history');
const { MAX_LINE_BYTES } = require('../lib/batch-history-ledger');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rows = [
  { ATS:'ashby', CatalogSlug:'alpha', Status:'success', FetchedAt:'2026-07-01T00:00:00Z', SourceBatch:'old', JobCount:2 },
  { ATS:'ashby', CatalogSlug:'alpha', Status:'failed', FetchedAt:'2026-07-02T00:00:00Z', SourceBatch:'failed', Diagnostic:{error_class:'http_failure',response_prefix:'café\n未完'}, HttpStatus:404 },
  { ATS:'ashby', CatalogSlug:'alpha', Status:'empty', FetchedAt:'2026-07-03T00:00:00Z', SourceBatch:'new', JobCount:0 },
  { ATS:'lever', CatalogSlug:'beta', Status:'success', FetchedAt:'2026-08-01T00:00:00Z', SourceBatch:'current', JobCount:1 },
];
const additions = [
  { ...rows[0], SourceBatch:'late-july', FetchedAt:'2026-07-04T00:00:00Z' },
  { ...rows[3], SourceBatch:'late-august', FetchedAt:'2026-08-02T00:00:00Z' },
];
function options(dir, input = rows) { return { outputDir:dir, generatedAt:'2026-08-03T00:00:00Z', sourceBatchCount:new Set(input.map(r=>r.SourceBatch)).size, fetchLogRows:input }; }
const ledger = (dir, month='2026-07') => path.join(dir,'history/fetch-events',month+'.jsonl.gz');
async function events(dir) {
  const out=[];
  for (const name of (await fs.readdir(path.join(dir,'history/fetch-events'))).sort()) {
    if (name.endsWith('.jsonl.gz')) out.push(...zlib.gunzipSync(await fs.readFile(path.join(dir,'history/fetch-events',name))).toString().trim().split('\n').filter(Boolean).map(JSON.parse));
  }
  return out;
}
async function fingerprint(dir) {
  const names=['board-latest-fetch.json',...(await fs.readdir(path.join(dir,'history/fetch-events'))).filter(n=>n.endsWith('.jsonl.gz')).map(n=>'history/fetch-events/'+n)];
  return Object.fromEntries(await Promise.all(names.sort().map(async n=>[n,hash(await fs.readFile(path.join(dir,n)))])));
}
async function assertClean(dir) {
  for (const d of [dir,path.join(dir,'history/fetch-events')]) assert(!(await fs.readdir(d)).some(n=>n.startsWith('.fetch-history')), 'Unexpected lock or staging residue');
}
async function crash(dir, phase) {
  await fs.writeFile(path.join(dir,'crash-input.json'),JSON.stringify([...rows.slice(2),...additions]));
  const child=fork(__filename,['--crash-child',dir,phase],{stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.on('data',s=>stderr+=s);
  const ended=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
  try {
    const message=await Promise.race([new Promise(resolve=>child.once('message',resolve)),ended.then(()=>{throw new Error('Crash child ended before phase: '+stderr);})]);
    assert.equal(message.phase,phase);
    await assert.rejects(write(options(dir)),/writer lock exists/);
    await assert.rejects(recover(dir),/still active/);
    child.kill('SIGKILL');assert.equal((await ended).signal,'SIGKILL');
  } finally {clearTimeout(timeout);if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');await ended;}
}
async function main() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'public-job-feed-ledger-test-'));let checks=0;
  async function test(name,fn) {const dir=path.join(root,String(++checks));await fs.mkdir(dir);await fn(dir);console.log('PASS '+name);}
  try {
    await test('removed batches, late arrivals, repeated rebuilds, empty input, and diagnostic preservation',async dir=>{
      await write(options(dir));const original=await events(dir);const board=JSON.parse(await fs.readFile(path.join(dir,'board-latest-fetch.json'))).Boards;
      const kept=rows.slice(2);
      let result=await write(options(dir,kept));assert.equal(result.eventCount,4);assert.equal(result.addedEventCount,0);
      assert.deepEqual(await events(dir),original);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'board-latest-fetch.json'))).Boards,board);
      result=await write(options(dir,[...kept,...additions,additions[0]]));assert.equal(result.eventCount,6);assert.equal(result.addedEventCount,2);
      const before=await fingerprint(dir),stat=await fs.stat(ledger(dir),{bigint:true});
      for(let i=0;i<2;i++){result=await write(options(dir,[...kept,...additions]));assert.equal(result.addedEventCount,0);assert.deepEqual(await fingerprint(dir),before);}
      assert.equal((await fs.stat(ledger(dir),{bigint:true})).mtimeNs,stat.mtimeNs);
      assert.deepEqual((await events(dir)).find(e=>e.Status==='failed').Diagnostic,rows[1].Diagnostic);
      result=await write(options(dir,[]));assert.equal(result.eventCount,6);assert.equal(result.boardCount,0);assert.equal((await events(dir)).length,6);
      await assertClean(dir);
    });
    await test('conflicting IDs fail closed; object key order does not create a conflict',async dir=>{
      await write(options(dir));const before=await fingerprint(dir);
      await assert.rejects(write(options(dir,[{...rows[0],JobCount:99}])),/Conflicting history/);
      await assert.rejects(write(options(dir,[rows[0],{...rows[0],JobCount:99}])),/Conflicting history/);
      assert.deepEqual(await fingerprint(dir),before);
      const reordered={...rows[1],Diagnostic:{response_prefix:rows[1].Diagnostic.response_prefix,error_class:'http_failure'}};
      assert.equal((await write(options(dir,[reordered]))).addedEventCount,0);
      await assertClean(dir);
    });
    for(const kind of ['truncated-gzip','bad-json','wrong-month','duplicate-id','oversized-saved','invalid-utf8']) {
      await test('saved '+kind+' stops publication without changing saved bytes',async dir=>{
        await write(options(dir));const file=ledger(dir,'2026-08');
        let bytes;
        if(kind==='truncated-gzip')bytes=(await fs.readFile(file)).subarray(0,-5);
        if(kind==='bad-json')bytes=zlib.gzipSync('{bad json}\n');
        if(kind==='wrong-month')bytes=zlib.gzipSync(JSON.stringify(toHistoryEvent(rows[0]))+'\n');
        if(kind==='duplicate-id')bytes=zlib.gzipSync((JSON.stringify(toHistoryEvent(rows[3]))+'\n').repeat(2));
        if(kind==='oversized-saved')bytes=zlib.gzipSync('x'.repeat(MAX_LINE_BYTES+1));
        if(kind==='invalid-utf8')bytes=zlib.gzipSync(Buffer.from([0xff,0x0a]));
        await fs.writeFile(file,bytes);const before=await fingerprint(dir);
        await assert.rejects(write(options(dir,[...rows,...additions])));
        assert.deepEqual(await fingerprint(dir),before);await assertClean(dir);
      });
    }
    await test('oversized incoming record leaves the original ledger and state intact',async dir=>{
      await write(options(dir));const before=await fingerprint(dir);
      await assert.rejects(write(options(dir,[{...additions[0],Diagnostic:{text:'x'.repeat(MAX_LINE_BYTES)}}])),/size limit/);
      assert.deepEqual(await fingerprint(dir),before);await assertClean(dir);
    });
    await test('ordinary write failure cleans only its own staged files',async dir=>{
      await write(options(dir));const before=await fingerprint(dir);
      const other=path.join(dir,'history/fetch-events/.unrelated.tmp');await fs.writeFile(other,'keep');
      await assert.rejects(write({...options(dir,[...rows,...additions]),onHistoryPhase:async phase=>{if(phase==='staged')throw new Error('simulated write failure');}}),/simulated/);
      assert.deepEqual(await fingerprint(dir),before);assert.equal(await fs.readFile(other,'utf8'),'keep');await assertClean(dir);
    });
    for(const phase of ['temp-opened','temp-chunk-written','staged','month-published','before-state-publish']) {
      await test('process death at '+phase+', explicit recovery, and idempotent retry',async dir=>{
        await write(options(dir));const before=await events(dir);const stateBefore=await fs.readFile(path.join(dir,'board-latest-fetch.json'),'utf8');
        await crash(dir,phase);
        if(phase==='temp-chunk-written'){
          const folder=path.join(dir,'history/fetch-events');
          const name=(await fs.readdir(folder)).find(n=>n.endsWith('.tmp'));
          const bytes=await fs.readFile(path.join(folder,name));assert(bytes.length>0);
          assert.throws(()=>zlib.gunzipSync(bytes),'The interrupted temporary gzip must be incomplete');
        }
        const after=await events(dir);for(const event of before)assert.deepEqual(after.find(e=>e.EventId===event.EventId),event);
        assert.equal(await fs.readFile(path.join(dir,'board-latest-fetch.json'),'utf8'),stateBefore);
        await assert.rejects(write(options(dir)),/writer lock exists/);
        const recovery=await recover(dir);assert.equal(recovery.recovered,true);assert(recovery.removedTemps>=1);
        const result=await write(options(dir,[...rows.slice(2),...additions]));assert.equal(result.eventCount,6);
        const stable=await fingerprint(dir);await write(options(dir,[...rows.slice(2),...additions]));assert.deepEqual(await fingerprint(dir),stable);
        assert.equal((await events(dir)).length,6);await assertClean(dir);
      });
    }
    await test('unknown lock and unknown staging paths require manual review',async dir=>{
      await write(options(dir));await crash(dir,'temp-opened');
      const lock=path.join(dir,'.fetch-history.lock'),owner=JSON.parse(await fs.readFile(lock));
      const unexpected=path.join(dir,`.fetch-history-${owner.nonce}-unexpected.tmp`);await fs.writeFile(unexpected,'keep');
      await assert.rejects(recover(dir),/Unknown history staging/);assert.equal(await fs.readFile(unexpected,'utf8'),'keep');
      await fs.unlink(unexpected);await fs.writeFile(lock,'{}');await assert.rejects(recover(dir),/Unknown history lock/);
      await fs.writeFile(lock,JSON.stringify(owner));await recover(dir);await write(options(dir));await assertClean(dir);
    });
    await test('symlinked ledger or parent cannot modify an external target',async dir=>{
      await write(options(dir));const file=ledger(dir),external=path.join(root,'external');await fs.copyFile(file,external);const before=await fs.readFile(external);
      await fs.unlink(file);await fs.symlink(external,file);await assert.rejects(write(options(dir,[...rows,...additions])),/Unsafe history file/);
      assert.deepEqual(await fs.readFile(external),before);
      const alias=path.join(root,'alias');await fs.symlink(dir,alias);await assert.rejects(write(options(alias)),/Unsafe history directory/);
      await assertClean(dir);
    });
    await test('real index entry point retains old events after fixture batch removal and two rebuilds',async dir=>{
      const project=path.join(dir,'project');
      for(const rel of ['src/lib/files.js','src/lib/batch-maintenance.js','src/lib/csv.js','src/lib/batch-history.js','src/lib/batch-history-ledger.js','src/scripts/index-batches.js']){
        const to=path.join(project,rel);await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.resolve(__dirname,'../..',rel),to);
      }
      const batches=path.join(project,'data/jobs/batches'),output=path.join(project,'data/jobs/index');
      async function add(row){const d=path.join(batches,row.SourceBatch);await fs.mkdir(d,{recursive:true});await fs.writeFile(path.join(d,'jobs-batch-fetch-log.json'),JSON.stringify([row]));await fs.writeFile(path.join(d,'jobs-batch-summary.json'),JSON.stringify({GeneratedAt:row.FetchedAt,ATS:row.ATS}));await fs.writeFile(path.join(d,'public-job-feed-batch.json'),'[]');}
      for(const row of rows)await add(row);
      const index=()=>run(process.execPath,[path.join(project,'src/scripts/index-batches.js')],{cwd:project});
      await index();const before=await events(output),boards=JSON.parse(await fs.readFile(path.join(output,'board-latest-fetch.json'))).Boards;
      for(const name of ['old','failed'])await fs.rm(path.join(batches,name),{recursive:true});
      for(let i=0;i<2;i++)await index();assert.deepEqual(await events(output),before);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'board-latest-fetch.json'))).Boards,boards);
      await add(additions[1]);await index();await index();assert.equal((await events(output)).length,5);
      assert.equal(JSON.parse(await fs.readFile(path.join(output,'board-latest-fetch.json'))).Boards.find(b=>b.BoardKey==='lever|beta').SourceBatch,'late-august');
      await assertClean(output);
    });
    console.log(JSON.stringify({status:'passed',groups:checks,scope:'Synthetic temporary folders; no production index, batch, CSV, or database writes'}));
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
if(require.main===module){
  if(process.argv[2]==='--crash-child'){
    const [, , ,dir,phase]=process.argv;
    fs.readFile(path.join(dir,'crash-input.json'),'utf8').then(JSON.parse).then(input=>write({...options(dir,input),onHistoryPhase:async p=>{if(p===phase){process.send({phase});await new Promise(()=>{setInterval(()=>{},1000);});}}})).catch(e=>{console.error(e);process.exitCode=1;});
  } else main().catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={main};
