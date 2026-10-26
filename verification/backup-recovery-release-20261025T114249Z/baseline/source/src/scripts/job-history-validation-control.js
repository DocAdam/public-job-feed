const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
async function worker(directory,operation,root){
  const {token}=JSON.parse(await fs.readFile(path.join(directory,'owner.json'),'utf8'));
  const args=[path.join(__dirname,'job-history-validation-worker.js'),directory,token,operation];
  if(root!==undefined)args.push(path.resolve(root));
  const {stdout}=await run(process.execPath,['--max-old-space-size=128',...(operation==='build'?['--expose-gc']:[]),...args],{maxBuffer:1024*1024});
  return JSON.parse(stdout);
}
async function validationOperation(directory,operation,root){
  if(operation!=='build')return worker(directory,operation,root);
  const scanned=await worker(directory,'scan',root);
  const built=await worker(directory,'build',root);
  return {...built,scan_peak_rss_bytes:scanned.peak_rss_bytes,build_peak_rss_bytes:built.peak_rss_bytes,
    peak_rss_bytes:Math.max(scanned.peak_rss_bytes,built.peak_rss_bytes)};
}
module.exports={validationOperation};
