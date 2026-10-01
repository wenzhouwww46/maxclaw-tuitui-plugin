import { getMediaTypes } from "./util_mime.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function detailedMedia(raw, source) {
    if (typeof raw === "string") {
        return { mimeType: getMediaTypes(source)?.[0] ?? "application/octet-stream", url: raw };
    }
    if (!isRecord(raw) || typeof raw.url !== "string")
        return undefined;
    return {
        mimeType: typeof raw.mime_type === "string"
            ? raw.mime_type
            : getMediaTypes(source)?.[0] ?? "application/octet-stream",
        url: raw.url,
        ...(typeof raw.name === "string" ? { name: raw.name } : {}),
        ...(typeof raw.file_id === "string"
            ? { fileId: raw.file_id }
            : typeof raw.fid === "string" ? { fileId: raw.fid } : {}),
    };
}
export function getDetailedTuituiMessageMedia(data) {
    if (!isRecord(data))
        return [];
    const result = [];
    const indexes = new Map();
    const append = (raw, source) => {
        const media = detailedMedia(raw, source);
        if (!media)
            return;
        const index = indexes.get(media.url);
        if (index !== undefined) {
            const existing = result[index];
            if (!existing.name && media.name)
                existing.name = media.name;
            if (!existing.fileId && media.fileId)
                existing.fileId = media.fileId;
            if (existing.mimeType === "application/octet-stream" && media.mimeType) {
                existing.mimeType = media.mimeType;
            }
            return;
        }
        indexes.set(media.url, result.length);
        result.push(media);
    };
    const collect = (message) => {
        for (const media of Array.isArray(message._tuitui_media) ? message._tuitui_media : []) {
            append(media, { msg_type: "file" });
        }
        for (const image of Array.isArray(message.images) ? message.images : []) {
            if (typeof image === "string") {
                append(image, { msg_type: "image", images: [image] });
            }
        }
        if (typeof message.voice === "string")
            append(message.voice, { msg_type: "voice", voice: message.voice });
        if (typeof message.video === "string")
            append(message.video, { msg_type: "video", video: message.video });
        if (isRecord(message.file))
            append(message.file, { msg_type: "file", file: message.file });
        if (isRecord(message.merged) && Array.isArray(message.merged.msgs)) {
            for (const child of message.merged.msgs)
                if (isRecord(child))
                    collect(child);
        }
        if (isRecord(message.ref))
            collect(message.ref);
    };
    collect(data);
    return result;
}
export function getTuituiMessageMedia(data) {
    return getDetailedTuituiMessageMedia(data).map(({ mimeType, url }) => [mimeType, url]);
}
//# sourceMappingURL=events.js.map