import { getDetailedTuituiMessageMedia, getTuituiMessageMedia, } from "./events.js";
import { formatTimestamp } from "./util_time.js";
import { subscribeTuitui } from "./websocket.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function renderBaseMessage(data) {
    const parts = [];
    const text = data.text;
    if (text)
        parts.push(text);
    const mediaIndexes = new Map();
    const appendMedia = (label, raw) => {
        const url = typeof raw === "string" ? raw : isRecord(raw) && typeof raw.url === "string" ? raw.url : "";
        if (!url)
            return;
        const name = isRecord(raw) && typeof raw.name === "string" ? raw.name : "";
        const line = name ? `[${label}] ${name}: ${url}` : `[${label}] ${url}`;
        const index = mediaIndexes.get(url);
        if (index !== undefined) {
            if (name)
                parts[index] = line;
            return;
        }
        mediaIndexes.set(url, parts.length);
        parts.push(line);
    };
    for (const image of data.images ?? []) {
        if (typeof image === "string")
            appendMedia("图片", image);
    }
    appendMedia("语音", data.voice);
    appendMedia("视频", data.video);
    appendMedia("文件", data.file);
    if (data.msg_type === "card" && data.card) {
        parts.push(`[名片]\n姓名: ${data.card.name ?? ""}\n推推账号: ${data.card.account ?? ""}`);
    }
    if (data.msg_type === "link" && data.link) {
        parts.push(`[网页链接]\n${data.link.title ?? ""}\n${data.link.url ?? ""}`);
    }
    if (data.msg_type === "merged" && data.merged) {
        const lines = [`[合并转发：${data.merged.source ?? "聊天记录"}]`];
        for (const message of data.merged.msgs ?? []) {
            lines.push("------");
            if (message.timestamp !== undefined)
                lines.push(`时间: ${formatTimestamp(message.timestamp)}`);
            const sender = message.user_name
                ? message.user_account && message.user_account !== message.user_name
                    ? `${message.user_name} (${message.user_account})`
                    : message.user_name
                : message.user_account || "unknown";
            lines.push(`发言人: ${sender}`, "内容：", ...renderMessage(message));
        }
        parts.push(lines.join("\n"));
    }
    return parts;
}
function renderMessage(message) {
    const parts = renderBaseMessage(message);
    if (message.ref) {
        const reference = renderMessage(message.ref).join("\n");
        if (message.ref.shared_post) {
            parts.push(`\n[原始背景信息参考如下]\n${reference}`);
        }
        else {
            const sender = message.ref.user_name
                ? message.ref.user_account && message.ref.user_account !== message.ref.user_name
                    ? `${message.ref.user_name} (${message.ref.user_account})`
                    : message.ref.user_name
                : message.ref.user_account || "unknown";
            parts.push(`\n[引用来自 ${sender} 的消息，内容如下]\n${reference}`);
        }
    }
    return parts;
}
export class TuituiEventApi {
    config;
    teams;
    SINGLE_CHAT_OPEN = "single_chat_open";
    SINGLE_CHAT = "single_chat";
    GROUP_CHAT = "group_chat";
    GROUP_CREATE = "group_create";
    GROUP_INVITE = "group_invite";
    GROUP_KICK = "group_kick";
    TEAMS_POST_CREATE = "teams_post_create";
    TEAMS_POST_MODIFY = "teams_post_modify";
    TEAMS_CHANNEL_CREATE = "teams_channel_create";
    TEAMS_TEAM_UPDATE = "teams_team_update";
    TEAMS_TEAM_DELETE = "teams_team_delete";
    TEAMS_MEMBER_ADD = "teams_member_add";
    TEAMS_MEMBER_REMOVE = "teams_member_remove";
    TEAMS_MEMBER_SET = "teams_member_set";
    INTERACTIVE_ACTION = "interactive_action";
    constructor(config, teams) {
        this.config = config;
        this.teams = teams;
    }
    /**
     * 开始持续接收事件。SDK 自动处理网络错误（断线重连、心跳超时）。
     * 调用 `unsubscribe()` 才会停止订阅。
     */
    subscribe(options = {}) {
        const onEvent = options.onEvent;
        if (!onEvent) {
            return subscribeTuitui(this.config, options);
        }
        return subscribeTuitui(this.config, {
            ...options,
            onEvent: async (body) => {
                await this.normalizeMessageEvent(body);
                await onEvent(body);
            },
        });
    }
    getMessageMedia(data) {
        return getTuituiMessageMedia(data);
    }
    getDetailedMessageMedia(data) {
        return getDetailedTuituiMessageMedia(data);
    }
    renderMessageBody(data) {
        if (!isRecord(data)) {
            return "";
        }
        const message = data;
        return renderMessage(message).join("\n");
    }
    /** 统一使用 body.data 表示消息，并将共享帖子补全为普通文本。 */
    async normalizeMessageEvent(body) {
        if (body.event !== this.SINGLE_CHAT && body.event !== this.GROUP_CHAT) {
            return;
        }
        if (isRecord(body.data)) {
            await this.normalizeSharedPost(body.data);
            if (isRecord(body.data.ref)) {
                await this.normalizeSharedPost(body.data.ref);
            }
            delete body.data.timestamp;
        }
        delete body.msgtype;
        delete body.text;
        delete body.trigger_word;
        delete body.images;
        delete body.file;
    }
    async normalizeSharedPost(message) {
        if (message.msg_type !== "shared_post") {
            return;
        }
        const content = await this.teams.getSharedPostForAgentContent(message.shared_post);
        message.msg_type = "text";
        message.text = content.text;
        if (content.media.length) {
            message._tuitui_media = content.media.map((media) => ({
                mime_type: media.mimeType,
                url: media.url,
                ...(media.name ? { name: media.name } : {}),
                ...(media.fileId ? { file_id: media.fileId } : {}),
            }));
        }
    }
}
//# sourceMappingURL=event.js.map