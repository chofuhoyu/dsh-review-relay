import { describe, expect, it } from 'vitest'
import {
  compileReviewerPattern,
  DEFAULT_REVIEWER_REASON_PATTERN,
  parseReviewAsk,
} from '../../src/shared/parse.js'

const pattern = compileReviewerPattern(DEFAULT_REVIEWER_REASON_PATTERN)

describe('review ask recognition', () => {
  it('parses the shipped ask reason', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'Auto review denied tool "bash": irreversible delete of build/',
    }, pattern)).toEqual({ toolName: 'bash', reason: 'irreversible delete of build/' })
  })

  it('keeps a multiline reason verbatim', () => {
    const reason = 'line one\nline two: with "quotes" and `code`\n  line three'
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: `Auto review denied tool "bash": ${reason}`,
    }, pattern)).toEqual({ toolName: 'bash', reason })
  })

  it('keeps the first delimiter split and the rest verbatim', () => {
    const reason = 'a: b: c; its body was not executed: d'
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: `Auto review denied tool "bash": ${reason}`,
    }, pattern)?.reason).toBe(reason)
  })

  it('accepts an ask without a reviewer reason', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'Auto review denied tool "bash"',
    }, pattern)).toEqual({ toolName: 'bash', reason: undefined })
  })

  it('rejects the direct-deny text', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'Auto review rejected tool "bash"; its body was not executed',
    }, pattern)).toBeUndefined()
  })

  it('rejects reviewer-failure text', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'Auto review of tool "bash" failed; its body was not executed: timeout',
    }, pattern)).toBeUndefined()
  })

  it('does not let a broad custom pattern turn a direct denial into an ask', () => {
    const broad = compileReviewerPattern('^Auto review .* tool "(?<tool>[^"]+)"(?:: (?<reason>[\\s\\S]+))?$')
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'Auto review rejected tool "bash"; its body was not executed',
    }, broad)).toBeUndefined()
  })

  it('falls back to the localized display reason only when the English reason is absent', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      displayReason: { zh: 'Auto review 拒绝了此调用：不要删 build/' },
    }, pattern)).toEqual({ toolName: 'bash', reason: '不要删 build/' })
    expect(parseReviewAsk({
      toolName: 'bash',
      reason: 'ordinary approval',
      displayReason: { zh: 'Auto review 拒绝了此调用：不要删 build/' },
    }, pattern)).toBeUndefined()
  })

  it('does not treat the no-reason localized sentence as an ask', () => {
    expect(parseReviewAsk({
      toolName: 'bash',
      displayReason: { zh: 'Auto review 拒绝了此调用。' },
    }, pattern)).toBeUndefined()
  })
})

describe('pattern compilation', () => {
  it('rejects an invalid regular expression', () => {
    expect(() => compileReviewerPattern('(')).toThrow(/not a valid regular expression/)
  })

  it('requires both named groups', () => {
    expect(() => compileReviewerPattern('^foo$')).toThrow(/named "tool" group/)
    expect(() => compileReviewerPattern('^foo (?<tool>[^"]+)$')).toThrow(/named "reason" group/)
  })

  it('rejects an empty pattern', () => {
    expect(() => compileReviewerPattern('  ')).toThrow(/non-empty/)
  })
})
