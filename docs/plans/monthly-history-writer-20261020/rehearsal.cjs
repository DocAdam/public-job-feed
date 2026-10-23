// Read saved production inputs; write only to a new temporary fixture.
const fs=require('node:fs/promises'),nodeFs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root='/Users/adampugh/GitHub/public-job-feed';
const {writeDerivedBatchHistory:write,isUsableBoardState,getBoardKey}=require(root+'/src/lib/batch-history');
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of nodeFs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function main(){
 const index=JSON.parse(await fs.readFile(root+'/data/jobs/index/batch-index.json'));
 const state=JSON.parse(await fs.readFile(root+'/data/jobs/index/board-latest-fetch.json'));
 assert(isUsableBoardState(state,index.filter(b=>b.IndexStatus==='OK').length));
 const referenced=new Set(state.Boards.map(b=>b.SourceBatch));
 const now=Date.now(),candidates=index.filter(b=>b.IndexStatus==='OK'&&!referenced.has(b.BatchName)&&Number.isFinite(Date.parse(b.GeneratedAt))&&Math.floor((now-Date.parse(b.GeneratedAt))/86400000)>=30);
 const removed=new Set(candidates.map(b=>b.BatchName));const kept=index.filter(b=>b.IndexStatus==='OK'&&!removed.has(b.BatchName));
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'public-job-feed-ledger-rehearsal-'));
 const history=path.join(fixture,'history/fetch-events');await fs.mkdir(history,{recursive:true});
 try{
  const sourceHistory=root+'/data/jobs/index/history/fetch-events',hashes={};
  for(const name of (await fs.readdir(sourceHistory)).filter(n=>n.endsWith('.jsonl.gz')).sort()){
   hashes[name]=await hash(path.join(sourceHistory,name));await fs.copyFile(path.join(sourceHistory,name),path.join(history,name));assert.equal(await hash(path.join(history,name)),hashes[name]);
  }
  await fs.copyFile(root+'/data/jobs/index/board-latest-fetch.json',path.join(fixture,'board-latest-fetch.json'));
  const logs=[];
  for(const batch of kept){const rows=JSON.parse(await fs.readFile(path.join(batch.BatchFolder,'jobs-batch-fetch-log.json')));logs.push(...rows.map(row=>({...row,SourceBatch:batch.BatchName})));}
  const phases=[];
  for(let i=0;i<2;i++){
   const result=await write({outputDir:fixture,generatedAt:state.GeneratedAt,sourceBatchCount:kept.length,fetchLogRows:logs});
   assert.equal(result.addedEventCount,0);assert.deepEqual(result.changedMonths,[]);
   const actual=JSON.parse(await fs.readFile(path.join(fixture,'board-latest-fetch.json')));
   assert.deepEqual(actual.Boards,state.Boards);
   for(const [name,expected] of Object.entries(hashes))assert.equal(await hash(path.join(history,name)),expected);
   phases.push({phase:'protected-subset-rebuild-'+(i+1),...result});global.gc?.();
  }
  const newLog={ATS:'fixture',CatalogSlug:'synthetic-board',SourceBatch:'synthetic-recovery-check',Status:'success',FetchedAt:'2026-10-20T00:00:00Z',JobCount:1,Diagnostic:{note:'Synthetic fixture; not a real job or board'}};
  const first=await write({outputDir:fixture,generatedAt:state.GeneratedAt,sourceBatchCount:kept.length+1,fetchLogRows:[...logs,newLog,newLog]});assert.equal(first.addedEventCount,1);
  const second=await write({outputDir:fixture,generatedAt:state.GeneratedAt,sourceBatchCount:kept.length+1,fetchLogRows:[...logs,newLog]});assert.equal(second.addedEventCount,0);assert.equal(second.eventCount,first.eventCount);
  const finalState=JSON.parse(await fs.readFile(path.join(fixture,'board-latest-fetch.json')));
  assert.equal(finalState.Boards.find(b=>b.BoardKey===getBoardKey(newLog)).SourceBatch,newLog.SourceBatch);
  for(const [name,expected] of Object.entries(hashes))assert.equal(await hash(path.join(sourceHistory,name)),expected);
  return {status:'passed',generated_at:new Date().toISOString(),indexed_batches:index.length,kept_batches:kept.length,simulated_removed_batches:removed.size,kept_log_rows:logs.length,production_board_count:state.Boards.length,phases,synthetic_addition:{first_added:first.addedEventCount,retry_added:second.addedEventCount,final_event_count:second.eventCount},source_ledger_hashes_unchanged:true,peak_rss_bytes:process.resourceUsage().maxRSS*1024,scope:'Production data read only; batch omission and synthetic addition exist only in temporary fixture; fixture removed in finally'};
 }finally{await fs.rm(fixture,{recursive:true,force:true});}
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
