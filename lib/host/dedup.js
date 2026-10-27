/** Exactly-once bookkeeping for relay deliveries. */
import { createHash } from 'node:crypto';
/** Stable delivery key: exact tool call when present, otherwise a bounded hash. */
export function deliveryKey(input) {
    if (input.callId !== undefined && input.callId !== '')
        return `call:${input.sessionId}:${input.callId}`;
    const hash = createHash('sha256')
        .update(input.sessionId)
        .update('\0')
        .update(input.toolName)
        .update('\0')
        .update(input.reason ?? '')
        .digest('hex')
        .slice(0, 32);
    return `fallback:${hash}`;
}
/** Bounded, TTL-based set used to keep a rejection from being relayed twice. */
export class DeliveredSet {
    maxEntries;
    ttlMs;
    now;
    entries = new Map();
    constructor(maxEntries = 2048, ttlMs = 24 * 60 * 60 * 1000, now = Date.now) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.now = now;
    }
    /**
     * Mark a key as delivered.
     * @param key - stable delivery key.
     * @returns true exactly once per live key.
     */
    mark(key) {
        const at = this.now();
        this.prune(at);
        const previous = this.entries.get(key);
        if (previous !== undefined && at - previous.at < this.ttlMs)
            return false;
        this.entries.delete(key);
        this.entries.set(key, { at });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done === true)
                break;
            this.entries.delete(oldest.value);
        }
        return true;
    }
    /**
     * Test a key without mutating it.
     * @param key - stable delivery key.
     * @returns whether the key is still live.
     */
    has(key) {
        const entry = this.entries.get(key);
        return entry !== undefined && this.now() - entry.at < this.ttlMs;
    }
    /** Number of live entries after pruning. */
    get size() {
        this.prune(this.now());
        return this.entries.size;
    }
    /** Drop every entry. */
    clear() {
        this.entries.clear();
    }
    prune(at) {
        for (const [key, entry] of this.entries) {
            if (at - entry.at < this.ttlMs)
                continue;
            this.entries.delete(key);
        }
    }
}
//# sourceMappingURL=dedup.js.map