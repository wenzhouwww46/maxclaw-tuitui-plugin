function createMentionsRegex() {
    return /(?<=^|[\s\r\n　、。，！？…])@([^\s]+)/g;
}
export function extractMentions(text) {
    return [
        ...new Set([...text.matchAll(createMentionsRegex())]
            .map((match) => match[1])
            .filter((value) => Boolean(value))),
    ];
}
export function replaceMentions(text) {
    return text.replace(createMentionsRegex(), (_match, account) => `{{tuitui_at "${account}"}}`);
}
//# sourceMappingURL=mention.js.map