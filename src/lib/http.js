async function fetchJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "public-job-feed-sample/0.1",
        ...(options.headers || {}),
      },
      method: options.method || "GET",
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        if (!response.ok) {
          const httpError = new Error(`HTTP ${response.status}`);
          httpError.status = response.status;
          httpError.body = text.slice(0, 500);
          throw httpError;
        }

        throw new Error(`Invalid JSON response: ${error.message}`);
      }
    }

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      data,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchJson,
};
