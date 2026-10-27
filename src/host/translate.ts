/** One-shot translation through the current LLM route or the optional translator service. */
import { createHash } from 'node:crypto'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TranslationProvider } from '../shared/types.js'
import type { ResolvedConfig } from './config.js'

/** Fixed system prompt; changing it changes translation behavior. */
export const TRANSLATION_SYSTEM_PROMPT = `You are a translation engine. Translate only the user's text into the requested target language.
Preserve code blocks, inline code, commands, paths, URLs, placeholders, identifiers, and line breaks exactly.
Do not add explanations, quotes, Markdown fences, or commentary. Return only the translation.`

/** Translation outcome with a machine-readable status. */
export type TranslationResult =
  | { readonly status: 'ok'; readonly text: string }
  | { readonly status: 'skipped'; readonly reason: 'disabled' | 'already-target' | 'empty' }
  | { readonly status: 'failed'; readonly reason: 'no-route' | 'timeout' | 'aborted' | 'provider' | 'empty-output' }

/** LLM route used for one translation request. */
export interface TranslationRoute {
  readonly provider: string
  readonly model: string
}

/** Structural dependencies, allowing tests to inject a fake LLM and translator. */
export interface TranslationRuntime {
  readonly llm?: {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  }
  get(name: string): unknown
  readonly logger: {
    warn(message: string): void
  }
}

/** One translation request. */
export interface TranslationRequest {
  readonly text: string
  readonly targetLanguage: string
  readonly route: TranslationRoute | undefined
  readonly sessionId: string | undefined
  readonly signal?: AbortSignal | undefined
}

/** Structural translator service contract from the optional experimental package. */
interface TranslatorLike {
  readonly maxTextChars?: number
  resolve(request: {
    readonly text: string
    readonly targetLanguage: string
    readonly sourceLanguage?: string
    readonly sessionId?: string
  }): unknown
  translate(spec: unknown, signal?: AbortSignal): Promise<string>
}

/** Maximum cached translations. */
export const TRANSLATION_CACHE_LIMIT = 128

/**
 * Whether text is already in the target language, using a CJK-coverage
 * heuristic for Chinese and an ASCII test for English.
 * @param text - source text.
 * @param targetLanguage - resolved target tag.
 * @returns true when no translation request is needed.
 */
export function isAlreadyTargetLanguage(text: string, targetLanguage: string): boolean {
  if (text.trim() === '') return true
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  const lower = targetLanguage.toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-')) {
    return letters > 0 && han / letters >= 0.5
  }
  if (lower === 'en' || lower.startsWith('en-')) {
    return han === 0 && /[A-Za-z]/.test(text) && /^[\x00-\x7F\s]*$/u.test(text)
  }
  return false
}

/** Split text into translator-sized chunks, preferring line boundaries. */
export function splitForLimit(text: string, limit: number): string[] {
  if (limit <= 0 || text.length <= limit) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut <= 0) cut = limit
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut + (rest.charAt(cut) === '\n' ? 1 : 0))
  }
  if (rest !== '') chunks.push(rest)
  return chunks
}

/** LRU translation cache keyed by source/target/provider/model. */
export class TranslationCache {
  private readonly entries = new Map<string, string>()

