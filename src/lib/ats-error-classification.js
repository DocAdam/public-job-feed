function clean(value) {
  return String(value || "").trim();
}

function classifyFetchError(ats, error = {}) {
  const source = clean(ats).toLowerCase();
  const message = clean(error.message || error.Error).toLowerCase();
  const status = Number(error.status || error.HttpStatus) || 0;
  const name = clean(error.name).toLowerCase();

  if (error.skip || /no usable .* fetch url/.test(message)) return "NO_USABLE_URL";
  if (name === "aborterror" || /abort|timed? out|timeout/.test(message)) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "UPSTREAM_SERVER_ERROR";
  if (status === 404 || status === 410) return "BOARD_NOT_FOUND";
  if (status === 401 || status === 403) return "ACCESS_BLOCKED";
  if (source === "workday" && status === 422) return "ENDPOINT_REJECTED";
  if (status >= 400) return "HTTP_CLIENT_ERROR";
  if (/json|parse|unexpected token|html/.test(message)) return "RESPONSE_PARSE_ERROR";
  if (/dns|enotfound|getaddrinfo|network|fetch failed|econn/.test(message)) return "NETWORK_ERROR";
  return "UNKNOWN_FETCH_ERROR";
}

module.exports = { classifyFetchError };
