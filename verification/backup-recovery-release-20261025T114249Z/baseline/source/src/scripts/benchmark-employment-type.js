const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { ensureEmploymentType } = require("../lib/employment-type");
const arg = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : ""; };
const file = arg("--input"), output = arg("--output");
if (!file || !output) throw new Error("Use --input SAVED_JSON --output NEW_REPORT_JSON");
const destination = path.resolve(output), protectedRoot = path.resolve(__dirname, "../../data");
const realParent = fs.realpathSync(path.dirname(destination));
if (realParent === protectedRoot || realParent.startsWith(protectedRoot + path.sep)) throw new Error("Benchmark reports must stay outside production data.");
const bytes = fs.readFileSync(file), rows = JSON.parse(bytes);
const baseline = [], enhanced = [];
let count = 0;
for (let n = 0; n < 10; n++) {
 let start = performance.now(); const copy = rows.map(r => ({...r})); const b = performance.now() - start;
 start = performance.now(); const output = rows.map(r => ({...r, ...ensureEmploymentType(r)})); const e = performance.now() - start;
 count += copy.length + output.length;
 if (n) { baseline.push(b); enhanced.push(e); }
}
const median = a => [...a].sort((a,b) => a-b)[Math.floor(a.length/2)];
const result = { input:file, inputSHA256:createHash('sha256').update(bytes).digest('hex'), rows:rows.length, node:process.version, repetitions:9, warmupRepetitions:1,
 copyOnlyMs:baseline, extractionAndCopyMs:enhanced, medianCopyOnlyMs:median(baseline), medianExtractionAndCopyMs:median(enhanced), medianDeltaMs:median(enhanced)-median(baseline),
 processedRows:count, requests:0, limit:'In-memory saved shortlist, one machine, warm cache. This compares extraction plus a copy with a copy-only baseline. It does not measure the full feed, collection, or a daily refresh.' };
fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));
