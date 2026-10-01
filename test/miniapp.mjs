import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "miniapp/miniapp.json"), "utf8"));
const client = await readFile(join(root, "miniapp/client/index.html"), "utf8");

assert.deepEqual(packageJson.mcode, { schemaVersion: 2, miniApp: "./miniapp/miniapp.json" });
assert.equal(manifest.surface.path, "/settings");
assert.equal(manifest.runtime.entry, "miniapp/node/server.mjs");
assert.deepEqual(manifest.artifacts, { client: ["miniapp/client"], node: ["miniapp/node"] });
for (const label of ["maxclaw Tuitui 设置", "App ID", "Secret", "启动监听", "停止监听", "推推 IM"]) {
  assert.match(client, new RegExp(label));
}

const dataDir = await mkdtemp(join(tmpdir(), "maxclaw-miniapp-test-"));
process.env.MAXCLAW_TUITUI_DATA_DIR = dataDir;
const { start } = await import(join(root, "miniapp/node/server.mjs"));
const context = {
  pluginRoot: root,
  dataDir,
  listen: { host: "127.0.0.1", port: 0 },
  signal: new AbortController().signal,
  logger: { info() {}, error() {} },
};
const lifecycle = await start(context);
try {
  const base = `http://${context.listen.host}:${context.listen.port}`;
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /maxclaw Tuitui/);

  const initial = await fetch(`${base}/api/status`);
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).configured, false);

  const credentials = await fetch(`${base}/api/credentials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appid: "app-1234", secret: "secret-value" }),
  });
  assert.equal(credentials.status, 204);

  const config = await fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ concurrency: 3, interactiveCards: false }),
  });
  assert.equal(config.status, 204);

  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.configured, true);
  assert.equal(status.config.credentials.appid, "ap***34");
  assert.equal(status.config.concurrency, 3);
  assert.equal(status.config.interactiveCards, false);
} finally {
  await lifecycle.dispose();
  await rm(dataDir, { recursive: true, force: true });
}

console.log("MiniApp settings: ok");
