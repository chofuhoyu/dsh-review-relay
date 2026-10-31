/** Host runtime: observe review asks, collect the browser note, and attach it once. */
import type { Context } from '@deepseek-ai/cordis';
import type { DeliveryMode } from '../shared/types.js';
import type { ResolvedConfig } from './config.js';
/** Delivery state exposed to the browser after a rejection. */
export type DeliveryState = 'pending' | 'delivered' | 'failed';
/** Concrete delivery destination after resolving the configured mode. */
export type DeliveryTarget = 'tool-result' | 'inject' | 'followup';
/**
 * Resolve where a prepared relay text goes.
 *
 * `tool-result` appends to the rejected call's own result. `auto` is kept as a
 * deprecated alias for that default. `inject` and `followup` preserve the
 * legacy synthetic-user-message behavior.
 * @param configured - configured delivery mode.
 * @returns the concrete destination.
 */
export declare function resolveDeliveryTarget(configured: DeliveryMode): DeliveryTarget;
/** Host-only relay runtime. */
export declare class ReviewRelayRuntime {
    private readonly ctx;
    private readonly config;
    private readonly translator;
    private readonly delivered;
    private readonly pendingReviews;
    private readonly pendingDeliveries;
    private readonly pendingEnrichments;
    private readonly pendingToolEnrichments;
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
    /**
     * Deliver legacy messages after the matching tool/result is committed, and
     * fail any tool-result enrichment that never reached post-execute.
     */
    private readonly onSessionEvent;
    /** Legacy path: relay a final Auto review denial that never asked the user. */
    private maybeRelayDirectDeny;
    /**
     * Append a staged relay to the rejected call's own result. This runs before
     * the tool result is materialized and appended to the Session, so the model
     * sees the note at tool priority and the conversation shows no synthetic
     * user message.
     */
    private readonly onPostExecute;
    /** Match one staged relay to this call and fold it onto the result content. */
    private enrichPostExecute;
    /** Take the oldest no-callId relay staged for this session/tool, if any. */
    private takeToolEnrichment;
    /** Append one text block while preserving the downstream decision. */
    private appendRelay;
    /** Attach the structured reason of a final Auto review denial that never asked. */
    private enrichDirectDeny;
    /** Drop queued relays for a closed turn and surface their failure. */
    private failPendingEnrichments;
    /** Queue one relay for the next matching rejected result. */
    private stageEnrichment;
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
    private toolEnrichmentKey;
    private prune;
}
