import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const DATA_DIR = process.env.MAXCLAW_TUITUI_DATA_DIR || join(homedir(), ".maxclaw-tuitui");
const CONFIG_FILE = join(DATA_DIR, "config.json");
const CREDENTIALS_FILE = join(DATA_DIR, "credentials.json");

function ensureDir() { mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); }
function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error("stored configuration is invalid");
  }
}
function atomicWrite(path, value, mode = 0o600) {
  ensureDir();
  const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode });
  chmodSync(temp, mode);
  renameSync(temp, path);
  chmodSync(path, mode);
}
function requiredText(value, name, max = 512) {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

export function saveCredentials({ appid, secret } = {}) {
  appid = requiredText(appid, "appid", 256);
  secret = requiredText(secret, "secret", 4096);
  atomicWrite(CREDENTIALS_FILE, { appid, secret }, 0o600);
}

export function readCredentials() {
  const value = readJson(CREDENTIALS_FILE, null);
  if (!value) return null;
  if (typeof value.appid !== "string" || typeof value.secret !== "string") throw new Error("stored credentials are invalid");
  return value;
}

export function saveConfig(config = {}) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) throw new TypeError("config must be an object");
  const allowed = { ...config };
  delete allowed.secret;
  delete allowed.credentials;
  atomicWrite(CONFIG_FILE, allowed, 0o600);
}

export function readPublicConfig() {
  const config = readJson(CONFIG_FILE, {});
  const credentials = readCredentials();
  return {
    ...config,
    credentials: { configured: Boolean(credentials), appid: credentials?.appid ? redact(credentials.appid) : null },
  };
}

function redact(value) {
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function paths() { return { dataDir: DATA_DIR, config: CONFIG_FILE, credentials: CREDENTIALS_FILE, listenerPid: join(DATA_DIR, "listener.pid") }; }
export function resetForTests() { for (const path of [CONFIG_FILE, CREDENTIALS_FILE]) { try { requireNotAvailable(path); } catch {} } }
function requireNotAvailable(path) { if (existsSync(path)) throw new Error("resetForTests is not supported in production"); }
