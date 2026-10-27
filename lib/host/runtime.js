import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { buildRelayMessage } from '../shared/template.js';
import { parseReviewAsk } from '../shared/parse.js';
import { normalizeLocale, publicConfig, resolveTargetLanguage } from './config.js';
import { DeliveredSet, deliveryKey } from './dedup.js';
import { errorResponse, isRecord, jsonResponse, readJsonBody, stringField, booleanField } from './http.js';
import { TranslationService, translationRouteOf } from './translate.js';
/** How long an unanswered pending review is retained before pruning. */
const PENDING_TTL_MS = 5 * 60 * 1000;
/** Host-only relay runtime. */
export class ReviewRelayRuntime {
    ctx;
    config;
    translator;
    delivered = new DeliveredSet();
    pendingReviews = new Map();
    pendingDeliveries = new Map();
    clientLocale;
    httpReady = false;
    disposed = false;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        const llm = ctx.get('llm');
        const translationRuntime = {
            ...llm === undefined ? {} : { llm },
            get: (name) => ctx.get(name),
            logger: ctx.logger,
        };
        this.translator = new TranslationService(translationRuntime, config);
    }
    /** Install listeners, routes, and disposal. */
    install() {
        this.ctx.on('approval/request', this.onApproval, true);
        this.ctx.on('session/event', this.onSessionEvent);
        this.ctx.inject(['connection'], (scope) => { this.installHttp(scope); });
        this.ctx.effect(() => () => { this.dispose(); }, 'review-relay: dispose');
        this.ctx.logger.info(`review-relay: active (forwardMode=${this.config.forwardMode}, delivery=${this.config.delivery}, translation=${this.config.translate ? this.config.translationProvider : 'off'})`);
    }
    /** Whether the authenticated client routes registered successfully (diagnostics/tests). */
    get httpAvailable() {
        return this.httpReady;
    }
    /** Unanswered review asks (diagnostics/tests). */
    get pendingReviewCount() {
        return this.pendingReviews.size;
    }
    /** Messages waiting for their tool result (diagnostics/tests). */
    get pendingDeliveryCount() {
        return this.pendingDeliveries.size;
    }
    /** Clear every in-memory structure and abort active translations. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.translator.clear();
        this.pendingReviews.clear();
        this.pendingDeliveries.clear();
        this.delivered.clear();
    }
    /** Observe one approval without changing its semantics. */
    onApproval = async (request, next) => {
        if (this.disposed || !this.config.enabled)
            return next();
        const parsed = parseReviewAsk({
            toolName: request.toolName,
            ...request.reason === undefined ? {} : { reason: request.reason },
            ...request.displayReason === undefined ? {} : { displayReason: request.displayReason },
        }, this.config.pattern);
        const isReview = parsed !== undefined;
        if (!isReview && !this.config.noteForNonReviewApprovals)
            return next();
        const sessionId = String(request.agent.session.id);
        const callId = request.callId === undefined ? undefined : String(request.callId);
        if (callId === undefined) {
            const outcome = await next();
            if (outcome === 'rejected' && isReview && this.config.forwardMode === 'always' && parsed.reason !== undefined) {
                const text = buildRelayMessage({
                    toolName: parsed.toolName,
                    reviewerReason: parsed.reason,
                    maxForwardChars: this.config.maxForwardChars,
                });
                if (text !== undefined) {
                    this.stageDelivery(request.agent, sessionId, request.toolName, parsed.reason, undefined, text);
                }
            }
            return outcome;
        }
        this.prune();
        const key = this.pendingKey(sessionId, callId);
        let pending = this.pendingReviews.get(key);
        if (pending === undefined) {
            pending = {
                key,
                sessionId,
                callId,
                agent: request.agent,
                toolName: request.toolName,
                reason: parsed?.reason,
                isReview,
                targetLanguage: resolveTargetLanguage(this.config, this.clientLocale),
                note: undefined,
                forward: undefined,
                noteSubmitted: false,
                translation: undefined,
                translationPromise: undefined,
                at: Date.now(),
            };
            this.pendingReviews.set(key, pending);
        }
        else {
            pending.toolName = request.toolName;
            pending.reason = parsed?.reason ?? pending.reason;
            pending.isReview ||= isReview;
        }
        if (pending.isReview && pending.reason !== undefined && this.config.translate) {
            this.startTranslation(pending);
        }
        const outcome = await next();
        const settled = this.pendingReviews.get(key) ?? pending;
        this.pendingReviews.delete(key);
        if (outcome !== 'rejected')
            return outcome;
        const shouldForward = this.config.forwardMode === 'always'
            ? true
            : this.config.forwardMode === 'never'
                ? false
                : settled.noteSubmitted && settled.forward === true;
        const note = this.config.noteEnabled ? settled.note ?? '' : '';
        const reviewerReason = shouldForward && settled.isReview ? settled.reason : undefined;
        const translation = shouldForward
            && this.config.translateForForward
            && settled.translation?.status === 'ok'
            ? settled.translation.text
            : undefined;
        const text = buildRelayMessage({
            toolName: settled.toolName,
            ...note === '' ? {} : { note },
            ...reviewerReason === undefined ? {} : { reviewerReason },
            ...translation === undefined ? {} : { translation },
            targetLanguage: settled.targetLanguage,
            maxForwardChars: this.config.maxForwardChars,
        });
        if (text === undefined)
            return outcome;
        this.stageDelivery(settled.agent, sessionId, settled.toolName, reviewerReason, callId, text);
        return outcome;
    };
    /** Deliver only after the matching tool/result is committed. */
    onSessionEvent = (session, event) => {
        if (this.disposed)
            return;
        if (event.type === 'tool/result') {
            const callId = String(event.data.message.toolCallId);
            const key = this.deliveryMapKey(String(session.id), callId);
            const delivery = this.pendingDeliveries.get(key);
            if (delivery === undefined)
                return;
            this.pendingDeliveries.delete(key);
            queueMicrotask(() => { this.deliver(delivery); });
            return;
        }
        if (event.type === 'turn/end') {
            const prefix = `${String(session.id)}\0`;
            for (const key of this.pendingDeliveries.keys()) {
                if (key.startsWith(prefix))
                    this.pendingDeliveries.delete(key);
            }
        }
    };
    stageDelivery(agent, sessionId, toolName, reason, callId, text) {
        const key = deliveryKey({ sessionId, toolName, reason, ...callId === undefined ? {} : { callId } });
        if (!this.delivered.mark(key)) {
            this.ctx.logger.warn(`review-relay: duplicate rejection ignored for tool "${toolName}"`);
            return;
        }
        const delivery = { agent, sessionId, callId, text, at: Date.now() };
        if (callId === undefined) {
            queueMicrotask(() => { this.deliver(delivery); });
            return;
        }
        this.pendingDeliveries.set(this.deliveryMapKey(sessionId, callId), delivery);
    }
    deliver(delivery, attempt = 0) {
        if (this.disposed)
            return;
        const message = createUserMessage({
            content: [{ type: 'text', text: delivery.text }],
            source: { kind: 'user' },
        });
        const mode = this.config.delivery === 'auto'
            ? delivery.agent.status === 'idle' ? 'followup' : 'inject'
            : this.config.delivery;
        try {
            if (mode === 'followup')
                delivery.agent.followup(message);
            else
                delivery.agent.inject(message);
            this.ctx.logger.info(`review-relay: delivered rejection notice via ${mode}`);
        }
        catch (error) {
            if (attempt === 0) {
                setTimeout(() => { this.deliver(delivery, 1); }, 50);
                return;
            }
            this.ctx.logger.warn(`review-relay: failed to deliver rejection notice: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    startTranslation(pending) {
        if (pending.reason === undefined || pending.translationPromise !== undefined)
            return;
        const route = translationRouteOf(pending.agent);
        const target = pending.targetLanguage;
        const promise = this.translator.translate({
            text: pending.reason,
            targetLanguage: target,
            route,
            sessionId: pending.sessionId,
        }).then((result) => {
            pending.translation = result;
            return result;
        }).catch(() => {
            const failed = { status: 'failed', reason: 'provider' };
            pending.translation = failed;
            return failed;
        });
        pending.translationPromise = promise;
        void promise;
    }
    translationView(result, targetLanguage) {
        switch (result.status) {
            case 'ok': return { status: 'ok', text: result.text, targetLanguage };
            case 'skipped': return { status: 'skipped', targetLanguage };
            case 'failed': return { status: 'failed', targetLanguage };
        }
    }
    async translationFor(pending, targetLanguage) {
        if (!pending.isReview || pending.reason === undefined) {
            return { status: 'skipped', targetLanguage };
        }
        if (!this.config.translate || this.config.translationProvider === 'off') {
            return { status: 'skipped', targetLanguage };
        }
        if (pending.targetLanguage !== targetLanguage) {
            pending.targetLanguage = targetLanguage;
            pending.translation = undefined;
            pending.translationPromise = undefined;
        }
        if (pending.translation !== undefined)
            return this.translationView(pending.translation, targetLanguage);
        this.startTranslation(pending);
        if (pending.translationPromise === undefined) {
            return { status: 'failed', targetLanguage };
        }
        return this.translationView(await pending.translationPromise, targetLanguage);
    }
    configResponse(request) {
        const url = new URL(request.url);
        this.rememberLocale(url.searchParams.get('locale'));
        const target = resolveTargetLanguage(this.config, this.clientLocale);
        return jsonResponse(200, publicConfig(this.config, target));
    }
    async noteResponse(request) {
        if (request.method !== 'POST')
            return errorResponse(405, 'method-not-allowed', 'method must be POST');
        const body = await readJsonBody(request);
        if (!body.ok)
            return body.response;
        if (!isRecord(body.value))
            return errorResponse(400, 'bad-request', 'body must be a JSON object');
        const sessionId = stringField(body.value, 'sessionId');
        const callId = stringField(body.value, 'callId');
        const note = stringField(body.value, 'note');
        const forward = booleanField(body.value, 'forward');
        const locale = stringField(body.value, 'locale');
        if (sessionId === undefined || sessionId === '' || callId === undefined || callId === '' || note === undefined || forward === undefined) {
            return errorResponse(400, 'bad-request', 'body must carry string sessionId/callId/note and boolean forward');
        }
        if (note.length > this.config.noteMaxChars) {
            return errorResponse(400, 'note-too-long', `note exceeds ${this.config.noteMaxChars} characters`);
        }
        if (!this.config.noteEnabled && note.trim() !== '') {
            return errorResponse(400, 'note-disabled', 'notes are disabled by configuration');
        }
        this.rememberLocale(locale);
        const pending = this.pendingReviews.get(this.pendingKey(sessionId, callId));
        if (pending === undefined)
            return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call');
        if (!pending.isReview && !this.config.noteForNonReviewApprovals) {
            return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call');
        }
        pending.note = note;
        pending.forward = forward;
        pending.noteSubmitted = true;
        return jsonResponse(200, { ok: true, ...this.config.noteEnabled ? {} : { noteIgnored: true } });
    }
    async translationResponse(request) {
        if (request.method !== 'GET')
            return errorResponse(405, 'method-not-allowed', 'method must be GET');
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');
        const callId = url.searchParams.get('callId');
        if (sessionId === null || sessionId === '' || callId === null || callId === '') {
            return errorResponse(400, 'bad-request', 'sessionId and callId are required');
        }
        this.rememberLocale(url.searchParams.get('locale'));
        const pending = this.pendingReviews.get(this.pendingKey(sessionId, callId));
        if (pending === undefined)
            return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call');
        const target = resolveTargetLanguage(this.config, url.searchParams.get('locale') ?? this.clientLocale);
        return jsonResponse(200, await this.translationFor(pending, target));
    }
    installHttp(scope) {
        const connection = scope.get('connection');
        if (connection === undefined || typeof connection.fetch?.register !== 'function') {
            this.ctx.logger.warn('review-relay: no connection.fetch service; note UI will fall back to the official approval card');
            return;
        }
        const register = (route) => {
            try {
                void connection.fetch.register(route);
            }
            catch (error) {
                this.httpReady = false;
                this.ctx.logger.warn(`review-relay: failed to register ${route.path}: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        register({
            path: '/api/review-relay/config',
            methods: ['GET'],
            requestBody: 'buffered',
            fetch: (request) => Promise.resolve(this.configResponse(request)),
        });
        register({
            path: '/api/review-relay/note',
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: (request) => this.guard(() => this.noteResponse(request)),
        });
        register({
            path: '/api/review-relay/translation',
            methods: ['GET'],
            requestBody: 'buffered',
            fetch: (request) => this.guard(() => this.translationResponse(request)),
        });
        this.httpReady = true;
    }
    async guard(handler) {
        try {
            return await handler();
        }
        catch (error) {
            this.ctx.logger.warn(`review-relay: route failed: ${error instanceof Error ? error.message : String(error)}`);
            return errorResponse(500, 'internal-error', 'review-relay route failed');
        }
    }
    rememberLocale(value) {
        const normalized = normalizeLocale(value);
        if (normalized !== undefined)
            this.clientLocale = normalized;
    }
    pendingKey(sessionId, callId) {
        return `${sessionId}\0${callId}`;
    }
    deliveryMapKey(sessionId, callId) {
        return `${sessionId}\0${callId}`;
    }
    prune() {
        const cutoff = Date.now() - PENDING_TTL_MS;
        for (const [key, pending] of this.pendingReviews) {
            if (pending.at < cutoff)
                this.pendingReviews.delete(key);
        }
    }
}
//# sourceMappingURL=runtime.js.map