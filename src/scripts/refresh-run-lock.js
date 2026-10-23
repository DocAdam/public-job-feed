const path = require('node:path');
const lock = require('../lib/feed-refresh-lock');
async function main() {
  const [mode, value] = process.argv.slice(2);
  const root = path.resolve(__dirname, '../..');
  if (mode === 'acquire' && /^[1-9][0-9]*$/.test(value || '')) console.log(await lock.acquire(root, Number(value)));
  else if (mode === 'release' && value) await lock.release(root, value);
  else throw new Error('Expected acquire PID or release TOKEN');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
