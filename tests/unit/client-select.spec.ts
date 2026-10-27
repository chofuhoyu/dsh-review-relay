import { describe, expect, it } from 'vitest'
import type { PublicConfig } from '../../src/shared/types.js'
import type { ApprovalLike } from '../../src/client/select.js'
import {
  compileClientPattern,
  forwardForced,
  forwardVisible,
  initialForward,
  isApprovalLike,
  matchApproval,
} from '../../src/client/select.js'

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

function approval(overrides: Partial<ApprovalLike> = {}): ApprovalLike {
  return {
    kind: 'approval',
    key: 'approval:1',
    sessionId: 'session-1',
    toolName: 'probe',
    callId: 'call-1',
    reason: 'Auto review denied tool "probe": irreversible delete of build/',
    displayReason: {
      en: 'Auto review denied this call: irreversible delete of build/',
      zh: 'Auto review 拒绝了此调用：irreversible delete of build/',
    },
    answerable: true,
    answer: async () => {},
    ...overrides,
  }
}

describe('approval routing', () => {
  it('recognizes an answerable approval instance', () => {
    expect(isApprovalLike(approval())).toBe(true)
    expect(isApprovalLike({ ...approval(), kind: 'question' })).toBe(false)
    expect(isApprovalLike({ ...approval(), answer: undefined })).toBe(false)
  })

  it('elects a review ask with a call id', () => {
    const matched = matchApproval(approval(), config, compileClientPattern(config))
    expect(matched?.review).toEqual({ toolName: 'probe', reason: 'irreversible delete of build/' })
    expect(matched?.approval.callId).toBe('call-1')
  })

  it('falls back to the localized display reason', () => {
    const matched = matchApproval(approval({
      reason: undefined,
      displayReason: { en: 'localized fallback', zh: 'Auto review 拒绝了此调用：不要删 build/' },
    }), config, compileClientPattern(config))
    expect(matched?.review).toEqual({ toolName: 'probe', reason: '不要删 build/' })
  })

  it('declines ordinary approvals by default', () => {
    const ordinary = approval({ reason: 'ordinary approval', displayReason: undefined })
    expect(matchApproval(ordinary, config, compileClientPattern(config))).toBeNull()
  })

  it('elects ordinary approvals when opted in', () => {
    const ordinary = approval({ reason: 'ordinary approval', displayReason: undefined })
    const matched = matchApproval(ordinary, { ...config, noteForNonReviewApprovals: true }, compileClientPattern(config))
    expect(matched).not.toBeNull()
    expect(matched?.review).toBeNull()
  })

  it('declines ordinary approvals when notes are disabled even with the opt-in', () => {
    const ordinary = approval({ reason: 'ordinary approval', displayReason: undefined })
    expect(matchApproval(ordinary, { ...config, noteForNonReviewApprovals: true, noteEnabled: false }, compileClientPattern(config))).toBeNull()
  })

  it('declines approvals without a call id', () => {
    expect(matchApproval(approval({ callId: undefined }), config, compileClientPattern(config))).toBeNull()
    expect(matchApproval(approval({ callId: '' }), config, compileClientPattern(config))).toBeNull()
  })

  it('declines a direct denial text', () => {
    const direct = approval({ reason: 'Auto review rejected tool "probe"; its body was not executed' })
    expect(matchApproval(direct, config, compileClientPattern(config))).toBeNull()
  })

  it('declines when disabled', () => {
    expect(matchApproval(approval(), { ...config, enabled: false }, compileClientPattern(config))).toBeNull()
  })
})

describe('forward controls', () => {
  it('resolves the initial checkbox from the mode', () => {
    expect(initialForward({ ...config, forwardMode: 'ask', defaultForward: true })).toBe(true)
    expect(initialForward({ ...config, forwardMode: 'ask', defaultForward: false })).toBe(false)
    expect(initialForward({ ...config, forwardMode: 'always' })).toBe(true)
    expect(initialForward({ ...config, forwardMode: 'never' })).toBe(false)
  })

  it('hides forwarding for never or a missing reviewer reason', () => {
    const matched = matchApproval(approval(), config, compileClientPattern(config))!
    expect(forwardVisible(config, matched)).toBe(true)
    expect(forwardVisible({ ...config, forwardMode: 'never' }, matched)).toBe(false)
    expect(forwardVisible(config, { approval: approval(), review: { toolName: 'probe', reason: undefined } })).toBe(false)
  })

  it('forces forwarding for always', () => {
    expect(forwardForced(config)).toBe(false)
    expect(forwardForced({ ...config, forwardMode: 'always' })).toBe(true)
  })
})
