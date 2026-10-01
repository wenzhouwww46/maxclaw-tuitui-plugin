import { TuituiApiError } from "./errors.js";
export class TuituiHttpClient {
    config;
    constructor(config) {
        this.config = config;
        if (typeof globalThis.fetch !== "function") {
            throw new Error("[tuitui] global fetch is unavailable");
        }
    }
    get(endpoint) {
        return this.request("GET", endpoint);
    }
    post(endpoint, payload = {}) {
        return this.request("POST", endpoint, payload);
    }
    async request(method, endpoint, payload) {
        const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const url = new URL(`${this.config.apiBaseUrl}${normalizedEndpoint}`);
        url.searchParams.set("appid", this.config.appId);
        url.searchParams.set("secret", this.config.appSecret);
        const isForm = method === "POST"
            && typeof FormData !== "undefined"
            && payload instanceof FormData;
        let init;
        if (method === "GET") {
            init = { method };
        }
        else if (isForm) {
            init = { method, body: payload };
        }
        else {
            init = {
                method,
                body: JSON.stringify(payload),
                headers: { "Content-Type": "application/json" },
            };
        }
        const startedAt = Date.now();
        if (method === "GET") {
            this.config.logger?.debug?.(`[tuitui] ${endpoint} request`);
        }
        else if (isForm) {
            this.config.logger?.debug?.(`[tuitui] ${endpoint} request`, payload);
        }
        else {
            this.config.logger?.debug?.(`[tuitui] ${endpoint} request\n${JSON.stringify(payload, null, 2)}`);
        }
        let response;
        try {
            response = await globalThis.fetch(url, init);
        }
        catch (cause) {
            throw new TuituiApiError(`${endpoint} request failed`, { endpoint, cause });
        }
        finally {
            this.config.logger?.debug?.(`[tuitui] ${endpoint} completed in ${Date.now() - startedAt}ms`);
        }
        const bodyText = await response.text();
        let data;
        try {
            data = bodyText ? JSON.parse(bodyText) : {};
        }
        catch (cause) {
            throw new TuituiApiError(`${endpoint} returned invalid JSON`, {
                endpoint,
                status: response.status,
                response: bodyText,
                cause,
            });
        }
        if (!response.ok) {
            throw new TuituiApiError(`${endpoint} failed: ${response.status} ${response.statusText}`, {
                endpoint,
                status: response.status,
                response: data,
            });
        }
        const errcode = Number(data?.errcode);
        if (errcode !== 0) {
            const errorResponse = data;
            const originalErrcode = errorResponse.errcode;
            const errmsg = typeof errorResponse.errmsg === "string"
                ? errorResponse.errmsg.trim()
                : "";
            const detail = errmsg || JSON.stringify(data);
            throw new TuituiApiError(`${endpoint} failed with errcode ${String(originalErrcode)}${detail ? `: ${detail}` : ""}`, {
                endpoint,
                errcode,
                response: data,
            });
        }
        return data;
    }
}
//# sourceMappingURL=http.js.map