import { homedir, platform as hostPlatform } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync, chmodSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readPublicConfig, readCredentials, paths as storePaths } from "./store.mjs";
import { startSettings } from "./settings.mjs";
import { startListener as defaultStartListener } from "./listener.mjs";
import { TaskStore } from "./tasks.mjs";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const quote = (value) => String(value).replaceAll("'", "'\\''");

export function serviceArtifact({ platform = hostPlatform(), nodePath = process.execPath, serverPath = join(PACKAGE_ROOT, "server.js"), home = homedir() } = {}) {
  if (platform === "darwin") {
    const label = "com.maxclaw.tuitui";
    const path = join(home, "Library", "LaunchAgents", `${label}.plist`);
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${nodePath}</string><string>${serverPath}</string><string>--listener-service</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n`;
    return { platform, path, content, install: "launchd", command: ["launchctl", "bootstrap", "gui/$UID", path] };
  }
  if (platform === "win32") {
    const path = join(process.env.APPDATA || join(home, "AppData", "Roaming"), "MaxClaw", "maxclaw-tuitui-start.cmd");
    const content = `@echo off\n"${nodePath}" "${serverPath}" --listener-service\n`;
    return { platform, path, content, install: "login-startup", command: ["explorer.exe", path] };
  }
  const path = join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "systemd", "user", "maxclaw-tuitui.service");
  const content = `[Unit]\nDescription=maxclaw Tuitui listener\n[Service]\nExecStart=${quote(nodePath)} ${quote(serverPath)} --listener-service\nRestart=on-failure\n[Install]\nWantedBy=default.target\n`;
  return { platform, path, content, install: "systemd-user", command: ["systemctl", "--user", "enable", "--now", "maxclaw-tuitui.service"] };
}

export function createServiceManager(options = {}) {
  const startListener = options.startListener || defaultStartListener;
  let listener = null;
  let listenerProcess = null;
  let settings = null;
  const tasks = options.tasks || new TaskStore();
  async function readEndpoint(endpointFile) {
    try {
      const value = JSON.parse(readFileSync(endpointFile, "utf8"));
      if (!value?.url) return null;
      const response = await fetch(value.url, { signal: AbortSignal.timeout(500) });
      return response.ok ? value : null;
    } catch { return null; }
  }
  async function waitForEndpoint(endpointFile, child) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const value = await readEndpoint(endpointFile);
      if (value) return value;
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("settings page service did not start");
  }
  const manager = {
    async settingsOpen() {
      if (settings?.url && await readEndpoint(storePaths().settingsEndpoint)) return { url: settings.url };
      const endpointFile = storePaths().settingsEndpoint;
      const existing = await readEndpoint(endpointFile);
      if (existing) { settings = existing; return { url: existing.url }; }
      try { unlinkSync(endpointFile); } catch {}
      if (options.startSettings) { settings = await options.startSettings(); return { url: settings.url }; }
      const child = spawn(process.execPath, [join(PACKAGE_ROOT, "server.js"), "--settings-service"], {
        stdio: "ignore", detached: true, env: { ...process.env, MAXCLAW_TUITUI_SETTINGS_ENDPOINT_FILE: endpointFile },
      });
      child.unref?.();
      const endpoint = await waitForEndpoint(endpointFile, child);
      settings = endpoint;
      return { url: endpoint.url };
    },
    status() {
      if (options.startListener && listener) {
        const state = listener.status?.() || { closed: false, running: true, queued: 0 };
        return { listener: { running: !state.closed, ...state }, configured: Boolean(readCredentials()), config: readPublicConfig(), tasks: tasks.list() };
      }
      const pidFile = storePaths().listenerPid;
      let pid = 0;
      try { pid = Number(readFileSync(pidFile, "utf8")); process.kill(pid, 0); }
      catch { pid = 0; }
      if (pid > 0) {
        listenerProcess = { pid, kill: signal => process.kill(pid, signal) };
        listener = { status: () => ({ closed: false, running: true, queued: 0 }) };
      } else {
        listenerProcess = null;
        listener = null;
      }
      const listenerStatus = listener?.status?.() || { running: false, closed: false, queued: 0 };
      return { listener: { running: Boolean(pid), ...listenerStatus }, configured: Boolean(readCredentials()), config: readPublicConfig(), tasks: tasks.list() };
    },
    async listenerStart(config = {}) {
      if (manager.status().listener.running) return manager.status();
      const credentials = readCredentials();
      if (!credentials) throw new Error("Tuitui credentials are not configured");
      if (options.startListener) {
        listener = await startListener({ ...readPublicConfig(), ...config, ...credentials }, { ...(options.dependencies || {}), tasks });
        return { ...manager.status(), listener: { running: true, ...(listener.status?.() || {}) } };
      }
      const child = (options.spawn || spawn)(process.execPath, [join(PACKAGE_ROOT, "server.js"), "--listener-service"], { stdio: "ignore", detached: true });
      child.unref?.();
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const current = manager.status();
        if (current.listener.running) return current;
        if (child.exitCode !== null) throw new Error(`Tuitui listener exited during startup (code ${child.exitCode})`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error("Tuitui listener did not become ready");
    },
    async listenerStop() {
      if (options.startListener && listener) {
        await listener.close?.();
        listener = null;
        return manager.status();
      }
      const current = manager.status();
      if (current.listener.running && listenerProcess?.pid) {
        const pid = listenerProcess.pid;
        try { process.kill(pid, "SIGTERM"); } catch (error) { if (error?.code !== "ESRCH") throw error; }
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline && manager.status().listener.running) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (manager.status().listener.running) throw new Error("Tuitui listener did not stop");
      } else if (listener?.close) {
        await listener.close(); listener = null;
      }
      return manager.status();
    },
    taskStatus(id) { if (id == null || id === "") return tasks.list(); return tasks.get(String(id)); },
    taskCancel(id) { return tasks.requestCancel(String(id)); },
    serviceArtifact(platformOptions = {}) { return serviceArtifact(platformOptions); },
    installArtifact(platformOptions = {}) { const artifact = serviceArtifact(platformOptions); mkdirSync(dirname(artifact.path), { recursive: true, mode: 0o700 }); writeFileSync(artifact.path, artifact.content, { mode: 0o700 }); chmodSync(artifact.path, 0o700); return artifact; },
  };
  return manager;
}

export { storePaths };
