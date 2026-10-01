import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const SESSION_FILE = process.env.MAXCLAW_TUITUI_SESSION_FILE ||
  join(process.env.MAXCLAW_TUITUI_DATA_DIR || join(homedir(), ".maxclaw-tuitui"), "sessions.json");

export function routeKey({ kind, id } = {}) {
  if (kind !== "group" && kind !== "user") throw new TypeError("kind must be group or user");
  if (typeof id !== "string" && typeof id !== "number") throw new TypeError("id must be a string or number");
  const value = String(id).trim();
  if (!value || value.length > 512 || /[\r\n]/.test(value)) throw new TypeError("id must be non-empty");
  return `${kind}:${value}`;
}

function readMap(file = SESSION_FILE) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("session mapping is invalid");
  }
}

export function getSession(route, file = SESSION_FILE) {
  return readMap(file)[route] || null;
}

export function setSession(route, sessionId, file = SESSION_FILE) {
  if (typeof route !== "string" || !route || typeof sessionId !== "string" || !sessionId.trim()) {
    throw new TypeError("route and sessionId are required");
  }
  const map = readMap(file);
  map[route] = sessionId;
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(map, null, 2) + "\n", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
  chmodSync(file, 0o600);
  return sessionId;
}

export function clearSession(route, file = SESSION_FILE) {
  const map = readMap(file);
  delete map[route];
  mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(map, null, 2) + "\n", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
  chmodSync(file, 0o600);
}

export function sessionPath() { return SESSION_FILE; }
