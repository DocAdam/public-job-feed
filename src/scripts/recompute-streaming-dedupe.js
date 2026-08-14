const path = require("path");
const { ExportRunStore } = require("../adapters/storage/export-run-store");

async function main() {
  const index = process.argv.indexOf("--run-dir");
  if (index === -1 || !process.argv[index + 1]) throw new Error("Provide --run-dir.");
  const runDir = path.resolve(process.argv[index + 1]);
  const store = await ExportRunStore.resume({ dbPath: path.join(runDir, "run-store.sqlite") });
  try { await store.recomputeDedupe(); console.log(`Recomputed dedupe state: ${runDir}`); }
  finally { await store.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
