/** Browser-side calls to the authenticated review-relay routes. */
import type { NoteRequest, PublicConfig, TranslationView } from '../shared/types.js'

const BASE = 'api/review-relay'

/** Document-relative endpoint URL (the served shell owns the mount base). */
export function endpoint(path: string): string {
  return `${BASE}/${path}`
}

/** Normalize the active UI locale to a translation tag. */
export function uiLocale(active: string | undefined): string {
  if (active === undefined || active === '') return 'zh-CN'
  if (active === 'zh') return 'zh-CN'
  if (active === 'en') return 'en'
  return active
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** Validate the public config wire shape. */
export function isPublicConfig(value: unknown): value is PublicConfig {
  if (!isRecord(value)) return false
  return value['protocol'] === 1
    && isBoolean(value['enabled'])
    && isBoolean(value['noteEnabled'])
    && isBoolean(value['noteForNonReviewApprovals'])
    && isNumber(value['noteMaxChars'])
    && (value['forwardMode'] === 'ask' || value['forwardMode'] === 'always' || value['forwardMode'] === 'never')
    && isBoolean(value['defaultForward'])
    && isNumber(value['maxForwardChars'])
    && isString(value['targetLanguage'])
    && isString(value['resolvedTargetLanguage'])
    && isBoolean(value['showOriginal'])
    && isBoolean(value['translate'])
    && isBoolean(value['translateForForward'])
    && (value['translationProvider'] === 'llm' || value['translationProvider'] === 'translator' || value['translationProvider'] === 'off')
    && isNumber(value['translationTimeoutMs'])
    && isString(value['reviewerReasonPattern'])
}

/** Validate one translation view. */
export function isTranslationView(value: unknown): value is TranslationView {
  if (!isRecord(value)) return false
  if (!isString(value['targetLanguage'])) return false
  if (value['status'] === 'ok') return isString(value['text'])
  return value['status'] === 'skipped' || value['status'] === 'failed'
}

/** Result of a note submission attempt. */
export type NoteSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string }

/**
 * Fetch the client-safe config once.
 * @param locale - current UI locale.
 * @param signal - plugin lifetime cancellation.
 * @returns validated config, or undefined when the route is unavailable.
 */
export async function fetchConfig(locale: string, signal: AbortSignal): Promise<PublicConfig | undefined> {
  try {
    const response = await fetch(`${endpoint('config')}?locale=${encodeURIComponent(locale)}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return undefined
    const value: unknown = await response.json()
    return isPublicConfig(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Submit the note before answering rejected.
 * @param request - pending session/call identity, note, forward flag, and locale.
 * @param signal - client cancellation.
 * @returns success or a card-displayable error code/message.
 */
export async function submitNote(request: NoteRequest, signal?: AbortSignal): Promise<NoteSubmitResult> {
  try {
    const response = await fetch(endpoint('note'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(request),
      ...signal === undefined ? {} : { signal },
    })
    if (response.ok) return { ok: true }
    let code = 'unknown'
    let message = `HTTP ${String(response.status)}`
    try {
      const value: unknown = await response.json()
      if (isRecord(value)) {
        if (isString(value['code'])) code = value['code']
        if (isString(value['message'])) message = value['message']
      }
    } catch {
      // The status is enough for the generic failure line.
    }
    return { ok: false, code, message }
  } catch (error: unknown) {
    return {
      ok: false,
      code: 'network',
      message: error instanceof Error ? error.message : 'network error',
    }
  }
}

/**
 * Read the reviewer-reason translation for a pending approval.
 * @param sessionId - pending session identity.
 * @param callId - pending tool call identity.
 * @param locale - current UI locale.
 * @param timeoutMs - hard client wait; the host owns the provider timeout.
 * @returns a validated view, or undefined on transport/HTTP failure.
 */
export async function fetchTranslation(
  sessionId: string,
  callId: string,
  locale: string,
  timeoutMs: number,
): Promise<TranslationView | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('translation request timed out')) }, timeoutMs)
  try {
    const query = new URLSearchParams({ sessionId, callId, locale })
    const response = await fetch(`${endpoint('translation')}?${query.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    const value: unknown = await response.json()
    return isTranslationView(value) ? value : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
