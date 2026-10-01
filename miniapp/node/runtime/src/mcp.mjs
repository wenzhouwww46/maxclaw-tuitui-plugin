import { createServiceManager } from "./service.mjs";

export const TOOLS = [
  ["maxclaw_settings_open", "Open the local maxclaw settings page.", { type: "object", properties: {}, additionalProperties: false }],
  ["maxclaw_status", "Show listener and task status (credentials are redacted).", { type: "object", properties: {}, additionalProperties: false }],
  ["maxclaw_listener_start", "Start the listener explicitly.", { type: "object", properties: {}, additionalProperties: false }],
  ["maxclaw_listener_stop", "Stop the listener explicitly.", { type: "object", properties: {}, additionalProperties: false }],
  ["maxclaw_task_status", "Inspect a task.", { type: "object", properties: { id: { type: "string" } }, additionalProperties: false }],
  ["maxclaw_task_cancel", "Cancel a task.", { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false }],
].map(([name, description, inputSchema]) => ({ name, description, inputSchema }));

export function createMcpHandler(manager = createServiceManager()) {
  const call = async (name, args = {}) => {
    switch (name) {
      case "maxclaw_settings_open": return manager.settingsOpen();
      case "maxclaw_status": return manager.status();
      case "maxclaw_listener_start": return manager.listenerStart(args);
      case "maxclaw_listener_stop": return manager.listenerStop();
      case "maxclaw_task_status": {
        const task = manager.taskStatus(args.id);
        if (args.id != null && args.id !== "" && !task) throw new Error(`unknown task: ${args.id}`);
        return task;
      }
      case "maxclaw_task_cancel": {
        const task = manager.taskCancel(args.id);
        if (!task) throw new Error(`unknown task: ${args.id}`);
        return task;
      }
      default: throw new Error(`unknown tool: ${name}`);
    }
  };
  return async (request) => {
    if (request.method === "initialize") return { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "maxclaw-tuitui", version: "1.0.0" } };
    if (request.method === "notifications/initialized") return null;
    if (request.method === "tools/list") return { tools: TOOLS };
    if (request.method === "tools/call") {
      try { const value = await call(request.params?.name, request.params?.arguments || {}); return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false }; }
      catch (error) { return { content: [{ type: "text", text: error.message }], isError: true }; }
    }
    throw new Error(`method not found: ${request.method}`);
  };
}
