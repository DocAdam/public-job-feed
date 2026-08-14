const nodeFs = require("fs");
const fs = require("fs/promises");
const path = require("path");

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  const escaped = text.replace(/"/g, '""');

  if (/[",\r\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

function rowsToCsv(headers, rows) {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
  ];

  return `${lines.join("\n")}\n`;
}

function detectDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseCsvRecords(csvText) {
  const text = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) {
    return {
      headers: [],
      rows: [],
    };
  }

  const delimiter = detectDelimiter(text);
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"' && (quoted || cell === "")) {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" && !quoted) {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  records.push(row);

  const headers = makeUniqueHeaders(records.shift() || []);
  const rows = records
    .filter((record) => record.some((value) => String(value || "").trim()))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] === undefined ? "" : record[index]]))
    );

  return {
    headers,
    rows,
  };
}

function makeUniqueHeaders(headers) {
  const seen = new Map();

  return headers.map((header, index) => {
    const fallback = `Column${index + 1}`;
    const cleanHeader = String(header || "").trim() || fallback;
    const normalized = cleanHeader.toLowerCase().replace(/[^a-z0-9]/g, "") || fallback.toLowerCase();
    const count = seen.get(normalized) || 0;
    seen.set(normalized, count + 1);

    return count === 0 ? cleanHeader : `${cleanHeader}_${count + 1}`;
  });
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

async function closeStream(stream) {
  await new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

async function writeLargeCsvFile(filePath, rows, columns, getValue = (row, column) => row[column]) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const stream = nodeFs.createWriteStream(tempPath, { encoding: "utf8" });

  try {
    await writeStreamChunk(stream, `${columns.map(escapeCsvValue).join(",")}\n`);

    for (const row of rows) {
      await writeStreamChunk(stream, `${columns.map((column) => escapeCsvValue(getValue(row, column))).join(",")}\n`);
    }

    await closeStream(stream);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    stream.destroy();
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

module.exports = {
  escapeCsvValue,
  parseCsvRecords,
  rowsToCsv,
  writeLargeCsvFile,
};
