export class StringDeduplicator {
    maxSize;
    expireSeconds;
    items = new Map();
    constructor(maxSize = 1000, expireSeconds = null) {
        this.maxSize = maxSize;
        this.expireSeconds = expireSeconds;
        if (maxSize <= 0) {
            throw new Error("maxSize must be positive");
        }
        if (expireSeconds !== null && expireSeconds <= 0) {
            throw new Error("expireSeconds must be positive or null");
        }
    }
    checkAndRecord(item) {
        if (item === undefined || item === null) {
            throw new Error("item cannot be null or undefined");
        }
        const now = Date.now() / 1000;
        const seenAt = this.items.get(item);
        const isDuplicate = seenAt !== undefined
            && (this.expireSeconds === null || now - seenAt < this.expireSeconds);
        if (isDuplicate) {
            return false;
        }
        if (seenAt !== undefined) {
            this.items.delete(item);
        }
        this.items.set(item, now);
        while (this.items.size > this.maxSize) {
            const oldest = this.items.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.items.delete(oldest);
        }
        this.cleanup(now);
        return true;
    }
    has(item) {
        const seenAt = this.items.get(item);
        if (seenAt === undefined) {
            return false;
        }
        if (this.expireSeconds !== null && Date.now() / 1000 - seenAt >= this.expireSeconds) {
            this.items.delete(item);
            return false;
        }
        return true;
    }
    clear() {
        this.items.clear();
    }
    delete(item) {
        return this.items.delete(item);
    }
    size() {
        this.cleanup(Date.now() / 1000);
        return this.items.size;
    }
    cleanup(now) {
        if (this.expireSeconds === null) {
            return;
        }
        for (const [item, seenAt] of this.items) {
            if (now - seenAt >= this.expireSeconds) {
                this.items.delete(item);
            }
        }
    }
}
//# sourceMappingURL=util_deduplicator.js.map