const MIME_TYPES = Object.freeze({
    // Images
    apng: "image/png",
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    ico: "image/x-icon",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    webp: "image/webp",
    // Audio
    aac: "audio/aac",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    amr: "audio/amr",
    caf: "audio/x-caf",
    flac: "audio/flac",
    m4a: "audio/x-m4a",
    mid: "audio/midi",
    midi: "audio/midi",
    mp3: "audio/mpeg",
    oga: "audio/ogg",
    ogg: "audio/ogg",
    opus: "audio/opus",
    silk: "audio/amr",
    wav: "audio/wav",
    wave: "audio/wav",
    wma: "audio/x-ms-wma",
    // Video
    "3gp": "video/3gpp",
    "3gpp": "video/3gpp",
    avi: "video/x-msvideo",
    flv: "video/x-flv",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    ogv: "video/ogg",
    webm: "video/webm",
    wmv: "video/x-ms-wmv",
    // Documents
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    epub: "application/epub+zip",
    ics: "text/calendar",
    odp: "application/vnd.oasis.opendocument.presentation",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rtf: "application/rtf",
    vcf: "text/vcard",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Text and source code
    bash: "application/x-sh",
    c: "text/x-c",
    cc: "text/x-c++",
    cjs: "text/javascript",
    conf: "text/plain",
    cpp: "text/x-c++",
    css: "text/css",
    go: "text/x-go",
    h: "text/x-c",
    hpp: "text/x-c++",
    htm: "text/html",
    html: "text/html",
    ini: "text/plain",
    java: "text/x-java-source",
    txt: "text/plain",
    json: "application/json",
    jsonl: "application/x-ndjson",
    jsx: "text/jsx",
    log: "text/plain",
    markdown: "text/markdown",
    md: "text/markdown",
    mjs: "text/javascript",
    php: "application/x-httpd-php",
    py: "text/x-python",
    rb: "text/x-ruby",
    rs: "text/x-rust",
    sh: "application/x-sh",
    sql: "application/sql",
    toml: "application/toml",
    ts: "text/typescript",
    tsx: "text/typescript",
    xml: "text/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    zsh: "application/x-sh",
    // Archives and binaries
    "7z": "application/x-7z-compressed",
    apk: "application/vnd.android.package-archive",
    bz2: "application/x-bzip2",
    dmg: "application/x-apple-diskimage",
    exe: "application/x-msdownload",
    gz: "application/gzip",
    iso: "application/x-iso9660-image",
    rar: "application/vnd.rar",
    tar: "application/x-tar",
    wasm: "application/wasm",
    xz: "application/x-xz",
    zip: "application/zip",
    zst: "application/zstd",
    // Fonts
    otf: "font/otf",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
});
function getExtension(filenameOrUrl) {
    const source = filenameOrUrl.trim();
    if (!source)
        return "";
    let pathname = source;
    try {
        // HTTP 和 HTTPS URL 只从 pathname 提取扩展名，避免查询参数和 fragment 干扰判断。
        if (/^https?:\/\//i.test(source))
            pathname = decodeURIComponent(new URL(source).pathname);
        else
            pathname = source.split(/[?#]/, 1)[0] ?? source;
    }
    catch {
        pathname = source.split(/[?#]/, 1)[0] ?? source;
    }
    const filename = pathname.split(/[\\/]/).pop() ?? "";
    const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
    return match?.[1]?.toLowerCase() ?? "";
}
/** Infer a MIME type from a filename, local path, or HTTP(S) URL. */
export function getMimeType(filename_or_url) {
    const extension = getExtension(filename_or_url);
    return MIME_TYPES[extension] ?? "application/octet-stream";
}
const UNKNOWN_MIME_TYPE = "application/octet-stream";
function getMediaMime(filenameOrUrl, kind, fallback) {
    const mime = getMimeType(filenameOrUrl);
    return mime.startsWith(`${kind}/`) ? mime : fallback;
}
function getFileMime(file) {
    for (const source of [file.filename, file.name, file.url]) {
        if (!source)
            continue;
        const mime = getMimeType(source);
        if (mime !== UNKNOWN_MIME_TYPE)
            return mime;
    }
    return UNKNOWN_MIME_TYPE;
}
/**
 * Resolve MIME types for a Tuitui media message.
 *
 * The declared message category supplies a safe fallback when filenames or
 * signed URLs do not contain a usable extension.
 */
export function getMediaTypes({ msg_type, images, voice, video, file, }) {
    if (msg_type === "image" || msg_type === "mixed") {
        if (images?.length) {
            return images.map((url) => getMediaMime(url, "image", "image/jpeg"));
        }
    }
    else if (msg_type === "voice") {
        if (voice)
            return [getMediaMime(voice, "audio", "audio/amr")];
    }
    else if (msg_type === "video") {
        if (video)
            return [getMediaMime(video, "video", "video/mp4")];
    }
    else if (msg_type === "file") {
        if (file && (file.filename || file.name || file.url))
            return [getFileMime(file)];
    }
    return undefined;
}
//# sourceMappingURL=util_mime.js.map