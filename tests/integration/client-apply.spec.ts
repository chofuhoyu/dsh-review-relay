import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PublicConfig } from '../../src/shared/types.js'
import { apply } from '../../src/client/index.js'
import { NS } from '../../src/client/locales.js'

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

interface FakeRegistration {
  readonly options: Record<string, unknown>
  readonly component: unknown
}

function fakeContext(): { ctx: Context; registrations: FakeRegistration[]; errors: Array<(key: string, entry: { locale?: string }, error: unknown) => void> } {
  const ctx = new Context()
  const registrations: FakeRegistration[] = []
  const errors: Array<(key: string, entry: { locale?: string }, error: unknown) => void> = []
  ctx.provide('locale', {
    register: () => () => {},
    getSnapshot: () => ({ active: 'zh', locales: [], revision: 0 }),
    resolveText: (text: { en: string }) => text.en,
  })
  ctx.provide('slots', {
    inject: (_owner: string, callback: () => () => void) => {
      callback()
      return () => {}
    },
    register: (options: Record<string, unknown>, component: unknown) => {
      registrations.push({ options, component })
      return () => {
        const index = registrations.findIndex(entry => entry.options === options)
        if (index >= 0) registrations.splice(index, 1)
      }
    },
    onEntryError: (listener: (key: string, entry: { locale?: string }, error: unknown) => void) => {
      errors.push(listener)
      return () => {
        const index = errors.indexOf(listener)
        if (index >= 0) errors.splice(index, 1)
      }
    },
  })
  return { ctx, registrations, errors }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('client apply', () => {
  it('registers a priority-0 chain entry that elects only review asks', async () => {
    const fetchMock = vi.fn(async () => Response.json(config))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, registrations } = fakeContext()
    apply(ctx)
    await settle()
    expect(registrations.some(entry => entry.options['name'] === 'shell.overlay' && entry.options['id'] === 'review-relay.toast')).toBe(true)
    const entry = registrations.find(entry => entry.options['name'] === 'conversation.composer')
    expect(entry).toBeDefined()
    expect(entry!.options).toMatchObject({ name: 'conversation.composer', priority: 0, locale: NS })
    const select = entry!.options['select'] as (owner: { pendingInteraction: unknown }) => unknown
    const review = select({
      pendingInteraction: {
        kind: 'approval',
        key: 'approval:1',
        sessionId: 's',
        toolName: 'probe',
        callId: 'c',
        reason: 'Auto review denied tool "probe": because',
        answerable: true,
        answer: async () => {},
      },
    })
    expect(review).toMatchObject({ review: { toolName: 'probe', reason: 'because' } })
    expect(select({ pendingInteraction: { kind: 'approval', key: 'approval:2', sessionId: 's', toolName: 'probe', callId: 'c', reason: 'ordinary', answerable: true, answer: async () => {} } })).toBeNull()
    const inject = entry!.options['inject'] as () => { config: PublicConfig; getLocale: () => string; resolveReason: (text: { en: string }) => string }
    const injected = inject()
    expect(injected.config).toEqual(config)
    expect(injected.getLocale()).toBe('zh-CN')
    expect(injected.resolveReason({ en: 'English' })).toBe('English')
    await ctx.fiber.dispose()
  })

  it('does not register when the config endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const { ctx, registrations } = fakeContext()
    apply(ctx)
    await settle()
    expect(registrations).toHaveLength(0)
    await ctx.fiber.dispose()
  })

  it('does not register when disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...config, enabled: false })))
    const { ctx, registrations } = fakeContext()
    apply(ctx)
    await settle()
    expect(registrations).toHaveLength(0)
    await ctx.fiber.dispose()
  })
})
