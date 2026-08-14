const nodeFs = require("fs");
const fs = require("fs/promises");
const path = require("path");
const readline = require("readline");

const projectRoot = path.resolve(__dirname, "../..");

function fromRoot(...parts) {
  return path.join(projectRoot, ...parts);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableFsError(error) {
  return ["EBUSY", "EAGAIN", "ETIMEDOUT"].includes(error && error.code);
}

async function withFsRetry(action, label) {
  const maxAttempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetriableFsError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = 500 * attempt;
      console.warn(`Retrying ${label} after ${error.code} (${attempt}/${maxAttempts})...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function readJsonFile(filePath) {
  const text = await withFsRetry(() => fs.readFile(filePath, "utf8"), `read ${filePath}`);
  return JSON.parse(text);
}

async function readLargeJsonArrayFile(filePath) {
  const rows = [];
  for await (const row of iterateLargeJsonArrayFile(filePath)) {
    rows.push(row);
  }
  return rows;
}

async function* iterateLargeJsonArrayFile(filePath) {
  const stream = nodeFs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed === "[" || trimmed === "]") {
        continue;
      }

      const jsonText = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
      yield JSON.parse(jsonText);
    }
  } catch (error) {
    stream.destroy();
    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }

}

async function* iterateStrictLineJsonArrayFile(filePath) {
  const stream = nodeFs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  let sawOpeningBracket = false;
  let sawClosingBracket = false;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!sawOpeningBracket) {
        if (trimmed !== "[") {
          throw new Error(`Expected opening [ on line ${lineNumber}`);
        }
        sawOpeningBracket = true;
        continue;
      }

      if (trimmed === "]") {
        sawClosingBracket = true;
        continue;
      }

      if (sawClosingBracket || !trimmed.startsWith("{")) {
        throw new Error(`Expected a JSON object or closing ] on line ${lineNumber}`);
      }

      const jsonText = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
      let row;
      try {
        row = JSON.parse(jsonText);
      } catch (error) {
        throw new Error(`Invalid JSON object on line ${lineNumber}: ${error.message}`);
      }

      if (!row || Array.isArray(row) || typeof row !== "object") {
        throw new Error(`Expected a JSON object on line ${lineNumber}`);
      }

      yield { lineNumber, row };
    }

    if (!sawOpeningBracket) throw new Error("Missing opening [");
    if (!sawClosingBracket) throw new Error("Missing closing ]");
  } catch (error) {
    stream.destroy();
    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }
}

async function getAvailableBytes(filePath) {
  const stats = await fs.statfs(filePath);
  return Number(stats.bavail) * Number(stats.bsize);
}

async function writeJsonFile(filePath, data) {
  await ensureDir(path.dirname(filePath));

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await withFsRetry(
      () => fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8"),
      `write ${tempPath}`
    );
    await withFsRetry(() => fs.rename(tempPath, filePath), `rename ${tempPath}`);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function writeTextFile(filePath, text) {
  await ensureDir(path.dirname(filePath));

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await withFsRetry(() => fs.writeFile(tempPath, text, "utf8"), `write ${tempPath}`);
    await withFsRetry(() => fs.rename(tempPath, filePath), `rename ${tempPath}`);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function writeJsonObjectFile(filePath, object) {
  await writeJsonFile(filePath, object);
}

function stringifyJsonLine(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function writeStreamChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    function onError(error) {
      reject(error);
    }

    stream.once("error", onError);
    stream.write(chunk, "utf8", (error) => {
      stream.off("error", onError);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function writeLargeJsonArrayFile(filePath, rows, mapRow = (row) => row) {
  await ensureDir(path.dirname(filePath));

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const stream = nodeFs.createWriteStream(tempPath, { encoding: "utf8" });

  try {
    await writeStreamChunk(stream, "[\n");

    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0) {
        await writeStreamChunk(stream, ",\n");
      }

      await writeStreamChunk(stream, stringifyJsonLine(mapRow(rows[index])));
    }

    await writeStreamChunk(stream, "\n]\n");

    await new Promise((resolve, reject) => {
      stream.end(resolve);
      stream.once("error", reject);
    });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    stream.destroy();
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

module.exports = {
  ensureDir,
  fromRoot,
  getAvailableBytes,
  iterateLargeJsonArrayFile,
  iterateStrictLineJsonArrayFile,
  readJsonFile,
  readLargeJsonArrayFile,
  stringifyJsonLine,
  writeJsonObjectFile,
  writeJsonFile,
  writeTextFile,
  writeLargeJsonArrayFile,
};
