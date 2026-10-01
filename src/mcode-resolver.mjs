import { readFileSync, realpathSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { spawnSync } from "node:child_process";
function which(cmd) { const r = spawnSync(platform() === "win32" ? "where" : "which", [cmd], { encoding: "utf8" }); return r.status === 0 ? (r.stdout || "").trim().split(/\r?\n/)[0] : null; }
function candidates() { const home = homedir(); return platform() === "win32" ? [join(process.env.APPDATA || join(home, "AppData", "Roaming"), "npm", "mcode.cmd")] : [join(home, ".local", "bin", "mcode"), "/usr/local/bin/mcode", "/opt/homebrew/bin/mcode", join(home, ".npm-global", "bin", "mcode"), join(home, "bin", "mcode")]; }
export function resolveMcode(explicit) {
  let p = explicit && explicit !== "auto" ? explicit : (which("mcode") || candidates().find(existsSync));
  if (!p) return { error: "PATH 上找不到 mcode 命令（请先安装 MiniMax Code CLI）" };
  if (explicit && explicit !== "auto" && !existsSync(p)) return { error: `配置的 mcode.path 不存在: ${p}` };
  if (/\.cmd$/i.test(p)) { const pkg = join(dirname(dirname(p)), "node_modules", "@minimax-ai", "code", "package.json"); try { const bin = JSON.parse(readFileSync(pkg, "utf8")).bin || {}; const rel = typeof bin.mcode === "string" ? bin.mcode : bin.mcode?.mcode; if (rel) return { entry: join(dirname(pkg), rel), source: p }; } catch {} return { error: `无法从 ${p} 解析出 MiniMax Code 包入口` }; }
  let real = p; try { real = realpathSync(p); } catch {}
  try { const head = readFileSync(real, "utf8").slice(0, 200); if (/\.[cm]?js$/i.test(real) || /^#!.*node/.test(head)) return { entry: real, source: p }; } catch {}
  return { error: `${p} 不是可识别的 mcode 入口` };
}
