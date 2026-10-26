const fs = require("node:fs");
const log = process.env.PJF_NETWORK_BLOCK_LOG;
function blocked(kind) { return (...args) => { if (log) fs.appendFileSync(log, JSON.stringify({pid:process.pid,kind,at:new Date().toISOString()})+"\n"); throw new Error("OFFLINE_VERIFICATION_NETWORK_BLOCKED: "+kind); }; }
globalThis.fetch = blocked("fetch");
for (const [module, methods] of [["node:http",["request","get"]],["node:https",["request","get"]],["node:net",["connect","createConnection"]],["node:tls",["connect"]],["node:dgram",["createSocket"]]]) for (const key of methods) require(module)[key]=blocked(module+"."+key);
