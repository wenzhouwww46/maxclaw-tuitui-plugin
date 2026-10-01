import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readPublicConfig, saveCredentials, saveConfig } from "./store.mjs";
import { SETTINGS_PAGE } from "./settings-page.mjs";

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

export function startSettings() {
  const sessionToken = token();
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (!validLoopbackHost(req.headers.host)) return json(res, 400, { error: "invalid host" });
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) return json(res, 403, { error: "invalid origin" });
    if (req.method === "GET" && pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(SETTINGS_PAGE);
    }
    if (!same(req.headers["x-maxclaw-session"], sessionToken)) return json(res, 403, { error: "invalid session" });
    if (req.method === "GET" && pathname === "/api/config") return json(res, 200, readPublicConfig());
    if (req.method !== "POST") return json(res, 404, { error: "not found" });
    if (!origin) return json(res, 403, { error: "origin required" });
    try {
      const input = await body(req);
      if (pathname === "/api/credentials") { saveCredentials(input); return json(res, 204, {}); }
      if (pathname === "/api/config") { saveConfig(input); return json(res, 204, {}); }
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
