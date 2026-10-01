import { StringDeduplicator } from "./util_deduplicator.js";
const KEEPALIVE_EVENT = "keepalive";
const DEFAULT_RECONNECT_DELAY_SECONDS = 1;
const DEFAULT_MAX_RECONNECT_DELAY_SECONDS = 60;
const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 30;
const DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 60;
const DEFAULT_DEDUPLICATION_SIZE = 1000;
const DEFAULT_DEDUPLICATION_TTL_SECONDS = 1200;
async function defaultFactory(url) {
    const { default: NodeWebSocket } = await import("../../ws/wrapper.mjs");
    return new NodeWebSocket(url);
}
async function textFromData(data) {
    if (typeof data === "string")
        return data;
    if (data instanceof ArrayBuffer)
        return new TextDecoder().decode(data);
    if (ArrayBuffer.isView(data))
        return new TextDecoder().decode(data);
    if (typeof Blob !== "undefined" && data instanceof Blob)
        return data.text();
    return String(data);
}
function toError(value) {
    if (value instanceof Error)
        return value;
    const event = value;
    if (event?.error instanceof Error)
        return event.error;
    if (typeof event?.message === "string")
        return new Error(event.message);
    return new Error(String(value));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isEventEnvelope(value) {
    return isRecord(value) && typeof value.event_id === "string" && value.event_id.length > 0;
}
function closeError(code, reason) {
    const closeReason = reason ?? (typeof code === "number" ? undefined : code);
    let reasonText = "";
    if (typeof closeReason === "string")
        reasonText = closeReason;
    else if (ArrayBuffer.isView(closeReason))
        reasonText = new TextDecoder().decode(closeReason);
    else if (closeReason != null)
        reasonText = String(closeReason);
    const details = [
        typeof code === "number" ? `code=${code}` : "",
        reasonText ? `reason=${reasonText}` : "",
    ].filter(Boolean);
    return new Error(`[tuitui] WebSocket closed${details.length ? ` (${details.join(", ")})` : ""}`);
}
export function subscribeTuitui(config, options = {}) {
    let socket = null;
    let stopped = false;
    let connectionId = 0;
    let reconnectAttempt = 0;
    let reconnectTimer;
    let connectionTimer;
    let heartbeatTimer;
    const deduplicator = new StringDeduplicator(options.deduplicationSize ?? DEFAULT_DEDUPLICATION_SIZE, options.deduplicationTtlSeconds ?? DEFAULT_DEDUPLICATION_TTL_SECONDS);
    function isCurrent(current) {
        return !stopped && socket === current;
    }
    function clearTimers() {
        clearTimeout(reconnectTimer);
        clearTimeout(connectionTimer);
        clearTimeout(heartbeatTimer);
        reconnectTimer = undefined;
        connectionTimer = undefined;
        heartbeatTimer = undefined;
    }
    function closeSocket(current) {
        if (!current)
            return;
        if (socket === current)
            socket = null;
        current.removeAllListeners?.();
        current.on("error", () => { });
        if (current.readyState !== 3) {
            if (current.terminate)
                current.terminate();
            else
                current.close();
        }
    }
    function reportError(value) {
        const error = toError(value);
        try {
            options.onError?.(error);
        }
        catch (callbackError) {
            config.logger?.error?.("[tuitui] WebSocket onError callback failed", toError(callbackError));
        }
        return error;
    }
    function scheduleReconnect() {
        if (stopped || reconnectTimer)
            return;
        const initialDelaySeconds = Math.max(0, options.reconnectDelaySeconds ?? DEFAULT_RECONNECT_DELAY_SECONDS);
        const maxDelaySeconds = Math.max(initialDelaySeconds, options.maxReconnectDelaySeconds ?? DEFAULT_MAX_RECONNECT_DELAY_SECONDS);
        const delaySeconds = Math.min(initialDelaySeconds * (2 ** reconnectAttempt), maxDelaySeconds);
        reconnectAttempt += 1;
        config.logger?.info?.(`[tuitui] WebSocket reconnecting in ${delaySeconds}s (attempt ${reconnectAttempt})`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            void connect();
        }, delaySeconds * 1000);
    }
    function disconnect(current, reason) {
        if (!isCurrent(current))
            return;
        clearTimeout(connectionTimer);
        clearTimeout(heartbeatTimer);
        connectionTimer = undefined;
        heartbeatTimer = undefined;
        closeSocket(current);
        config.logger?.warn?.("[tuitui] WebSocket disconnected", reason);
        scheduleReconnect();
        try {
            options.onDisconnected?.(reason);
        }
        catch (error) {
            reportError(error);
        }
    }
    function armConnectionTimeout(current) {
        clearTimeout(connectionTimer);
        connectionTimer = setTimeout(() => {
            if (!isCurrent(current))
                return;
            const error = new Error("[tuitui] WebSocket connection timeout");
            config.logger?.warn?.(error.message);
            disconnect(current, error);
        }, (options.connectionTimeoutSeconds ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS) * 1000);
    }
    function armHeartbeat(current) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            if (!isCurrent(current))
                return;
            const error = new Error("[tuitui] WebSocket heartbeat timeout");
            config.logger?.warn?.(error.message);
            disconnect(current, error);
        }, (options.heartbeatTimeoutSeconds ?? DEFAULT_HEARTBEAT_TIMEOUT_SECONDS) * 1000);
    }
    async function handleMessage(current, data) {
        if (!isCurrent(current))
            return;
        let raw;
        try {
            raw = JSON.parse(await textFromData(data));
        }
        catch (error) {
            reportError(error);
            return;
        }
        if (!isRecord(raw)) {
            reportError(new Error("[tuitui] Invalid WebSocket event"));
            return;
        }
        if (!isEventEnvelope(raw)) {
            config.logger?.warn?.("[tuitui] WebSocket event missing event_id", raw);
            return;
        }
        const eventId = raw.event_id;
        try {
            current.send(JSON.stringify({ ack: eventId }));
        }
        catch (error) {
            const sendError = reportError(error);
            disconnect(current, sendError);
            return;
        }
        if (!deduplicator.checkAndRecord(eventId))
            return;
        armHeartbeat(current);
        if (raw.body?.event === KEEPALIVE_EVENT)
            return;
        const appId = raw.header?.["X-Tuitui-Robot-Appid"];
        if (typeof appId === "string" && appId !== config.appId) {
            reportError(new Error("[tuitui] Event appId does not match client appId"));
            return;
        }
        if (!isRecord(raw.body) || typeof raw.body.event !== "string") {
            reportError(new Error("[tuitui] WebSocket event missing body"));
            return;
        }
        const botName = raw.header?.["X-Tuitui-Robot-AppName"];
        raw.body.bot_name = typeof botName === "string" ? botName : "";
        try {
            await options.onEvent?.(raw.body);
        }
        catch (error) {
            reportError(error);
        }
    }
    function bindSocketEvents(current) {
        current.on("open", () => {
            if (!isCurrent(current))
                return;
            clearTimeout(connectionTimer);
            connectionTimer = undefined;
            reconnectAttempt = 0;
            armHeartbeat(current);
            try {
                options.onConnected?.();
            }
            catch (error) {
                reportError(error);
            }
        });
        current.on("message", (data) => {
            void handleMessage(current, data).catch(reportError);
        });
        current.on("close", (code, reason) => {
            disconnect(current, closeError(code, reason));
        });
        current.on("error", (value) => {
            const error = reportError(value);
            disconnect(current, error);
        });
    }
    async function connect() {
        if (stopped)
            return;
        const currentConnectionId = ++connectionId;
        const url = new URL(`${config.websocketBaseUrl}/callback/ws`);
        url.searchParams.set("auth", `${config.appId}.${config.appSecret}`);
        let current;
        try {
            current = await (options.websocketFactory ?? defaultFactory)(url.toString());
        }
        catch (error) {
            if (stopped || currentConnectionId !== connectionId)
                return;
            reportError(error);
            scheduleReconnect();
            return;
        }
        if (stopped || currentConnectionId !== connectionId) {
            closeSocket(current);
            return;
        }
        closeSocket(socket);
        socket = current;
        bindSocketEvents(current);
        armConnectionTimeout(current);
    }
    void connect();
    return {
        unsubscribe() {
            if (stopped)
                return;
            stopped = true;
            connectionId += 1;
            clearTimers();
            deduplicator.clear();
            closeSocket(socket);
        },
        get unsubscribed() {
            return stopped;
        },
        get socket() {
            return socket;
        },
    };
}
//# sourceMappingURL=websocket.js.map