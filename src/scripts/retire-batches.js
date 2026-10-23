const path = require('node:path');
const { fromRoot, readJsonFile, writeJsonFile, writeTextFile } = require('../lib/files');
const { retireBatches } = require('../lib/batch-retention');
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Missing value: ' + name);
  return process.argv[i + 1];
}
async function main() {
  const planDir = path.resolve(arg('--plan-dir', fromRoot('data', 'jobs', 'reports')));
  const outputDir = path.resolve(arg('--output-dir', fromRoot('data', 'jobs', 'reports')));
  const rows = await readJsonFile(path.join(planDir, 'batch-retention-plan.json'));
  const manifest = await readJsonFile(path.join(planDir, 'batch-retention-plan.manifest.json'));
  const result = await retireBatches({ batchesRoot: fromRoot('data', 'jobs', 'batches'), indexDir: fromRoot('data', 'jobs', 'index') },
    { ...manifest, rows }, { apply: process.argv.includes('--apply') });
  await writeJsonFile(path.join(outputDir, 'batch-retirement-result.json'), result);
  await writeTextFile(path.join(outputDir, 'batch-retirement-result.md'), [
    '# Batch retirement result', '', `Generated: ${result.GeneratedAt}`, `Applied: ${result.Applied}`,
    `Candidates: ${result.CandidateCount}`, `Deleted: ${result.DeletedCount}`, `Validation: ${result.Validation}`, '',
  ].join('\n'));
  console.log(`Batch retirement ${result.Applied ? 'complete' : 'validated'}: ${result.DeletedCount}/${result.CandidateCount} folders deleted.`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
