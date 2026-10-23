const path = require('path');
const { withBatchMaintenance } = require('./batch-maintenance');
const { writeJsonFile } = require('./files');
const { preview } = require('./failure-diagnostics');

// A marker remains "running" if the process is killed. A caught error becomes "failed".
// Each attempt has its own marker, so a retry does not erase older evidence.
async function runBatch(batchDir, action) {
  const startedAt = new Date().toISOString();
  const marker = path.join(batchDir, `batch-run-${Date.now()}-${process.pid}-${require('crypto').randomUUID()}.json`);
  const record = { status: 'running', started_at: startedAt, phase: 'starting' };
  const phase = async value => { record.phase = value; await writeJsonFile(marker, record); };
  await writeJsonFile(marker, record);
  try {
    const result = await action(phase);
    await writeJsonFile(marker, { ...record, status: 'complete', completed_at: new Date().toISOString() });
    return result;
  } catch (error) {
    try {
      await writeJsonFile(marker, { ...record, status: 'failed', failed_at: new Date().toISOString(), error: preview(error.message), error_name: error.name });
    } catch (markerError) { console.error('Could not write batch failure marker:', markerError.code || markerError.name); }
    throw error;
  }
}
async function withBatchRun(batchDir, action) {
  return withBatchMaintenance(path.dirname(batchDir), 'collect', () => runBatch(batchDir, action));
}
module.exports = { withBatchRun };
