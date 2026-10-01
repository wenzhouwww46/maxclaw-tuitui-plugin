const HIGH_RISK = [
  /\b(rm\s+-rf|del\s+\/|format\s+disk|drop\s+database|delete\s+all)\b/i,
  /(删除全部|清空数据库|销毁|破坏性删除|读取.*(密码|密钥|凭证)|访问.*(密码|密钥|token))/i,
  /\b(git\s+(push|merge)|push\s+to|deploy|purchase|buy|send\s+(email|message|money))\b/i,
  /(发送邮件|发送消息|付款|购买|部署上线|推送代码|合并分支)/i,
];
export function preflight(prompt) {
  if (typeof prompt !== "string") return { allowed: false, reason: "invalid prompt" };
  const matched = HIGH_RISK.find(pattern => pattern.test(prompt));
  return matched ? { allowed: false, reason: "为保护所有用户，已阻止可能造成破坏、凭据访问或外部发送/购买/部署的高风险请求；请在受控环境中由人工确认并执行。" } : { allowed: true };
}
