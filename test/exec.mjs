import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "../src/exec.mjs";

function fakeChild({ stdout = "", stderr = "", code = 0 } = {}) {
  return {
    stdout: { on(_event, handler) { if (stdout) queueMicrotask(() => handler(Buffer.from(stdout))); } },
    stderr: { on(_event, handler) { if (stderr) queueMicrotask(() => handler(Buffer.from(stderr))); } },
    stdin: { end() {} },
    kill() {},
    once(event, handler) { if (event === "close") queueMicrotask(() => handler(code)); return this; },
  };
}

test("first run starts a fresh session in the configured workspace", async () => {
  let captured;
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const temporary = mkdtempSync(join(tmpdir(), "maxclaw-exec-first-"));
  const result = await execute("user:first-run", "你好", [], {
    sessionFile: join(temporary, "sessions.json"),
    entry: "/tmp/fake-mcode-entry.mjs",
    cwd: "/tmp/maxclaw-test-workspace",
    spawn(_node, args, options) {
      captured = { args, options };
      return fakeChild({ stdout: JSON.stringify({ status: "succeeded", output: "ok", sessionId: "session-1" }) });
    },
  });
  assert.equal(result.status, "succeeded");
  assert.equal(captured.options.cwd, "/tmp/maxclaw-test-workspace");
  assert(!captured.args.includes("--continue"));
  assert(!captured.args.includes("--session"));
  rmSync(temporary, { recursive: true, force: true });
});

test("existing session is resumed explicitly", async () => {
  let captured;
  const sessionFile = "/tmp/maxclaw-exec-session-test.json";
  const { writeFileSync, unlinkSync } = await import("node:fs");
  writeFileSync(sessionFile, JSON.stringify({ "user:resume": "session-42" }));
  try {
    const result = await execute("user:resume", "继续", [], {
      entry: "/tmp/fake-mcode-entry.mjs",
      cwd: "/tmp/maxclaw-test-workspace",
      sessionFile,
      spawn(_node, args, options) {
        captured = { args, options };
        return fakeChild({ stdout: JSON.stringify({ status: "succeeded", output: "ok", sessionId: "session-42" }) });
      },
    });
    assert.equal(result.status, "succeeded");
    assert(captured.args.includes("--session"));
    assert(captured.args.includes("session-42"));
    assert(!captured.args.includes("--continue"));
  } finally { try { unlinkSync(sessionFile); } catch {} }
});

test("empty successful output reports stderr instead of a JSON parser symptom", async () => {
  const result = await execute("user:empty", "你好", [], {
    entry: "/tmp/fake-mcode-entry.mjs",
    cwd: "/tmp/maxclaw-test-workspace",
    spawn() { return fakeChild({ stderr: "Agent returned no JSON output", code: 0 }); },
  });
  assert.equal(result.status, "error");
  assert.equal(result.error, "Agent returned no JSON output");
});
