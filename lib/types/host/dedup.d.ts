/** Stable delivery key: exact tool call when present, otherwise a bounded hash. */
export declare function deliveryKey(input: {
    readonly callId?: string | undefined;
    readonly sessionId: string;
    readonly toolName: string;
    readonly reason?: string | undefined;
}): string;
/** Bounded, TTL-based set used to keep a rejection from being relayed twice. */
export declare class DeliveredSet {
    private readonly maxEntries;
    private readonly ttlMs;
    private readonly now;
    private readonly entries;
    constructor(maxEntries?: number, ttlMs?: number, now?: () => number);
    /**
     * Mark a key as delivered.
     * @param key - stable delivery key.
     * @returns true exactly once per live key.
     */
    mark(key: string): boolean;
    /**
     * Test a key without mutating it.
     * @param key - stable delivery key.
     * @returns whether the key is still live.
     */
    has(key: string): boolean;
    /** Number of live entries after pruning. */
    get size(): number;
    /** Drop every entry. */
    clear(): void;
    private prune;
}
