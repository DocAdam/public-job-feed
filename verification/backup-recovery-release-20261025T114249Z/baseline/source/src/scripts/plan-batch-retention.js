const path = require('node:path');
const { rowsToCsv } = require('../lib/csv');
const { fromRoot, writeJsonFile, writeTextFile } = require('../lib/files');
const { planRetention } = require('../lib/batch-retention');
const headers = ['BatchName', 'ATS', 'GeneratedAt', 'AgeDays', 'SizeBytes', 'Action', 'Reason'];
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Missing value: ' + name);
  return process.argv[i + 1];
}
function buildMarkdown(plan) {
  const counts = plan.rows.reduce((out, r) => { out[r.Action] = (out[r.Action] || 0) + 1; return out; }, {});
  return ['# Batch retention plan', '', `Generated: ${plan.generatedAt}`, '',
    'Status: checked proposal. No deletion is authorized by this file.', '',
    `- Keep raw batches for ${plan.rawRetentionDays} days.`,
    '- Keep every current board source, regardless of age.',
    '- Keep review folders and folders with unfinished collection records.',
    '- Source hashes, full current state, retained-source state, and saved fetch events were checked.',
    '- The executor must repeat these checks under the shared lock. Plans expire after 24 hours.', '',
    ...Object.entries(counts).sort().map(([name, count]) => `- ${name}: ${count}`),
    `- Candidate bytes: ${plan.totals.candidateBytes} (${(plan.totals.candidateBytes / 2 ** 30).toFixed(2)} GiB).`,
    `- Current boards: ${plan.checks.boardCount}.`,
    `- Raw fetch rows checked: ${plan.checks.rawFetchRows}.`,
    `- Candidate fetch rows checked: ${plan.checks.candidateFetchRows}.`,
    `- Saved history events: ${plan.checks.ledgerEvents}.`, '',
    'The monthly ledger keeps fetch records. It does not keep every raw job description or every batch export. Decide whether a verified external archive is needed before approving removal.', '',
    'A stopped process leaves its lock for manual review. Other tools that write files directly do not follow this lock. Stop such work before any approved cleanup.', '',
  ].join('\n');
}
async function savePlan(outputDir, plan) {
  const { rows, ...manifest } = plan;
  await writeJsonFile(path.join(outputDir, 'batch-retention-plan.json'), rows);
  await writeTextFile(path.join(outputDir, 'batch-retention-plan.csv'), rowsToCsv(headers, rows));
  await writeTextFile(path.join(outputDir, 'batch-retention-plan.md'), buildMarkdown(plan));
  // Publish the binding last. A partial export cannot validate with an older manifest.
  await writeJsonFile(path.join(outputDir, 'batch-retention-plan.manifest.json'), manifest);
}
async function main() {
  const outputDir = path.resolve(arg('--output-dir', fromRoot('data', 'jobs', 'reports')));
  const rawRetentionDays = Number(arg('--raw-retention-days', '30'));
  const plan = await planRetention({ batchesRoot: fromRoot('data', 'jobs', 'batches'), indexDir: fromRoot('data', 'jobs', 'index') },
    { rawRetentionDays, save: p => savePlan(outputDir, p) });
  console.log(`Batch retention plan: ${plan.totals.batches} batches, ${plan.totals.candidateCount} candidates, ${plan.totals.candidateBytes} bytes. No batches deleted.`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main, savePlan, buildMarkdown };
