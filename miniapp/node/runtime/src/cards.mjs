const COLORS = { blue: "#3873FA", red: "#FA5151", gray: "#666666" };

export function taskCard({ taskId, title, status = "执行中", prompt = "", detail = "" } = {}) {
  const actions = [];
  if (status === "执行中") actions.push({ text: "取消任务", name: "cancel", value: { taskId }, color: "FFFFFF", bgcolor: COLORS.red, confirm: { title: "取消任务", content: "确定取消当前 Agent 任务吗？", ok: "取消", cancel: "继续执行" } });
  if (status === "已完成" || status === "失败" || status === "已取消") actions.push({ text: "重新执行", name: "retry", value: { taskId }, color: "FFFFFF", bgcolor: COLORS.blue });
  return {
    head: { text: `maxclaw · ${status}`, bgcolor: status === "失败" ? COLORS.red : COLORS.blue, tcolor: "#FFFFFF" },
    body: { title: title || "MiniMax Code Agent", content: `${String(prompt).slice(0, 500)}${detail ? `\n\n${String(detail).slice(0, 1200)}` : ""}` },
    fields: [{ name: "任务 ID", text: taskId }],
    action: actions,
  };
}

export function cardAction(body) {
  const data = body?.data || body?.message || body || {};
  const value = data.value ?? data.action?.[0]?.value ?? data.fields?.find?.(x => x?.name === "taskId")?.value;
  const action = data.actionName || data.name || data.action?.[0]?.name || data.action?.[0]?.value || data.id;
  let parsed = value;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch {} }
  const taskId = typeof parsed === "object" && parsed ? parsed.taskId || parsed.id : (typeof parsed === "string" ? parsed : undefined);
  return { taskId, action: String(action || "").toLowerCase(), messageId: data.msgid || data.message_id || body?.msgid || body?.messageId };
}

export async function sendCard(client, target, card) {
  if (client?.im?.sendInteractive) return client.im.sendInteractive({ to: target, interactive: card });
  return null;
}

export async function updateCard(client, target, messageId, card) {
  if (!messageId || !client?.im?.modifyInteractive) return false;
  await client.im.modifyInteractive({ to: target, messageId, interactive: card });
  return true;
}
