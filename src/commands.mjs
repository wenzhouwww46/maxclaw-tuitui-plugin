const HELP = `可用命令：
/帮助 查看帮助
/状态 查看 Listener 和任务状态
/取消 取消当前路由最近运行中的任务
/新会话 清除当前路由的 Agent Session
/任务 查看最近任务列表`;

export function parseCommand(text) {
  const match = String(text || "").trim().match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), args: match[2]?.trim() || "" } : null;
}

export function commandHelp() { return HELP; }
export function isCommand(text) { return Boolean(parseCommand(text)); }

export async function runCommand(command, { route, tasks, clearSession, status } = {}) {
  if (!command) return null;
  switch (command.name) {
    case "帮助": case "help": return { text: HELP };
    case "状态": case "status": return { text: typeof status === "function" ? JSON.stringify(status(), null, 2) : "状态不可用" };
    case "任务": case "tasks": return { text: JSON.stringify(tasks?.list?.() || [], null, 2) };
    case "取消": case "cancel": {
      const task = (tasks?.list?.() || []).reverse().find(item => item.route === route && item.status === "running");
      return task ? { text: `已请求取消任务：${task.id}`, taskId: task.id, cancel: tasks.requestCancel(task.id) } : { text: "当前没有运行中的任务。" };
    }
    case "新会话": case "new": case "new-session":
      if (typeof clearSession === "function") clearSession(route);
      return { text: "已清除当前会话，下条消息将开始新的 Agent 会话。" };
    default: return { text: `未知命令 /${command.name}。\n\n${HELP}` };
  }
}

export function mediaItems(client, data) {
  const result = [];
  const detailed = client?.event?.getDetailedMessageMedia?.(data);
  if (Array.isArray(detailed)) result.push(...detailed);
  const raw = [data?.images, data?.voice, data?.video, data?.file].flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  for (const value of raw) {
    const url = typeof value === "string" ? value : value?.url;
    if (url && !result.some(item => item.url === url)) result.push({ url, mimeType: typeof value === "object" ? value.mime_type : undefined, name: typeof value === "object" ? (value.filename || value.name) : undefined });
  }
  return result;
}
