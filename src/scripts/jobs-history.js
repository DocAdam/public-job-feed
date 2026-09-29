const { runHistory } = require('../lib/jobs-history');
const [mode, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = { '--root': 'root', '--database': 'database' }[args[i]];
  if (!key || !args[i + 1]) throw new Error('Use --root PATH and/or --database PATH');
  options[key] = args[i + 1];
}
runHistory(mode, options).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
