function normalizeValues(values, name) {
    if (!Array.isArray(values)) {
        throw new Error(`[tuitui] ${name} must be an array`);
    }
    const normalized = [
        ...new Set(values
            .map((value) => typeof value === "string" ? value.trim() : "")
            .filter(Boolean)),
    ];
    if (!normalized.length) {
        throw new Error(`[tuitui] ${name} must not be empty`);
    }
    return normalized;
}
export class TuituiToApi {
    /** 私聊某个推推账号。 */
    account(account) {
        return Object.freeze({
            accounts: Object.freeze(normalizeValues([account], "accounts")),
        });
    }
    /** 私聊某个用户 UID。 */
    uid(uid) {
        return Object.freeze({
            uids: Object.freeze(normalizeValues([uid], "uids")),
        });
    }
    /** 发送到某个群聊。 */
    group(groupId) {
        const normalized = typeof groupId === "string" ? groupId.trim() : "";
        if (!normalized) {
            throw new Error("[tuitui] groupId is required");
        }
        return Object.freeze({ groupId: normalized });
    }
    /** 私聊多个推推账号。 */
    accounts(accounts) {
        return Object.freeze({
            accounts: Object.freeze(normalizeValues(accounts, "accounts")),
        });
    }
    /** 私聊多个用户 UID。 */
    uids(uids) {
        return Object.freeze({
            uids: Object.freeze(normalizeValues(uids, "uids")),
        });
    }
}
export function resolveToTarget(target) {
    if (!target || typeof target !== "object") {
        throw new Error("[tuitui] target is required");
    }
    const accounts = target.accounts === undefined
        ? []
        : normalizeValues(target.accounts, "accounts");
    const uids = target.uids === undefined ? [] : normalizeValues(target.uids, "uids");
    const groupId = typeof target.groupId === "string" ? target.groupId.trim() : "";
    if (groupId) {
        if (accounts.length || uids.length) {
            throw new Error("[tuitui] user and group targets cannot be mixed");
        }
        return { kind: "group", groupId };
    }
    if (!accounts.length && !uids.length) {
        throw new Error("[tuitui] target must contain accounts, uids, or groupId");
    }
    if (accounts.length > 100 || uids.length > 100) {
        throw new Error("[tuitui] user targets exceed the limit of 100");
    }
    return { kind: "users", accounts, uids };
}
export function resolveSingleEditableTarget(target) {
    const resolved = resolveToTarget(target);
    if (resolved.kind === "group") {
        return resolved;
    }
    if (resolved.uids.length) {
        throw new Error("[tuitui] uid targets do not support this operation");
    }
    if (resolved.accounts.length !== 1) {
        throw new Error("[tuitui] this operation requires exactly one account");
    }
    return { kind: "account", account: resolved.accounts[0] };
}
//# sourceMappingURL=to-target.js.map