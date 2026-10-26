const { safeUrl, payloadShape, responseEvidence } = require('./failure-diagnostics');

async function fetchResponse(url, options = {}, json = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  let diagnostics = {
    request_url: safeUrl(url), request_method: options.method || 'GET',
    request_payload_shape: payloadShape(options.body), error_class: 'transport_failure',
  };
  try {
    const response = await fetch(url, {
      headers: { accept: json ? 'application/json' : 'text/html', 'user-agent': 'public-job-feed-sample/0.1', ...(options.headers || {}) },
      method: options.method || 'GET', body: options.body, signal: controller.signal,
    });
    const text = await response.text();
    diagnostics = responseEvidence(url, options, response, text);
    const fail = (message, errorClass) => {
      const error = new Error(message);
      error.status = response.status;
      error.diagnostics = { ...diagnostics, error_class: errorClass };
      throw error;
    };
    if (!response.ok) fail(`HTTP ${response.status}`, 'http_failure');
    if (!json) return { text, status: response.status, diagnostics };
    if (diagnostics.response_detail && /html|careers|challenge|homepage/.test(diagnostics.response_detail)) {
      fail('Expected JSON; received HTML', 'unexpected_content_type');
    }
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch {
      const nonJsonType = diagnostics.content_type && !/application\/(?:[\w.-]+\+)?json/i.test(diagnostics.content_type);
      fail('Invalid JSON response', nonJsonType ? 'unexpected_content_type' : 'parse_failure');
    }
    // Some servers omit or mislabel JSON. Preserve support for valid JSON in that case.
    return { data, status: response.status, diagnostics };
  } catch (error) {
    if (!error.diagnostics) error.diagnostics = { ...diagnostics, error_class: 'transport_failure' };
    throw error;
  } finally { clearTimeout(timeout); }
}
function fetchJson(url, options = {}) { return fetchResponse(url, options, true); }
function fetchText(url, options = {}) { return fetchResponse(url, options, false); }
module.exports = { fetchJson, fetchText };
