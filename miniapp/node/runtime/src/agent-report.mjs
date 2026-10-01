function safe(value, max = 1200) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/(?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*\S+/gi, "$1: [REDACTED]").slice(0, max);
  try { return JSON.stringify(value).replace(/(?:api[_-]?key|secret|token|password|authorization)("?\s*[:=]\s*"?)[^,}\s]+/gi, "$1[REDACTED]").slice(0, max); } catch { return "[unserializable]"; }
}

export function createAgentReporter(client, body, options = {}) {
  const api = client?.agent;
  if (!api?.report) return { enabled: false, received() {}, input() {}, output() {}, beforeTool() {}, afterTool() {}, end() {} };
  let context;
  try { context = api.contextFromMessage(body); } catch { context = null; }
  if (!context) return { enabled: false, received() {}, input() {}, output() {}, beforeTool() {}, afterTool() {}, end() {} };
  const call = (name, data) => { try { api.report[name]?.(context, data); } catch {} };
  return {
    enabled: true,
    received() { call("message_received", {}); },
    input(prompt) { call("llm_input", { model: options.model || "MiniMax Code", prompt: safe(prompt, 800) }); },
    output(text) { call("llm_output", { assistantTexts: [], thinking: safe(text, 800), usage: {} }); },
    beforeTool(toolName, params) { call("before_tool_call", { toolCallId: `${options.runId || "run"}-tool`, toolName: safe(toolName, 120), params: safe(params, 800) }); },
    afterTool(toolName, result) { call("after_tool_call", { toolCallId: `${options.runId || "run"}-tool`, toolName: safe(toolName, 120), result: safe(result, 1000) }); },
    end(result) { call("agent_end", { status: result?.status || "unknown" }); },
  };
}
