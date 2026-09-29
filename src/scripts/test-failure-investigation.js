const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { fetchJson } = require('../lib/http');
const { fetchWorkdayBoard, getWorkdayFetchUrl } = require('../lib/ats/workday');
const { fetchBambooHRBoard } = require('../lib/ats/bamboohr');
const { getICIMSFetchUrl, getICIMSSlugFromUrl, fetchICIMSBoard } = require('../lib/ats/icims');
const { preview, safeUrl, retryCategory } = require('../lib/failure-diagnostics');
const { addHistory, analyze, groupFailures, workdayConfig, workdayGroups } = require('../lib/failure-analysis');
const { withBatchRun } = require('../lib/batch-run');
const { writeBatchOutputs, getOutputPaths, fetchOneAtsRow } = require('./fetch-batch-jobs');
const { buildJobExportArtifacts } = require('../lib/job-export');
const { updateBoardState } = require('../lib/board-state');
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function response(body, status = 200, type = 'application/json', url = 'https://demo.bamboohr.com/careers/list', redirected = false) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': type, 'retry-after': '120' }), url, redirected, text: async () => body };
}
async function rejected(action, stage, detail) {
  let error; try { await action(); } catch(value) { error = value; }
  assert.ok(error, 'Expected failure'); checks++;
  check(error.diagnostics.error_class, stage);
  if (detail) check(error.diagnostics.response_detail, detail);
  return error;
}
async function main() {
  const originalFetch = global.fetch;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'failure-investigation-'));
  try {
    check(getWorkdayFetchUrl('acme|wd5|External'), 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs');
    check(getWorkdayFetchUrl('', 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs?q=1'), 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs');
    // Document the current locale assumption. This test does not endorse it.
    check(getWorkdayFetchUrl('', 'https://acme.wd5.myworkdayjobs.com/en-US/External'), 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/en-US/jobs');
    let request;
    global.fetch = async (url, options) => { request = { url, options }; return response('{"total":0,"jobPostings":[]}'); };
    check((await fetchWorkdayBoard('acme|wd5|External')).jobs, []);
    check(workdayConfig('', request.url).tenant, 'acme');
    check(workdayConfig('', getWorkdayFetchUrl('wd5|wd1|external')).tenant_looks_like_host_segment, true);
    check(request.options.method, 'POST');
    check(JSON.parse(request.options.body), { appliedFacets: {}, limit:20, offset:0, searchText:'' });
    global.fetch = async () => response('{"error":"rejected","token":"secret-value"}', 422);
    const wd = await rejected(() => fetchWorkdayBoard('acme|wd5|External'), 'http_failure');
    check(wd.status, 422); check(wd.diagnostics.request_payload_shape.limit, 'number');
    check(wd.diagnostics.response_prefix.includes('secret-value'), false);
    global.fetch = async () => response('<html><title>Careers</title></html>', 200, 'text/html', 'https://demo.bamboohr.com/careers', true);
    const html = await rejected(() => fetchBambooHRBoard('demo'), 'unexpected_content_type', 'redirected_to_careers_page');
    check(html.diagnostics.html_title, 'Careers'); check(html.diagnostics.redirect_chain_complete, false);
    check(html.diagnostics.http_status, 200);
    global.fetch = async () => response('<html><title>Verify you are human</title></html>', 403, 'text/html');
    await rejected(() => fetchBambooHRBoard('demo'), 'http_failure', 'access_challenge');
    global.fetch = async () => response('<html>missing</html>', 404, 'text/html');
    await rejected(() => fetchBambooHRBoard('demo'), 'http_failure', 'endpoint_not_found');
    global.fetch = async () => response('<html>unknown page</html>', 200, 'text/html');
    await rejected(() => fetchBambooHRBoard('demo'), 'unexpected_content_type', 'unexpected_html_response');
    global.fetch = async () => response('broken JSON');
    await rejected(() => fetchJson('https://demo.example'), 'parse_failure');
    global.fetch = async () => response('{"unrecognized":[]}');
    await rejected(() => fetchBambooHRBoard('demo'), 'schema_validation_failure');
    global.fetch = async () => response('{"success":false}');
    await rejected(() => fetchWorkdayBoard('demo|wd1|External'), 'application_rejection');
    global.fetch = async () => response('{"result":[]}');
    check((await fetchBambooHRBoard('demo')).jobs, []);
    global.fetch = async () => { throw new TypeError('fetch failed'); };
    await rejected(() => fetchJson('https://demo.example'), 'transport_failure');
    global.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    await rejected(() => fetchJson('https://demo.example'), 'transport_failure');
    global.fetch = async () => response('busy', 429, 'text/plain');
    check((await rejected(() => fetchJson('https://demo.example'), 'http_failure')).diagnostics.retry_after, '120');
    for (const [slug, source, host] of [
      ['acme','','careers-acme.icims.com'],['careers-acme','','careers-acme.icims.com'],['-careers-acme','','careers-acme.icims.com'],
      ['ignored','https://jobs-acme.icims.com/jobs/42/title?x=1','jobs-acme.icims.com'],
      ['ignored','https://careers.example.org/jobs/42/title','careers.example.org'],
    ]) {
      const url = new URL(getICIMSFetchUrl(slug,source)); check(url.hostname,host); check(url.pathname,'/jobs/search');
      check(url.searchParams.get('in_iframe'),'1');
    }
    check(getICIMSSlugFromUrl('https://careers-acme.icims.com/jobs/search'), 'acme');
    check(getICIMSFetchUrl('', 'invalid URL'), 'invalid URL');
    global.fetch = async () => response('missing',404,'text/html');
    await rejected(() => fetchICIMSBoard('acme'), 'http_failure', 'endpoint_not_found');
    const unsafe = 'https://user:pass@demo.example/path?token=SECRET#SECRET';
    check(safeUrl(unsafe).includes('SECRET'),false); check(safeUrl(unsafe).includes('pass@'),false);
    const redacted = preview('token=SECRET Authorization: Bearer SECRET <input value="SECRET"><script>SECRET</script>');
    check(preview('{"token":{"nested":"SECRET"}}').includes('SECRET'), false);
    check(redacted.includes('SECRET'), false); check(Buffer.byteLength(preview('é'.repeat(4000))) <= 2048, true);
    check(retryCategory('workday','ENDPOINT_REJECTED',422,2),'adapter_review');
    check(retryCategory('workday','ENDPOINT_REJECTED',422,1),'slow_revalidation');
    check(retryCategory('ashby','BOARD_NOT_FOUND',404),'slow_revalidation');
    check(retryCategory('ashby','BOARD_NOT_FOUND',410),'catalog_review');
    for (const code of ['TIMEOUT','NETWORK_ERROR','RATE_LIMITED','UPSTREAM_SERVER_ERROR']) check(retryCategory('ashby',code,null),'transient_retry');
    check(retryCategory('bamboohr','RESPONSE_PARSE_ERROR',200),'adapter_review');
    const now = '2026-09-29T00:00:00.000Z', old = '2026-08-01T00:00:00.000Z';
    const boards = ['a','b','c'].map(slug => ({ BoardKey:`bamboohr|${slug}`, CatalogSlug:slug, ATS:'bamboohr', Active:true, FetchEligible:true, CoverageStatus:'FETCH_FAILED', LastAttemptAt:now, LastError:'HTTP 404', FirstSeenAt:old }));
    const history = new Map();
    for(const source of ['ledger','batch']) addHistory(history,{ ATS:'bamboohr', CatalogSlug:'b', Status:'empty', FetchedAt:old },source);
    addHistory(history,{ ATS:'bamboohr', CatalogSlug:'b', Status:'failed', FetchedAt:old, HttpStatus:500 },'old failure');
    boards[2].LastSuccessAt = old;
    const rows = analyze(boards,[],history,Date.parse(now));
    check(rows.map(row => row.success_history),['never succeeded','previously succeeded','previously succeeded']);
    check(rows.map(row => row.successful_snapshot_count),[0,1,1]);
    addHistory(history,{ ATS:'bamboohr', CatalogSlug:'a', Status:'failed', FetchedAt:now, HttpStatus:404 },'ledger');
    addHistory(history,{ ATS:'bamboohr', CatalogSlug:'a', Status:'failed', FetchedAt:now, HttpStatus:404, FetchURL:'https://a.bamboohr.com/careers/list' },'batch');
    check(analyze(boards,[],history,Date.parse(now))[0].request_url_basis,'saved request');
    check(rows[1].http_status,404); check(rows[1].response_evidence_available,false);
    check(groupFailures(rows).reduce((sum,row)=>sum+row.boards,0),3);
    global.fetch = async () => response('<html>unknown</html>',200,'text/html');
    const failed = await fetchOneAtsRow({ BambooHRSlug:'a', BambooHRURL:'https://a.bamboohr.com/careers/list' },'bamboohr',[]);
    check(failed.fetchLogRow.Diagnostic.error_class,'unexpected_content_type');
    const state={Boards:boards};updateBoardState(state,[failed.fetchLogRow],[]);
    check(boards[0].LastDiagnostic.response_detail,'unexpected_html_response');
    const failedDir = path.join(temp,'failed');
    await assert.rejects(withBatchRun(failedDir,async phase=>{ await phase('write_outputs'); throw new RangeError('Invalid string length'); }),RangeError);checks++;
    const marker=JSON.parse(await fs.readFile(path.join(failedDir,(await fs.readdir(failedDir))[0])));
    check(marker.status,'failed');check(marker.phase,'write_outputs');
    const outputDir=path.join(temp,'complete');
    const artifacts=buildJobExportArtifacts([],[],[],now);artifacts.fetchLogRows=[];
    await withBatchRun(outputDir,()=>writeBatchOutputs(getOutputPaths(outputDir),artifacts));
    check(JSON.parse(await fs.readFile(getOutputPaths(outputDir).publicFeedJson)),[]);
    const completeName=(await fs.readdir(outputDir)).find(name=>name.startsWith('batch-run-'));
    check(JSON.parse(await fs.readFile(path.join(outputDir,completeName))).status,'complete');
    // Simulate the old whole-array string limit without allocating a huge string.
    const stringify=JSON.stringify;JSON.stringify=function(value,...args){if(value===artifacts.publicFeedRows)throw new RangeError('Invalid string length');return stringify(value,...args);};
    try { await writeBatchOutputs(getOutputPaths(outputDir),artifacts);checks++; } finally { JSON.stringify=stringify; }
    // Run the CLI against an isolated saved-data fixture. It must not change inputs.
    const dataRoot=path.join(temp,'data');
    for(const dir of ['jobs/state','catalogs/crawl','jobs/batches']) await fs.mkdir(path.join(dataRoot,dir),{recursive:true});
    const stateFile=path.join(dataRoot,'jobs/state/board-state.json');
    const saved=JSON.stringify({GeneratedAt:now,Boards:boards});
    await fs.writeFile(stateFile,saved);
    await fs.writeFile(path.join(dataRoot,'catalogs/crawl/board-catalog.json'),'[]');
    require('child_process').execFileSync(process.execPath,[path.join(__dirname,'analyze-board-failures.js'),'--data-root',dataRoot],{stdio:'pipe'});
    check(await fs.readFile(stateFile,'utf8'),saved);
    const report=JSON.parse(await fs.readFile(path.join(dataRoot,'jobs/reports/failure-analysis.json')));
    check(report.summary.failed_boards,3);
    check(report.groups.reduce((sum,g)=>sum+g.boards,0),3);
    check(workdayGroups([{ats:'workday',http_status:422,success_history:'never succeeded',workday:workdayConfig('',getWorkdayFetchUrl('wd5|wd1|external')),board_key:'workday|wd5|wd1|external'}])[0].tenant_looks_like_host_segment,true);
    console.log(`Failure investigation: ${checks} checks passed.`);
  } finally { global.fetch=originalFetch; await fs.rm(temp,{recursive:true,force:true}); }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
