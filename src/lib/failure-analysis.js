const { safeUrl, failureStage, retryCategory } = require('./failure-diagnostics');
const { classifyFetchError } = require('./ats-error-classification');
const { getWorkdayFetchUrl } = require('./ats/workday');
const { getBambooHRFetchUrl } = require('./ats/bamboohr');
const { getAshbyFetchUrl } = require('./ats/ashby');
const { getGreenhouseFetchUrl } = require('./ats/greenhouse');
const { getLeverFetchUrl } = require('./ats/lever');
const { getICIMSFetchUrl } = require('./ats/icims');
const time = value => Date.parse(value || '') || 0;
const keyOf = row => row.BoardKey || `${row.ATS}|${row.CatalogSlug}`.toLowerCase();
function addHistory(history, row, source, cutoff = Infinity) {
  const key = keyOf(row);
  if (!key || !time(row.FetchedAt) || time(row.FetchedAt) > cutoff) return;
  if (!history.has(key)) history.set(key, { successes: new Map(), latestFailure: null });
  const item = history.get(key);
  if (['success', 'empty'].includes(row.Status)) {
    // Copied logs and merged ledgers are the same observation at the same time.
    item.successes.set(row.FetchedAt, source);
  }
  if (row.Status === 'failed' && (!item.latestFailure || time(row.FetchedAt) > time(item.latestFailure.FetchedAt) ||
    (row.FetchedAt === item.latestFailure.FetchedAt && (row.Diagnostic || (!item.latestFailure.Diagnostic && (row.FetchURL || row.FetchEndpoint)))))) item.latestFailure = { ...row, evidence_source: source };
}
function urlPattern(value, ats) {
  try {
    const url = new URL(value), parts = url.pathname.split('/').filter(Boolean);
    if (ats === 'workday') return `${url.hostname.match(/wd\d+/)?.[0] || 'other-host'}:${parts[0] === 'wday' && parts[1] === 'cxs' ? '/wday/cxs/:tenant/:site/' + (parts[4] || '(missing)') : '/' + (parts.length ? ':site' : '(missing)')}`;
    if (ats === 'icims') return `${url.hostname.endsWith('.icims.com') ? (url.hostname.startsWith('careers-') ? 'careers-*' : 'other-icims-host') : 'custom-host'}:${url.pathname.replace(/\/\d+(?=\/|$)/g, '/:id')}`;
    if (ats === 'ashby') return 'ashby:/posting-api/job-board/:slug';
    if (ats === 'greenhouse') return 'greenhouse:/v1/boards/:slug/jobs';
    if (ats === 'lever') return 'lever:/v0/postings/:slug';
    return `${ats}:${url.pathname.replace(/\/\d+(?=\/|$)/g, '/:id')}`;
  } catch { return 'unknown'; }
}
function workdayConfig(source, endpoint) {
  try {
    const url = new URL(endpoint), parts = url.pathname.split('/').filter(Boolean);
    let sourceParts = [];
    try { sourceParts = new URL(source).pathname.split('/').filter(Boolean); } catch {}
    return { tenant: parts[2] || '', hostname: url.hostname, site: parts[3] || '',
      source_url: safeUrl(source), constructed_endpoint: safeUrl(endpoint),
      source_first_segment: sourceParts[0] || '',
      tenant_looks_like_host_segment: /^wd\d+$/i.test(parts[2] || ''),
      host_segment: url.hostname.split('.')[1] || '',
      locale_shaped_site: /^[a-z]{2}-[a-z]{2}$/i.test(parts[3] || ''),
      tenant_matches_host: (parts[2] || '').toLowerCase() === url.hostname.split('.')[0].toLowerCase(),
      request_payload_shape: { appliedFacets: {}, limit: 'number', offset: 'number', searchText: 'string' },
      payload_shape_basis: 'current adapter; saved request may not include payload'  };
  } catch { return null; }
}
function analyze(boards, catalog, history, now) {
  const entries = new Map(catalog.map(row => [row.BoardKey, row]));
  return boards.filter(row => row.Active && row.FetchEligible && row.CoverageStatus === 'FETCH_FAILED').map(row => {
    const item = history.get(row.BoardKey), successes = new Map(item?.successes || []);
    if (time(row.LastSuccessAt)) successes.set(row.LastSuccessAt, 'board-state.LastSuccessAt');
    const dates = [...successes.keys()].sort((a,b) => time(a)-time(b));
    const last = dates.at(-1) || null;
    // Never attach a historical response to a newer failure.
    const log = item?.latestFailure?.FetchedAt === row.LastAttemptAt ? item.latestFailure : null;
    const diag = row.LastDiagnostic?.attempted_at === row.LastAttemptAt ? row.LastDiagnostic : log?.Diagnostic;
    const source = entries.get(row.BoardKey)?.BoardURL || row.BoardURL || '';
    const constructors = { ashby: getAshbyFetchUrl, greenhouse: getGreenhouseFetchUrl, lever: getLeverFetchUrl, workday: getWorkdayFetchUrl, bamboohr: getBambooHRFetchUrl, icims: getICIMSFetchUrl };
    const endpoint = constructors[row.ATS]?.(row.CatalogSlug, source) || '';
    const savedUrl = diag?.request_url || log?.FetchEndpoint || log?.FetchURL;
    const statusMatch = String(row.LastError || '').match(/^HTTP (\d{3})\b/);
    const status = Number(diag?.http_status || log?.HttpStatus || statusMatch?.[1]) || null;
    const errorClass = row.LastErrorClass || classifyFetchError(row.ATS, { Error: row.LastError, HttpStatus: status });
    const stage = diag?.error_class || failureStage({ Error: row.LastError, HttpStatus: status });
    return {
      board_key: row.BoardKey, ats: row.ATS, catalog_url: safeUrl(source),
      request_url: safeUrl(savedUrl || endpoint), request_url_basis: savedUrl ? 'saved request' : endpoint ? 'constructed from current catalog; not observed' : 'unknown',
      request_method: diag?.request_method || (row.ATS === 'workday' ? 'POST' : 'GET'),
      request_method_basis: diag ? 'saved request' : 'current adapter',
      http_status: status, http_status_basis: diag?.http_status || log?.HttpStatus ? 'saved status' : statusMatch ? 'saved error message' : 'unknown',
      content_type: diag?.content_type || '', redirect_chain: diag?.redirect_chain || [], redirect_chain_complete: diag?.redirect_chain_complete ?? false,
      final_url: diag?.final_url || '', response_length: diag?.response_length ?? null, response_prefix: diag?.response_prefix || '',
      html_title: diag?.html_title || '', response_detail: diag?.response_detail || '',
      retry_after: diag?.retry_after || null,
      error_class: stage, specific_error_class: errorClass,
      attempted_at: row.LastAttemptAt, last_success_at: last, successful_snapshot_count: dates.length,
      success_history: last ? 'previously succeeded' : 'never succeeded',
      success_history_scope: 'available saved history; zero means no recorded success',
      prior_success_age: !last ? 'none recorded' : now - time(last) <= 7 * 86400000 ? 'recent prior success' : 'historical prior success',
      first_seen_at: row.FirstSeenAt || null,
      catalog_age: !time(row.FirstSeenAt) ? 'unknown' : now - time(row.FirstSeenAt) <= 7 * 86400000 ? 'recently discovered' : 'older catalog entry',
      consecutive_failures: Number(row.ConsecutiveFailures) || 0,
      recommended_action: retryCategory(row.ATS, errorClass, status, row.ConsecutiveFailures, stage),
      request_pattern: urlPattern(savedUrl || endpoint, row.ATS), catalog_pattern: urlPattern(source, row.ATS),
      workday: row.ATS === 'workday' ? workdayConfig(source, endpoint) : null,
      saved_workday_request: row.ATS === 'workday' && savedUrl ? workdayConfig(source, savedUrl) : null,
      response_evidence_available: Boolean(diag), evidence_source: diag ? (log?.evidence_source || 'board-state.LastDiagnostic') : log?.evidence_source || 'board-state',
    };
  });
}
function groupFailures(rows) {
  const groups = new Map();
  for (const row of rows) {
    const fields = ['ats','specific_error_class','error_class','http_status','success_history','request_pattern','recommended_action'];
    const values = Object.fromEntries(fields.map(key => [key,row[key]]));
    const key = JSON.stringify(values);
    if (!groups.has(key)) groups.set(key, { ...values, boards: 0, samples: [] });
    const group = groups.get(key); group.boards++;
    if (group.samples.length < 5) group.samples.push(row.board_key);
  }
  return [...groups.values()].sort((a,b) => b.boards-a.boards || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
module.exports = { addHistory, analyze, groupFailures, workdayConfig, urlPattern };

function workdayGroups(rows) {
  const groups = new Map();
  for (const row of rows.filter(row => row.ats === 'workday')) {
    const config = row.saved_workday_request || row.workday;
    const fields = { http_status: row.http_status, success_history: row.success_history,
      host_segment: config?.host_segment || 'unknown',
      tenant_looks_like_host_segment: config?.tenant_looks_like_host_segment ?? null,
      tenant_matches_host: config?.tenant_matches_host ?? null };
    const key = JSON.stringify(fields);
    if (!groups.has(key)) groups.set(key, { ...fields, boards: 0, samples: [] });
    const group = groups.get(key); group.boards++;
    if (group.samples.length < 3) group.samples.push({ board_key: row.board_key, request_url: row.request_url });
  }
  return [...groups.values()].sort((a,b) => b.boards-a.boards);
}
module.exports.workdayGroups = workdayGroups;
