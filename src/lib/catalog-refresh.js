const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { ensureDir, readJsonFile, writeJsonFile, writeTextFile } = require("./files");

function parseCatalogText(text, label = "catalog") {
  let rows;

  try {
    rows = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`${label} must contain a JSON array`);
  }

  if (rows.length === 0) {
    throw new Error(`${label} contains zero rows`);
  }

  return rows;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    return fallback;
  }
}

async function readExistingCatalog(filePath, label) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const rows = parseCatalogText(text, label);
    return { text, count: rows.length, sha256: sha256(text) };
  } catch (error) {
    return { text: "", count: 0, sha256: "", error: error.message };
  }
}

async function fetchCatalog(source, previous, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const previousManifest = options.previousManifest || {};
  const headers = {
    accept: "application/json",
    "user-agent": "public-job-feed-catalog-refresh/1.0",
  };

  if (!options.force && previousManifest.ETag) {
    headers["if-none-match"] = previousManifest.ETag;
  }
  if (!options.force && previousManifest.LastModified) {
    headers["if-modified-since"] = previousManifest.LastModified;
  }

  try {
    let response = await options.fetchImpl(source.url, { headers, signal: controller.signal });

    if (response.status === 304 && previous.count === 0) {
      response = await options.fetchImpl(source.url, {
        headers: { accept: "application/json", "user-agent": headers["user-agent"] },
        signal: controller.signal,
      });
    }

    if (response.status === 304) {
      return {
        status: "not_modified",
        count: previous.count,
        text: "",
        sha256: previous.sha256,
        etag: previousManifest.ETag || "",
        lastModified: previousManifest.LastModified || "",
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    }

    const text = await response.text();
    const rows = parseCatalogText(text, source.ats);
    const count = rows.length;
    const minimumAllowed = Math.floor(previous.count * (1 - options.maximumDropRatio));

    if (!options.allowLargeDrop && previous.count > 0 && count < minimumAllowed) {
      const dropPercent = (((previous.count - count) / previous.count) * 100).toFixed(1);
      throw new Error(
        `row count fell from ${previous.count} to ${count} (${dropPercent}%); ` +
          `rerun with --allow-large-drop true after review`
      );
    }

    return {
      status: sha256(text) === previous.sha256 ? "unchanged" : "updated",
      count,
      text,
      sha256: sha256(text),
      etag: response.headers.get("etag") || "",
      lastModified: response.headers.get("last-modified") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshCatalogSources(options) {
  const startedAt = new Date().toISOString();
  const previousManifest = (await readJsonIfExists(options.manifestPath, {})) || {};
  const previousByAts = new Map(
    (Array.isArray(previousManifest.Sources) ? previousManifest.Sources : []).map((row) => [row.ATS, row])
  );

  await ensureDir(options.rawDir);

  const work = options.sources.map(async (source) => {
    const outputPath = path.join(options.rawDir, source.filename);
    const previous = await readExistingCatalog(outputPath, `${source.ats} existing catalog`);
    const previousSourceManifest = previousByAts.get(source.ats) || {};

    try {
      const result = await fetchCatalog(source, previous, {
        ...options,
        previousManifest: previousSourceManifest,
      });

      if (result.text) {
        await writeTextFile(outputPath, result.text);
      }

      return {
        ATS: source.ats,
        URL: source.url,
        RawFile: source.filename,
        Status: result.status,
        Usable: true,
        RowCount: result.count,
        PreviousRowCount: previous.count,
        SHA256: result.sha256,
        ETag: result.etag,
        LastModified: result.lastModified,
        LastAttemptAt: startedAt,
        LastSuccessfulAt:
          result.status === "not_modified" ? previousSourceManifest.LastSuccessfulAt || startedAt : startedAt,
        Error: "",
      };
    } catch (error) {
      return {
        ATS: source.ats,
        URL: source.url,
        RawFile: source.filename,
        Status: previous.count > 0 ? "fallback" : "failed",
        Usable: previous.count > 0,
        RowCount: previous.count,
        PreviousRowCount: previous.count,
        SHA256: previous.sha256,
        ETag: previousSourceManifest.ETag || "",
        LastModified: previousSourceManifest.LastModified || "",
        LastAttemptAt: startedAt,
        LastSuccessfulAt: previousSourceManifest.LastSuccessfulAt || "",
        Error: error.name === "AbortError" ? "request timed out" : error.message,
      };
    }
  });

  const sources = await Promise.all(work);
  const unusable = sources.filter((row) => !row.Usable);
  const fallback = sources.filter((row) => row.Status === "fallback");
  const completedAt = new Date().toISOString();
  const manifest = {
    Version: 1,
    StartedAt: startedAt,
    CompletedAt: completedAt,
    RefreshStatus: unusable.length > 0 ? "failed" : fallback.length > 0 ? "partial" : "complete",
    SourceCount: sources.length,
    UpdatedSourceCount: sources.filter((row) => row.Status === "updated").length,
    FallbackSourceCount: fallback.length,
    UnusableSourceCount: unusable.length,
    TotalRows: sources.reduce((sum, row) => sum + Number(row.RowCount || 0), 0),
    Sources: sources,
    PipelineStatus: previousManifest.PipelineStatus || "not_run",
    PipelineCompletedAt: previousManifest.PipelineCompletedAt || "",
  };

  await writeJsonFile(options.manifestPath, manifest);

  if (unusable.length > 0) {
    throw new Error(`Catalog refresh has ${unusable.length} unusable source(s): ${unusable.map((row) => row.ATS).join(", ")}`);
  }

  if (options.strict && fallback.length > 0) {
    throw new Error(`Catalog refresh used fallback data for: ${fallback.map((row) => row.ATS).join(", ")}`);
  }

  return manifest;
}

module.exports = {
  parseCatalogText,
  refreshCatalogSources,
  sha256,
};
