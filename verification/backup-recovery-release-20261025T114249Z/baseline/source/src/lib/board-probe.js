const { getAtsFetchUrl } = require('../scripts/fetch-batch-jobs');
const { toFetchQueueRow } = require('./board-registry');
const { getWorkdaySlugFromUrl, parseWorkdaySlug, getWorkdayBoardUrl } = require('./ats/workday');
const { getICIMSFetchUrl, parseICIMSJobs } = require('./ats/icims');
const { safeUrl, preview, payloadShape, responseEvidence, validateJobResponse } = require('./failure-diagnostics');
const { classifyFetchError } = require('./ats-error-classification');

const MAX_BOARDS = 40;
const MAX_REDIRECTS = 2;
const MAX_BODY_BYTES = 512 * 1024;
const WORKDAY_PAYLOAD = { appliedFacets: {}, limit: 20, offset: 0, searchText: '' };
function selectBoards(selection, catalog, limit = MAX_BOARDS) {
  if (!Array.isArray(selection) || !selection.length) throw new Error('Explicit board keys are required; there is no all mode.');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BOARDS || selection.length > limit) throw new Error(`Select 1–${Math.min(limit, MAX_BOARDS)} boards. No requests were made.`);
  const byKey = new Map(catalog.map(row => [row.BoardKey, row]));
  const seen = new Set();
  return selection.map(value => {
    const key = typeof value === 'string' ? value : value?.board_key;
    if (typeof key !== 'string' || !key.includes('|') || seen.has(key)) throw new Error('Invalid or repeated board key.');
    const entry = byKey.get(key);
    if (!entry?.FetchEligible) throw new Error(`Board key is absent or ineligible: ${key}`);
    seen.add(key);
    return { entry, cohort: typeof value === 'string' ? 'explicit_selection' : value.cohort || 'explicit_selection' };
  });
}
function checkUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') ||
      /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || url.hostname.startsWith('[')) {
    throw new Error('Probe URL must use public HTTPS without credentials or a custom port.');
  }
  return url.toString();
}
function buildRequest(entry, view = 'adapter') {
  const row = toFetchQueueRow(entry);
  let url = getAtsFetchUrl(entry.ATS, entry.CatalogSlug, row);
  if (entry.ATS === 'icims') { const parsed = new URL(url); parsed.searchParams.set('pr', '0'); url = parsed.toString(); }
  if (view === 'careers') {
    if (entry.ATS !== 'bamboohr') throw new Error('The careers comparison is limited to BambooHR.');
    const parsed = new URL(url); parsed.pathname = '/careers'; parsed.search = ''; url = parsed.toString();
  } else if (view !== 'adapter') throw new Error('Unknown request view.');
  const method = entry.ATS === 'workday' ? 'POST' : 'GET';
  const body = method === 'POST' ? JSON.stringify(WORKDAY_PAYLOAD) : undefined;
  let parsedFields = { catalog_slug: entry.CatalogSlug };
  if (entry.ATS === 'workday') {
    const catalogParsed = parseWorkdaySlug(entry.CatalogSlug);
    const endpoint = new URL(url), parts = endpoint.pathname.split('/').filter(Boolean);
    const parsed = { tenant: parts[2] || '', hostSegment: endpoint.hostname.split('.')[1] || '', site: parts[3] || '' };
    const boardUrl = getWorkdayBoardUrl(entry.CatalogSlug, entry.BoardURL);
    parsedFields = { ...parsedFields, ...parsed, catalog_parsed_fields: catalogParsed, hostname: new URL(url).hostname,
      generated_board_url: safeUrl(boardUrl), round_trip_slug: getWorkdaySlugFromUrl(boardUrl),
      round_trip_basis: entry.BoardURL ? 'catalog source URL' : 'constructed URL, not an independent source',
      source_url_parsed_slug: entry.BoardURL ? getWorkdaySlugFromUrl(entry.BoardURL) : null,
      tenant_looks_like_shard: /^wd\d+$/i.test(parsed?.tenant || '') };
  }
  if (entry.ATS === 'icims') parsedFields = { ...parsedFields, hostname: new URL(url).hostname,
    url_basis: entry.BoardURL ? 'catalog source URL' : 'constructed hostname',
    source_url_normalization_comparison: safeUrl(getICIMSFetchUrl(entry.CatalogSlug, url)),
    comparison_basis: 'constructed request passed as URL; no independent catalog source URL' };
  return { url: checkUrl(url), method, body, parsed_fields: parsedFields, view };
}
async function readBounded(response, maximum = MAX_BODY_BYTES) {
  if (!response.body) return { text: '', bytes: 0, complete: true };
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0, complete = false;
  try {
    while (bytes < maximum) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      const chunk = Buffer.from(value).subarray(0, maximum - bytes);
      chunks.push(chunk); bytes += chunk.length;
    }
  } finally { if (!complete) await reader.cancel(); reader.releaseLock(); }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes, complete };
}
function classifyResponse(ats, evidence, text, complete = true) {
  const status = evidence.http_status;
  if (status >= 400) return { error_class: 'http_failure', specific_class: classifyFetchError(ats, { status }), endpoint_result: String(status) };
  if (status >= 300) return { error_class: 'redirect_unresolved', specific_class: 'REDIRECT_NOT_COMPLETED', endpoint_result: 'redirected' };
  if (status < 200) return { error_class: 'unexpected_response', specific_class: 'UNEXPECTED_STATUS', endpoint_result: 'other' };
  if (ats === 'icims') {
    const count = parseICIMSJobs(text).length;
    return { error_class: count ? null : 'unverified_html', specific_class: count ? 'ICIMS_JOB_CARDS' : 'NO_PARSED_JOB_CARDS',
      endpoint_result: count ? 'now successful' : 'other', parsed_job_count: count, count_scope: complete ? 'first page' : 'bounded body' };
  }
  if (/html|careers|challenge|homepage/.test(evidence.response_detail)) return { error_class: 'unexpected_content_type', specific_class: evidence.response_detail, endpoint_result: 'other' };
  if (!complete) return { error_class: 'body_limit', specific_class: 'RESPONSE_TRUNCATED', endpoint_result: 'other' };
  let data;
  try { data = JSON.parse(text); } catch { return { error_class: 'parse_failure', specific_class: 'RESPONSE_PARSE_ERROR', endpoint_result: 'other' }; }
  const keys = { workday: ['jobPostings','jobs','data.jobPostings'], bamboohr: ['result','jobs','jobOpenings','openings'], ashby: ['jobs'], greenhouse: ['jobs'], lever: [] };
  try { validateJobResponse({ data, status, diagnostics: evidence }, keys[ats] || []); }
  catch (error) { return { error_class: error.diagnostics.error_class, specific_class: classifyFetchError(ats,error), endpoint_result: 'other' }; }
  return { error_class: null, specific_class: 'SUPPORTED_JOB_RESPONSE', endpoint_result: 'now successful' };
}
async function probe(entry, { fetchImpl = fetch, onAttempt = async () => {}, timeoutMs = 20000, view = 'adapter' } = {}) {
  const request = buildRequest(entry, view), attempts = [];
  let url = request.url, method = request.method, body = request.body;
  const result = { board_key: entry.BoardKey, ats: entry.ATS, catalog_url: safeUrl(entry.BoardURL),
    catalog_source: safeUrl(entry.CatalogSource), parsed_fields: request.parsed_fields,
    constructed_request_url: safeUrl(request.url), constructed_request_method: method, request_method: method,
    request_payload_shape: payloadShape(body), request_payload: entry.ATS === 'workday' ? WORKDAY_PAYLOAD : null, request_payload_basis: 'initial request; fixed non-sensitive search parameters',
    request_view: view, attempted_at: new Date().toISOString(), attempts };
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    const attempt = { sequence: hop + 1, request_url: safeUrl(url), request_method: method, attempted_at: new Date().toISOString(), outcome: 'started' };
    attempts.push(attempt);
    await onAttempt(attempt);
    try {
      const response = await fetchImpl(url, { method, body, redirect: 'manual', signal: controller.signal,
        headers: { accept: entry.ATS === 'icims' || view === 'careers' ? 'text/html' : 'application/json',
          'user-agent': entry.ATS === 'icims' ? 'public-job-feed-icims/1.0' : 'public-job-feed-sample/0.1',
          ...(body ? { 'content-type': 'application/json' } : {}) } });
      attempt.http_status = response.status;
      attempt.content_type = (response.headers.get('content-type') || '').slice(0,200);
      const location = response.headers.get('location');
      if ([301,302,303,307,308].includes(response.status) && location) {
        const next = checkUrl(new URL(location,url).toString());
        attempt.redirect_to = safeUrl(next);
        if (hop < MAX_REDIRECTS) {
          await response.body?.cancel(); attempt.outcome = 'redirect';
          if (response.status === 303 || ([301,302].includes(response.status) && method === 'POST')) { method = 'GET'; body = undefined; }
          url = next; continue;
        }
      }
      const captured = await readBounded(response);
      const evidence = responseEvidence(url, { method, body }, { status: response.status, headers: response.headers, url, redirected: hop > 0 }, captured.text);
      evidence.final_url = safeUrl(url);
      evidence.redirected = hop > 0;
      evidence.redirect_chain = attempts.filter(x => x.redirect_to).map(x => ({ url:x.request_url, http_status:x.http_status, location:x.redirect_to }));
      evidence.redirect_chain_complete = !(response.status >= 300 && response.status < 400);
      evidence.response_length = captured.complete ? captured.bytes : null;
      evidence.response_bytes_read = captured.bytes;
      evidence.response_body_complete = captured.complete;
      attempt.outcome = 'response';
      Object.assign(result, evidence, classifyResponse(entry.ATS,evidence,captured.text,captured.complete));
      result.conclusion = { label: 'CONFIRMED', text: `Endpoint returned HTTP ${response.status}; ${result.specific_class}. This does not establish board retirement.` };
      return result;
    } catch (error) {
      attempt.outcome = 'error'; attempt.error_name = error.name;
      Object.assign(result, { http_status: attempt.http_status || null, content_type: attempt.content_type || '',
        final_url: safeUrl(url), response_length:null, response_prefix:'', redirect_chain:attempts.filter(x=>x.redirect_to).map(x=>({url:x.request_url,http_status:x.http_status,location:x.redirect_to})),
        redirect_chain_complete:false, error_class:'transport_failure', specific_class:classifyFetchError(entry.ATS,error),
        error:preview(error.message), endpoint_result:'other', conclusion:{label:'UNRESOLVED',text:'No complete response evidence was collected.'} });
      return result;
    } finally { clearTimeout(timer); }
  }
}
module.exports = { MAX_BOARDS, MAX_REDIRECTS, MAX_BODY_BYTES, WORKDAY_PAYLOAD, selectBoards, checkUrl, buildRequest, readBounded, classifyResponse, probe };