  constructor(private readonly limit = TRANSLATION_CACHE_LIMIT) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: string, value: string): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next()
      if (oldest.done === true) break
      this.entries.delete(oldest.value)
    }
  }

  get size(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Read the LLM route a translation should use for one agent. */
export function translationRouteOf(agent: Agent): TranslationRoute | undefined {
  const header = agent.session.requestHeader()
  if (header !== undefined && header.config.provider !== '' && header.config.model !== '') {
    return { provider: header.config.provider, model: header.config.model }
  }
  const provider = agent.options.provider
  const model = agent.options.model
  if (provider !== undefined && provider !== '' && model !== undefined && model !== '') {
    return { provider, model }
  }
  return undefined
}

/** Per-process translator with in-flight deduplication and a bounded LRU. */
export class TranslationService {
  private readonly cache = new TranslationCache()
  private readonly inflight = new Map<string, Promise<TranslationResult>>()
  private readonly controllers = new Set<AbortController>()
  private warnedMissingTranslator = false

  constructor(
    private readonly runtime: TranslationRuntime,
    private readonly config: ResolvedConfig,
  ) {}

  /**
   * Translate one reviewer reason.
   * @param request - source text, target, route, session, and cancellation.
   * @returns ok/skipped/failed, never a partial translation.
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.config.translate || this.config.translationProvider === 'off') {
      return { status: 'skipped', reason: 'disabled' }
    }
    if (request.text.trim() === '') return { status: 'skipped', reason: 'empty' }
    if (isAlreadyTargetLanguage(request.text, request.targetLanguage)) {
      return { status: 'skipped', reason: 'already-target' }
    }
    if (request.route === undefined) return { status: 'failed', reason: 'no-route' }
    const model = this.config.translationModel ?? request.route.model
    const key = this.cacheKey(request.text, request.targetLanguage, request.route.provider, model)
    const cached = this.cache.get(key)
    if (cached !== undefined) return { status: 'ok', text: cached }
    const pending = this.inflight.get(key)
    if (pending !== undefined) return await pending
    const task = this.run(key, request, request.route.provider, model).finally(() => {
      this.inflight.delete(key)
    })
    this.inflight.set(key, task)
    return await task
  }

  /** Cancel every active translation and clear cached/queued state. */
  clear(): void {
    for (const controller of this.controllers) controller.abort(new Error('review-relay disposed'))
    this.controllers.clear()
    this.inflight.clear()
    this.cache.clear()
  }

  private async run(
    key: string,
    request: TranslationRequest,
    provider: string,
    model: string,
  ): Promise<TranslationResult> {
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort(request.signal?.reason ?? new Error('translation aborted')) }
    if (request.signal !== undefined) {
      request.signal.addEventListener('abort', onAbort, { once: true })
      if (request.signal.aborted) onAbort()
    }
    const timer = setTimeout(() => { controller.abort(new Error('translation timeout')) }, this.config.translationTimeoutMs)
    this.controllers.add(controller)
    try {
      const text = this.config.translationProvider === 'translator'
        ? await this.translateViaTranslator(request, controller.signal) ?? await this.translateViaLlm(request, provider, model, controller.signal)
        : await this.translateViaLlm(request, provider, model, controller.signal)
      if (text.trim() === '') return { status: 'failed', reason: 'empty-output' }
      this.cache.set(key, text)
      return { status: 'ok', text }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        const disposed = controller.signal.reason instanceof Error
          && controller.signal.reason.message === 'review-relay disposed'
        return { status: 'failed', reason: request.signal?.aborted === true || disposed ? 'aborted' : 'timeout' }
      }
      this.runtime.logger.warn(`review-relay: translation failed: ${error instanceof Error ? error.message : String(error)}`)
      return { status: 'failed', reason: 'provider' }
    } finally {
      clearTimeout(timer)
      this.controllers.delete(controller)
      if (request.signal !== undefined) request.signal.removeEventListener('abort', onAbort)
    }
  }

  private async translateViaTranslator(request: TranslationRequest, signal: AbortSignal): Promise<string | undefined> {
    const translator = this.translator()
    if (translator === undefined) return undefined
    const limit = translator.maxTextChars ?? 4000
    const parts: string[] = []
    for (const chunk of splitForLimit(request.text, limit)) {
      const spec = translator.resolve({
        text: chunk,
        targetLanguage: request.targetLanguage,
        ...request.sessionId === undefined ? {} : { sessionId: request.sessionId },
      })
      parts.push(await translator.translate(spec, signal))
      signal.throwIfAborted()
    }
    return parts.join('\n')
  }

  private translator(): TranslatorLike | undefined {
    const service = this.runtime.get('translator')
    if (service === null || typeof service !== 'object') {
      this.warnTranslatorMissing()
      return undefined
    }
    const candidate = service as Partial<TranslatorLike>
    if (typeof candidate.resolve !== 'function' || typeof candidate.translate !== 'function') {
      this.warnTranslatorMissing()
      return undefined
    }
    return candidate as TranslatorLike
  }

  private warnTranslatorMissing(): void {
    if (this.warnedMissingTranslator) return
    this.warnedMissingTranslator = true
    this.runtime.logger.warn('review-relay: translationProvider="translator" but no translator service is mounted; falling back to llm')
  }

  private async translateViaLlm(
    request: TranslationRequest,
    provider: string,
    model: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (this.runtime.llm === undefined) throw new Error('no llm service is mounted')
    const options: GenerateOptions = {
      provider,
      model,
      system: TRANSLATION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `Target language: ${request.targetLanguage}\n\nTEXT TO TRANSLATE:\n${request.text}\nEND TEXT`,
        }],
      }],
      temperature: 0,
      signal,
    }
    let output = ''
    let finished = false
    for await (const chunk of this.runtime.llm.stream(options)) {
      if (chunk.type === 'text-delta') {
        output += chunk.text
        continue
      }
      if (chunk.type === 'finish') {
        finished = true
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
          throw new Error(`translation stream ended with ${chunk.reason.kind}`)
        }
      }
    }
    if (!finished && output === '') throw new Error('translation stream ended without text')
    return output.trim()
  }

  private cacheKey(text: string, target: string, provider: string, model: string): string {
    return createHash('sha256')
      .update(text)
      .update('\0')
      .update(target)
      .update('\0')
      .update(provider)
      .update('\0')
      .update(model)
      .update('\0')
      .update(this.config.translationProvider satisfies TranslationProvider)
      .digest('hex')
  }
}
