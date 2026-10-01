import { resolveToTarget, resolveSingleEditableTarget, } from "./to-target.js";
import { extractMentions } from "./mention.js";
export class TuituiImApi {
    http;
    uploader;
    records;
    constructor(http, uploader, records) {
        this.http = http;
        this.uploader = uploader;
        this.records = records;
    }
    async sendText(options) {
        const { targetPayload, group } = this.resolveTarget(options.to, options.at);
        return this.http.post("/message/custom/send", {
            ...targetPayload,
            msgtype: "text",
            at: options.at ?? (group ? extractMentions(options.text) : []),
            text: {
                content: options.text,
                ...(options.referenceMessageId ? { reference_msgid: options.referenceMessageId } : {}),
            },
        });
    }
    /** 发送强通知。该能力需要服务端为机器人开通权限。 */
    async sendStrongNotice(options) {
        return this.http.post("/strongNotice/single/send", {
            account: options.account,
            content: options.content,
            sms_notice: options.smsNotice,
            call_notice: options.callNotice,
        });
    }
    /** 向推推账号或手机号码发送电话报警。 */
    async sendPhoneAlarm(options) {
        return this.http.post("/message/custom/send", {
            ...(options.accounts !== undefined ? { tousers: options.accounts } : {}),
            msgtype: "voice",
            voice: {
                ...(options.mobiles !== undefined ? { mobiles: options.mobiles } : {}),
                message: options.message,
            },
        });
    }
    async sendMixed(options) {
        const { targetPayload, at } = this.resolveTarget(options.to, options.at);
        return this.http.post("/message/custom/send", {
            ...targetPayload,
            msgtype: "mixed",
            mixed: await this.prepareMixedItems(options.items),
            at,
        });
    }
    async sendPage(options) {
        const { targetPayload } = this.resolveTarget(options.to);
        return this.http.post("/message/custom/send", {
            ...targetPayload,
            msgtype: "page",
            page: { ...options.page },
        });
    }
    async sendLink(options) {
        const { targetPayload } = this.resolveTarget(options.to);
        return this.http.post("/message/custom/send", {
            ...targetPayload,
            msgtype: "link",
            link: { ...options.link },
        });
    }
    async sendFile(options) {
        const { to, source, at: requestedAt, ...uploadOptions } = options;
        const { targetPayload, at } = this.resolveTarget(to, requestedAt);
        const uploaded = await this.uploader.upload(source, uploadOptions);
        return uploaded.mediaType === "image"
            ? this.http.post("/message/custom/send", {
                ...targetPayload,
                msgtype: "image",
                image: { media_id: uploaded.fid },
                at,
            })
            : this.http.post("/message/custom/send", {
                ...targetPayload,
                msgtype: "attachment",
                attachment: { media_id: uploaded.fid },
                at,
            });
    }
    async sendInteractive(options) {
        const { targetPayload, targetCount } = this.resolveTarget(options.to);
        if (targetCount !== 1) {
            throw new Error("[tuitui] interactive messages require exactly one target");
        }
        const response = await this.http.post("/message/custom/send", {
            ...targetPayload,
            msgtype: "interactive",
            interactive: options.interactive,
        });
        const msgid = response.msgid ?? response.msgids?.[0]?.msgid;
        return msgid ? { ...response, msgid } : response;
    }
    async modifyText(options) {
        if (!options.messageId) {
            throw new Error("[tuitui] messageId is required");
        }
        const target = resolveSingleEditableTarget(options.to);
        const modifyTarget = target.kind === "account"
            ? { tousers: [{ user: target.account, msgid: options.messageId }] }
            : { togroups: [{ group: target.groupId, msgid: options.messageId }] };
        return this.http.post("/message/custom/modify", {
            ...modifyTarget,
            msgtype: "text",
            text: { content: options.text },
            ...(options.withoutPush !== undefined ? { without_push: options.withoutPush } : {}),
        });
    }
    async modifyInteractive(options) {
        const target = resolveSingleEditableTarget(options.to);
        const modifyTarget = target.kind === "account"
            ? { tousers: [{ user: target.account, msgid: options.messageId }] }
            : { togroups: [{ group: target.groupId, msgid: options.messageId }] };
        return this.http.post("/message/custom/modify", {
            ...modifyTarget,
            msgtype: "interactive",
            interactive: options.interactive,
        });
    }
    /** 撤回已发送的单聊或群聊消息。 */
    async recall(options) {
        const target = resolveSingleEditableTarget(options.to);
        const recallTarget = target.kind === "account"
            ? { tousers: [{ user: target.account, msgid: options.messageId }] }
            : { togroups: [{ group: target.groupId, msgid: options.messageId }] };
        return this.http.post("/message/custom/modify", {
            ...recallTarget,
            msgtype: "recall",
        });
    }
    async emojiReaction(options) {
        const target = resolveSingleEditableTarget(options.to);
        const reactionTarget = target.kind === "account"
            ? { tousers: [{ user: target.account, msgid: options.messageId }] }
            : { togroups: [{ group: target.groupId, msgid: options.messageId }] };
        return this.http.post("/message/custom/modify", {
            ...reactionTarget,
            msgtype: "emoji_reaction",
            emoji_reaction: {
                emoji: options.emoji,
                cancel: options.cancel ?? false,
            },
        });
    }
    async getHistory(to, options = {}) {
        const normalized = resolveSingleEditableTarget(to);
        return normalized.kind === "account"
            ? this.records.getPrivateHistory(normalized.account, options)
            : this.records.getGroupHistory(normalized.groupId, options);
    }
    resolveTarget(to, at) {
        const target = resolveToTarget(to);
        if (target.kind === "users") {
            if (at?.length) {
                throw new Error("[tuitui] at is only supported for group messages");
            }
            return {
                targetPayload: {
                    ...(target.accounts.length ? { tousers: target.accounts } : {}),
                    ...(target.uids.length ? { touids: target.uids } : {}),
                },
                group: false,
                at: [],
                targetCount: target.accounts.length + target.uids.length,
            };
        }
        return {
            targetPayload: { togroups: [target.groupId] },
            group: true,
            at: at ?? [],
            targetCount: 1,
        };
    }
    async prepareMixedItems(items) {
        if (!Array.isArray(items) || items.length === 0 || items.length > 10) {
            throw new Error("[tuitui] mixed items must contain between 1 and 10 entries");
        }
        const textLength = items.reduce((total, item) => total + (item.type === "text" ? item.text.length : 0), 0);
        if (textLength > 50_000) {
            throw new Error("[tuitui] mixed text must not exceed 50000 characters");
        }
        return Promise.all(items.map(async (item) => {
            if (item.type === "text") {
                return { type: "text", value: item.text };
            }
            const uploadOptions = {
                ...(item.filename !== undefined ? { filename: item.filename } : {}),
                ...(item.contentType !== undefined ? { contentType: item.contentType } : {}),
            };
            const uploaded = await this.uploader.upload(item.source, uploadOptions);
            if (uploaded.mediaType !== "image") {
                throw new Error(`[tuitui] mixed messages only support JPG/JPEG, PNG, and GIF images: ${uploaded.filename}`);
            }
            return { type: "image", value: uploaded.fid };
        }));
    }
}
//# sourceMappingURL=im.js.map