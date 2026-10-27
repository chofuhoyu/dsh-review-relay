import { describe, expect, it } from 'vitest'
import { buildRelayMessage, truncateReviewerReason } from '../../src/shared/template.js'

describe('relay template', () => {
  it('omits an empty note', () => {
    expect(buildRelayMessage({
      toolName: 'bash',
      note: '   ',
      reviewerReason: 'delete build/',
      maxForwardChars: 8000,
    })).toBe('User rejected tool "bash".\n\nReviewer reason (verbatim):\ndelete build/')
  })

  it('omits the reviewer blocks when not forwarding', () => {
    expect(buildRelayMessage({
      toolName: 'bash',
      note: 'use pnpm clean',
      maxForwardChars: 8000,
    })).toBe('User rejected tool "bash".\n\nUser note:\nuse pnpm clean')
  })

  it('includes note, verbatim reason, and translation', () => {
    expect(buildRelayMessage({
      toolName: 'bash',
      note: 'use pnpm clean',
      reviewerReason: 'delete build/',
      translation: '删除 build/',
      targetLanguage: 'zh-CN',
      maxForwardChars: 8000,
    })).toBe([
      'User rejected tool "bash".',
      'User note:\nuse pnpm clean',
      'Reviewer reason (verbatim):\ndelete build/',
      'Reviewer reason (translated to zh-CN):\n删除 build/',
    ].join('\n\n'))
  })

  it('omits a translation identical to the verbatim reason', () => {
    expect(buildRelayMessage({
      toolName: 'bash',
      reviewerReason: 'delete build/',
      translation: 'delete build/',
      targetLanguage: 'zh-CN',
      maxForwardChars: 8000,
    })).toBe('User rejected tool "bash".\n\nReviewer reason (verbatim):\ndelete build/')
  })

  it('returns undefined when there is nothing to relay', () => {
    expect(buildRelayMessage({ toolName: 'bash', maxForwardChars: 8000 })).toBeUndefined()
  })

  it('preserves interior whitespace and line breaks exactly', () => {
    const reason = '  first\n\tsecond  '
    expect(buildRelayMessage({ toolName: 'bash', reviewerReason: reason, maxForwardChars: 8000 }))
      .toBe(`User rejected tool "bash".\n\nReviewer reason (verbatim):\n${reason}`)
  })
})

describe('reviewer reason truncation', () => {
  it('is explicit and never silent', () => {
    const result = truncateReviewerReason('abcdefghij', 4)
    expect(result).toEqual({
      text: 'abcd\n\n[reviewer reason truncated at 4 chars]',
      truncated: true,
      originalLength: 10,
    })
  })

  it('does not change short text', () => {
    expect(truncateReviewerReason('abc', 4)).toEqual({ text: 'abc', truncated: false, originalLength: 3 })
  })
})
