const fs = require("fs/promises");
const path = require("path");

async function validateJsonFile(filePath) {
  JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function validateOutputDirectory(outputDir, requiredFiles) {
  for (const fileName of requiredFiles) {
    const filePath = path.join(outputDir, fileName);
    await fs.access(filePath);
    if (fileName.endsWith(".json")) await validateJsonFile(filePath);
  }
}

async function publishAtomically({ outputDir, publishRoot, requiredFiles, failBeforeSymlink = false }) {
  await validateOutputDirectory(outputDir, requiredFiles);
  await fs.mkdir(publishRoot, { recursive: true });
  const versionName = "streaming-v1-" + new Date().toISOString().replace(/[:.]/g, "-");
  const versionDir = path.join(publishRoot, versionName);
  await fs.rename(outputDir, versionDir);
  if (failBeforeSymlink) throw new Error("Injected failure before latest symlink update");
  const nextLink = path.join(publishRoot, ".latest-" + process.pid + "-" + Date.now());
  const latestLink = path.join(publishRoot, "latest");
  await fs.symlink(versionName, nextLink);
  await fs.rename(nextLink, latestLink);
  return { latestLink, versionDir };
}

module.exports = { publishAtomically, validateOutputDirectory };
