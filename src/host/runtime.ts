/** Host runtime: observe review asks, collect the browser note, and deliver once. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome, ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { DeliveryMode, PublicConfig, TranslationView } from '../shared/types.js'
import { buildRelayMessage, truncateReviewerReason } from '../shared/template.js'
import { parseReviewAsk } from '../shared/parse.js'
import type { ResolvedConfig } from './config.js'
import { normalizeLocale, publicConfig, resolveTargetLanguage } from './config.js'
import { DeliveredSet, deliveryKey } from './dedup.js'
import { errorResponse, isRecord, jsonResponse, readJsonBody, stringField, booleanField } from './http.js'
import { TranslationService, translationRouteOf, type TranslationResult, type TranslationRuntime } from './translate.js'

/** One review ask awaiting a browser answer/note. */
interface PendingReview {
  readonly key: string
  readonly sessionId: string
  readonly callId: string
  readonly agent: Agent
  toolName: string
  reason: string | undefined
  isReview: boolean
  targetLanguage: string
  note: string | undefined
  forward: boolean | undefined
  noteSubmitted: boolean
  translation: TranslationResult | undefined
  translationPromise: Promise<TranslationResult> | undefined
  readonly at: number
}

/** One prepared message waiting for its committed tool result. */
interface PendingDelivery {
  readonly agent: Agent
  readonly sessionId: string
  readonly callId: string | undefined
  readonly text: string
  readonly at: number
}

/** Structural lookup for the optional agent registry. */
interface AgentLookup {
  get(id: SessionId): Agent | undefined
}

/** Structural subset of `ctx.connection` used here (type-only). */
interface ConnectionFetchRoute {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  readonly fetch: (request: Request) => Promise<Response>
}

interface ConnectionLike {
  readonly fetch: {
    register(route: ConnectionFetchRoute): () => Promise<void>
  }
}

/** How long an unanswered pending review is retained before pruning. */
const PENDING_TTL_MS = 60 * 60 * 1000

/**
 * Resolve how a prepared message enters the agent.
 * @param status - live agent status at delivery time.
 * @param configured - configured delivery mode.
 * @returns `inject` while a turn is open, `followup` when the agent is idle.
 */
export function resolveDeliveryMode(status: string, configured: DeliveryMode): 'inject' | 'followup' {
  if (configured === 'inject') return 'inject'
  if (configured === 'followup') return 'followup'
  return status === 'idle' ? 'followup' : 'inject'
}

/** Host-only relay runtime. */
export class ReviewRelayRuntime {
  private readonly translator: TranslationService
  private readonly delivered = new DeliveredSet()
  private readonly pendingReviews = new Map<string, PendingReview>()
  private readonly pendingDeliveries = new Map<string, PendingDelivery>()
  private clientLocale: string | undefined
  private httpReady = false
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {
    const llm = ctx.get('llm') as TranslationRuntime['llm']
    const translationRuntime: TranslationRuntime = {
      ...llm === undefined ? {} : { llm },
      get: (name) => ctx.get(name),
      logger: ctx.logger,
    }
    this.translator = new TranslationService(translationRuntime, config)
  }

  /** Install listeners, routes, and disposal. */
  install(): void {
    this.ctx.on('approval/request', this.onApproval, true)
    this.ctx.on('session/event', this.onSessionEvent)
    this.ctx.inject(['connection'], (scope) => { this.installHttp(scope) })
    this.ctx.effect(() => () => { this.dispose() }, 'review-relay: dispose')
    this.ctx.logger.info(
      `review-relay: active (forwardMode=${this.config.forwardMode}, delivery=${this.config.delivery}, translation=${this.config.translate ? this.config.translationProvider : 'off'})`,
    )
  }

  /** Whether the authenticated client routes registered successfully (diagnostics/tests). */
  get httpAvailable(): boolean {
    return this.httpReady
  }

  /** Unanswered review asks (diagnostics/tests). */
  get pendingReviewCount(): number {
    return this.pendingReviews.size
  }

  /** Messages waiting for their tool result (diagnostics/tests). */
  get pendingDeliveryCount(): number {
    return this.pendingDeliveries.size
  }

