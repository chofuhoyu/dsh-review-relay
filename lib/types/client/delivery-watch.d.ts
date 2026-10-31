/** Short post-rejection poll for the host's attachment result. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * Watch one call's delivery outcome after a successful rejection. The card
 * already showed the immediate success toast; a failure replaces it with an
 * error toast, so attachment failures stay visible after the card closes.
 * @param sessionId - rejected session.
 * @param callId - rejected tool call.
 * @param t - card dictionary.
 */
export declare function watchDelivery(sessionId: string, callId: string, t: TranslateNS<'review-relay'>): void;
/** Cancel every active delivery watcher on plugin disposal. */
export declare function disposeDeliveryWatch(): void;
