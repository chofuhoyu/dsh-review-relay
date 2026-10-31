import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeLocale,
  publicConfig,
  resolveConfig,
  resolveTargetLanguage,
} from '../../src/host/config.js'
import { DEFAULT_REVIEWER_REASON_PATTERN } from '../../src/shared/parse.js'

const originalEnv = {
  LC_ALL: process.env.LC_ALL,
  LC_MESSAGES: process.env.LC_MESSAGES,
  LANG: process.env.LANG,
}

afterEach(() => {
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('config validation', () => {
  it('applies the documented defaults', () => {
    const config = resolveConfig(undefined)
    expect(config).toMatchObject({
      enabled: true,
      reviewerReasonPattern: DEFAULT_REVIEWER_REASON_PATTERN,
      noteEnabled: true,
      noteForNonReviewApprovals: false,
      noteMaxChars: 2000,
      forwardMode: 'ask',
      defaultForward: true,
      maxForwardChars: 8000,
      targetLanguage: 'ui',
      translate: true,
      translateForForward: true,
      showOriginal: true,
      translationProvider: 'llm',
      translationTimeoutMs: 10000,
      delivery: 'tool-result',
      forwardOnDirectDeny: false,
    })
    expect(config.pattern).toBeInstanceOf(RegExp)
  })

  it('fails loud on unknown fields', () => {
    expect(() => resolveConfig({ nope: true })).toThrow(/unknown config field "nope"/)
  })

  it('compiles the pattern once and rejects bad patterns', () => {
    expect(() => resolveConfig({ reviewerReasonPattern: '(' })).toThrow(/invalid reviewerReasonPattern/)
    expect(() => resolveConfig({ reviewerReasonPattern: '^x$' })).toThrow(/named "tool" group/)
  })

  it('rejects out-of-range numbers', () => {
    expect(() => resolveConfig({ noteMaxChars: 0 })).toThrow(/noteMaxChars/)
    expect(() => resolveConfig({ maxForwardChars: 1.5 })).toThrow(/maxForwardChars/)
    expect(() => resolveConfig({ translationTimeoutMs: 99 })).toThrow(/translationTimeoutMs/)
    expect(() => resolveConfig({ noteMaxChars: 100_001 })).toThrow(/noteMaxChars/)
  })

  it('rejects invalid enums and language tags', () => {
    expect(() => resolveConfig({ forwardMode: 'sometimes' as 'ask' })).toThrow()
    expect(() => resolveConfig({ delivery: 'later' as 'tool-result' })).toThrow()
    expect(() => resolveConfig({ targetLanguage: 'not a tag' })).toThrow(/BCP-47/)
  })

  it('rejects a whitespace translation model', () => {
    expect(() => resolveConfig({ translationModel: '   ' })).toThrow(/translationModel/)
  })

  it('accepts every supported enum value', () => {
    for (const forwardMode of ['ask', 'always', 'never'] as const) {
      expect(resolveConfig({ forwardMode }).forwardMode).toBe(forwardMode)
    }
    for (const delivery of ['tool-result', 'auto', 'inject', 'followup'] as const) {
      expect(resolveConfig({ delivery }).delivery).toBe(delivery)
    }
    for (const translationProvider of ['llm', 'translator', 'off'] as const) {
      expect(resolveConfig({ translationProvider }).translationProvider).toBe(translationProvider)
    }
  })
})

describe('locale resolution', () => {
  it('normalizes common locale spellings', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN')
    expect(normalizeLocale('zh_CN.UTF-8')).toBe('zh-CN')
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN')
    expect(normalizeLocale('zh-TW')).toBe('zh-TW')
    expect(normalizeLocale('en_US.UTF-8')).toBe('en')
    expect(normalizeLocale('fr-CA')).toBe('fr-CA')
    expect(normalizeLocale('not a locale')).toBeUndefined()
  })

  it('honours an explicit target first', () => {
    const config = resolveConfig({ targetLanguage: 'ja-JP' })
    expect(resolveTargetLanguage(config, 'zh')).toBe('ja-JP')
  })

  it('follows the client locale, then the environment, then zh-CN', () => {
    process.env.LC_ALL = 'en_US.UTF-8'
    delete process.env.LC_MESSAGES
    delete process.env.LANG
    const config = resolveConfig({ targetLanguage: 'ui' })
    expect(resolveTargetLanguage(config, 'zh')).toBe('zh-CN')
    expect(resolveTargetLanguage(config)).toBe('en')
    delete process.env.LC_ALL
    delete process.env.LC_MESSAGES
    delete process.env.LANG
    expect(resolveTargetLanguage(config)).toBe('zh-CN')
  })
})

describe('public config', () => {
  it('exposes the recognition pattern and resolved target', () => {
    const config = resolveConfig({ targetLanguage: 'ui' })
    expect(publicConfig(config, 'zh-CN')).toMatchObject({
      protocol: 1,
      resolvedTargetLanguage: 'zh-CN',
      reviewerReasonPattern: DEFAULT_REVIEWER_REASON_PATTERN,
      noteMaxChars: 2000,
    })
  })
})
