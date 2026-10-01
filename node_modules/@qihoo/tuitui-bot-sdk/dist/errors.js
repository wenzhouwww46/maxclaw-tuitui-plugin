export class TuituiApiError extends Error {
    endpoint;
    constructor(message, options) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "TuituiApiError";
        this.endpoint = options.endpoint;
        if (options.status !== undefined) {
            this.status = options.status;
        }
        if (options.errcode !== undefined) {
            this.errcode = options.errcode;
        }
        if (options.response !== undefined) {
            this.response = options.response;
        }
    }
}
//# sourceMappingURL=errors.js.map