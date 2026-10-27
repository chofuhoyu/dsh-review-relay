/** Browser approval card: reviewer reason, optional note, and explicit decisions. */
import { type ReactNode } from 'react';
import type { UseChat } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ApprovalLike, MatchedApproval } from './select.js';
import type { PublicConfig } from '../shared/types.js';
/** Injection seat supplied by the chain registration. */
export interface ReviewRelayInjected {
    readonly config: PublicConfig;
    readonly getLocale: () => string;
    readonly resolveReason: (reason: NonNullable<ApprovalLike['displayReason']>) => string;
}
/**
 * Props the card actually consumes. The slot registration provides the full
 * composer standard props; this narrower parameter is deliberately compatible
 * so the card does not depend on unrelated standard seats.
 */
export interface ReviewRelayPanelProps extends ReviewRelayInjected {
    readonly matched: MatchedApproval;
    readonly t: TranslateNS<'review-relay'>;
    readonly useChat?: UseChat | undefined;
}
/**
 * Render one pending approval with the reviewer reason, translation, note
 * input, forward choice, and safe allow/reject actions.
 * @param props - chain-matched approval and injected config/locale helpers.
 * @returns the approval card.
 */
export declare function ReviewRelayPanel(props: ReviewRelayPanelProps): ReactNode;
