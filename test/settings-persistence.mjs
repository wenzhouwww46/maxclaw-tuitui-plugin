import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const dataDir = await mkdtemp(join(tmpdir(), "maxclaw-settings-test-"));
const endpointFile = join(dataDir, "settings-endpoint.json");
const child = spawn(process.execPath, [join(root, "server.js")], {
  cwd: root,
  env: { ...process.env, MAXCLAW_TUITUI_DATA_DIR: dataDir, MAXCLAW_TUITUI_SETTINGS_ENDPOINT_FILE: endpointFile },
  stdio: ["pipe", "pipe", "pipe"],
});
let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
const send = (id, method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
const waitFor = async (predicate, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out; stdout=${stdout}`);
};
try {
  send(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  send(2, "tools/call", { name: "maxclaw_settings_open", arguments: {} });
  await waitFor(() => stdout.includes('"id":2'));
  const response = stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line)).find((row) => row.id === 2);
  const settings = JSON.parse(response.result.content[0].text);
  assert.match(settings.url, /^http:\/\/127\.0\.0\.1:/);

  child.stdin.end();
  await new Promise((resolve) => child.once("close", resolve));
  const page = await fetch(settings.url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /maxclaw Tuitui/);
  assert.match(html, /推推 IM/);
  assert.match(html, /启动监听/);
} finally {
  try { child.kill("SIGTERM"); } catch {}
  await rm(dataDir, { recursive: true, force: true });
}
console.log("persistent settings service: ok");
