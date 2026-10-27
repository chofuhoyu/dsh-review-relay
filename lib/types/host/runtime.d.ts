/** Host runtime: observe review asks, collect the browser note, and deliver once. */
import type { Context } from '@deepseek-ai/cordis';
import type { DeliveryMode } from '../shared/types.js';
import type { ResolvedConfig } from './config.js';
/** Delivery state exposed to the browser after a rejection. */
export type DeliveryState = 'pending' | 'delivered' | 'failed';
/**
 * Resolve how a prepared message enters the agent.
 * @param status - live agent status at delivery time.
 * @param configured - configured delivery mode.
 * @returns `inject` while a turn is open, `followup` when the agent is idle.
 */
export declare function resolveDeliveryMode(status: string, configured: DeliveryMode): 'inject' | 'followup';
/** Host-only relay runtime. */
export declare class ReviewRelayRuntime {
    private readonly ctx;
    private readonly config;
    private readonly translator;
    private readonly delivered;
    private readonly pendingReviews;
    private readonly pendingDeliveries;
    private readonly deliveryStatus;
    private clientLocale;
    private httpReady;
    private disposed;
    constructor(ctx: Context, config: ResolvedConfig);
    /** Install listeners, routes, and disposal. */
    install(): void;
    /** Whether the authenticated client routes registered successfully (diagnostics/tests). */
    get httpAvailable(): boolean;
    /** Unanswered review asks (diagnostics/tests). */
    get pendingReviewCount(): number;
    /** Messages waiting for their tool result (diagnostics/tests). */
    get pendingDeliveryCount(): number;
    /** Clear every in-memory structure and abort active translations. */
    dispose(): void;
    /** Observe one approval without changing its semantics. */
    private readonly onApproval;
    /** Deliver only after the matching tool/result is committed. */
    private readonly onSessionEvent;
    /** Relay a final Auto review denial that never asked the user. */
    private maybeRelayDirectDeny;
    private stageDelivery;
    private deliver;
    private startTranslation;
    private translationView;
    private translationFor;
    private configResponse;
    private noteResponse;
    private translationResponse;
    private installHttp;
    private guard;
    private deliveryResponse;
    private recordDelivery;
    private rememberLocale;
    private pendingKey;
    private deliveryMapKey;
    private prune;
}
