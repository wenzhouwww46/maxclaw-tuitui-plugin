import { getMimeType } from "./util_mime.js";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
// 推推 Bot API 仅支持将 JPG/JPEG、PNG 和 GIF 作为图片上传，并会读取文件内容进行最终校验。
// 此处按扩展名和 MIME 类型做初步过滤；SVG 等其他图片格式必须作为文件上传。
const IMAGE_SOURCE_PATTERN = /\.(jpg|jpeg|png|gif)(?:$|[?#])/i;
const IMAGE_CONTENT_TYPES = new Set(["image/jpg", "image/jpeg", "image/png", "image/gif"]);
function detectMediaType(blob, filename) {
    const contentType = blob.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (contentType && contentType !== "application/octet-stream") {
        return IMAGE_CONTENT_TYPES.has(contentType) ? "image" : "file";
    }
    return IMAGE_SOURCE_PATTERN.test(filename) ? "image" : "file";
}
function filenameFromHeaders(url, headers) {
    const disposition = headers.get("content-disposition");
    const match = disposition?.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)"?/i);
    if (match?.[1]) {
        return decodeURIComponent(match[1]);
    }
    try {
        return new URL(url).pathname.split("/").filter(Boolean).pop() ?? "media";
    }
    catch {
        return "media";
    }
}
function decodeDataUrl(source) {
    const match = source.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
    if (!match) {
        throw new Error("[tuitui] Invalid data URL format");
    }
    const contentType = match[1] || "application/octet-stream";
    const data = match[3] ?? "";
    if (!match[2]) {
        return {
            bytes: new TextEncoder().encode(decodeURIComponent(data)),
            contentType,
        };
    }
    const binary = typeof atob === "function"
        ? atob(data)
        : Buffer.from(data, "base64").toString("binary");
    return {
        bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
        contentType,
    };
}
function bytesToArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
export class TuituiUploader {
    http;
    config;
    constructor(http, config) {
        this.http = http;
        this.config = config;
    }
    async upload(source, options = {}) {
        const prepared = await this.prepare(source, options);
        if (prepared.blob.size > MAX_UPLOAD_BYTES) {
            const actualMb = (prepared.blob.size / 1024 / 1024).toFixed(2);
            const limitMb = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(2);
            throw new Error(`[tuitui] File too large: ${actualMb}MB > ${limitMb}MB limit`);
        }
        const form = new FormData();
        form.append("media", prepared.blob, prepared.filename);
        const mediaType = detectMediaType(prepared.blob, prepared.filename);
        const response = await this.http.post(`/media/upload?type=${mediaType}`, form);
        return {
            fid: response.media_id,
            filename: prepared.filename,
            filesize: prepared.blob.size,
            mediaType,
        };
    }
    async prepare(source, options) {
        if (typeof source === "string") {
            if (source.startsWith("data:")) {
                const decoded = decodeDataUrl(source);
                const extension = decoded.contentType.split("/")[1] || "bin";
                return {
                    blob: new Blob([bytesToArrayBuffer(decoded.bytes)], { type: options.contentType ?? decoded.contentType }),
                    filename: options.filename ?? `media_${Date.now()}.${extension}`,
                };
            }
            if (/^https?:/i.test(source)) {
                const response = await this.config.fetchWithSSRF(source);
                if (!response.ok) {
                    throw new Error(`[tuitui] Failed to download ${source}: ${response.status}`);
                }
                const filename = options.filename ?? filenameFromHeaders(source, response.headers);
                const contentType = options.contentType
                    ?? response.headers.get("content-type")
                    ?? getMimeType(filename);
                return {
                    blob: new Blob([await response.arrayBuffer()], { type: contentType }),
                    filename,
                };
            }
            if (typeof process === "undefined" || !process.versions?.node) {
                throw new Error("[tuitui] Local paths are only supported in Node.js");
            }
            const [{ readFile, stat }, path] = await Promise.all([
                import("node:fs/promises"),
                import("node:path"),
            ]);
            const fileStat = await stat(source).catch(() => null);
            if (!fileStat?.isFile()) {
                throw new Error(`[tuitui] Local file not found: ${source}`);
            }
            const filename = options.filename ?? path.basename(source);
            const bytes = await readFile(source);
            return {
                blob: new Blob([bytes], { type: options.contentType ?? getMimeType(filename) }),
                filename,
            };
        }
        if (source instanceof Blob) {
            const named = source;
            return {
                blob: source,
                filename: options.filename ?? named.name ?? `media_${Date.now()}`,
            };
        }
        if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
            const filename = options.filename ?? `media_${Date.now()}`;
            const part = source instanceof Uint8Array ? bytesToArrayBuffer(source) : source;
            return {
                blob: new Blob([part], { type: options.contentType ?? getMimeType(filename) }),
                filename,
            };
        }
        const filename = options.filename ?? source.filename;
        const data = source.data;
        const part = data instanceof Uint8Array ? bytesToArrayBuffer(data) : data;
        const blob = data instanceof Blob
            ? data
            : new Blob([part], { type: options.contentType ?? source.contentType ?? getMimeType(filename) });
        return { blob, filename };
    }
}
//# sourceMappingURL=upload.js.map