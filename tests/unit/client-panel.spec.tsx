import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicConfig } from '../../src/shared/types.js'
import type { ReviewRelayPanelProps } from '../../src/client/panel.js'
import { ReviewRelayPanel } from '../../src/client/panel.js'
import type { MatchedApproval } from '../../src/client/select.js'
import { en, type ReviewRelayKey } from '../../src/client/locales.js'

const baseConfig: PublicConfig = {
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

function t(key: ReviewRelayKey, params?: Record<string, unknown>): string {
  let text: string = en[key]
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

function matched(overrides: Partial<MatchedApproval['approval']> = {}, review = true): MatchedApproval {
  return {
    approval: {
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
    },
    review: review ? { toolName: 'probe', reason: 'irreversible delete of build/' } : null,
  }
}

function render(overrides: Partial<ReviewRelayPanelProps> = {}): string {
  const props: ReviewRelayPanelProps = {
    matched: matched(),
    config: baseConfig,
    getLocale: () => 'zh-CN',
    resolveReason: (reason) => reason.en,
    t,
    ...overrides,
  }
  return renderToStaticMarkup(createElement(ReviewRelayPanel, props))
}

describe('review relay panel', () => {
  it('renders the reason, note, forward choice, and both actions', () => {
    const html = render()
    expect(html).toContain('Auto review denied this call')
    expect(html).toContain('probe')
    expect(html).toContain('irreversible delete of build/')
    expect(html).toContain('Forward the reviewer reason verbatim')
    expect(html).toContain('<textarea')
    expect(html).toContain('0 / 2000')
    expect(html).toContain('Allow once')
    expect(html).toContain('Reject and send note')
  })

  it('hides the note area when notes are disabled', () => {
    const html = render({ config: { ...baseConfig, noteEnabled: false } })
    expect(html).not.toContain('<textarea')
    expect(html).toContain('Allow once')
    expect(html).toContain('Reject and send note')
  })

  it('forces and locks forwarding under always', () => {
    const html = render({ config: { ...baseConfig, forwardMode: 'always' } })
    expect(html).toContain('The reviewer reason will be forwarded verbatim')
    expect(html).toContain('checked=""')
    expect(html).toContain('disabled=""')
  })

  it('hides forwarding under never and falls back to the plain reject label', () => {
    const html = render({ config: { ...baseConfig, forwardMode: 'never' } })
    expect(html).not.toContain('Forward the reviewer reason verbatim')
    expect(html).toContain('Reject')
    expect(html).not.toContain('Reject and send note')
  })

  it('renders the plain card for an opted-in ordinary approval', () => {
    const html = render({
      matched: matched({ reason: 'ordinary approval', displayReason: undefined }, false),
      config: { ...baseConfig, noteForNonReviewApprovals: true, forwardMode: 'never' },
    })
    expect(html).toContain('This action needs your approval')
    expect(html).not.toContain('Forward the reviewer reason verbatim')
    expect(html).toContain('Approval reason')
  })

  it('shows the localized display reason for an ordinary approval', () => {
    const html = render({
      matched: matched({ reason: 'ordinary approval', displayReason: { en: 'localized approval text', zh: '本地审批文本' } }, false),
      config: { ...baseConfig, noteForNonReviewApprovals: true },
    })
    expect(html).toContain('localized approval text')
  })
})
