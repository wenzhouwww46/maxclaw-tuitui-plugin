import { stat, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { TuituiBotClient } from "../vendor/tuitui-bot-sdk/dist/index.js";
import { DATA_DIR } from "./store.mjs";
import { execute } from "./exec.mjs";
import { routeKey, clearSession } from "./router.mjs";
import { BoundedRouteQueue, PersistentDedupe } from "./queue.mjs";
import { TaskStore } from "./tasks.mjs";
import { preflight } from "./policy.mjs";
import { taskCard, cardAction, sendCard, updateCard } from "./cards.mjs";
import { createAgentReporter } from "./agent-report.mjs";
import { mediaItems, parseCommand, runCommand } from "./commands.mjs";


export function isSuccessfulResult(result) {
  const status = String(result?.status ?? "").toLowerCase();
  return status === "success" || status === "succeeded" || status === "completed";
}

export function resultError(result) {
  if (isSuccessfulResult(result)) return undefined;
  return typeof result?.error === "string" && result.error.trim()
    ? result.error
    : (result?.status || "unknown error");
}

const DEFAULTS = { concurrency: 2, maxQueue: 32, maxAttachments: 5, maxAttachmentBytes: 20 * 1024 * 1024, taskTimeoutMs: 120_000, dedupeWindowMs: 24 * 60 * 60 * 1000, interactiveCards: true, agentProgress: true, commands: true };

function eventType(client, body) { return body.event || body.type || body.name || client?.event?.SINGLE_CHAT; }
function dataOf(body) { return body.data || body.message || body; }
function eventId(body) { return body.event_id || body.eventId || body.id || dataOf(body).event_id || dataOf(body).id; }
function isGroup(client, body) { const type = eventType(client, body); return type === client?.event?.GROUP_CHAT || /group/i.test(String(type)); }
function isPrivate(client, body) { const type = eventType(client, body); return type === client?.event?.SINGLE_CHAT || /single|private|user/i.test(String(type)); }
function textOf(client, body) {
  const data = dataOf(body);
  if (typeof data.text === "string") return data.text;
  if (typeof data.content === "string") return data.content;
  try { return client.event.renderMessageBody(data); } catch { return ""; }
}
function senderId(data) { return data.sender_id || data.senderId || data.from?.id || data.user_id || data.account || data.uid; }
function groupId(data) { return data.group_id || data.groupId || data.chat_id || data.chatId || data.conversation_id; }
function attachmentsOf(data) { return data.attachments || data.files || data.file_list || []; }

async function attachmentPaths(attachments, config, client) {
  if (!Array.isArray(attachments) || attachments.length > config.maxAttachments) throw new Error("attachment count exceeds limit");
  let total = 0;
  const paths = [];
  for (const item of attachments) {
    const local = typeof item === "string" ? item : item.path || item.localPath;
    let value = local;
    if (!value) {
      const url = typeof item === "object" && (item.url || item.downloadUrl || item.href || item.source);
      if (!url || !/^https?:\/\//i.test(url)) throw new Error("attachment has no downloadable URL");
      const mediaDir = join(DATA_DIR, "media"); await mkdir(mediaDir, { recursive: true, mode: 0o700 });
      const target = join(mediaDir, `${randomUUID()}-${basename(new URL(url).pathname) || "attachment"}`);
      let response;
      try { response = await fetch(url); } catch { throw new Error("attachment download failed"); }
      if (!response.ok || !response.body) throw new Error("attachment download failed");
      const declared = Number(item.size || item.bytes || response.headers.get("content-length") || 0);
      if (declared > config.maxAttachmentBytes || total + declared > config.maxAttachmentBytes) throw new Error("attachment size exceeds limit");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > config.maxAttachmentBytes || total + buffer.length > config.maxAttachmentBytes) throw new Error("attachment size exceeds limit");
      await writeFile(target, buffer, { mode: 0o600 }); value = target;
    }
    let bytes = Number(typeof item === "object" && (item.size || item.bytes) || 0);
    if (!bytes) { try { bytes = (await stat(value)).size; } catch { throw new Error("attachment is unavailable"); } }
    total += bytes;
    if (bytes > config.maxAttachmentBytes || total > config.maxAttachmentBytes) throw new Error("attachment size exceeds limit");
    paths.push(value);
  }
  return paths;
}

export function startListener(config = {}, dependencies = {}) {
  const options = { ...DEFAULTS, ...config };
  const client = dependencies.client || (dependencies.createClient || ((id, secret) => new TuituiBotClient(id, secret)))(config.appid || config.appId, config.secret || config.appSecret);
  const queue = dependencies.queue || new BoundedRouteQueue({ concurrency: options.concurrency, maxQueue: options.maxQueue });
  const dedupe = dependencies.dedupe || new PersistentDedupe({ file: config.dedupeFile, windowMs: options.dedupeWindowMs });
  const runExecute = dependencies.execute || execute;
  const taskRegistry = dependencies.taskRegistry;
  const send = dependencies.send || ((to, text) => client.im.sendText({ to, text }));
  const tasks = dependencies.tasks || new TaskStore();
  const cards = new Map();
  const active = new Map();
  let subscription;
  let closed = false;

  const targetOf = (body, data = dataOf(body)) => {
    const group = isGroup(client, body);
    return group ? client.to.group(groupId(data)) : (data.sender_uid ? client.to.uid(data.sender_uid) : client.to.account(senderId(data)));
  };
  const routeOf = (body, data = dataOf(body)) => isGroup(client, body) ? routeKey({ kind: "group", id: groupId(data) }) : routeKey({ kind: "user", id: senderId(data) });
  const handleInteractive = async (body) => {
    const action = cardAction(body);
    const task = action.taskId ? tasks.get(action.taskId) : null;
    if (!task) return false;
    if (action.action.includes("cancel")) { tasks.requestCancel(action.taskId); return true; }
    if (action.action.includes("retry")) {
      const original = cards.get(action.taskId)?.body;
      if (!original) return false;
      const originalData = dataOf(original);
      await onEvent({ ...original, id: `retry:${action.taskId}:${Date.now()}`, data: { ...originalData, text: task.prompt || "请重试上一任务" } });
      return true;
    }
    return false;
  };
  const onEvent = async (body) => {
    if (closed) return;
    const type = eventType(client, body);
    if (/interactive/i.test(String(type))) { await handleInteractive(body); return; }
    const data = dataOf(body);
    const group = isGroup(client, body);
    if (!group && !isPrivate(client, body)) return;
    if (group && !(data.at_me ?? data.atMe)) return;
    if (dedupe.seen(eventId(body))) return;
    const route = routeOf(body, data);
    const prompt = textOf(client, body).trim();
    const target = targetOf(body, data);
    if (options.commands) {
      const command = parseCommand(prompt);
      if (command) { const result = await runCommand(command, { route, tasks, status: () => ({ running: active.size, tasks: tasks.list() }), clearSession: key => clearSession(key, config.sessionFile) }); await send(target, result.text); return; }
    }
    const safety = preflight(prompt);
    if (!safety.allowed) { await send(target, `任务已阻止：${safety.reason}`); return; }
    const media = mediaItems(client, data);
    const rawAttachments = [...attachmentsOf(data), ...media.map(item => ({ url: item.url, size: item.size, mime_type: item.mimeType }))];
    let files;
    try { files = await attachmentPaths(rawAttachments, options, client); } catch (error) { await send(target, `任务失败：${error.message}`); return; }
    const taskId = tasks.register({ route, prompt });
    let cardMessageId;
    if (options.interactiveCards && client?.im?.sendInteractive) {
      try { const card = await sendCard(client, target, taskCard({ taskId, prompt })); cardMessageId = card?.msgid || card?.messageId || card?.id; if (cardMessageId) cards.set(taskId, { target, messageId: cardMessageId, body }); } catch {}
    }
    await queue.enqueue(route, async () => {
      const controller = new AbortController();
      active.set(taskId, controller);
      const progress = options.agentProgress ? createAgentReporter(client, body, { runId: taskId }) : null;
      const cancelWatcher = setInterval(() => { if (tasks.isCancelRequested(taskId)) controller.abort(); }, 500);
      try {
        const result = await runExecute(route, prompt, files, { timeoutMs: options.taskTimeoutMs, signal: controller.signal, progress });
        const ok = isSuccessfulResult(result);
        const cancelled = String(result?.status ?? "").toLowerCase() === "cancelled" || tasks.isCancelRequested(taskId);
        const status = cancelled ? "cancelled" : ok ? "completed" : "failed";
        const failure = resultError(result);
        tasks.update(taskId, { status, result, ...(failure ? { error: failure } : {}) });
        const message = cancelled ? "任务已取消。" : ok ? (result.output || "任务已完成，但没有输出。") : `任务失败：${failure}`;
        const card = cards.get(taskId);
        if (card) { try { await updateCard(client, card.target, card.messageId, taskCard({ taskId, prompt, status: cancelled ? "已取消" : ok ? "已完成" : "失败", detail: message })); } catch {} }
        await send(target, message);
        return result;
      } finally { clearInterval(cancelWatcher); active.delete(taskId); }
    }).catch(async (error) => {
      tasks.update(taskId, { status: "failed", error: error.message });
      const card = cards.get(taskId);
      if (card) { try { await updateCard(client, card.target, card.messageId, taskCard({ taskId, prompt, status: "失败", detail: error.message })); } catch {} }
      try { await send(target, `任务失败：${error.message}`); } catch { /* transport failure is not recoverable here */ }
    });
  };
  if (dependencies.subscribe) subscription = dependencies.subscribe(onEvent);
  else subscription = client.event.subscribe({ onEvent, onError: dependencies.onError });
  return {
    async close() { closed = true; subscription?.unsubscribe?.(); for (const controller of active.values()) controller.abort(); await queue.close(); },
    status() { return { closed, running: queue.running, queued: queue.size, tasks: active.size }; },
    taskStore: tasks,
  };
}

export { attachmentPaths };
