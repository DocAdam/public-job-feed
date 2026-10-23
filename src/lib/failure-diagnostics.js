// Diagnostics are evidence, not proof that a board has closed.
const SENSITIVE = /token|secret|password|passwd|authorization|cookie|credential|api.?key|session|csrf|signature/i;
const PREVIEW_BYTES = 2048;
function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[redacted]');
    url.pathname = url.pathname.replace(/\/(token|secret|session|key)\/[^/]+/gi, '/$1/[redacted]');
    return url.toString();
  } catch { return '[invalid URL]'; }
}
function redactText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, '[script omitted]')
    .replace(/<(?:input|meta)\b[^>]*(?:>|$)/gi, '[input omitted]')
    .replace(/https?:\/\/[^\s<>"']+/gi, value => safeUrl(value))
    .replace(/\b(Bearer|Basic)\s+[a-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/(["']?[\w-]{0,80}(?:token|secret|password|passwd|authorization|cookie|credential|api.?key|session|csrf|signature)[\w-]{0,80}["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;<>]+)/gi, '$1[redacted]');
}
function preview(text) {
  try {
    const scrub = value => Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE.test(key) ? '[redacted]' : scrub(item)])) : value;
    text = JSON.stringify(scrub(JSON.parse(text)));
  } catch {}
  // Redact before truncation so a split credential cannot escape the filter.
  return Buffer.from(redactText(text)).subarray(0, PREVIEW_BYTES).toString('utf8').replace(/\uFFFD$/, '');
}
function payloadShape(body) {
  if (!body) return null;
  try {
    const shape = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE.test(key)).map(([key, item]) => [key, shape(item)]))
      : typeof value;
    return shape(JSON.parse(body));
  } catch { return { format: 'unparsed' }; }
}
function responseEvidence(url, options, response, text) {
  const contentType = response.headers.get('content-type') || '';
  const isHtml = /\btext\/html\b|application\/xhtml/i.test(contentType) || /^\s*(?:<!doctype html|<html)\b/i.test(text);
  const title = isHtml ? String(text).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] : '';
  const finalUrl = response.url || url;
  let detail = '';
  if (response.status === 404 || response.status === 410) detail = 'endpoint_not_found';
  else if (isHtml && /captcha|cf-chl-|verify (?:that )?you are human|access denied/i.test(text)) detail = 'access_challenge';
  else if (isHtml && response.redirected && new URL(finalUrl).hostname === 'www.bamboohr.com' && new URL(finalUrl).pathname === '/' && /BambooHR.*HR Software/i.test(title || '')) detail = 'redirected_to_vendor_homepage';
  else if (isHtml && response.redirected && /\/careers\/?$/.test(new URL(finalUrl).pathname)) detail = 'redirected_to_careers_page';
  else if (isHtml) detail = 'unexpected_html_response';
  const retryAfter = response.headers.get('retry-after') || '';
  return {
    request_url: safeUrl(url), request_method: options.method || 'GET',
    http_status: response.status, content_type: contentType.slice(0, 200),
    // Fetch exposes the final URL, not the intermediate redirect hops.
    redirect_chain: [], redirect_chain_complete: !response.redirected,
    redirected: Boolean(response.redirected), final_url: safeUrl(finalUrl),
    response_length: Buffer.byteLength(text), response_prefix: preview(text),
    html_title: preview(title).slice(0, 300), response_detail: detail,
    retry_after: /^(?:\d+|[A-Za-z]{3}, .+ GMT)$/.test(retryAfter) ? retryAfter.slice(0, 100) : null,
    request_payload_shape: payloadShape(options.body),
  };
}
function failureStage(error) {
  if (error.diagnostics?.error_class) return error.diagnostics.error_class;
  if (error.errorClass) return error.errorClass;
  if (Number(error.status || error.HttpStatus) >= 400) return 'http_failure';
  if (/timeout|timed out|aborted|fetch failed|network|enotfound|econn/i.test(error.message || error.Error || '')) return 'transport_failure';
  if (/json|parse|unexpected token/i.test(error.message || error.Error || '')) return 'parse_failure';
  return 'unknown_failure';
}
function retryCategory(ats, errorClass, status, failures = 1, stage = '') {
  if (['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMITED', 'UPSTREAM_SERVER_ERROR'].includes(errorClass) || status === 429 || status >= 500) return 'transient_retry';
  if (status === 410 || errorClass === 'NO_USABLE_URL') return 'catalog_review';
  if (status === 404 || errorClass === 'BOARD_NOT_FOUND') return 'slow_revalidation';
  if (ats === 'workday' && status === 422) return failures >= 2 ? 'adapter_review' : 'slow_revalidation';
  if (['parse_failure', 'schema_validation_failure', 'unexpected_content_type', 'application_rejection'].includes(stage) || /PARSE|HTML/.test(errorClass)) return 'adapter_review';
  return 'slow_revalidation';
}
function boardDiagnostic(ats, slug, catalogUrl, requestUrl, error, attemptedAt) {
  const evidence = error.diagnostics || {};
  return {
    board_key: `${ats}|${slug}`.toLowerCase(), ats, catalog_url: safeUrl(catalogUrl),
    request_url: safeUrl(requestUrl), request_method: ats === 'workday' ? 'POST' : 'GET',
    http_status: Number(error.status) || null, content_type: '', redirect_chain: [],
    redirect_chain_complete: false, final_url: '', response_length: null, response_prefix: '',
    ...evidence,
    ...(ats === 'workday' ? { workday: (() => {
      try { const url = new URL(evidence.request_url || requestUrl); const parts = url.pathname.split('/').filter(Boolean);
        return { tenant: parts[2] || '', hostname: url.hostname, site: parts[3] || '', source_url: safeUrl(catalogUrl), constructed_endpoint: safeUrl(requestUrl) };
      } catch { return null; }
    })() } : {}),
    error_class: failureStage(error), attempted_at: attemptedAt,
    last_success_at: null, successful_snapshot_count: null,
    history_scope: 'not joined; use failure analysis',
  };
}
module.exports = { safeUrl, redactText, preview, payloadShape, responseEvidence, failureStage, retryCategory, boardDiagnostic };

function validateJobResponse(result, arrayKeys) {
  const data = result.data;
  const rejection = data && !Array.isArray(data) && (data.success === false || data.error || (Array.isArray(data.errors) && data.errors.length));
  const valid = Array.isArray(data) || arrayKeys.some(key => Array.isArray(key.split('.').reduce((value, part) => value?.[part], data)));
  if (!rejection && valid) return;
  const error = new Error(rejection ? 'ATS application rejected request' : 'Expected a supported jobs array');
  error.status = result.status;
  error.diagnostics = { ...result.diagnostics, error_class: rejection ? 'application_rejection' : 'schema_validation_failure' };
  throw error;
}
module.exports.validateJobResponse = validateJobResponse;
