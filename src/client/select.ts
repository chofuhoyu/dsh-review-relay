/** Pure routing/decision helpers shared by the card and its tests. */
import { compileReviewerPattern, parseReviewAsk } from '../shared/parse.js'
import type { PublicConfig, ReviewAsk } from '../shared/types.js'

/** Structural view of the official PendingApproval instance (no value import). */
export interface ApprovalLike {
  readonly kind: 'approval'
  readonly key: string
  readonly sessionId: string
  readonly toolName: string
  readonly callId?: string | undefined
  readonly reason?: string | undefined
  readonly displayReason?: { readonly en: string; readonly [locale: string]: string } | undefined
  readonly signal?: AbortSignal | undefined
  readonly answerable: boolean
  answer(outcome: 'allowed-once' | 'rejected'): Promise<void>
}

/** One elected card. `review` is null for an opted-in ordinary approval. */
export interface MatchedApproval {
  readonly approval: ApprovalLike
  readonly review: ReviewAsk | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Whether a pending interaction is an answerable approval instance. */
export function isApprovalLike(value: unknown): value is ApprovalLike {
  if (!isRecord(value)) return false
  return value['kind'] === 'approval'
    && typeof value['key'] === 'string'
    && typeof value['sessionId'] === 'string'
    && typeof value['toolName'] === 'string'
    && (value['callId'] === undefined || typeof value['callId'] === 'string')
    && (value['reason'] === undefined || typeof value['reason'] === 'string')
    && (value['displayReason'] === undefined || isRecord(value['displayReason']))
    && typeof value['answerable'] === 'boolean'
    && typeof value['answer'] === 'function'
}

/** Compile the host-provided recognition pattern for browser routing. */
export function compileClientPattern(config: PublicConfig): RegExp {
  return compileReviewerPattern(config.reviewerReasonPattern)
}

/**
 * Decide whether this chain entry takes over the approval.
 * @param value - the owner's pendingInteraction.
 * @param config - fetched public config.
 * @param pattern - compiled recognition pattern.
 * @returns the elected card input, or null to let the official entry render.
 */
export function matchApproval(value: unknown, config: PublicConfig, pattern: RegExp): MatchedApproval | null {
  if (!config.enabled) return null
  if (!isApprovalLike(value)) return null
  // Both the note route and the translation route are call-id addressed. An
  // approval without one must keep the official card rather than render a
  // card whose note could never be delivered.
  if (value.callId === undefined || value.callId === '') return null
  const review = parseReviewAsk({
    toolName: value.toolName,
    ...value.reason === undefined ? {} : { reason: value.reason },
    ...value.displayReason === undefined ? {} : { displayReason: value.displayReason },
  }, pattern) ?? null
  if (review === null && (!config.noteForNonReviewApprovals || !config.noteEnabled)) return null
  return { approval: value, review }
}

/** Initial checkbox state for the configured forward mode. */
export function initialForward(config: PublicConfig): boolean {
  switch (config.forwardMode) {
    case 'always': return true
    case 'never': return false
    case 'ask': return config.defaultForward
  }
}

/** Whether the forward checkbox is shown for this card. */
export function forwardVisible(config: PublicConfig, matched: MatchedApproval): boolean {
  return matched.review !== null
    && matched.review.reason !== undefined
    && config.forwardMode !== 'never'
}

/** Whether the forward checkbox is forced by config. */
export function forwardForced(config: PublicConfig): boolean {
  return config.forwardMode === 'always'
}
