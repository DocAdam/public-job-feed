const knownBadFinalUrlPatterns = [
  /[?&]error=true(?:&|$)/i,
  /\/404(?:\/|$)/i,
  /\/not-found(?:\/|$)/i,
  /\/job-not-found(?:\/|$)/i,
];

const knownBadPageTextPatterns = [
  /\bjob (?:is )?no longer available\b/i,
  /\bposting (?:is )?no longer available\b/i,
  /\bposition (?:has been )?filled\b/i,
  /\bjob not found\b/i,
  /\bpage not found\b/i,
  /\bthis job is closed\b/i,
  /\bthis position is closed\b/i,
  /\bno longer accepting applications\b/i,
];
const confirmedDeadUrls = new Set([
  "https://jobs.ashbyhq.com/arketa/3bf07433-ac6b-45bd-bd48-5c3351c9c340",
  "https://jobs.ashbyhq.com/bjakcareer/faebc310-bb09-4cb9-9abb-e7b661e81404",
  "https://jobs.ashbyhq.com/clipboard/1e2cd9dc-78ba-4fc8-a327-3bcd4b9712a1",
  "https://jobs.ashbyhq.com/fitt/337f6c68-bffa-45be-84e6-51c8dc4ae703",
  "https://jobs.ashbyhq.com/kong/99cb9821-3f79-4336-a88c-1c97cdc84d4e",
  "https://jobs.ashbyhq.com/onhires/361f7d50-6e1b-4ab3-adfe-ee1226302cdf",
  "https://jobs.ashbyhq.com/parity/82fb9e54-1d83-477e-9618-b53df5dadb1e",
  "https://jobs.ashbyhq.com/telus-digital/6bb27489-8dc9-4946-866b-7157acd1fad1",
]);

function normalizeUrl(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const hyperlinkMatch = raw.match(/^=HYPERLINK\(\s*"([^"]+)"/i);
  const url = hyperlinkMatch ? hyperlinkMatch[1] : raw;

  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(url)) {
    return `https://${url}`;
  }

  return url;
}

function normalizeUrlKey(value) {
  return normalizeUrl(value).replace(/\/+$/, "").toLowerCase();
}

function greenhouseBoardHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io";
}

function ashbyJobHost(hostname) {
  return String(hostname || "").toLowerCase() === "jobs.ashbyhq.com";
}

function isAshbyEmptyJobShell(originalUrl, pageSample) {
  if (!ashbyJobHost(originalUrl.hostname)) {
    return false;
  }

  // Ashby returns this otherwise-successful generic document for removed job
  // IDs. Active jobs use a title in the form "<role> @ <company>".
  return /<title\b[^>]*>\s*jobs\s*<\/title>/i.test(pageSample);
}

