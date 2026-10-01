import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const DEFAULT_DATA_DIR = join(homedir(), ".maxclaw-tuitui");
export const DATA_DIR = process.env.MAXCLAW_TUITUI_DATA_DIR || DEFAULT_DATA_DIR;

function createStoreForDirectory(dataDir) {
  const configFile = join(dataDir, "config.json");
  const credentialsFile = join(dataDir, "credentials.json");

  function ensureDir() { mkdirSync(dataDir, { recursive: true, mode: 0o700 }); }
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
  function saveCredentials({ appid, secret } = {}) {
    appid = requiredText(appid, "appid", 256);
    secret = requiredText(secret, "secret", 4096);
    atomicWrite(credentialsFile, { appid, secret }, 0o600);
  }
  function readCredentials() {
    const value = readJson(credentialsFile, null);
    if (!value) return null;
    if (typeof value.appid !== "string" || typeof value.secret !== "string") throw new Error("stored credentials are invalid");
    return value;
  }
  function saveConfig(config = {}) {
    if (config === null || typeof config !== "object" || Array.isArray(config)) throw new TypeError("config must be an object");
    const allowed = { ...config };
    delete allowed.secret;
    delete allowed.credentials;
    atomicWrite(configFile, allowed, 0o600);
  }
  function readPublicConfig() {
    const config = readJson(configFile, {});
    const credentials = readCredentials();
    return {
      ...config,
      credentials: { configured: Boolean(credentials), appid: credentials?.appid ? redact(credentials.appid) : null },
    };
  }
  function paths() { return { dataDir, config: configFile, credentials: credentialsFile, listenerPid: join(dataDir, "listener.pid"), settingsEndpoint: join(dataDir, "settings-endpoint.json") }; }
  function resetForTests() { for (const path of [configFile, credentialsFile]) { try { requireNotAvailable(path); } catch {} } }
  return { saveCredentials, readCredentials, saveConfig, readPublicConfig, paths, resetForTests };
}

const defaultStore = createStoreForDirectory(DATA_DIR);
export const saveCredentials = defaultStore.saveCredentials;
export const readCredentials = defaultStore.readCredentials;
export const saveConfig = defaultStore.saveConfig;
export const readPublicConfig = defaultStore.readPublicConfig;
export const paths = defaultStore.paths;
export const resetForTests = defaultStore.resetForTests;
export function createStore(dataDir = DATA_DIR) { return createStoreForDirectory(dataDir); }

function redact(value) {
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function requireNotAvailable(path) { if (existsSync(path)) throw new Error("resetForTests is not supported in production"); }
