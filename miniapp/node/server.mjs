import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR = join(homedir(), ".maxclaw-tuitui");
const MAX_BODY_BYTES = 64 * 1024;

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(value === undefined ? "" : JSON.stringify(value));
}

function page(response, html) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(html);
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > MAX_BODY_BYTES) throw new Error("request body too large");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("request body must be valid JSON");
  }
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function start(context) {
  const dataDir = process.env.MAXCLAW_TUITUI_DATA_DIR || DEFAULT_DATA_DIR;
  process.env.MAXCLAW_TUITUI_DATA_DIR = dataDir;

  // Load the existing service only after the shared data directory is selected.
  const [{ createServiceManager }, { createStore }] = await Promise.all([
    import("./runtime/src/service.mjs"),
    import("./runtime/src/store.mjs"),
  ]);
  const store = createStore(dataDir);
  const manager = createServiceManager();
  const nodeRoot = dirname(fileURLToPath(import.meta.url));
  const html = await readFile(join(nodeRoot, "../client/index.html"), "utf8");
  let disposed = false;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    try {
      if (request.method === "GET" && ["/", "/settings", "/settings/"].includes(url.pathname)) {
        page(response, html);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        json(response, 200, manager.status());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        json(response, 200, store.readPublicConfig());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/tasks") {
        json(response, 200, manager.taskStatus());
        return;
      }
      if (request.method !== "POST") {
        json(response, 404, { error: "not found" });
        return;
      }
      if (url.pathname === "/api/credentials") {
        store.saveCredentials(await readJson(request));
        json(response, 204);
        return;
      }
      if (url.pathname === "/api/config") {
        store.saveConfig(await readJson(request));
        json(response, 204);
        return;
      }
      if (url.pathname === "/api/listener/start") {
        json(response, 200, await manager.listenerStart(await readJson(request)));
        return;
      }
      if (url.pathname === "/api/listener/stop") {
        json(response, 200, await manager.listenerStop());
        return;
      }
      const cancelMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/cancel$/u);
      if (cancelMatch) {
        const task = manager.taskCancel(decodeURIComponent(cancelMatch[1]));
        if (!task) {
          json(response, 404, { error: "task not found" });
          return;
        }
        json(response, 200, task);
        return;
      }
      json(response, 404, { error: "not found" });
    } catch (error) {
      json(response, 400, { error: error?.message || "request failed" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(context.listen.port, context.listen.host, () => {
      server.off("error", reject);
      const address = server.address();
      if (address && typeof address === "object") context.listen.port = address.port;
      resolve();
    });
  });

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await manager.listenerStop();
    await close(server);
  };
  context.signal?.addEventListener("abort", () => { void dispose(); }, { once: true });
  return { dispose };
}