function greenhouseJobId(url) {
  if (!greenhouseBoardHost(url.hostname)) {
    return "";
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const jobsIndex = parts.findIndex((part) => part === "jobs");

  return jobsIndex === -1 ? "" : String(parts[jobsIndex + 1] || "").trim();
}

function greenhouseBoardSlug(url) {
  if (!greenhouseBoardHost(url.hostname)) {
    return "";
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const jobsIndex = parts.findIndex((part) => part === "jobs");
  if (jobsIndex > 0) {
    return parts[jobsIndex - 1] || "";
  }

  return parts[0] || "";
}

async function confirmGreenhouseJobViaApi(originalUrl, timeoutMs) {
  const slug = greenhouseBoardSlug(originalUrl);
  const jobId = greenhouseJobId(originalUrl);
  if (!slug || !jobId) {
    return {
      confirmed: false,
      finalUrl: "",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=false`;
    const response = await fetch(apiUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 public-job-feed-url-checker",
      },
    });
    if (!response.ok) {
      return {
        confirmed: false,
        finalUrl: "",
      };
    }

    const data = await response.json();
    const jobs = Array.isArray(data && data.jobs) ? data.jobs : [];
    const job = jobs.find((candidate) => String(candidate.id || "") === jobId);
    return {
      confirmed: Boolean(job),
      finalUrl: job && job.absolute_url ? job.absolute_url : "",
    };
  } catch (error) {
    return {
      confirmed: false,
      finalUrl: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyUrlIssue({ originalUrl, finalUrl, httpStatus, ok, pageSample = "" }) {
  if (!ok) {
    return `HTTP ${httpStatus}`;
  }

  const finalUrlText = String(finalUrl || "");
  if (knownBadFinalUrlPatterns.some((pattern) => pattern.test(finalUrlText))) {
    return "Final URL matches a known expired/error page pattern.";
  }

  let final;
  try {
    final = new URL(finalUrlText);
  } catch (error) {
    return `Could not parse final URL: ${error.message}`;
  }

  const originalJobId = greenhouseJobId(originalUrl);
  const finalJobId = greenhouseJobId(final);
  if (originalJobId && finalJobId && originalJobId !== finalJobId) {
    return `Greenhouse job URL redirected to a different job id (${finalJobId}).`;
  }
  if (originalJobId && !finalJobId && greenhouseBoardHost(final.hostname)) {
    return "Greenhouse job URL redirected to the company board instead of the job detail page.";
  }

  if (knownBadPageTextPatterns.some((pattern) => pattern.test(pageSample))) {
    return "Page text matches a known closed/not-found job pattern.";
  }

  if (isAshbyEmptyJobShell(originalUrl, pageSample)) {
    return "Ashby job URL returned an empty generic Jobs page.";
  }

  return "";
}

async function readResponseSample(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!/text|html|json|xml/i.test(contentType) || !response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (text.length < 65536) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }

  return text;
}

function buildResult(result) {
  return {
    ok: Boolean(result.ok),
    status: result.status || "",
    issue: result.issue || "",
    httpStatus: result.httpStatus || "",
    finalUrl: result.finalUrl || "",
    durationMs: result.durationMs || 0,
    checkedAt: result.checkedAt || new Date().toISOString(),
  };
}

async function checkJobUrl(rawUrl, options = {}) {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  const timeoutMs = options.timeoutMs || 15000;
  const normalizedUrl = normalizeUrl(rawUrl);

  if (!normalizedUrl) {
    return buildResult({
      ok: false,
      status: "Missing URL",
      issue: "URL cell is empty.",
      checkedAt,
      durationMs: Date.now() - started,
    });
  }

  let originalUrl;
  try {
    originalUrl = new URL(normalizedUrl);
  } catch (error) {
    return buildResult({
      ok: false,
      status: "Invalid URL",
      issue: `Could not parse URL: ${normalizedUrl}`,
      finalUrl: normalizedUrl,
      checkedAt,
      durationMs: Date.now() - started,
    });
  }

  if (confirmedDeadUrls.has(normalizeUrlKey(originalUrl.toString()))) {
    return buildResult({
      ok: false,
      status: "Bad",
      issue: "URL is on the reviewed confirmed-dead job URL list.",
      finalUrl: originalUrl.toString(),
      checkedAt,
      durationMs: Date.now() - started,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(originalUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 public-job-feed-url-checker",
      },
    });
    const finalUrl = response.url || originalUrl.toString();
    if (response.status === 429) {
      return buildResult({
        ok: true,
        status: "Rate Limited",
        issue: "HTTP 429; URL was not pruned because the site rate-limited the checker.",
        httpStatus: response.status,
        finalUrl,
        checkedAt,
        durationMs: Date.now() - started,
      });
    }

    if (response.status === 406 && greenhouseJobId(originalUrl)) {
      const apiConfirmation = await confirmGreenhouseJobViaApi(originalUrl, Math.min(timeoutMs, 15000));
      if (apiConfirmation.confirmed) {
        return buildResult({
          ok: false,
          status: "Greenhouse Detail 406",
          issue:
            "HTTP 406 from Greenhouse detail page; Greenhouse board API still lists this job, so it was kept for review.",
          httpStatus: response.status,
          finalUrl: apiConfirmation.finalUrl || finalUrl,
          checkedAt,
          durationMs: Date.now() - started,
        });
      }
    }

    const pageSample = await readResponseSample(response);
    const issue = classifyUrlIssue({
      originalUrl,
      finalUrl,
      httpStatus: response.status,
      ok: response.ok,
      pageSample,
    });

    return buildResult({
      ok: !issue,
      status: issue ? "Bad" : "Good",
      issue,
      httpStatus: response.status,
      finalUrl,
      checkedAt,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    return buildResult({
      ok: false,
      status: error && error.name === "AbortError" ? "Timeout" : "Fetch Error",
      issue:
        error && error.name === "AbortError"
          ? `Timed out after ${timeoutMs}ms.`
          : String((error && error.message) || error),
      finalUrl: originalUrl.toString(),
      checkedAt,
      durationMs: Date.now() - started,
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  checkJobUrl,
  classifyUrlIssue,
  normalizeUrl,
  isAshbyEmptyJobShell,
};
