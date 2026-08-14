const assert = require("assert");
const { classifyFetchError } = require("../lib/ats-error-classification");

function main() {
  assert.equal(classifyFetchError("workday", { status: 422, message: "HTTP 422" }), "ENDPOINT_REJECTED");
  assert.equal(classifyFetchError("workday", { message: "No usable Workday fetch URL", skip: true }), "NO_USABLE_URL");
  assert.equal(classifyFetchError("icims", { status: 403, message: "HTTP 403" }), "ACCESS_BLOCKED");
  assert.equal(classifyFetchError("icims", { status: 404, message: "HTTP 404" }), "BOARD_NOT_FOUND");
  assert.equal(classifyFetchError("icims", { status: 429, message: "HTTP 429" }), "RATE_LIMITED");
  assert.equal(classifyFetchError("workday", { name: "AbortError", message: "request aborted" }), "TIMEOUT");
  assert.equal(classifyFetchError("icims", { message: "getaddrinfo ENOTFOUND" }), "NETWORK_ERROR");
  console.log("ATS error-classification fixture tests passed.");
}

if (require.main === module) main();

module.exports = { main };
