import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const TASK_FILE = process.env.MAXCLAW_TUITUI_TASK_FILE ||
  join(process.env.MAXCLAW_TUITUI_DATA_DIR || join(homedir(), ".maxclaw-tuitui"), "tasks.json");

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const MAX_TASKS = 200;

function readAll(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray(value.tasks)) return [];
    return value.tasks.filter(task => task && typeof task.id === "string");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error("task registry is invalid");
  }
}

function writeAll(file, tasks) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify({ tasks }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
  chmodSync(file, 0o600);
}

function publicView(task) {
  return {
    id: task.id,
    route: task.route,
    status: task.status,
    cancelRequested: Boolean(task.cancelRequested),
    createdAt: task.createdAt,
    finishedAt: task.finishedAt,
    result: task.result,
    error: task.error,
    prompt: task.prompt,
  };
}

export class TaskStore {
  constructor({ file = TASK_FILE } = {}) { this.file = file; }

  #mutate(fn) {
    const tasks = readAll(this.file);
    const value = fn(tasks);
    const trimmed = tasks.filter(task => !TERMINAL.has(task.status) || (task.finishedAt || 0) > Date.now() - 24 * 60 * 60 * 1000).slice(-MAX_TASKS);
    writeAll(this.file, trimmed);
    return value;
  }

  register({ route, prompt } = {}) {
    const id = randomUUID();
    this.#mutate(tasks => { tasks.push({ id, route: String(route ?? ""), status: "running", prompt: String(prompt ?? "").slice(0, 500), createdAt: Date.now(), cancelRequested: false }); });
    return id;
  }

  update(id, patch = {}) {
    return this.#mutate(tasks => {
      const task = tasks.find(candidate => candidate.id === id);
      if (!task) return null;
      if (TERMINAL.has(task.status)) return publicView(task);
      if (patch.status && !TERMINAL.has(patch.status)) task.status = patch.status;
      if (TERMINAL.has(patch.status)) { task.status = patch.status; task.finishedAt = Date.now(); }
      if ("result" in patch) task.result = patch.result;
      if ("error" in patch) task.error = patch.error;
      return publicView(task);
    });
  }

  /** Marks a running task as cancelled and asks the owning process to abort it. */
  requestCancel(id) {
    return this.#mutate(tasks => {
      const task = tasks.find(candidate => candidate.id === id);
      if (!task) return null;
      if (TERMINAL.has(task.status)) return publicView(task);
      task.cancelRequested = true;
      return publicView(task);
    });
  }

  isCancelRequested(id) {
    return Boolean(readAll(this.file).find(task => task.id === id)?.cancelRequested);
  }

  get(id) { const task = readAll(this.file).find(candidate => candidate.id === id); return task ? publicView(task) : null; }
  list() { return readAll(this.file).map(publicView); }
  taskPath() { return this.file; }
}
