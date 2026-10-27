// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicConfig } from '../../src/shared/types.js'
import { ReviewRelayPanel, type ReviewRelayPanelProps } from '../../src/client/panel.js'
import { RelayToastView, disposeRelayToast } from '../../src/client/toast.js'
import { disposeDeliveryWatch } from '../../src/client/delivery-watch.js'
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
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}

function makeMatched(overrides: Partial<MatchedApproval['approval']> = {}): MatchedApproval {
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
      answer: vi.fn(async () => {}),
      ...overrides,
    },
    review: { toolName: 'probe', reason: 'irreversible delete of build/' },
  }
}

function renderPanel(overrides: Partial<ReviewRelayPanelProps> = {}, matched = makeMatched()) {
  const props: ReviewRelayPanelProps = {
    matched,
    config: baseConfig,
    getLocale: () => 'zh-CN',
    resolveReason: reason => reason.en,
    t,
    ...overrides,
  }
  return render(
    <>
      <ReviewRelayPanel {...props} />
      <RelayToastView />
    </>,
  )
}

function routeFetch(handlers: { translation?: () => Response; note?: () => Response; delivery?: () => Response } = {}) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/translation')) {
      return handlers.translation?.() ?? Response.json({ status: 'ok', text: '删除构建目录', targetLanguage: 'zh-CN' })
    }
    if (url.includes('/note')) {
      return handlers.note?.() ?? Response.json({ ok: true })
    }
    if (url.includes('/delivery')) {
      return handlers.delivery?.() ?? Response.json({ state: 'delivered' })
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  cleanup()
  disposeRelayToast()
  disposeDeliveryWatch()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('review relay panel interactions', () => {
  it('submits the note before answering rejected and shows the success toast', async () => {
    const matched = makeMatched()
    const fetchMock = routeFetch()
    renderPanel({}, matched)
    await waitFor(() => { expect(screen.getByText('删除构建目录')).toBeTruthy() })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'use pnpm clean' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject and send note' }))

    await waitFor(() => { expect(matched.approval.answer).toHaveBeenCalledWith('rejected') })
    const noteCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/note'))
    expect(noteCall).toBeDefined()
    const body = JSON.parse(String((noteCall?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      sessionId: 'session-1',
      callId: 'call-1',
      note: 'use pnpm clean',
      forward: true,
      locale: 'zh-CN',
    })
    await waitFor(() => { expect(screen.getByText('Rejected; the note was relayed to the agent')).toBeTruthy() })
  })

  it('replaces the success toast with a visible error when delivery fails', async () => {
    const matched = makeMatched()
    routeFetch({ delivery: () => Response.json({ state: 'failed' }) })
    renderPanel({}, matched)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'use pnpm clean' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject and send note' }))
    await waitFor(() => {
      expect(screen.getByText('Rejection succeeded, but relaying the note failed; check the Host log')).toBeTruthy()
    })
  })

  it('keeps the card open on a note failure and offers a plain reject fallback', async () => {
    const matched = makeMatched()
    routeFetch({ note: () => Response.json({ code: 'internal-error', message: 'server broke' }, { status: 500 }) })
    renderPanel({}, matched)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'use pnpm clean' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject and send note' }))

    await waitFor(() => { expect(screen.getByText(/Submission failed/)).toBeTruthy() })
    expect(matched.approval.answer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reject without a note' }))
    await waitFor(() => { expect(matched.approval.answer).toHaveBeenCalledWith('rejected') })
  })

  it('allows without submitting a note', async () => {
    const matched = makeMatched()
    const fetchMock = routeFetch()
    renderPanel({}, matched)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'discard me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Allow once' }))
    await waitFor(() => { expect(matched.approval.answer).toHaveBeenCalledWith('allowed-once') })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/note'))).toBe(false)
  })

  it('does not submit when the user unchecks forwarding and leaves the note empty', async () => {
    const matched = makeMatched()
    const fetchMock = routeFetch()
    renderPanel({}, matched)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => { expect(matched.approval.answer).toHaveBeenCalledWith('rejected') })
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/note'))).toBe(false)
  })

  it('blocks an oversized note and does not answer', async () => {
    const matched = makeMatched()
    const fetchMock = routeFetch()
    renderPanel({ config: { ...baseConfig, noteMaxChars: 5 } }, matched)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '123456' } })
    expect(screen.getByText(/The note exceeds 5 characters/)).toBeTruthy()
    const reject = screen.getByRole('button', { name: 'Reject and send note' }) as HTMLButtonElement
    expect(reject.disabled).toBe(true)
    expect(matched.approval.answer).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/note'))).toBe(false)
  })

  it('forces and locks forwarding under always', () => {
    renderPanel({ config: { ...baseConfig, forwardMode: 'always' } })
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)
    expect(screen.getByText('The reviewer reason will be forwarded verbatim')).toBeTruthy()
  })

  it('disables actions when the pending signal aborts', async () => {
    const controller = new AbortController()
    const matched = makeMatched({ signal: controller.signal })
    renderPanel({}, matched)
    act(() => { controller.abort() })
    await waitFor(() => { expect(screen.getByText('This approval was cancelled')).toBeTruthy() })
    expect((screen.getByRole('button', { name: 'Allow once' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the translation and can reveal the original', async () => {
    const matched = makeMatched()
    routeFetch()
    renderPanel({}, matched)
    await waitFor(() => { expect(screen.getByText('删除构建目录')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Show original' }))
    expect(screen.getByText('irreversible delete of build/')).toBeTruthy()
  })

  it('shows the original and a failure notice when translation fails', async () => {
    const matched = makeMatched()
    routeFetch({ translation: () => new Response('nope', { status: 500 }) })
    renderPanel({}, matched)
    await waitFor(() => { expect(screen.getByText('Translation failed; showing the original')).toBeTruthy() })
    expect(screen.getByText('irreversible delete of build/')).toBeTruthy()
  })
})
