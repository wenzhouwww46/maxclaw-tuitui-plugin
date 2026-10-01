import { execFileSync } from "node:child_process";
import { platform as hostPlatform } from "node:os";

const MIN_NODE_MAJOR = 20;

function versionOf(value) {
  const match = String(value ?? "").match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? { major: Number(match[1]), minor: Number(match[2] ?? 0), patch: Number(match[3] ?? 0) } : null;
}

function run(command, args, runner) {
  try {
    return String(runner(command, args, { encoding: "utf8", timeout: 5000 })).trim();
  } catch {
    return null;
  }
}

function findMcode(platform, runner) {
  const locator = platform === "win32" ? "where.exe" : "which";
  const output = run(locator, [platform === "win32" ? "mcode.exe" : "mcode"], runner);
  return output?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export function checkRuntime({ platform = hostPlatform(), nodeVersion = process.version, mcodePath, runner = execFileSync } = {}) {
  const node = versionOf(nodeVersion);
  const nodeOk = Boolean(node && node.major >= MIN_NODE_MAJOR);
  const executable = mcodePath || findMcode(platform, runner);
  const mcodeVersion = executable ? run(executable, ["--version"], runner) : null;
  const mcodeOk = Boolean(executable && mcodeVersion);
  const checks = [
    {
      name: "node",
      ok: nodeOk,
      version: node ? `v${node.major}.${node.minor}.${node.patch}` : null,
      reason: node ? (nodeOk ? null : `Node.js ${MIN_NODE_MAJOR}+ is required`) : "Node.js was not detected",
    },
    {
      name: "mcode",
      ok: mcodeOk,
      path: executable,
      version: mcodeVersion,
      reason: executable ? (mcodeOk ? null : "MiniMax Code CLI did not respond to --version") : "MiniMax Code CLI was not found",
    },
  ];
  const nextSteps = [];
  if (!nodeOk) nextSteps.push(platform === "win32" ? "Install Node.js 20 LTS or newer, then restart MiniMax Code." : "Install Node.js 20 LTS or newer, then restart MiniMax Code.");
  if (!mcodeOk) nextSteps.push("Install or enable the MiniMax Code CLI and ensure mcode is on PATH; run mcode --version to verify.");
  return { ready: checks.every((check) => check.ok), platform, checks, nextSteps };
}

export { versionOf };
