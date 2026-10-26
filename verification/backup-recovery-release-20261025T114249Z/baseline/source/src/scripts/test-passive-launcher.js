const assert = require("assert");
const fs = require("fs/promises");
const { fromRoot } = require("../lib/files");

async function main() {
  const root = fromRoot();
  const plistPath = fromRoot("launchers", "com.public-job-feed.maintain-index.plist.example");
  const installerPath = fromRoot("launchers", "Install Passive Job Index Refresh.command");
  const [plist, installer] = await Promise.all([fs.readFile(plistPath, "utf8"), fs.readFile(installerPath, "utf8")]);

  assert.match(plist, /<string>com\.public-job-feed\.maintain-index<\/string>/);
  assert.ok(plist.includes(`<string>${root}</string>`), "plist WorkingDirectory must point to the current repository");
  assert.ok(plist.includes(`${root}/data/jobs/logs/passive-maintenance.log`));
  assert.match(plist, /<string>\/bin\/zsh<\/string>/);
  assert.match(plist, /<string>-lc<\/string>/);
  assert.match(plist, /\/opt\/homebrew\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin/);
  assert.match(plist, /npm run jobs:maintain-index/);
  assert.doesNotMatch(plist, /<key>KeepAlive<\/key>/, "one scheduled process must not be configured as KeepAlive");
  assert.ok(installer.includes(`PROJECT_DIR="${root}"`), "installer PROJECT_DIR must point to the current repository");
  assert.match(installer, /launchctl bootstrap/);
  console.log("Passive LaunchAgent smoke test passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main };
