import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicConfig } from '../../src/shared/types.js'
import {
  fetchConfig,
  fetchTranslation,
  isPublicConfig,
  isTranslationView,
  submitNote,
  uiLocale,
} from '../../src/client/api.js'

const config: PublicConfig = {
  protocol: 1,
  enabled: true,
  noteEnabled: true,
  noteForNonReviewApprovals: false,
  noteMaxChars: 2000,
  forwardMode: 'ask',
  defaultForward: true,
  maxForwardChars: 8000,
  targetLanguage: 'ui',
  resolvedTargetLanguage: 'zh-CN',
  showOriginal: true,
  translate: true,
  translateForForward: true,
  translationProvider: 'llm',
  translationTimeoutMs: 10000,
  reviewerReasonPattern: '^Auto review denied tool "(?<tool>[^"]+)"(?:: (?<reason>[\\s\\S]+))?$',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ui locale', () => {
  it('maps built-in locales to translation tags', () => {
    expect(uiLocale('zh')).toBe('zh-CN')
    expect(uiLocale('en')).toBe('en')
    expect(uiLocale('fr-CA')).toBe('fr-CA')
    expect(uiLocale(undefined)).toBe('zh-CN')
  })
})

describe('wire guards', () => {
  it('accepts the public config shape', () => {
    expect(isPublicConfig(config)).toBe(true)
    expect(isPublicConfig({ ...config, protocol: 2 })).toBe(false)
    expect(isPublicConfig({ ...config, forwardMode: 'sometimes' })).toBe(false)
    expect(isPublicConfig(null)).toBe(false)
  })

  it('accepts the translation shape', () => {
    expect(isTranslationView({ status: 'ok', text: 'x', targetLanguage: 'zh-CN' })).toBe(true)
    expect(isTranslationView({ status: 'skipped', targetLanguage: 'zh-CN' })).toBe(true)
    expect(isTranslationView({ status: 'failed', targetLanguage: 'zh-CN' })).toBe(true)
    expect(isTranslationView({ status: 'ok', targetLanguage: 'zh-CN' })).toBe(false)
  })
})

describe('client routes', () => {
  it('fetches config with the document-relative route and UI locale', async () => {
    const fetchMock = vi.fn(async () => Response.json(config))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchConfig('zh-CN', new AbortController().signal)).resolves.toEqual(config)
    expect(fetchMock).toHaveBeenCalledWith('api/review-relay/config?locale=zh-CN', expect.objectContaining({ method: 'GET' }))
  })

  it('returns undefined for an unavailable or malformed config', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    await expect(fetchConfig('zh-CN', new AbortController().signal)).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ protocol: 1 })))
    await expect(fetchConfig('zh-CN', new AbortController().signal)).resolves.toBeUndefined()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(fetchConfig('zh-CN', new AbortController().signal)).resolves.toBeUndefined()
  })

  it('submits a note and preserves route errors', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(submitNote({
      sessionId: 's', callId: 'c', note: 'n', forward: true, locale: 'zh-CN',
    })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('api/review-relay/note', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    }))

    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { code: 'note-too-long', message: 'too long' },
      { status: 400 },
    )))
    await expect(submitNote({ sessionId: 's', callId: 'c', note: 'n', forward: true }))
      .resolves.toEqual({ ok: false, code: 'note-too-long', message: 'too long' })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const failed = await submitNote({ sessionId: 's', callId: 'c', note: 'n', forward: true })
    expect(failed).toMatchObject({ ok: false, code: 'network' })
  })

  it('fetches a translation view with a client timeout', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({
      status: 'ok', text: '删除构建目录', targetLanguage: 'zh-CN',
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchTranslation('s', 'c', 'zh-CN', 1000)).resolves.toEqual({
      status: 'ok', text: '删除构建目录', targetLanguage: 'zh-CN',
    })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('api/review-relay/translation?')
    expect(url).toContain('sessionId=s')
    expect(url).toContain('callId=c')
  })

  it('returns undefined for an unavailable translation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    await expect(fetchTranslation('s', 'c', 'zh-CN', 1000)).resolves.toBeUndefined()
  })
})
