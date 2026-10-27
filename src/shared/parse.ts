/**
 * Recognition of Auto review's ask reason. The parser is pure so the browser
 * half can make the same routing decision as the host without importing Node.
 */
import type { ReviewAsk } from './types.js'

/**
 * Default pattern for the shipped 0.2.1-rc.2 ask path:
 * `Auto review denied tool "<tool>": <reason>`.
 *
 * The direct-deny text (`Auto review rejected tool "<tool>"; its body was not
 * executed`) intentionally does not match, and a custom pattern that would
 * match it is still rejected by the explicit guards below.
 */
export const DEFAULT_REVIEWER_REASON_PATTERN = '^Auto review denied tool "(?<tool>[^"]+)"(?:: (?<reason>[\\s\\S]+))?$'

/** Shipped direct denial, which is not an ask. */
const DIRECT_DENY_PATTERN = /^Auto review rejected tool "[^"]+"; its body was not executed$/
/** Shipped reviewer failure, which is not an ask. */
const REVIEW_FAILURE_PATTERN = /^Auto review of tool "[^"]+" failed; its body was not executed(?:$|: )/
/** Localized display fallback for an ask whose English `reason` is absent. */
const DISPLAY_FALLBACK_PATTERN = /^Auto review 拒绝了此调用：(?<reason>[\s\S]+)$/

/** Input fields the approval request exposes to recognition. */
export interface ReviewAskInput {
  readonly toolName: string
  readonly reason?: string | undefined
  readonly displayReason?: { readonly zh?: string | undefined; readonly [locale: string]: string | undefined } | undefined
}

/**
 * Compile and validate a configured recognition pattern.
 * @param source - JavaScript regular-expression source with `tool` and `reason` groups.
 * @returns the compiled pattern (never stateful: no global/sticky flags).
 * @throws {TypeError} when the source is empty, invalid, or misses a required group.
 */
export function compileReviewerPattern(source: string): RegExp {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError('review-relay: reviewerReasonPattern must be a non-empty regular expression')
  }
  let pattern: RegExp
  try {
    pattern = new RegExp(source)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new TypeError(`review-relay: reviewerReasonPattern is not a valid regular expression: ${detail}`)
  }
  if (!pattern.source.includes('(?<tool>')) {
    throw new TypeError('review-relay: reviewerReasonPattern must declare a named "tool" group')
  }
  if (!pattern.source.includes('(?<reason>')) {
    throw new TypeError('review-relay: reviewerReasonPattern must declare a named "reason" group')
  }
  return pattern
}

/**
 * Parse one approval reason as an Auto review ask.
 * @param input - the approval request's tool name and reason fields.
 * @param pattern - compiled {@link DEFAULT_REVIEWER_REASON_PATTERN} or configured equivalent.
 * @returns the parsed ask, or undefined for any ordinary/direct/failed approval.
 */
export function parseReviewAsk(input: ReviewAskInput, pattern: RegExp): ReviewAsk | undefined {
  const reason = input.reason
  if (reason !== undefined) {
    // These guards keep a broader custom pattern from turning a final denial
    // or a reviewer failure into an ask.
    if (DIRECT_DENY_PATTERN.test(reason) || REVIEW_FAILURE_PATTERN.test(reason)) return undefined
    const match = pattern.exec(reason)
    if (match !== null) {
      const tool = match.groups?.['tool']
      if (typeof tool === 'string' && tool.length > 0) {
        const captured = match.groups?.['reason']
        return {
          toolName: tool,
          reason: typeof captured === 'string' && captured.length > 0 ? captured : undefined,
        }
      }
    }
  }
  if (reason === undefined) {
    const localized = input.displayReason?.zh
    if (typeof localized === 'string') {
      const fallback = DISPLAY_FALLBACK_PATTERN.exec(localized)
      const captured = fallback?.groups?.['reason']
      if (typeof captured === 'string' && captured.length > 0) {
        return { toolName: input.toolName, reason: captured }
      }
    }
  }
  return undefined
}
