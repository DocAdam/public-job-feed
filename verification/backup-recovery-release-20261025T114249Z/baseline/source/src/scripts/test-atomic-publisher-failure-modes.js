const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { publishAtomically } = require("../adapters/exports/atomic-publisher");

async function createOutput(root, name, json) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "required.json"), json);
  await fs.writeFile(path.join(dir, "required.csv"), "header\nvalue\n");
  return dir;
}

async function assertLatest(root, expected) {
  assert.strictEqual(await fs.readlink(path.join(root, "latest")), expected);
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "public-job-feed-publish-failures-"));
  const publishRoot = path.join(root, "publish");
  await fs.mkdir(path.join(publishRoot, "previous"), { recursive: true });
  await fs.symlink("previous", path.join(publishRoot, "latest"));
  try {
    const missing = path.join(root, "missing");
    await fs.mkdir(missing);
    await assert.rejects(() => publishAtomically({ outputDir: missing, publishRoot, requiredFiles: ["required.json"] }));
    await assertLatest(publishRoot, "previous");

    const invalid = await createOutput(root, "invalid", "not-json");
    await assert.rejects(() => publishAtomically({ outputDir: invalid, publishRoot, requiredFiles: ["required.json"] }));
    await assertLatest(publishRoot, "previous");

    const injected = await createOutput(root, "injected", "{}\n");
    await assert.rejects(() => publishAtomically({ outputDir: injected, publishRoot, requiredFiles: ["required.json", "required.csv"], failBeforeSymlink: true }), /Injected failure/);
    await assertLatest(publishRoot, "previous");
    console.log("Atomic publisher failure-mode tests passed.");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
