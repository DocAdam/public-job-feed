const fs = require("fs/promises");
const nodeFs = require("fs");
const path = require("path");
const { escapeCsvValue } = require("../../lib/csv");
const { ensureDir, stringifyJsonLine } = require("../../lib/files");

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    function onError(error) {
      stream.off("error", onError);
      reject(error);
    }
    stream.once("error", onError);
    stream.write(chunk, "utf8", (error) => {
      stream.off("error", onError);
      if (error) reject(error);
      else resolve();
    });
  });
}

async function writeRecords(filePath, rows, format, headers) {
  await ensureDir(path.dirname(filePath));
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  const stream = nodeFs.createWriteStream(tempPath, { encoding: "utf8" });
  try {
    if (format === "csv") await writeChunk(stream, `${headers.map(escapeCsvValue).join(",")}\n`);
    else await writeChunk(stream, "[\n");
    let index = 0;
    for (const row of rows) {
      const text = format === "csv"
        ? `${headers.map((header) => escapeCsvValue(row[header])).join(",")}\n`
        : `${index > 0 ? ",\n" : ""}${stringifyJsonLine(row)}`;
      await writeChunk(stream, text);
      index += 1;
    }
    if (format === "json") await writeChunk(stream, "\n]\n");
    await new Promise((resolve, reject) => { stream.end(resolve); stream.once("error", reject); });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    stream.destroy();
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

module.exports = { writeRecords };
