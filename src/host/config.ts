/** Load-time configuration: schema defaults, strict unknown-key checks, semantic validation. */
import z from '@deepseek-ai/schemastery'
import type { DeliveryMode, ForwardMode, PublicConfig, TranslationProvider } from '../shared/types.js'
import { compileReviewerPattern, DEFAULT_REVIEWER_REASON_PATTERN } from '../shared/parse.js'

/** Resolved plugin configuration. */
export interface ReviewRelayConfig {
  enabled: boolean
  reviewerReasonPattern: string
  noteEnabled: boolean
  noteForNonReviewApprovals: boolean
  noteMaxChars: number
  forwardMode: ForwardMode
  defaultForward: boolean
  maxForwardChars: number
  targetLanguage: string
  translate: boolean
  translateForForward: boolean
  showOriginal: boolean
  translationProvider: TranslationProvider
  translationModel?: string
  translationTimeoutMs: number
  delivery: DeliveryMode
  forwardOnDirectDeny: boolean
}

/** Validated configuration plus the compiled recognition pattern. */
export interface ResolvedConfig extends ReviewRelayConfig {
  readonly pattern: RegExp
}

/** Every accepted top-level config key, in schema order. */
const CONFIG_KEYS = [
  'enabled',
  'reviewerReasonPattern',
  'noteEnabled',
  'noteForNonReviewApprovals',
  'noteMaxChars',
  'forwardMode',
  'defaultForward',
  'maxForwardChars',
  'targetLanguage',
  'translate',
  'translateForForward',
  'showOriginal',
  'translationProvider',
  'translationModel',
  'translationTimeoutMs',
  'delivery',
  'forwardOnDirectDeny',
] as const

const KNOWN_KEYS = new Set<string>(CONFIG_KEYS)

/** Schemastery schema shown by `Config.listConfigs` and enforced by the Loader. */
export const Config: z<Partial<ReviewRelayConfig>, ReviewRelayConfig> = z.object({
  enabled: z.boolean().default(true),
  reviewerReasonPattern: z.string().default(DEFAULT_REVIEWER_REASON_PATTERN),
  noteEnabled: z.boolean().default(true),
  noteForNonReviewApprovals: z.boolean().default(false),
  noteMaxChars: z.number().default(2000),
  forwardMode: z.union(['ask', 'always', 'never'] as const).default('ask'),
  defaultForward: z.boolean().default(true),
  maxForwardChars: z.number().default(8000),
  targetLanguage: z.string().default('ui'),
  translate: z.boolean().default(true),
  translateForForward: z.boolean().default(true),
  showOriginal: z.boolean().default(true),
  translationProvider: z.union(['llm', 'translator', 'off'] as const).default('llm'),
  translationModel: z.string().required(false),
  translationTimeoutMs: z.number().default(10000),
  delivery: z.union(['tool-result', 'auto', 'inject', 'followup'] as const).default('tool-result'),
  forwardOnDirectDeny: z.boolean().default(false),
})

function integerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`review-relay: ${name} must be an integer in [${min}, ${max}], received ${String(value)}`)
  }
}

function assertBcp47(name: string, value: string): void {
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value)) {
    throw new TypeError(`review-relay: ${name} must be "ui" or a BCP-47 language tag, received ${JSON.stringify(value)}`)
  }
}

/**
 * Validate raw config and compile the recognition pattern once.
 * @param raw - raw Loader config (or a resolved object after a reload).
 * @returns the validated config with its compiled pattern.
 * @throws {TypeError} on unknown keys, out-of-range numbers, bad enums, or a bad pattern.
 */
export function resolveConfig(raw: unknown): ResolvedConfig {
  if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
    throw new TypeError('review-relay: config must be an object')
  }
  const record = (raw ?? {}) as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new TypeError(`review-relay: unknown config field ${JSON.stringify(key)}; known fields are ${CONFIG_KEYS.join(', ')}`)
    }
  }
  let parsed: ReviewRelayConfig
  try {
    parsed = Config(record as Partial<ReviewRelayConfig>)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new TypeError(`review-relay: invalid config: ${detail}`)
  }
  integerInRange('noteMaxChars', parsed.noteMaxChars, 1, 100_000)
  integerInRange('maxForwardChars', parsed.maxForwardChars, 1, 1_000_000)
  integerInRange('translationTimeoutMs', parsed.translationTimeoutMs, 100, 120_000)
  if (parsed.targetLanguage !== 'ui') assertBcp47('targetLanguage', parsed.targetLanguage)
  if (parsed.translationModel !== undefined && parsed.translationModel.trim() === '') {
    throw new TypeError('review-relay: translationModel must be a non-empty model id when set')
  }
  let pattern: RegExp
  try {
    pattern = compileReviewerPattern(parsed.reviewerReasonPattern)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new TypeError(`review-relay: invalid reviewerReasonPattern: ${detail}`)
  }
  return { ...parsed, pattern }
}

/**
 * Normalize a UI or environment locale to a translation target.
 * @param value - raw locale, optionally with an encoding or underscore separator.
 * @returns a BCP-47-ish tag, or undefined when unusable.
 */
export function normalizeLocale(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.split('.')[0]?.replace(/_/g, '-').trim()
  if (cleaned === undefined || cleaned === '') return undefined
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(cleaned)) return undefined
  const lower = cleaned.toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-hans') || (lower.startsWith('zh-') && !/^zh-(tw|hk|mo|hant)/.test(lower))) {
    return 'zh-CN'
  }
  if (/^zh-(tw|hk|mo|hant)/.test(lower)) return 'zh-TW'
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return cleaned
}

/**
 * Resolve the effective target language. `ui` follows the browser locale when
 * the client supplied one, then the host locale environment, then zh-CN.
 * @param config - validated config.
 * @param clientLocale - locale reported by the browser, when available.
 * @returns a concrete target language tag.
 */
export function resolveTargetLanguage(config: ReviewRelayConfig, clientLocale?: string | undefined): string {
  if (config.targetLanguage !== 'ui') return config.targetLanguage
  const fromClient = normalizeLocale(clientLocale)
  if (fromClient !== undefined) return fromClient
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const) {
    const value = process.env[key]
    const normalized = normalizeLocale(value)
    if (normalized !== undefined) return normalized
  }
  return 'zh-CN'
}

/**
 * Project the public, client-safe config.
 * @param config - validated config.
 * @param resolvedTargetLanguage - effective target for this request.
 * @returns the body of `GET /api/review-relay/config`.
 */
export function publicConfig(config: ReviewRelayConfig, resolvedTargetLanguage: string): PublicConfig {
  return {
    protocol: 1,
    enabled: config.enabled,
    noteEnabled: config.noteEnabled,
    noteForNonReviewApprovals: config.noteForNonReviewApprovals,
    noteMaxChars: config.noteMaxChars,
    forwardMode: config.forwardMode,
    defaultForward: config.defaultForward,
    maxForwardChars: config.maxForwardChars,
    targetLanguage: config.targetLanguage,
    resolvedTargetLanguage,
    showOriginal: config.showOriginal,
    translate: config.translate,
    translateForForward: config.translateForForward,
    translationProvider: config.translationProvider,
    translationTimeoutMs: config.translationTimeoutMs,
    reviewerReasonPattern: config.reviewerReasonPattern,
  }
}
