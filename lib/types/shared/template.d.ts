/**
 * Relay text templates.
 *
 * The default path appends a block to the rejected tool call's own result, so
 * the labels are English and stable for the model. The legacy path builds a
 * standalone user message; it is kept for `delivery: 'inject' | 'followup'`.
 */
/** Inputs for one relay text. */
export interface RelayTemplateInput {
    readonly toolName: string;
    readonly note?: string | undefined;
    readonly reviewerReason?: string | undefined;
    readonly translation?: string | undefined;
    readonly targetLanguage?: string | undefined;
    readonly maxForwardChars: number;
}
/** Result of applying the explicit reviewer-reason truncation. */
export interface TruncatedReason {
    readonly text: string;
    readonly truncated: boolean;
    readonly originalLength: number;
}
/**
 * Truncate a reviewer reason without touching its interior whitespace.
 * @param reason - verbatim reviewer text.
 * @param max - maximum retained UTF-16 code units.
 * @returns the retained text plus an explicit marker when truncated.
 */
export declare function truncateReviewerReason(reason: string, max: number): TruncatedReason;
/**
 * Render the blocks appended to a rejected tool result. The result's own
 * `Error: the user rejected tool "..."` line already states the decision, so
 * this text carries only the note, the reviewer reason, and the translation.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the appended text, or undefined when there is nothing to relay.
 */
export declare function buildToolResultRelay(input: RelayTemplateInput): string | undefined;
/**
 * Render the legacy synthetic user message used by `delivery: 'inject'` and
 * `delivery: 'followup'`.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the message text, or undefined when there is nothing to relay.
 */
export declare function buildRelayMessage(input: RelayTemplateInput): string | undefined;
