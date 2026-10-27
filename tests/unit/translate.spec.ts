import { describe, expect, it, vi } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { resolveConfig } from '../../src/host/config.js'
import {
  isAlreadyTargetLanguage,
  splitForLimit,
  TranslationCache,
  TranslationService,
  TRANSLATION_CACHE_LIMIT,
  type TranslationRuntime,
} from '../../src/host/translate.js'

function textChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function runtime(
  stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
  translator?: unknown,
): TranslationRuntime & { calls: number; warnings: string[] } {
  const state = {
    calls: 0,
    warnings: [] as string[],
    llm: {
      stream: (options: GenerateOptions) => {
        state.calls += 1
        return stream(options)
      },
    },
    get: (name: string) => name === 'translator' ? translator : undefined,
    logger: { warn: (message: string) => { state.warnings.push(message) } },
  }
  return state
}

const route = { provider: 'mock', model: 'mock' }

describe('language heuristics', () => {
  it('skips Chinese text for a Chinese target but not for English', () => {
    expect(isAlreadyTargetLanguage('该命令会删除 build/ 下的产物。', 'zh-CN')).toBe(true)
    expect(isAlreadyTargetLanguage('该命令会删除 build/ 下的产物。', 'en')).toBe(false)
  })

  it('skips ASCII English for an English target', () => {
    expect(isAlreadyTargetLanguage('The command deletes build/.', 'en')).toBe(true)
    expect(isAlreadyTargetLanguage('The command deletes build/.', 'zh-CN')).toBe(false)
  })

  it('treats empty text as already translated', () => {
    expect(isAlreadyTargetLanguage('   ', 'zh-CN')).toBe(true)
  })
})

describe('splitForLimit', () => {
  it('prefers line boundaries and never loses text', () => {
    expect(splitForLimit('aaa\nbbb\nccc', 7)).toEqual(['aaa\nbbb', 'ccc'])
    expect(splitForLimit('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(splitForLimit('short', 10)).toEqual(['short'])
  })
})

describe('TranslationCache', () => {
  it('keeps the most recent entries bounded', () => {
    const cache = new TranslationCache(2)
    cache.set('a', '1')
    cache.set('b', '2')
    expect(cache.get('a')).toBe('1')
    cache.set('c', '3')
    expect(cache.size).toBe(2)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('1')
    expect(cache.get('c')).toBe('3')
  })

  it('has the documented limit', () => {
    expect(TRANSLATION_CACHE_LIMIT).toBe(128)
  })
})

describe('TranslationService', () => {
  it('skips disabled translation and already-target text', async () => {
    const disabled = runtime(async function* () { yield* textChunks('x') })
    const off = new TranslationService(disabled, resolveConfig({ translate: false }))
    expect(await off.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' }))
      .toEqual({ status: 'skipped', reason: 'disabled' })
    expect(disabled.calls).toBe(0)

    const rtl = runtime(async function* () { yield* textChunks('x') })
    const service = new TranslationService(rtl, resolveConfig({}))
    expect(await service.translate({ text: '这是中文。', targetLanguage: 'zh-CN', route, sessionId: 's' }))
      .toEqual({ status: 'skipped', reason: 'already-target' })
    expect(rtl.calls).toBe(0)
  })

  it('translates through the llm and reuses the cache', async () => {
    const rtl = runtime(async function* () { yield* textChunks('删除构建目录') })
    const service = new TranslationService(rtl, resolveConfig({}))
    const first = await service.translate({ text: 'delete build/', targetLanguage: 'zh-CN', route, sessionId: 's' })
    expect(first).toEqual({ status: 'ok', text: '删除构建目录' })
    const second = await service.translate({ text: 'delete build/', targetLanguage: 'zh-CN', route, sessionId: 's' })
    expect(second).toEqual({ status: 'ok', text: '删除构建目录' })
    expect(rtl.calls).toBe(1)
  })

  it('fails without a route', async () => {
    const rtl = runtime(async function* () { yield* textChunks('x') })
    const service = new TranslationService(rtl, resolveConfig({}))
    expect(await service.translate({ text: 'hello', targetLanguage: 'zh-CN', route: undefined, sessionId: 's' }))
      .toEqual({ status: 'failed', reason: 'no-route' })
  })

  it('fails on provider errors', async () => {
    const rtl = runtime(async function* () { throw new Error('provider down') })
    const service = new TranslationService(rtl, resolveConfig({}))
    expect(await service.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' }))
      .toEqual({ status: 'failed', reason: 'provider' })
    expect(rtl.warnings.join('\n')).toMatch(/translation failed/)
  })

  it('fails on empty provider output', async () => {
    const rtl = runtime(async function* () { yield { type: 'finish', reason: { kind: 'stop' } } satisfies StreamChunk })
    const service = new TranslationService(rtl, resolveConfig({}))
    expect(await service.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' }))
      .toEqual({ status: 'failed', reason: 'empty-output' })
  })

  it('times out without blocking forever', async () => {
    const rtl = runtime(async function* (options) {
      await new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      })
    })
    const service = new TranslationService(rtl, resolveConfig({ translationTimeoutMs: 100 }))
    const result = await service.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' })
    expect(result).toEqual({ status: 'failed', reason: 'timeout' })
  })

  it('falls back to the llm when the translator service is absent', async () => {
    const rtl = runtime(async function* () { yield* textChunks('translated') })
    const service = new TranslationService(rtl, resolveConfig({ translationProvider: 'translator' }))
    expect(await service.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' }))
      .toEqual({ status: 'ok', text: 'translated' })
    expect(rtl.calls).toBe(1)
    expect(rtl.warnings.join('\n')).toMatch(/falling back to llm/)
  })

  it('uses the translator service when it is mounted', async () => {
    const translate = vi.fn(async (spec: unknown) => `translated:${(spec as { text: string }).text.length}`)
    const translator = {
      maxTextChars: 10,
      resolve: (request: unknown) => request,
      translate,
    }
    const rtl = runtime(async function* () { yield* textChunks('llm should not run') }, translator)
    const service = new TranslationService(rtl, resolveConfig({ translationProvider: 'translator' }))
    const result = await service.translate({ text: 'abcdefghijklmnopqrstuvwxyz', targetLanguage: 'zh-CN', route, sessionId: 's' })
    expect(result.status).toBe('ok')
    expect(translate).toHaveBeenCalledTimes(3)
    expect(rtl.calls).toBe(0)
  })

  it('clear aborts active translations and clears the cache', async () => {
    const rtl = runtime(async function* (options) {
      await new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
      })
    })
    const service = new TranslationService(rtl, resolveConfig({ translationTimeoutMs: 5000 }))
    const pending = service.translate({ text: 'hello', targetLanguage: 'zh-CN', route, sessionId: 's' })
    service.clear()
    await expect(pending).resolves.toEqual({ status: 'failed', reason: 'aborted' })
  })
})
