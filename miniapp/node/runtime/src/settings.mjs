import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readPublicConfig, saveCredentials, saveConfig } from "./store.mjs";
import { SETTINGS_PAGE } from "./settings-page.mjs";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function token() { return randomBytes(32).toString("base64url"); }
function same(a, b) { const x = Buffer.from(a || ""); const y = Buffer.from(b || ""); return x.length === y.length && timingSafeEqual(x, y); }
function validLoopbackHost(host) {
  const hostname = String(host || "").split(":")[0].replace(/[\[\]]/g, "");
  return hostname === "127.0.0.1" || hostname === "localhost";
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { text += chunk; if (text.length > 64 * 1024) reject(new Error("request too large")); });
    req.on("end", () => { try { resolve(JSON.parse(text || "{}")); } catch { reject(new Error("malformed JSON")); } });
    req.on("error", reject);
  });
}

export async function startSettings({ manager } = {}) {
  const sessionToken = token();
  let pageHtml = SETTINGS_PAGE;
  try { pageHtml = await readFile(join(PACKAGE_ROOT, "miniapp/client/index.html"), "utf8"); } catch {}
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (!validLoopbackHost(req.headers.host)) return json(res, 400, { error: "invalid host" });
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) return json(res, 403, { error: "invalid origin" });
    if (req.method === "GET" && ["/", "/settings", "/settings/"].includes(pathname)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(pageHtml);
    }
    if (!same(req.headers["x-maxclaw-session"], sessionToken)) return json(res, 403, { error: "invalid session" });
    if (req.method === "GET" && pathname === "/api/config") return json(res, 200, readPublicConfig());
    if (req.method === "GET" && pathname === "/api/status") return json(res, 200, manager?.status?.() || { configured: Boolean(readPublicConfig().credentials?.configured), listener: { running: false }, tasks: [] });
    if (req.method === "GET" && pathname === "/api/tasks") return json(res, 200, manager?.taskStatus?.() || []);
    if (req.method !== "POST") return json(res, 404, { error: "not found" });
    if (!origin) return json(res, 403, { error: "origin required" });
    try {
      const input = await body(req);
      if (pathname === "/api/credentials") { saveCredentials(input); return json(res, 204, {}); }
      if (pathname === "/api/config") { saveConfig(input); return json(res, 204, {}); }
      if (pathname === "/api/listener/start") return json(res, 200, await manager.listenerStart(input));
      if (pathname === "/api/listener/stop") return json(res, 200, await manager.listenerStop());
      const cancelMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/cancel$/u);
      if (cancelMatch) return json(res, 200, manager.taskCancel(decodeURIComponent(cancelMatch[1])));
      return json(res, 404, { error: "not found" });
    } catch (error) { return json(res, 400, { error: error.message || "invalid request" }); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/?session=${sessionToken}`, token: sessionToken, close: () => new Promise(done => server.close(done)) });
    });
  });
}
