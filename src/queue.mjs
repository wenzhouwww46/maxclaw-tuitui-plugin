export class BoundedRouteQueue {
  constructor({ concurrency = 2, maxQueue = 32 } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.maxQueue = Math.max(0, Number(maxQueue) || 0);
    this.pending = [];
    this.active = 0;
    this.routes = new Map();
    this.closed = false;
  }

  enqueue(route, task) {
    if (this.closed) return Promise.reject(new Error("queue is closed"));
    if (this.pending.length >= this.maxQueue) return Promise.reject(new Error("queue capacity exceeded"));
    if (typeof task !== "function") return Promise.reject(new TypeError("task must be a function"));
    return new Promise((resolve, reject) => {
      const item = { route, task, resolve, reject };
      const tail = this.routes.get(route);
      if (tail) { tail.next = item; item.prev = tail; }
      else this.routes.set(route, item);
      this.pending.push(item);
      this.#pump();
    });
  }

  close() {
    this.closed = true;
    for (const item of this.pending.splice(0)) item.reject(new Error("queue is closed"));
    return this.waitForIdle();
  }
  waitForIdle() { return this.active ? new Promise(resolve => { const check = () => this.active ? setTimeout(check, 10) : resolve(); check(); }) : Promise.resolve(); }
  get size() { return this.pending.length; }
  get running() { return this.active; }

  #pump() {
    while (this.active < this.concurrency) {
      const item = this.pending.find((candidate) => !candidate.started && (!candidate.prev || candidate.prev.done));
      if (!item) return;
      item.started = true;
      this.pending.splice(this.pending.indexOf(item), 1);
      this.active++;
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => {
        item.done = true;
        this.active--;
        if (this.routes.get(item.route) === item) this.routes.delete(item.route);
        else if (item.next) this.routes.set(item.route, item.next);
        this.#pump();
      });
    }
  }
}

export class PersistentDedupe {
  constructor({ file, windowMs = 24 * 60 * 60 * 1000, maxEntries = 4096, now = () => Date.now() } = {}) {
    this.file = file || path.join(DATA_DIR, "dedupe.json");
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
    this.#load();
  }
  seen(id) {
    if (id == null || id === "") return false;
    this.#prune();
    const key = String(id);
    if (this.entries.has(key)) return true;
    this.entries.set(key, this.now());
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    this.#save();
    return false;
  }
  #prune() {
    const cutoff = this.now() - this.windowMs;
    for (const [key, time] of this.entries) if (time < cutoff) this.entries.delete(key);
  }
  #load() {
    if (!this.file) return;
    try {
      const parsed = JSON.parse(requireUnavailableRead(this.file));
      if (Array.isArray(parsed)) for (const item of parsed) if (Array.isArray(item) && typeof item[0] === "string") this.entries.set(item[0], Number(item[1]));
      this.#prune();
    } catch { /* absent or malformed state is treated as empty */ }
  }
  #save() {
    if (!this.file) return;
    try {
      const { mkdirSync, writeFileSync, renameSync } = requireFs();
      const { dirname } = requirePath();
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const temp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify([...this.entries]) + "\n", { mode: 0o600 });
      renameSync(temp, this.file);
    } catch { /* dedupe remains effective for this process */ }
  }
}

// Keep imports out of the public plugin configuration surface while remaining ESM-safe.
import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "./store.mjs";
const requireUnavailableRead = readFileSync;
const requireFs = () => fs;
const requirePath = () => path;
