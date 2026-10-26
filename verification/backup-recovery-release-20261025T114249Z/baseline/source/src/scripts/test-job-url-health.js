const assert = require("assert");
const { classifyUrlIssue } = require("../lib/job-url-health");

function issueFor(url, pageSample) {
  return classifyUrlIssue({
    originalUrl: new URL(url),
    finalUrl: url,
    httpStatus: 200,
    ok: true,
    pageSample,
  });
}

function main() {
  const ashbyShellIssue = "Ashby job URL returned an empty generic Jobs page.";
  const cases = [
    {
      name: "Ashby generic Jobs title",
      url: "https://jobs.ashbyhq.com/vultr/37d274f6-43c6-44d1-90b1-e3706d82b176",
      pageSample: "<!doctype html><html><head><title>Jobs </title></head><body></body></html>",
      expected: ashbyShellIssue,
    },
    {
      name: "Ashby generic title with markup and mixed case",
      url: "https://jobs.ashbyhq.com/example/123",
      pageSample: "<title data-page=\"job\">  jObS  </title>",
      expected: ashbyShellIssue,
    },
    {
      name: "live Ashby role",
      url: "https://jobs.ashbyhq.com/percona/60e9cd47-cebb-47d2-b1c1-811f3fb4889e",
      pageSample: "<!doctype html><html><head><title>Technical Writer - PostgreSQL @ Percona</title></head></html>",
      expected: "",
    },
    {
      name: "generic title on another host",
      url: "https://example.com/jobs/1",
      pageSample: "<title>Jobs</title>",
      expected: "",
    },
  ];

  for (const testCase of cases) {
    assert.strictEqual(issueFor(testCase.url, testCase.pageSample), testCase.expected, testCase.name);
  }

  console.log("Job URL health regression: PASS");
}

try {
  main();
} catch (error) {
  console.error(`Job URL health regression: FAIL\n${error.stack || error}`);
  process.exitCode = 1;
}