  /** Clear every in-memory structure and abort active translations. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.translator.clear()
    this.pendingReviews.clear()
    this.pendingDeliveries.clear()
    this.delivered.clear()
  }

  /** Observe one approval without changing its semantics. */
  private readonly onApproval = async (
    request: ApprovalRequestEvent,
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> => {
    if (this.disposed || !this.config.enabled) return next()
    const parsed = parseReviewAsk({
      toolName: request.toolName,
      ...request.reason === undefined ? {} : { reason: request.reason },
      ...request.displayReason === undefined ? {} : { displayReason: request.displayReason },
    }, this.config.pattern)
    const isReview = parsed !== undefined
    if (!isReview && !this.config.noteForNonReviewApprovals) return next()

    const sessionId = String(request.agent.session.id)
    const callId = request.callId === undefined ? undefined : String(request.callId)
    if (callId === undefined) {
      const outcome = await next()
      if (outcome === 'rejected' && isReview && this.config.forwardMode === 'always' && parsed.reason !== undefined) {
        const text = buildRelayMessage({
          toolName: parsed.toolName,
          reviewerReason: parsed.reason,
          maxForwardChars: this.config.maxForwardChars,
        })
        if (text !== undefined) {
          this.stageDelivery(request.agent, sessionId, request.toolName, parsed.reason, undefined, text)
        }
      }
      return outcome
    }

    this.prune()
    const key = this.pendingKey(sessionId, callId)
    let pending = this.pendingReviews.get(key)
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
      }
      this.pendingReviews.set(key, pending)
    } else {
      pending.toolName = request.toolName
      pending.reason = parsed?.reason ?? pending.reason
      pending.isReview ||= isReview
    }
    if (pending.isReview && pending.reason !== undefined && this.config.translate) {
      this.startTranslation(pending)
    }

    let outcome: ApprovalOutcome
    try {
      outcome = await next()
    } catch (error: unknown) {
      this.pendingReviews.delete(key)
      throw error
    }
    const settled = this.pendingReviews.get(key) ?? pending
    this.pendingReviews.delete(key)
    if (outcome !== 'rejected') return outcome

