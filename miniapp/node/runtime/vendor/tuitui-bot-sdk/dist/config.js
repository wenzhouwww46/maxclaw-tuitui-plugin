export const TUITUI_PRODUCTION_HOST = "im.live.360.cn";
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, "");
}
export function resolveTuituiConfig(appId, appSecret, options = {}) {
    const fetchWithSSRF = options.fetchWithSSRF ?? globalThis.fetch;
    return {
        appId,
        appSecret,
        apiBaseUrl: trimTrailingSlash(options.apiBaseUrl ?? `https://${TUITUI_PRODUCTION_HOST}:8282/robot`),
        websocketBaseUrl: trimTrailingSlash(options.websocketBaseUrl ?? `wss://${TUITUI_PRODUCTION_HOST}:8282/robot`),
        fetchWithSSRF,
        ...(options.logger ? { logger: options.logger } : {}),
    };
}
//# sourceMappingURL=config.js.map