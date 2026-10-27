/** Browser-side calls to the authenticated review-relay routes. */
import type { NoteRequest, PublicConfig, TranslationView } from '../shared/types.js';
/** Document-relative endpoint URL (the served shell owns the mount base). */
export declare function endpoint(path: string): string;
/** Normalize the active UI locale to a translation tag. */
export declare function uiLocale(active: string | undefined): string;
/** Validate the public config wire shape. */
export declare function isPublicConfig(value: unknown): value is PublicConfig;
/** Validate one translation view. */
export declare function isTranslationView(value: unknown): value is TranslationView;
/** Result of a note submission attempt. */
export type NoteSubmitResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly code: string;
    readonly message: string;
};
/**
 * Fetch the client-safe config once.
 * @param locale - current UI locale.
 * @param signal - plugin lifetime cancellation.
 * @returns validated config, or undefined when the route is unavailable.
 */
export declare function fetchConfig(locale: string, signal: AbortSignal): Promise<PublicConfig | undefined>;
/**
 * Submit the note before answering rejected.
 * @param request - pending session/call identity, note, forward flag, and locale.
 * @param signal - client cancellation.
 * @returns success or a card-displayable error code/message.
 */
export declare function submitNote(request: NoteRequest, signal?: AbortSignal): Promise<NoteSubmitResult>;
/**
 * Read the reviewer-reason translation for a pending approval.
 * @param sessionId - pending session identity.
 * @param callId - pending tool call identity.
 * @param locale - current UI locale.
 * @param timeoutMs - hard client wait; the host owns the provider timeout.
 * @returns a validated view, or undefined on transport/HTTP failure.
 */
export declare function fetchTranslation(sessionId: string, callId: string, locale: string, timeoutMs: number): Promise<TranslationView | undefined>;
