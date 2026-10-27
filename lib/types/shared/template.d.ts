/**
 * Fixed injection template. The labels are English on purpose: the model sees
 * stable block names, while the note and reviewer text keep their own language.
 */
/** Inputs for one relay message. */
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
 * Render the fixed relay message, omitting every empty block.
 * @param input - tool name, optional note, optional reviewer text, optional translation.
 * @returns the message text, or undefined when there is nothing to relay.
 */
export declare function buildRelayMessage(input: RelayTemplateInput): string | undefined;
