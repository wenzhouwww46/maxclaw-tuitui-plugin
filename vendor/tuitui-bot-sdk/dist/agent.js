import { randomUUID } from "node:crypto";
const DEFAULT_CHANNEL_ID = "tuitui";
export const TUITUI_AGENT_EVENT = Object.freeze({
    MESSAGE_RECEIVED: "message_received",
    LLM_INPUT: "llm_input",
    LLM_OUTPUT: "llm_output",
    BEFORE_TOOL_CALL: "before_tool_call",
    AFTER_TOOL_CALL: "after_tool_call",
    SUBAGENT_SPAWNED: "subagent_spawned",
    SUBAGENT_ENDED: "subagent_ended",
    AGENT_END: "agent_end",
});
/** Agent 执行中间步骤的上下文构造与上报 API。 */
export class TuituiAgentApi {
    http;
    config;
    report;
    queue = [];
    consuming = false;
    lastGeneratedTimestamp = 0;
    constructor(http, config) {
        this.http = http;
        this.config = config;
        const legacy = ((event, context, data) => this.enqueue(event, context, data));
        Object.assign(legacy, {
            message_received: (context) => this.enqueue(TUITUI_AGENT_EVENT.MESSAGE_RECEIVED, context, {}),
            llm_input: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.LLM_INPUT, context, data),
            llm_output: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.LLM_OUTPUT, context, data),
            before_tool_call: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.BEFORE_TOOL_CALL, context, data),
            after_tool_call: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.AFTER_TOOL_CALL, context, data),
            subagent_spawned: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.SUBAGENT_SPAWNED, context, data),
            subagent_ended: (context, data) => this.enqueue(TUITUI_AGENT_EVENT.SUBAGENT_ENDED, context, data),
            agent_end: (context) => this.enqueue(TUITUI_AGENT_EVENT.AGENT_END, context, {}),
        });
        this.report = Object.freeze(legacy);
    }
    contextFromMessage(event) {
        const eventName = event.event;
        if (eventName === "single_chat") {
            return this.buildContext({
                target: { type: "direct", account: event.user_account },
                messageId: messageMessageId(event),
            });
        }
        if (eventName === "group_chat") {
            const data = event.data;
            const groupId = stringValue(data.group_id) || stringValue(event.group_id);
            return this.buildContext({
                target: { type: "group", groupId },
                messageId: messageMessageId(event),
            });
        }
        if (eventName === "teams_post_create") {
            const data = event.data;
            const postId = stringValue(data.post_id);
            const isReply = data.is_reply === true;
            const parentPostId = isReply ? stringValue(data.parent_id) : undefined;
            if (isReply && (!parentPostId || parentPostId === "0")) {
                throw new Error("[tuitui] teams reply data.parent_id is required");
            }
            return this.buildContext({
                target: {
                    type: "channel",
                    channelId: stringValue(data.channel_id),
                    postId,
                    ...(parentPostId ? { parentPostId } : {}),
                },
                messageId: postId,
            });
        }
        throw new Error(`[tuitui] unsupported Agent message event: ${eventName}`);
    }
    contextFromRoute(options) {
        return Object.freeze({
            sessionKey: options.sessionKey,
            messageId: options.messageId,
            runId: options.runId,
        });
    }
    buildContext(options) {
        const appId = sessionKeyPart(this.config.appId, "appId");
        const channelId = DEFAULT_CHANNEL_ID;
        const messageId = requiredString(options.messageId, "messageId");
        let sessionKey;
        switch (options.target.type) {
            case "direct": {
                const account = sessionKeyPart(options.target.account, "target.account");
                sessionKey = `agent:${appId}:${channelId}:direct:${account}`;
                break;
            }
            case "group": {
                const groupId = sessionKeyPart(options.target.groupId, "target.groupId");
                sessionKey = `agent:${appId}:${channelId}:group:${groupId}`;
                break;
            }
            case "channel": {
                const chatId = sessionKeyPart(options.target.channelId, "target.channelId");
                const postId = sessionKeyPart(options.target.postId, "target.postId");
                const threadId = options.target.parentPostId !== undefined
                    ? sessionKeyPart(options.target.parentPostId, "target.parentPostId")
                    : postId;
                sessionKey = `agent:${appId}:${channelId}:channel:${chatId}:thread:${threadId}`;
                break;
            }
        }
        return Object.freeze({ sessionKey, messageId, runId: randomUUID() });
    }
    buildSubagentContext(options) {
        const appId = sessionKeyPart(this.config.appId, "appId");
        const requesterSessionKey = requiredString(options.parentContext.sessionKey, "parentContext.sessionKey");
        validateRoutableSessionKey(requesterSessionKey);
        requiredString(options.parentContext.runId, "parentContext.runId");
        const messageId = requiredString(options.parentContext.messageId, "parentContext.messageId");
        const subagentId = sessionKeyPart(options.subagentId ?? randomUUID(), "subagentId");
        return Object.freeze({
            sessionKey: `agent:${appId}:subagent:${subagentId}`,
            requesterSessionKey,
            runId: randomUUID(),
            messageId,
        });
    }
    enqueue(event, context, data) {
        try {
            const payload = this.toPayload(event, context, data);
            this.queue.push({ payload });
            if (!this.consuming)
                void this.consume();
        }
        catch (error) {
            this.log("error", "[tuitui] Agent event report failed", { event, error });
        }
    }
    toPayload(event, context, data) {
        const appId = requiredString(this.config.appId, "appId");
        const normalizedData = normalizeEventData(event, data);
        validateEvent(event, normalizedData);
        const timestamp = this.nextTimestamp();
        let serialized;
        try {
            serialized = JSON.stringify(normalizedData);
        }
        catch (cause) {
            throw new Error(`[tuitui] cannot serialize Agent event ${event}`, { cause });
        }
        if (serialized === undefined) {
            throw new Error(`[tuitui] cannot serialize Agent event ${event}`);
        }
        if (!isRecord(JSON.parse(serialized))) {
            throw new Error("[tuitui] data must serialize to a JSON object");
        }
        return {
            event,
            timestamp,
            plugin: DEFAULT_CHANNEL_ID,
            accountId: appId,
            appId,
            ctx: context,
            data: serialized,
        };
    }
    nextTimestamp() {
        const timestamp = Math.max(Date.now(), this.lastGeneratedTimestamp + 1);
        this.lastGeneratedTimestamp = timestamp;
        return timestamp;
    }
    async consume() {
        if (this.consuming)
            return;
        this.consuming = true;
        try {
            while (this.queue.length > 0) {
                const job = this.queue.shift();
                try {
                    await this.http.post("/openclaw/report", [job.payload]);
                }
                catch (error) {
                    this.log("error", "[tuitui] Agent event report failed", {
                        event: job.payload.event,
                        error,
                    });
                }
            }
        }
        finally {
            this.consuming = false;
        }
    }
    log(level, message, context) {
        try {
            this.config.logger?.[level]?.(message, context);
        }
        catch {
            // 用户提供的 logger 不得中断后台上报队列。
        }
    }
}
function messageMessageId(event) {
    return stringValue(event.data.msgid);
}
function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
}
function requiredString(value, field) {
    if (typeof value !== "string")
        throw new Error(`[tuitui] ${field} is required`);
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`[tuitui] ${field} is required`);
    return normalized;
}
function sessionKeyPart(value, field) {
    const normalized = requiredString(value, field);
    if (normalized.includes(":")) {
        throw new Error(`[tuitui] ${field} must not contain ':'`);
    }
    return normalized;
}
function validateEvent(event, data) {
    if (!Object.values(TUITUI_AGENT_EVENT).includes(event)) {
        throw new Error(`[tuitui] unsupported Agent event: ${event}`);
    }
    if (event === TUITUI_AGENT_EVENT.BEFORE_TOOL_CALL || event === TUITUI_AGENT_EVENT.AFTER_TOOL_CALL) {
        requiredString(data.toolCallId, "data.toolCallId");
        requiredString(data.toolName, "data.toolName");
    }
    validateEventData(event, data);
}
function validateSessionKey(sessionKey) {
    const parts = sessionKey.split(":");
    if (parts[0] !== "agent" || !parts[1]) {
        throw new Error("[tuitui] ctx.sessionKey has an invalid Agent prefix");
    }
    if (parts.length === 4 && parts[2] === "subagent" && parts[3])
        return;
    validateRoutableSessionKey(sessionKey);
}
function validateSubagentSessionKey(sessionKey) {
    const parts = sessionKey.split(":");
    if (parts.length !== 4 || parts[0] !== "agent" || !parts[1]
        || parts[2] !== "subagent" || !parts[3]) {
        throw new Error("[tuitui] ctx.sessionKey must identify a subagent");
    }
}
function validateEventData(event, data) {
    if (!isRecord(data)) {
        throw new Error("[tuitui] data must be an object");
    }
    switch (event) {
        case TUITUI_AGENT_EVENT.MESSAGE_RECEIVED:
            break;
        case TUITUI_AGENT_EVENT.LLM_INPUT:
            requiredString(data.model, "data.model");
            requiredString(data.prompt, "data.prompt");
            break;
        case TUITUI_AGENT_EVENT.LLM_OUTPUT: {
            if (!Array.isArray(data.assistantTexts)) {
                throw new Error("[tuitui] data.assistantTexts must be an array");
            }
            if (typeof data.thinking !== "string") {
                throw new Error("[tuitui] data.thinking must be a string");
            }
            if (!isRecord(data.usage)) {
                throw new Error("[tuitui] data.usage is required");
            }
            for (const field of ["input", "output", "cacheRead", "total"]) {
                requiredNumber(data.usage[field], `data.usage.${field}`);
            }
            if (data.usage.cacheWrite !== undefined) {
                requiredNumber(data.usage.cacheWrite, "data.usage.cacheWrite");
            }
            break;
        }
        case TUITUI_AGENT_EVENT.AFTER_TOOL_CALL:
            if (!("result" in data) || data.result === undefined) {
                throw new Error("[tuitui] data.result is required");
            }
            break;
        case TUITUI_AGENT_EVENT.SUBAGENT_ENDED:
            if (!["ok", "error", "cancelled"].includes(data.outcome)) {
                throw new Error("[tuitui] data.outcome is invalid");
            }
            break;
    }
}
function normalizeEventData(event, data) {
    if (event !== TUITUI_AGENT_EVENT.LLM_OUTPUT)
        return data;
    const usage = isRecord(data.usage) ? data.usage : {};
    const input = usage.input === undefined ? 0 : usage.input;
    const output = usage.output === undefined ? 0 : usage.output;
    return {
        ...data,
        usage: {
            ...usage,
            input,
            output,
            cacheRead: usage.cacheRead === undefined ? 0 : usage.cacheRead,
            total: usage.total === undefined && typeof input === "number" && typeof output === "number"
                ? input + output : usage.total,
        },
    };
}
function requiredNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`[tuitui] ${field} must be a finite number`);
    }
    return value;
}
function validateRoutableSessionKey(sessionKey) {
    const parts = sessionKey.split(":");
    const channel = parts.length >= 7
        && parts[0] === "agent"
        && Boolean(parts[1])
        && Boolean(parts[2])
        && parts[3] === "channel"
        && Boolean(parts[4])
        && parts[5] === "thread"
        && Boolean(parts[6]);
    const group = parts.length >= 5
        && parts[0] === "agent"
        && Boolean(parts[1])
        && Boolean(parts[2])
        && parts[3] === "group"
        && Boolean(parts[4]);
    const directIndex = parts.indexOf("direct", 3);
    const direct = parts[0] === "agent"
        && Boolean(parts[1])
        && Boolean(parts[2])
        && directIndex >= 3
        && Boolean(parts[directIndex + 1]);
    if (!channel && !group && !direct) {
        throw new Error("[tuitui] sessionKey must identify a channel, group, or direct conversation");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=agent.js.map