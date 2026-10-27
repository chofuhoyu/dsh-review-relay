import type { PublicConfig, ReviewAsk } from '../shared/types.js';
/** Structural view of the official PendingApproval instance (no value import). */
export interface ApprovalLike {
    readonly kind: 'approval';
    readonly key: string;
    readonly sessionId: string;
    readonly toolName: string;
    readonly callId?: string | undefined;
    readonly reason?: string | undefined;
    readonly displayReason?: {
        readonly en: string;
        readonly [locale: string]: string;
    } | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly answerable: boolean;
    answer(outcome: 'allowed-once' | 'rejected'): Promise<void>;
}
/** One elected card. `review` is null for an opted-in ordinary approval. */
export interface MatchedApproval {
    readonly approval: ApprovalLike;
    readonly review: ReviewAsk | null;
}
/** Whether a pending interaction is an answerable approval instance. */
export declare function isApprovalLike(value: unknown): value is ApprovalLike;
/** Compile the host-provided recognition pattern for browser routing. */
export declare function compileClientPattern(config: PublicConfig): RegExp;
/**
 * Decide whether this chain entry takes over the approval.
 * @param value - the owner's pendingInteraction.
 * @param config - fetched public config.
 * @param pattern - compiled recognition pattern.
 * @returns the elected card input, or null to let the official entry render.
 */
export declare function matchApproval(value: unknown, config: PublicConfig, pattern: RegExp): MatchedApproval | null;
/** Initial checkbox state for the configured forward mode. */
export declare function initialForward(config: PublicConfig): boolean;
/** Whether the forward checkbox is shown for this card. */
export declare function forwardVisible(config: PublicConfig, matched: MatchedApproval): boolean;
/** Whether the forward checkbox is forced by config. */
export declare function forwardForced(config: PublicConfig): boolean;
