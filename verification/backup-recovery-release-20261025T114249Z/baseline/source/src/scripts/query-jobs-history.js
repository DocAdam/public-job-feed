const path = require('node:path');
const { DuckDBInstance } = require('@duckdb/node-api');
const { query } = require('../lib/jobs-history');
async function main() {
  const statement = process.argv[2];
  if (!statement) throw new Error('Usage: node src/scripts/query-jobs-history.js "SELECT ..." [database path]');
  const database = path.resolve(process.argv[3] || 'data/jobs/history/jobs-history.duckdb');
  return require('../lib/job-history-access').withLease(database,async()=>{
  const instance = await DuckDBInstance.create(database, { ...require('../lib/job-history-bounded-storage').DATABASE_OPTIONS, access_mode: 'READ_ONLY', enable_external_access: 'false' });
  const connection = await instance.connect();
  try { console.log(JSON.stringify(await query(connection, statement), null, 2)); }
  finally { connection.closeSync(); instance.closeSync(); }
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
