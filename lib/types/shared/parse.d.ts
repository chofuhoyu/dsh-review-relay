/**
 * Recognition of Auto review's ask reason. The parser is pure so the browser
 * half can make the same routing decision as the host without importing Node.
 */
import type { ReviewAsk } from './types.js';
/**
 * Default pattern for the shipped 0.2.1-rc.2 ask path:
 * `Auto review denied tool "<tool>": <reason>`.
 *
 * The direct-deny text (`Auto review rejected tool "<tool>"; its body was not
 * executed`) intentionally does not match, and a custom pattern that would
 * match it is still rejected by the explicit guards below.
 */
export declare const DEFAULT_REVIEWER_REASON_PATTERN = "^Auto review denied tool \"(?<tool>[^\"]+)\"(?:: (?<reason>[\\s\\S]+))?$";
/** Input fields the approval request exposes to recognition. */
export interface ReviewAskInput {
    readonly toolName: string;
    readonly reason?: string | undefined;
    readonly displayReason?: {
        readonly zh?: string | undefined;
        readonly [locale: string]: string | undefined;
    } | undefined;
}
/**
 * Compile and validate a configured recognition pattern.
 * @param source - JavaScript regular-expression source with `tool` and `reason` groups.
 * @returns the compiled pattern (never stateful: no global/sticky flags).
 * @throws {TypeError} when the source is empty, invalid, or misses a required group.
 */
export declare function compileReviewerPattern(source: string): RegExp;
/**
 * Parse one approval reason as an Auto review ask.
 * @param input - the approval request's tool name and reason fields.
 * @param pattern - compiled {@link DEFAULT_REVIEWER_REASON_PATTERN} or configured equivalent.
 * @returns the parsed ask, or undefined for any ordinary/direct/failed approval.
 */
export declare function parseReviewAsk(input: ReviewAskInput, pattern: RegExp): ReviewAsk | undefined;
