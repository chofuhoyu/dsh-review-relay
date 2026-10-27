/** Host runtime: observe review asks, collect the browser note, and deliver once. */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
/** Host-only relay runtime. */
export declare class ReviewRelayRuntime {
    private readonly ctx;
    private readonly config;
    private readonly translator;
    private readonly delivered;
    private readonly pendingReviews;
    private readonly pendingDeliveries;
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
    private rememberLocale;
    private pendingKey;
    private deliveryMapKey;
    private prune;
}
