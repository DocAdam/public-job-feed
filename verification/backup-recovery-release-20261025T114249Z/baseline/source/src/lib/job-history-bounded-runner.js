// A process boundary releases native DuckDB allocations after each package.
// The only writable destination is a fresh, token-owned temporary prototype.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createBoundedPrototype } = require('./job-history-bounded-storage');
const run = promisify(execFile);
async function createBoundedRunner() {
  const seed = await createBoundedPrototype(); await seed.close();
  let reader = null, busy = false;
  const stats = { imported:0, no_op:0, max_batch_rows:0, max_batch_bytes:0, worker_peak_rss_bytes:0, worker_count:0, file_worker_peak_rss_bytes:0, file_worker_count:0 };
  async function fileOperation(operation){
    const {stdout}=await run(process.execPath,['--max-old-space-size=128','--expose-gc',path.join(__dirname,'../scripts/job-history-file-worker.js'),
      seed.directory,seed.ownerToken,operation],{maxBuffer:1024*1024});
    const output=JSON.parse(stdout);stats.file_worker_count++;
    stats.file_worker_peak_rss_bytes=Math.max(stats.file_worker_peak_rss_bytes,output.peak_rss_bytes);
    return {...output.result,worker_peak_rss_bytes:output.peak_rss_bytes};
  }
  return { database:seed.database, directory:seed.directory, connection:null, stats,
    async importPackage(root,id,{status='complete'}={}) {
      if(busy)throw new Error('Prototype worker already active');
      if(reader)throw new Error('Close the query connection before importing');
      if(status!=='complete')throw new Error('Failed or incomplete package stops advancement');
      busy=true;
      try {
        const {stdout}=await run(process.execPath,['--max-old-space-size=128','--expose-gc',path.join(__dirname,'../scripts/job-history-storage-worker.js'),
          seed.directory,seed.ownerToken,path.resolve(root),id],{maxBuffer:1024*1024});
        const result=JSON.parse(stdout);
        stats.worker_count++;
        for(const name of ['imported','no_op'])stats[name]+=result.stats[name];
        for(const name of ['max_batch_rows','max_batch_bytes'])stats[name]=Math.max(stats[name],result.stats[name]);
        stats.worker_peak_rss_bytes=Math.max(stats.worker_peak_rss_bytes,result.peak_rss_bytes);
        return result.result;
      }finally{busy=false;}
    },
    async importPackages(root,entries) {
      for(const entry of [...entries].sort((a,b)=>a.id.localeCompare(b.id)))await this.importPackage(root,entry.id,entry);
    },
    async openQueries() {
      if(busy)throw new Error('Import still active');
      if(!reader)reader=await createBoundedPrototype({ownedDirectory:seed.directory,ownerToken:seed.ownerToken});
      this.connection=reader.connection;
      return reader.connection;
    },
    async prepareQueries() {
      if(busy||reader)throw new Error('Close the prototype before preparing queries');
      busy=true;
      try{return await fileOperation('prepare');}finally{busy=false;}
    },
    async fingerprint() {
      if(busy||reader)throw new Error('Close the prototype before the file audit');
      busy=true;
      try{return await fileOperation('fingerprint');}finally{busy=false;}
    },
    async compact() {
      if(busy||reader)throw new Error('Close the prototype before compaction');
      busy=true;
      try{return await fileOperation('compact');}
      finally{busy=false;}
    },
    async recover({rollback=false}={}) {
      if(busy||reader)throw new Error('Close the prototype before recovery');
      busy=true;
      try{return await fileOperation(rollback?'rollback':'recover');}
      finally{busy=false;}
    },
    async close() { await reader?.close();reader=null;this.connection=null; },
    async dispose() { if(busy)throw new Error('Import still active');await this.close();await fs.rm(seed.directory,{recursive:true,force:true}); },
  };
}
module.exports={createBoundedRunner};
