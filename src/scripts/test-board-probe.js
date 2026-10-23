const assert=require('assert/strict');
const { selectBoards, buildRequest, probe, classifyResponse, readBounded, MAX_BODY_BYTES }=require('../lib/board-probe');
const { parseArgs, markdown }=require('./probe-board');
const { getWorkdaySlugFromUrl, getWorkdayFetchUrl }=require('../lib/ats/workday');
const { chooseCohorts }=require('./select-failure-probe-cohorts');
const { aggregate, observedClass }=require('./report-failure-probes');
const fixtures=require('./fixtures/failure-probes-2026-09-29.json');
const { getICIMSFetchUrl }=require('../lib/ats/icims');
const { preview, responseEvidence }=require('../lib/failure-diagnostics');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};const throws=fn=>{assert.throws(fn);checks++;};
const board=(ats,slug,url='')=>({BoardKey:`${ats}|${slug}`,ATS:ats,CatalogSlug:slug,BoardURL:url,FetchEligible:true});
async function main(){
  const entry=board('workday','employer|wd5|External');
  throws(()=>selectBoards([],[]));throws(()=>selectBoards(['all'],[entry]));throws(()=>selectBoards([entry.BoardKey,entry.BoardKey],[entry]));
  throws(()=>selectBoards(Array(41).fill(entry.BoardKey),[entry]));throws(()=>selectBoards(['workday|absent'],[entry]));
  throws(()=>selectBoards([entry.BoardKey],[entry],NaN));throws(()=>parseArgs([]));throws(()=>parseArgs(['--all']));throws(()=>parseArgs(['--keys-file']));
  eq(selectBoards([entry.BoardKey],[entry]).length,1);eq(parseArgs([entry.BoardKey,'--limit','1']).limit,1);
  for(const shard of ['wd1','wd3','wd5']){
    const url=`https://employer.${shard}.myworkdayjobs.com/External`;
    eq(getWorkdaySlugFromUrl(url),`employer|${shard}|External`);
    eq(getWorkdayFetchUrl('',url),`https://employer.${shard}.myworkdayjobs.com/wday/cxs/employer/External/jobs`);
  }
  eq(buildRequest(board('workday','wd5|wd1|External')).parsed_fields.tenant,'wd5');
  eq(buildRequest(entry).method,'POST');eq(buildRequest(entry).parsed_fields.hostSegment,'wd5');
  throws(()=>buildRequest(board('bamboohr','demo','https://user:secret@example.com/careers')));
  throws(()=>buildRequest(board('bamboohr','demo','http://example.com/careers')));
  throws(()=>buildRequest(board('bamboohr','demo','https://127.0.0.1/careers')));
  const requests=[];
  const response=(text,status=200,headers={})=>new Response(text,{status,headers:{'content-type':'application/json',...headers}});
  const result=await probe(entry,{fetchImpl:async(url,options)=>{requests.push({url,options});return response('{"jobPostings":[],"total":0}');}});
  eq(requests.length,1);eq(requests[0].options.redirect,'manual');eq(JSON.parse(requests[0].options.body),{appliedFacets:{},limit:20,offset:0,searchText:''});
  eq(result.specific_class,'SUPPORTED_JOB_RESPONSE');eq(result.request_payload_shape.limit,'number');
  const secret=await probe(board('bamboohr','demo'),{fetchImpl:async()=>response('{"token":"SECRET","jobs":[]}',422,{'set-cookie':'sid=COOKIESECRET','authorization':'Bearer HEADERSECRET'})});
  for(const value of ['SECRET','COOKIESECRET','HEADERSECRET','set-cookie','authorization'])eq(JSON.stringify(secret).includes(value),false);
  eq(secret.http_status,422);eq(secret.attempts.length,1);
  const html=await probe(board('bamboohr','demo'),{fetchImpl:async()=>response('<html><title>Careers</title><input value="SECRET"><script>SECRET</script></html>',200,{'content-type':'text/html'})});
  eq(html.html_title,'Careers');eq(html.specific_class,'unexpected_html_response');eq(JSON.stringify(html).includes('SECRET'),false);
  let calls=0;
  const redirect=await probe(board('bamboohr','demo'),{fetchImpl:async()=>{calls++;return calls===1?response('',302,{location:'https://demo.bamboohr.com/careers?token=SECRET'}):response('<html>page</html>',200,{'content-type':'text/html'});}});
  eq(calls,2);eq(redirect.redirect_chain.length,1);eq(redirect.redirected,true);eq(JSON.stringify(redirect).includes('SECRET'),false);
  calls=0;const loop=await probe(board('bamboohr','demo'),{fetchImpl:async()=>{calls++;return response('',302,{location:'https://demo.bamboohr.com/careers'});}});eq(calls,3);eq(loop.redirect_chain_complete,false);
  calls=0;await probe(entry,{fetchImpl:async()=>{calls++;throw new Error('network failure');}});eq(calls,1);
  const big=await readBounded(response('x'.repeat(MAX_BODY_BYTES+1)));eq(big.bytes,MAX_BODY_BYTES);eq(big.complete,false);eq(Buffer.byteLength(preview(big.text)),2048);
  for(const status of [404,410])eq(classifyResponse('bamboohr',{http_status:status},'').endpoint_result,String(status));
  eq(classifyResponse('icims',{http_status:200},'<html>unrelated page</html>').specific_class,'NO_PARSED_JOB_CARDS');
  const selected=chooseCohorts({Boards:[]},{boards:[]},[]);eq(selected.boards,[]);eq(selected.unavailable.http_410,0);
  const md=markdown({run_id:'fixture',status:'complete',started_at:'test',request_attempts:[],results:[]});eq(md.includes('HTTP request attempts'),true);
  for(const row of fixtures.workday){
    eq(getWorkdaySlugFromUrl(row.input_url),`${row.expected_tenant}|${row.expected_hostname_shard}|${row.expected_site}`);
    eq(getWorkdayFetchUrl('',row.input_url),row.expected_endpoint);
  }
  for(const row of fixtures.icims){
    const parsed=new URL(getICIMSFetchUrl('ignored',row.input_url));
    eq(parsed.hostname,row.expected_hostname);eq(parsed.pathname,'/jobs/search');
  }
  const b=fixtures.bamboohr;
  const observed=responseEvidence(b.redirect_chain[0].url,{}, {status:b.http_status,headers:new Headers({'content-type':b.content_type}),url:b.final_url,redirected:true},b.response_prefix);
  eq(observed.response_detail,'redirected_to_vendor_homepage');
  eq(observedClass({...b,ats:'bamboohr',specific_class:'unexpected_html_response'}),'redirected_to_vendor_homepage');
  eq(classifyResponse('bamboohr',observed,b.response_prefix).specific_class,'redirected_to_vendor_homepage');
  eq(preview('<meta name="csrf-token" content="SECRET"><input value="SECRET">').includes('SECRET'),false);
  eq(buildRequest(board('workday','unused|wd1|Unused','https://indivior.wd3.myworkdayjobs.com/indivior')).parsed_fields.tenant,'indivior');
  throws(()=>aggregate([]));throws(()=>aggregate([{status:'running'}]));
  const fixtureRun={run_id:'one',status:'complete',started_at:'2026-09-29',completed_at:'2026-09-29',results:[],request_attempts:[]};
  eq(aggregate([fixtureRun]).summary.live_http_request_attempts,0);
  throws(()=>aggregate([fixtureRun,fixtureRun]));
  throws(()=>aggregate([{...fixtureRun,request_attempts:[{}]}]));
  const adversarial=JSON.stringify({nested:{password:'SECRET',token:['SECRET']}});
  eq(preview(adversarial).includes('SECRET'),false);
  console.log(`Board probe: ${checks} checks passed. No live requests.`);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
