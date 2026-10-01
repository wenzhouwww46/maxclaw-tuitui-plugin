import { TuituiApiError } from "./errors.js";
import { replaceMentions } from "./mention.js";
import { getDetailedTuituiMessageMedia } from "./events.js";
import { compactPostChainForAgent, } from "./records.js";
import { formatTimestamp, parseRelativeTime } from "./util_time.js";
function postChainText(posts) {
    const lines = ["以下为一个独立的帖子讨论串，包含主贴和回帖"];
    posts.forEach((post, index) => {
        lines.push(index ? "[讨论回帖]" : "[讨论主贴]", `发言人: ${post.name}`, `时间: ${formatTimestamp(post.time)}`, `内容: ${removePostMediaPlaceholders(post.content, post.properties)}`);
        const properties = (post.properties ?? {});
        for (const file of properties.files ?? []) {
            if (file.url)
                lines.push(`[文件] ${file.name ? `${file.name}: ` : ""}${file.url}`);
        }
        for (const image of properties.images ?? []) {
            if (image.url)
                lines.push(`[图片] ${image.name ? `${image.name}: ` : ""}${image.url}`);
        }
        lines.push("");
    });
    return lines.join("\n").trim();
}
function removePostMediaPlaceholders(content, rawProperties) {
    if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties))
        return content;
    const properties = rawProperties;
    const removeImages = Array.isArray(properties.images) && properties.images.length > 0;
    const removeFiles = Array.isArray(properties.files) && properties.files.length > 0;
    return content.split("\n")
        .filter((line) => !((removeImages && line.trim() === "[图片]") || (removeFiles && line.trim() === "[文件]")))
        .join("\n")
        .trim();
}
function postChainMedia(posts) {
    const media = [];
    for (const post of posts) {
        if (!post.properties || typeof post.properties !== "object" || Array.isArray(post.properties)) {
            continue;
        }
        const properties = post.properties;
        for (const [field, defaultMime] of [["images", "image/*"], ["files", "application/octet-stream"]]) {
            for (const item of Array.isArray(properties[field]) ? properties[field] : []) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                    const value = item;
                    media.push({
                        ...value,
                        mime_type: typeof value.mime_type === "string" ? value.mime_type : defaultMime,
                    });
                }
            }
        }
    }
    return getDetailedTuituiMessageMedia({ _tuitui_media: media });
}
export class TuituiTeamsApi {
    http;
    uploader;
    constructor(http, uploader) {
        this.http = http;
        this.uploader = uploader;
    }
    async getChannelPostTagId(channelId, tag) {
        const channelTags = await this.loadChannelPostTags(channelId);
        const expected = tag.trim().toLowerCase();
        const matched = channelTags.find((item) => item.name?.trim().toLowerCase() === expected);
        if (!matched?.tag_id) {
            const available = channelTags.map((item) => item.name?.trim()).filter(Boolean);
            const hint = available.length
                ? ` Available tags: ${available.join(", ")}`
                : " This channel has no tags.";
            throw new Error(`[tuitui] channel post tag not found: ${tag}.${hint}`);
        }
        return matched.tag_id;
    }
    async sendPost(options) {
        if (!options.teamId) {
            throw new Error("[tuitui] teamId is required");
        }
        if (!options.channelId) {
            throw new Error("[tuitui] channelId is required");
        }
        const tagId = options.tag
            ? await this.getChannelPostTagId(options.channelId, options.tag)
            : undefined;
        const target = {
            team_id: options.teamId,
            channel_id: options.channelId,
            ...(options.parentId ? { parent_id: options.parentId } : {}),
            ...(options.refPostId ? { ref_post_id: options.refPostId } : {}),
            ...(tagId ? { tags: [tagId] } : {}),
        };
        const markdown = replaceMentions(options.text);
        const hasMention = markdown !== options.text;
        try {
            return await this.http.post("/message/custom/send", {
                toteams: [target],
                msgtype: "richtext/markdown",
                richtext: {
                    markdown,
                    delims_left: hasMention ? "{{" : "",
                    delims_right: hasMention ? "}}" : "",
                },
            });
        }
        catch (error) {
            if (!hasMention)
                throw error;
            return this.http.post("/message/custom/send", {
                toteams: [target],
                msgtype: "richtext/markdown",
                richtext: {
                    markdown: options.text,
                    delims_left: "",
                    delims_right: "",
                },
            });
        }
    }
    async editPost(options) {
        if (!options.teamId) {
            throw new Error("[tuitui] teamId is required");
        }
        if (!options.channelId) {
            throw new Error("[tuitui] channelId is required");
        }
        if (!options.postId) {
            throw new Error("[tuitui] postId is required");
        }
        const tagId = options.tag
            ? await this.getChannelPostTagId(options.channelId, options.tag)
            : undefined;
        const target = {
            team_id: options.teamId,
            channel_id: options.channelId,
            post_id: options.postId,
            ...(tagId ? { tags: [tagId] } : {}),
        };
        const markdown = replaceMentions(options.text);
        const hasMention = markdown !== options.text;
        try {
            return await this.http.post("/message/custom/modify", {
                toteams: [target],
                msgtype: "richtext/markdown",
                richtext: {
                    markdown,
                    delims_left: hasMention ? "{{" : "",
                    delims_right: hasMention ? "}}" : "",
                },
            });
        }
        catch (error) {
            if (!hasMention)
                throw error;
            return this.http.post("/message/custom/modify", {
                toteams: [target],
                msgtype: "richtext/markdown",
                richtext: {
                    markdown: options.text,
                    delims_left: "",
                    delims_right: "",
                },
            });
        }
    }
    async sendFile(options) {
        const { teamId, channelId, source, text, parentId, at, ...uploadOptions } = options;
        const uploaded = await this.uploader.upload(source, uploadOptions);
        const target = {
            team_id: teamId,
            channel_id: channelId,
            ...(parentId ? { parent_id: parentId } : {}),
        };
        const fileMarkdown = uploaded.mediaType === "image"
            ? `![]({{tuitui_image "${uploaded.fid}"}})`
            : `[${uploaded.filename}]({{tuitui_file "${uploaded.fid}"}})`;
        const markdown = text ? `${text}\n\n${fileMarkdown}` : fileMarkdown;
        return this.http.post("/message/custom/send", {
            toteams: [target],
            msgtype: "richtext/markdown",
            at: at ?? [],
            richtext: { markdown, delims_left: "{{", delims_right: "}}" },
        });
    }
    async emojiReaction(options) {
        return this.http.post("/message/custom/modify", {
            toteams: [{
                    team_id: options.teamId,
                    channel_id: options.channelId,
                    parent_id: "",
                    post_id: options.postId,
                }],
            msgtype: "emoji_reaction",
            emoji_reaction: { emoji: options.emoji, cancel: options.cancel ?? false },
        });
    }
    async getChannelInfo(channelId) {
        if (!channelId.trim()) {
            throw new Error("[tuitui] channelId is required");
        }
        const endpoint = "/teams/channel/info";
        const body = await this.http.post(endpoint, { channel_id: channelId });
        const info = body.datas?.info;
        if (!info?.team_id) {
            throw new TuituiApiError(`${endpoint} returned invalid channel info for channel ${channelId}: team_id is missing`, { endpoint, response: body });
        }
        return info;
    }
    async loadChannelPostTags(channelId) {
        const body = await this.http.post("/teams/channel/postTag/list", { channel_id: channelId });
        return body.datas?.tags ?? [];
    }
    async getChannelPostTags(channelId) {
        const tags = await this.loadChannelPostTags(channelId);
        return tags.map((tag) => tag.name?.trim()).filter((name) => Boolean(name));
    }
    async getMembers(teamId) {
        const body = await this.http.post("/teams/member/list", { team_id: teamId });
        return body.datas?.members ?? [];
    }
    async getMemberNames(teamId) {
        const members = await this.getMembers(teamId);
        return members.map((member) => String(member.name ?? "")).join("\n");
    }
    async getAnnouncement(channelId) {
        return (await this.getChannelInfo(channelId)).announcement;
    }
    async getPostChain(teamId, channelId, postId) {
        return this.http.post("/teams/post/chain", {
            team_id: teamId,
            channel_id: channelId,
            post_id: postId,
        });
    }
    async getPostChainForAgent(teamId, channelId, postId) {
        const body = await this.getPostChain(teamId, channelId, postId);
        return compactPostChainForAgent(body.datas);
    }
    async getSharedPost(shareId) {
        if (!shareId.trim()) {
            throw new Error("[tuitui] shareId is required");
        }
        return this.http.post("/teams/share/post", { share_id: shareId });
    }
    async getSharedPostForAgent(shareId) {
        return (await this.getSharedPostForAgentContent(shareId)).text;
    }
    /** @internal 供事件归一化同时保留共享帖媒体。 */
    async getSharedPostForAgentContent(shareId) {
        const body = await this.getSharedPost(shareId);
        const posts = compactPostChainForAgent(body.datas);
        return { text: postChainText(posts), media: postChainMedia(posts) };
    }
    async getPostTopics(options) {
        return this.http.post("/teams/post/topic/list", options);
    }
    async getChannelPosts(channelId, options = {}) {
        if (options.cursor && options.cursor !== "0" && !options.relativeTime && !options.startTime) {
            throw new Error("cursor param must use with param relativeTime or startTime");
        }
        const info = await this.getChannelInfo(channelId);
        const pageSize = options.limit && options.limit >= 1 && options.limit <= 100
            ? options.limit
            : 20;
        const payload = {
            team_id: info.team_id,
            channel_id: channelId,
            size: pageSize,
            sort_type: "reply",
            order: "asc",
        };
        if (options.relativeTime) {
            const range = parseRelativeTime(options.relativeTime);
            if (range) {
                payload.from_timestamp = range.start.getTime();
                payload.end_timestamp = range.end.getTime();
            }
        }
        else {
            if (options.startTime)
                payload.from_timestamp = new Date(options.startTime).getTime();
            if (options.endTime)
                payload.end_timestamp = new Date(options.endTime).getTime();
        }
        if (options.cursor && options.cursor !== "0") {
            payload.from_timestamp = Number(options.cursor);
        }
        const body = await this.getPostTopics(payload);
        const posts = body.datas?.post_list ?? [];
        const chains = posts.map(compactPostChainForAgent).filter((chain) => chain.length);
        const lastTimestamp = chains.at(-1)?.[0]?.last_reply_time;
        const hasMore = posts.length >= pageSize;
        return {
            errcode: Number(body.errcode),
            errmsg: String(body.errmsg ?? ""),
            cursor: hasMore && lastTimestamp ? String(Number(lastTimestamp) + 1) : "",
            has_more: hasMore,
            time: String(body.time ?? ""),
            subject: String(info.name ?? ""),
            threads: chains.map(postChainText),
        };
    }
}
//# sourceMappingURL=teams.js.map