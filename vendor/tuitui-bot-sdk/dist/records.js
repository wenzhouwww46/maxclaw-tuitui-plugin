import { formatTimestamp } from "./util_time.js";
export function compactChatRecordForAgent(value) {
    return {
        errcode: value.errcode,
        errmsg: value.errmsg,
        cursor: value.cursor,
        has_more: value.has_more,
        current_time: value.time,
        msgs: (value.msgs ?? []).map(({ user_account, user_name, timestamp, data }) => {
            const { at, msgid, group_id, group_name, ...restData } = data;
            return {
                ...restData,
                user_account,
                user_name,
                msg_time: formatTimestamp(timestamp),
            };
        }),
    };
}
export function compactPostChainForAgent(value) {
    const item = (value && typeof value === "object" ? value : {});
    const topic = (item.topic && typeof item.topic === "object" ? item.topic : {});
    const replies = Array.isArray(item.reply_list) ? item.reply_list : [];
    const convert = (post, main) => {
        return {
            from_uid: String(post.from_uid ?? ""),
            post_id: String(post.post_id ?? ""),
            time: String(post.create_time ?? ""),
            last_reply_time: main ? String(post.last_reply_time ?? "") : "",
            name: String(post.from_name ?? ""),
            content: String(post.content ?? ""),
            properties: post.properties ?? "",
        };
    };
    const replyItems = [...replies]
        .reverse()
        .map((reply) => convert((reply ?? {}), false));
    return [convert(topic, true), ...replyItems];
}
export class TuituiRecordsApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async getPrivateHistory(user, options = {}) {
        const body = await this.http.post("/message/single/sync", this.historyPayload("user", user, options));
        return options.compactForAgent ? compactChatRecordForAgent(body) : body;
    }
    async getGroupHistory(groupId, options = {}) {
        const body = await this.http.post("/message/group/sync", this.historyPayload("group_id", groupId, options));
        return options.compactForAgent ? compactChatRecordForAgent(body) : body;
    }
    historyPayload(key, value, options) {
        const payload = {
            [key]: value,
            cursor: options.cursor ?? "0",
        };
        if (options.relativeTime) {
            payload.relative_time = options.relativeTime;
        }
        else {
            if (options.startTime)
                payload.start_time = options.startTime;
            if (options.endTime)
                payload.end_time = options.endTime;
        }
        if (options.limit !== undefined) {
            payload.limit = options.limit;
        }
        if (options.orderAsc !== undefined) {
            payload.order_asc = options.orderAsc;
        }
        return payload;
    }
}
//# sourceMappingURL=records.js.map