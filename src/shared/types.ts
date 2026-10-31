/** Shared value contracts for the host and browser halves (no Node APIs). */

/** How the reviewer reason is forwarded. */
export type ForwardMode = 'ask' | 'always' | 'never'

/** Translation backend selection. */
export type TranslationProvider = 'llm' | 'translator' | 'off'

/**
 * Where a prepared relay text is delivered.
 *
 * `tool-result` appends it to the rejected call's own tool result, so the model
 * sees it at tool priority and the conversation shows no synthetic user
 * message. `auto` is a deprecated alias for `tool-result`. `inject` and
 * `followup` are the legacy synthetic-user-message modes.
 */
export type DeliveryMode = 'tool-result' | 'auto' | 'inject' | 'followup'

/** One parsed Auto review ask. `reason` is absent when the reviewer gave none. */
export interface ReviewAsk {
  readonly toolName: string
  readonly reason: string | undefined
}

/** Client-safe configuration served by `GET /api/review-relay/config`. */
export interface PublicConfig {
  readonly protocol: 1
  readonly enabled: boolean
  readonly noteEnabled: boolean
  readonly noteForNonReviewApprovals: boolean
  readonly noteMaxChars: number
  readonly forwardMode: ForwardMode
  readonly defaultForward: boolean
  readonly maxForwardChars: number
  readonly targetLanguage: string
  readonly resolvedTargetLanguage: string
  readonly showOriginal: boolean
  readonly translate: boolean
  readonly translateForForward: boolean
  readonly translationProvider: TranslationProvider
  readonly translationTimeoutMs: number
  readonly reviewerReasonPattern: string
}

/** One note submitted by the browser before it answers a pending approval. */
export interface NoteRequest {
  readonly sessionId: string
  readonly callId: string
  readonly note: string
  readonly forward: boolean
  readonly locale?: string
}

/** Translation state returned to the card. */
export type TranslationView =
  | { readonly status: 'ok'; readonly text: string; readonly targetLanguage: string }
  | { readonly status: 'skipped'; readonly targetLanguage: string }
  | { readonly status: 'failed'; readonly targetLanguage: string }
