const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const flagIndex = args.indexOf("--use-streaming-export");
const useStreaming = flagIndex !== -1;
if (useStreaming) args.splice(flagIndex, 1);

const target = useStreaming
  ? "export-public-slices-streaming-dry-run.js"
  : "export-public-slices.js";

if (useStreaming && !args.includes("--profile")) args.push("--profile", "full");
if (useStreaming) {
  console.log("Streaming export opt-in selected: staging only; no public outputs will be published.");
}

const result = spawnSync(process.execPath, [path.join(__dirname, target), ...args], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
