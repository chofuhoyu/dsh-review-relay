/** Load-time configuration: schema defaults, strict unknown-key checks, semantic validation. */
import z from '@deepseek-ai/schemastery';
import type { DeliveryMode, ForwardMode, PublicConfig, TranslationProvider } from '../shared/types.js';
/** Resolved plugin configuration. */
export interface ReviewRelayConfig {
    enabled: boolean;
    reviewerReasonPattern: string;
    noteEnabled: boolean;
    noteForNonReviewApprovals: boolean;
    noteMaxChars: number;
    forwardMode: ForwardMode;
    defaultForward: boolean;
    maxForwardChars: number;
    targetLanguage: string;
    translate: boolean;
    translateForForward: boolean;
    showOriginal: boolean;
    translationProvider: TranslationProvider;
    translationModel?: string;
    translationTimeoutMs: number;
    delivery: DeliveryMode;
    forwardOnDirectDeny: boolean;
}
/** Validated configuration plus the compiled recognition pattern. */
export interface ResolvedConfig extends ReviewRelayConfig {
    readonly pattern: RegExp;
}
/** Schemastery schema shown by `Config.listConfigs` and enforced by the Loader. */
export declare const Config: z<Partial<ReviewRelayConfig>, ReviewRelayConfig>;
/**
 * Validate raw config and compile the recognition pattern once.
 * @param raw - raw Loader config (or a resolved object after a reload).
 * @returns the validated config with its compiled pattern.
 * @throws {TypeError} on unknown keys, out-of-range numbers, bad enums, or a bad pattern.
 */
export declare function resolveConfig(raw: unknown): ResolvedConfig;
/**
 * Normalize a UI or environment locale to a translation target.
 * @param value - raw locale, optionally with an encoding or underscore separator.
 * @returns a BCP-47-ish tag, or undefined when unusable.
 */
export declare function normalizeLocale(value: string | undefined | null): string | undefined;
/**
 * Resolve the effective target language. `ui` follows the browser locale when
 * the client supplied one, then the host locale environment, then zh-CN.
 * @param config - validated config.
 * @param clientLocale - locale reported by the browser, when available.
 * @returns a concrete target language tag.
 */
export declare function resolveTargetLanguage(config: ReviewRelayConfig, clientLocale?: string | undefined): string;
/**
 * Project the public, client-safe config.
 * @param config - validated config.
 * @param resolvedTargetLanguage - effective target for this request.
 * @returns the body of `GET /api/review-relay/config`.
 */
export declare function publicConfig(config: ReviewRelayConfig, resolvedTargetLanguage: string): PublicConfig;
