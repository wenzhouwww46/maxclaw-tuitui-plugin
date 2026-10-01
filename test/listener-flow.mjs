import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startListener } from "../src/listener.mjs";
import { TaskStore } from "../src/tasks.mjs";

test("succeeded mcode response is delivered to Tuitui and stored as completed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "maxclaw-flow-"));
  const sent = [];
  let onEvent;
  const tasks = new TaskStore({ file: join(dir, "tasks.json") });
  const client = {
    event: { SINGLE_CHAT: "single_chat" },
    to: { account: id => id },
    im: { sendText: async ({ to, text }) => { sent.push({ to, text }); } },
  };
  const listener = startListener({ appid: "test", secret: "test", interactiveCards: false, agentProgress: false }, {
    client,
    tasks,
    dedupe: { seen: () => false },
    subscribe: fn => { onEvent = fn; return { unsubscribe() {} }; },
    execute: async () => ({ status: "succeeded", output: "你好，任务已完成。", sessionId: "test-session" }),
  });
  try {
    await onEvent({ event: "single_chat", event_id: "test-event", data: { text: "你好", sender_id: "test-user" } });
    assert.deepEqual(sent, [{ to: "test-user", text: "你好，任务已完成。" }]);
    const [task] = tasks.list();
    assert.equal(task.status, "completed");
    assert.equal(task.error, undefined);
  } finally {
    await listener.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
