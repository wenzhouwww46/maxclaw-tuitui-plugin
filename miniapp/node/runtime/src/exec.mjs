import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolveMcode } from "./mcode-resolver.mjs";
import { getSession, setSession } from "./router.mjs";

function jsonResult(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("mcode returned malformed JSON");
  return value;
}

export function parseResult(text, exitCode) {
  let value;
  try { value = jsonResult(text); } catch (error) {
    return { status: exitCode === 0 ? "error" : "failed", output: "", error: error.message };
  }
  const status = exitCode === 0 ? (typeof value.status === "string" ? value.status : "success") : "failed";
  return {
    status,
    output: typeof value.output === "string" ? value.output : (typeof value.message === "string" ? value.message : ""),
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    runId: typeof value.runId === "string" ? value.runId : undefined,
    error: exitCode === 0 ? (typeof value.error === "string" ? value.error : undefined) : (value.error || `mcode exited with code ${exitCode}`),
  };
}

export async function execute(route, prompt, files = [], options = {}) {
  if (typeof route !== "string" || !route) throw new TypeError("route is required");
  if (typeof prompt !== "string") throw new TypeError("prompt must be a string");
  const started = Date.now();
  const runId = randomUUID();
  const progress = options.progress || {};
  progress.received?.();
  progress.input?.(prompt);
  progress.beforeTool?.("mcode exec", { route, files: Array.isArray(files) ? files.length : 0 });
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120_000;
  const resolved = options.entry ? { entry: options.entry } : resolveMcode(options.mcodePath);
  if (!resolved.entry) return { status: "error", output: "", sessionId: getSession(route, options.sessionFile), runId, durationMs: Date.now() - started, error: resolved.error || "mcode entry unavailable" };
  const sessionId = getSession(route, options.sessionFile);
  const args = [resolved.entry, "exec", sessionId ? "--session" : "--continue", ...(sessionId ? [sessionId] : []), "--output-format", "json", "--prompt-mode", "work", "--input", "-"];
  for (const file of Array.isArray(files) ? files : []) args.push("--file", String(file));
  const spawn = options.spawn || nodeSpawn;
  const signal = options.signal;
  let child;
  try { child = spawn(process.execPath, args, { cwd: options.cwd, env: options.env ? { ...process.env, ...options.env } : process.env, signal }); }
  catch (error) { return { status: "error", output: "", sessionId, runId, durationMs: Date.now() - started, error: error.message }; }
  let stdout = "", stderr = "", timedOut = false, cancelled = false;
  const timer = setTimeout(() => { timedOut = true; child.kill?.("SIGTERM"); }, timeoutMs);
  const cancel = () => { cancelled = true; child.kill?.("SIGTERM"); };
  if (signal) signal.addEventListener("abort", cancel, { once: true });
  try {
    child.stdout?.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.stdin?.end(prompt);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (timedOut || cancelled) return { status: timedOut ? "timeout" : "cancelled", output: "", sessionId, runId, durationMs: Date.now() - started, error: timedOut ? "execution timed out" : "execution cancelled" };
    const parsed = parseResult(stdout.trim(), code);
    const result = { ...parsed, sessionId: parsed.sessionId || sessionId, runId: parsed.runId || runId, durationMs: Date.now() - started };
    progress.output?.(result.output || result.error || result.status);
    if (code === 0 && result.sessionId && result.sessionId !== sessionId) setSession(route, result.sessionId, options.sessionFile);
    if (code !== 0 && !result.error && stderr) result.error = stderr.slice(0, 500);
    progress.afterTool?.("mcode exec", { status: result.status, durationMs: result.durationMs, output: result.output, error: result.error });
    progress.end?.(result);
    return result;
  } catch (error) {
    const result = { status: cancelled ? "cancelled" : "error", output: "", sessionId, runId, durationMs: Date.now() - started, error: error.message };
    progress.end?.(result);
    return result;
  } finally { clearTimeout(timer); if (signal) signal.removeEventListener("abort", cancel); }
}