    const shouldForward = this.config.forwardMode === 'always'
      ? true
      : this.config.forwardMode === 'never'
        ? false
        : settled.noteSubmitted && settled.forward === true
    const note = this.config.noteEnabled ? settled.note ?? '' : ''
    const reviewerReason = shouldForward && settled.isReview ? settled.reason : undefined
    const translation = shouldForward
      && this.config.translateForForward
      && settled.translation?.status === 'ok'
      ? settled.translation.text
      : undefined
    const text = buildRelayMessage({
      toolName: settled.toolName,
      ...note === '' ? {} : { note },
      ...reviewerReason === undefined ? {} : { reviewerReason },
      ...translation === undefined ? {} : { translation },
      targetLanguage: settled.targetLanguage,
      maxForwardChars: this.config.maxForwardChars,
    })
    if (text === undefined) return outcome
    this.stageDelivery(settled.agent, sessionId, settled.toolName, reviewerReason, callId, text)
    return outcome
  }

  /** Deliver only after the matching tool/result is committed. */
  private readonly onSessionEvent = (session: Session, event: SessionEvent): void => {
    if (this.disposed) return
    if (event.type === 'tool/result') {
      const callId = String(event.data.message.toolCallId)
      const key = this.deliveryMapKey(String(session.id), callId)
      const delivery = this.pendingDeliveries.get(key)
      if (delivery !== undefined) {
        this.pendingDeliveries.delete(key)
        queueMicrotask(() => { this.deliver(delivery) })
        return
      }
      this.maybeRelayDirectDeny(session, event.data, callId)
      return
    }
    if (event.type === 'turn/end') {
      const prefix = `${String(session.id)}\0`
      for (const key of this.pendingDeliveries.keys()) {
        if (key.startsWith(prefix)) this.pendingDeliveries.delete(key)
      }
    }
  }

  /** Relay a final Auto review denial that never asked the user. */
  private maybeRelayDirectDeny(
    session: Session,
    data: Extract<SessionEvent, { type: 'tool/result' }>['data'],
    callId: string,
  ): void {
    if (!this.config.forwardOnDirectDeny) return
    const info = data.error
    if (info?.code !== 'AUTO_REVIEW_DENIED' || info.reason === undefined || info.reason.trim() === '') return
    const key = deliveryKey({ sessionId: String(session.id), callId: `${callId}:direct-deny`, toolName: 'tool', reason: info.reason })
    if (!this.delivered.mark(key)) return
    const agents = this.ctx.get('agents') as AgentLookup | undefined
    const agent = agents?.get(session.id)
    if (agent === undefined) return
    let toolName = 'tool'
    const events = session.snapshotEvents()
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type !== 'tool/call' || String(event.data.callId) !== callId) continue
      toolName = event.data.name
      break
    }
    const reviewer = truncateReviewerReason(info.reason, this.config.maxForwardChars)
    const text = `Auto review rejected tool "${toolName}".\n\nReviewer reason (verbatim):\n${reviewer.text}`
    const delivery: PendingDelivery = { agent, sessionId: String(session.id), callId: undefined, text, at: Date.now() }
    queueMicrotask(() => { this.deliver(delivery) })
  }

  private stageDelivery(
    agent: Agent,
    sessionId: string,
    toolName: string,
    reason: string | undefined,
    callId: string | undefined,
    text: string,
  ): void {
    const key = deliveryKey({ sessionId, toolName, reason, ...callId === undefined ? {} : { callId } })
    if (!this.delivered.mark(key)) {
      this.ctx.logger.warn(`review-relay: duplicate rejection ignored for tool "${toolName}"`)
      return
    }
    const delivery: PendingDelivery = { agent, sessionId, callId, text, at: Date.now() }
    if (callId === undefined) {
      queueMicrotask(() => { this.deliver(delivery) })
      return
    }
    this.pendingDeliveries.set(this.deliveryMapKey(sessionId, callId), delivery)
  }

  private deliver(delivery: PendingDelivery, attempt = 0): void {
    if (this.disposed) return
    const message = createUserMessage({
      content: [{ type: 'text', text: delivery.text }],
      source: { kind: 'user' },
    })
    const mode = resolveDeliveryMode(delivery.agent.status, this.config.delivery)
    try {
      if (mode === 'followup') delivery.agent.followup(message)
      else delivery.agent.inject(message)
      this.ctx.logger.info(`review-relay: delivered rejection notice via ${mode}`)
    } catch (error: unknown) {
      if (attempt === 0) {
        setTimeout(() => { this.deliver(delivery, 1) }, 50)
        return
      }
      this.ctx.logger.warn(
        `review-relay: failed to deliver rejection notice: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private startTranslation(pending: PendingReview): void {
    if (pending.reason === undefined || pending.translationPromise !== undefined) return
    const route = translationRouteOf(pending.agent)
    const target = pending.targetLanguage
    const promise = this.translator.translate({
      text: pending.reason,
      targetLanguage: target,
      route,
      sessionId: pending.sessionId,
    }).then((result) => {
      pending.translation = result
      return result
    }).catch((): TranslationResult => {
      const failed: TranslationResult = { status: 'failed', reason: 'provider' }
      pending.translation = failed
      return failed
    })
    pending.translationPromise = promise
    void promise
  }

  private translationView(result: TranslationResult, targetLanguage: string): TranslationView {
    switch (result.status) {
      case 'ok': return { status: 'ok', text: result.text, targetLanguage }
      case 'skipped': return { status: 'skipped', targetLanguage }
      case 'failed': return { status: 'failed', targetLanguage }
    }
  }

  private async translationFor(pending: PendingReview, targetLanguage: string): Promise<TranslationView> {
    if (!pending.isReview || pending.reason === undefined) {
      return { status: 'skipped', targetLanguage }
    }
    if (!this.config.translate || this.config.translationProvider === 'off') {
      return { status: 'skipped', targetLanguage }
    }
    if (pending.targetLanguage !== targetLanguage) {
      pending.targetLanguage = targetLanguage
      pending.translation = undefined
      pending.translationPromise = undefined
    }
    if (pending.translation !== undefined) return this.translationView(pending.translation, targetLanguage)
    this.startTranslation(pending)
    if (pending.translationPromise === undefined) {
      return { status: 'failed', targetLanguage }
    }
    return this.translationView(await pending.translationPromise, targetLanguage)
  }

  private configResponse(request: Request): Response {
    const url = new URL(request.url)
    this.rememberLocale(url.searchParams.get('locale'))
    const target = resolveTargetLanguage(this.config, this.clientLocale)
    return jsonResponse(200, publicConfig(this.config, target) satisfies PublicConfig)
  }

  private async noteResponse(request: Request): Promise<Response> {
    if (request.method !== 'POST') return errorResponse(405, 'method-not-allowed', 'method must be POST')
    const body = await readJsonBody(request)
    if (!body.ok) return body.response
    if (!isRecord(body.value)) return errorResponse(400, 'bad-request', 'body must be a JSON object')
    const sessionId = stringField(body.value, 'sessionId')
    const callId = stringField(body.value, 'callId')
    const note = stringField(body.value, 'note')
    const forward = booleanField(body.value, 'forward')
    const locale = stringField(body.value, 'locale')
    if (sessionId === undefined || sessionId === '' || callId === undefined || callId === '' || note === undefined || forward === undefined) {
      return errorResponse(400, 'bad-request', 'body must carry string sessionId/callId/note and boolean forward')
    }
    if (note.length > this.config.noteMaxChars) {
      return errorResponse(400, 'note-too-long', `note exceeds ${this.config.noteMaxChars} characters`)
    }
    if (!this.config.noteEnabled && note.trim() !== '') {
      return errorResponse(400, 'note-disabled', 'notes are disabled by configuration')
    }
    this.rememberLocale(locale)
    const pending = this.pendingReviews.get(this.pendingKey(sessionId, callId))
    if (pending === undefined) return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call')
    if (!pending.isReview && !this.config.noteForNonReviewApprovals) {
      return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call')
    }
    pending.note = note
    pending.forward = forward
    pending.noteSubmitted = true
    return jsonResponse(200, { ok: true, ...this.config.noteEnabled ? {} : { noteIgnored: true } })
  }

  private async translationResponse(request: Request): Promise<Response> {
    if (request.method !== 'GET') return errorResponse(405, 'method-not-allowed', 'method must be GET')
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const callId = url.searchParams.get('callId')
    if (sessionId === null || sessionId === '' || callId === null || callId === '') {
      return errorResponse(400, 'bad-request', 'sessionId and callId are required')
    }
    this.rememberLocale(url.searchParams.get('locale'))
    const pending = this.pendingReviews.get(this.pendingKey(sessionId, callId))
    if (pending === undefined) return errorResponse(404, 'approval-not-pending', 'no pending approval matches this call')
    const target = resolveTargetLanguage(this.config, url.searchParams.get('locale') ?? this.clientLocale)
    return jsonResponse(200, await this.translationFor(pending, target))
  }

  private installHttp(scope: Context): void {
    const connection = scope.get('connection') as ConnectionLike | undefined
    if (connection === undefined || typeof connection.fetch?.register !== 'function') {
      this.ctx.logger.warn('review-relay: no connection.fetch service; note UI will fall back to the official approval card')
      return
    }
    const register = (route: ConnectionFetchRoute): void => {
      try {
        void connection.fetch.register(route)
      } catch (error: unknown) {
        this.httpReady = false
        this.ctx.logger.warn(
          `review-relay: failed to register ${route.path}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    register({
      path: '/api/review-relay/config',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => this.guard(async () => this.configResponse(request)),
    })
    register({
      path: '/api/review-relay/note',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => this.guard(() => this.noteResponse(request)),
    })
    register({
      path: '/api/review-relay/translation',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request) => this.guard(() => this.translationResponse(request)),
    })
    this.httpReady = true
  }

  private async guard(handler: () => Promise<Response>): Promise<Response> {
    try {
      return await handler()
    } catch (error: unknown) {
      this.ctx.logger.warn(
        `review-relay: route failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return errorResponse(500, 'internal-error', 'review-relay route failed')
    }
  }

  private rememberLocale(value: string | null | undefined): void {
    const normalized = normalizeLocale(value)
    if (normalized !== undefined) this.clientLocale = normalized
  }

  private pendingKey(sessionId: string, callId: string): string {
    return `${sessionId}\0${callId}`
  }

  private deliveryMapKey(sessionId: string, callId: string): string {
    return `${sessionId}\0${callId}`
  }

  private prune(): void {
    const cutoff = Date.now() - PENDING_TTL_MS
    for (const [key, pending] of this.pendingReviews) {
      if (pending.at < cutoff) this.pendingReviews.delete(key)
    }
  }
}
