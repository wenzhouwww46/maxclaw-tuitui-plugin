#!/usr/bin/env node
import { createMcpHandler } from "./src/mcp.mjs";
import { readPublicConfig, readCredentials } from "./src/store.mjs";
import { startListener } from "./src/listener.mjs";

if (process.argv.includes("--listener-service")) {
  const credentials = readCredentials();
  if (!credentials) { console.error("Tuitui credentials are not configured"); process.exitCode = 1; }
  else {
    const listener = startListener({ ...readPublicConfig(), ...credentials });
    process.on("exit", () => {});
    const stop = async () => { await listener.close(); process.exit(0); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
  }
} else {
  const handle = createMcpHandler();
  process.stdin.setEncoding("utf8"); let buffer = "";
  function reply(id, result, error) { process.stdout.write(`${JSON.stringify(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result })}\n`); }
  process.stdin.on("data", chunk => { buffer += chunk; let line; while ((line = buffer.indexOf("\n")) >= 0) { const raw = buffer.slice(0, line).trim(); buffer = buffer.slice(line + 1); if (!raw) continue; let request; try { request = JSON.parse(raw); } catch { continue; } Promise.resolve(handle(request)).then(result => { if (request.id !== undefined && result !== null) reply(request.id, result); }).catch(error => { if (request.id !== undefined) reply(request.id, undefined, { code: -32601, message: error.message }); }); } });
}
