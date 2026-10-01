import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { acquireListenerSingleton } from "../src/listener-singleton.mjs";

test("only one listener process can claim a data directory", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "maxclaw-singleton-"));
  const script = `import { acquireListenerSingleton } from ${JSON.stringify(new URL("../src/listener-singleton.mjs", import.meta.url).href)};\nconst lease = acquireListenerSingleton(process.argv[1]);\nconsole.log(lease ? "acquired" : "duplicate");\nif (lease) { process.once("SIGTERM", () => { lease.release(); process.exit(0); }); setInterval(() => {}, 1000); }`;
  const first = spawn(process.execPath, ["--input-type=module", "-e", script, dataDir], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    const firstLine = await new Promise((resolve, reject) => {
      first.stdout.once("data", chunk => resolve(String(chunk).trim()));
      first.once("error", reject);
    });
    assert.equal(firstLine, "acquired");
    const second = spawn(process.execPath, ["--input-type=module", "-e", script, dataDir], { stdio: ["ignore", "pipe", "pipe"] });
    let secondOutput = "";
    second.stdout.on("data", chunk => secondOutput += chunk);
    await new Promise(resolve => second.once("close", resolve));
    assert.equal(secondOutput.trim(), "duplicate");
    assert.equal(Number(readFileSync(join(dataDir, "listener.pid"), "utf8")), first.pid);
    first.kill("SIGTERM");
    await new Promise(resolve => first.once("close", resolve));
    const third = acquireListenerSingleton(dataDir);
    assert(third, "released singleton can be acquired again");
    third.release();
  } finally {
    first.kill("SIGTERM");
    rmSync(dataDir, { recursive: true, force: true });
  }
});
