import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  LlmAdapter,
  ToolCallId,
  createUserMessage,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { KNOWN_SESSION_EVENT_TYPES, Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import ApprovalService, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import * as ReviewRelay from '../../src/index.js'
import { TRANSLATION_SYSTEM_PROMPT } from '../../src/host/translate.js'

type Route = { fetch(request: Request): Promise<Response> }

interface HarnessOptions {
  readonly config?: Record<string, unknown>
  readonly askReason?: string
  readonly translation?: 'ok' | 'fail'
  readonly adapterMode?: 'single' | 'repeat'
  readonly onApproval?: (request: { sessionId: string; callId: string }) => Promise<ApprovalOutcome>
}

const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolCallResponse(id: string, name: string, args: object): StreamChunk[] {
  const callId = ToolCallId(id)
  const json = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: json },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: json } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  main = 0
  translationCalls = 0
  constructor(
    private readonly translation: 'ok' | 'fail',
    private readonly mode: 'single' | 'repeat',
  ) { super() }
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.system === TRANSLATION_SYSTEM_PROMPT) {
      this.translationCalls += 1
      if (this.translation === 'fail') throw new Error('translation provider down')
      yield* textResponse('删除构建目录')
      return
    }
    this.main += 1
    const toolCall = this.mode === 'repeat' ? this.main % 2 === 1 : this.main === 1
    if (toolCall) {
      yield* toolCallResponse('call-1', 'probe', {})
      return
    }
    yield* textResponse('done')
  }
}

async function harness(options: HarnessOptions = {}) {
  const routes = new Map<string, Route>()
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.provide('connection', {
    fetch: {
      register(route: { path: string; fetch(request: Request): Promise<Response> }) {
        routes.set(route.path, route)
        return Promise.resolve(async () => { routes.delete(route.path) })
      },
    },
  })
  const adapter = new ScriptedAdapter(options.translation ?? 'ok', options.adapterMode ?? 'single')
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(ReviewRelay, options.config ?? {})
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  contexts.push(ctx)

  const askReason = options.askReason ?? 'Auto review denied tool "probe": irreversible delete of build/'
  let runs = 0
  ctx.tools.register(defineContentToolFixture({
    name: 'probe',
    description: 'probe tool',
    parameters: {},
    async execute() {
      runs += 1
      return [{ type: 'text', text: 'body ran' }]
    },
  }))
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'probe') return next()
    return Promise.resolve({ kind: 'ask', reason: askReason })
  })
  ctx.on('approval/request', async (request) => {
    if (options.onApproval !== undefined) {
      return await options.onApproval({
        sessionId: String(request.agent.session.id),
        callId: String(request.callId),
      })
    }
    return 'rejected'
  })

  const agent = await ctx.agentLoop.create(SessionId('integration'), { provider: 'mock', model: 'mock' })
  return { ctx, agent, routes, adapter, runs: () => runs }
}

function send(agent: Agent): void {
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
}

function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

function injectedMessages(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter((event): event is Extract<SessionEvent, { type: 'user/message' }> => event.type === 'user/message')
    .filter(event => event.data.source.kind === 'user')
    .flatMap(event => event.data.content)
    .flatMap(block => block.type === 'text' ? [block.text] : [])
}

async function configOf(routes: Map<string, Route>, locale = 'zh-CN') {
  const route = routes.get('/api/review-relay/config')
  if (route === undefined) throw new Error('config route missing')
  const response = await route.fetch(new Request(`http://localhost/api/review-relay/config?locale=${locale}`))
  expect(response.status).toBe(200)
  return await response.json() as Record<string, unknown>
}

async function postNote(
  routes: Map<string, Route>,
  body: Record<string, unknown>,
  contentType = 'application/json',
): Promise<Response> {
  const route = routes.get('/api/review-relay/note')
  if (route === undefined) throw new Error('note route missing')
  return await route.fetch(new Request('http://localhost/api/review-relay/note', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  }))
}

describe('host relay integration', () => {
  it('collects a note and relays note + verbatim reason + translation exactly once', async () => {
    const h = await harness({
      onApproval: async ({ sessionId, callId }) => {
        const response = await postNote(h.routes, {
          sessionId,
          callId,
          note: '不要删 build/，改用 pnpm clean。',
          forward: true,
          locale: 'zh-CN',
        })
        expect(response.status).toBe(200)
        const translationRoute = h.routes.get('/api/review-relay/translation')
        expect(translationRoute).toBeDefined()
        const translation = await translationRoute!.fetch(new Request(
          `http://localhost/api/review-relay/translation?sessionId=${encodeURIComponent(sessionId)}&callId=${encodeURIComponent(callId)}&locale=zh-CN`,
        ))
        expect(translation.status).toBe(200)
        expect(await translation.json()).toMatchObject({
          status: 'ok',
          text: '删除构建目录',
          targetLanguage: 'zh-CN',
        })
        return 'rejected'
      },
    })
    await configOf(h.routes)
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)

    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toBe([
      'User rejected tool "probe".',
      'User note:\n不要删 build/，改用 pnpm clean。',
      'Reviewer reason (verbatim):\nirreversible delete of build/',
      'Reviewer reason (translated to zh-CN):\n删除构建目录',
    ].join('\n\n'))

    const result = h.agent.session.snapshotEvents().find(event => event.type === 'tool/result')
    expect(result?.type === 'tool/result' ? result.data.message.content : []).toEqual([
      { type: 'text', text: 'Error: the user rejected tool "probe"' },
    ])
    expect(h.runs()).toBe(0)
    expect(h.adapter.translationCalls).toBe(1)

    // Cold load: serialize the exact log, parse it, and reconstruct the session.
    const events = h.agent.session.snapshotEvents()
    for (const event of events) expect(KNOWN_SESSION_EVENT_TYPES.has(event.type)).toBe(true)
    const encoded = events.map(event => JSON.stringify(event)).join('\n')
    const decoded = encoded.split('\n').map(line => JSON.parse(line) as SessionEvent)
    const restored = Session.create(SessionId('cold'), decoded)
    expect(restored.snapshotEvents().some(event => event.type === 'user/message'
      && event.data.content.some(block => block.type === 'text' && block.text.includes('不要删 build/')))).toBe(true)
  })

  it('does not inject when the approval is cancelled', async () => {
    const h = await harness({ onApproval: async () => 'cancelled' })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    expect(injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))).toHaveLength(0)
    expect(h.runs()).toBe(0)
  })

  it('does not inject when the user allows the call', async () => {
    const h = await harness({ onApproval: async () => 'allowed-once' })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    expect(injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))).toHaveLength(0)
    expect(h.runs()).toBe(1)
  })

  it('relays only the reviewer reason under forwardMode always (M1 host-only path)', async () => {
    const h = await harness({ config: { forwardMode: 'always', translate: false } })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toEqual([
      'User rejected tool "probe".\n\nReviewer reason (verbatim):\nirreversible delete of build/',
    ])
    expect(h.adapter.translationCalls).toBe(0)
  })

  it('does not relay under forwardMode ask when the official card supplied no note', async () => {
    const h = await harness({ config: { forwardMode: 'ask', translate: false } })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    expect(injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))).toHaveLength(0)
  })

  it('falls back to the verbatim reason when translation fails', async () => {
    const h = await harness({
      translation: 'fail',
      onApproval: async ({ sessionId, callId }) => {
        const response = await postNote(h.routes, {
          sessionId,
          callId,
          note: '',
          forward: true,
        })
        expect(response.status).toBe(200)
        const translationRoute = h.routes.get('/api/review-relay/translation')
        expect(translationRoute).toBeDefined()
        const translation = await translationRoute!.fetch(new Request(
          `http://localhost/api/review-relay/translation?sessionId=${encodeURIComponent(sessionId)}&callId=${encodeURIComponent(callId)}&locale=zh-CN`,
        ))
        expect(translation.status).toBe(200)
        expect(await translation.json()).toMatchObject({ status: 'failed', targetLanguage: 'zh-CN' })
        return 'rejected'
      },
    })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Reviewer reason (verbatim):\nirreversible delete of build/')
    expect(messages[0]).not.toContain('Reviewer reason (translated')
  })

  it('skips translation for an already-Chinese reviewer reason', async () => {
    const h = await harness({
      askReason: 'Auto review denied tool "probe": 该命令会删除 build/ 下的产物。',
      onApproval: async ({ sessionId, callId }) => {
        const response = await postNote(h.routes, {
          sessionId,
          callId,
          note: '',
          forward: true,
        })
        expect(response.status).toBe(200)
        const translationRoute = h.routes.get('/api/review-relay/translation')
        expect(translationRoute).toBeDefined()
        const translation = await translationRoute!.fetch(new Request(
          `http://localhost/api/review-relay/translation?sessionId=${encodeURIComponent(sessionId)}&callId=${encodeURIComponent(callId)}&locale=zh-CN`,
        ))
        expect(translation.status).toBe(200)
        expect(await translation.json()).toMatchObject({ status: 'skipped', targetLanguage: 'zh-CN' })
        return 'rejected'
      },
    })
    await configOf(h.routes)
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    expect(h.adapter.translationCalls).toBe(0)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages[0]).toContain('该命令会删除 build/ 下的产物。')
    expect(messages[0]).not.toContain('Reviewer reason (translated')
  })

  it('relays at most once when the same call id is replayed', async () => {
    const h = await harness({
      config: { forwardMode: 'always', translate: false },
      adapterMode: 'repeat',
    })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toHaveLength(1)
    expect(h.adapter.main).toBe(4)
  })

  it('sends the note alone when forwardMode is never', async () => {
    const h = await harness({
      config: { forwardMode: 'never' },
      onApproval: async ({ sessionId, callId }) => {
        const response = await postNote(h.routes, {
          sessionId,
          callId,
          note: 'use pnpm clean',
          forward: true,
        })
        expect(response.status).toBe(200)
        return 'rejected'
      },
    })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toEqual(['User rejected tool "probe".\n\nUser note:\nuse pnpm clean'])
  })

  it('supports notes on ordinary approvals when opted in', async () => {
    const h = await harness({
      askReason: 'ordinary approval: please confirm',
      config: { noteForNonReviewApprovals: true, forwardMode: 'never' },
      onApproval: async ({ sessionId, callId }) => {
        const response = await postNote(h.routes, {
          sessionId,
          callId,
          note: 'go ahead, but only once',
          forward: false,
        })
        expect(response.status).toBe(200)
        return 'rejected'
      },
    })
    send(h.agent)
    await waitForIdle(h.ctx, h.agent)
    const messages = injectedMessages(h.agent).filter(text => text.startsWith('User rejected tool'))
    expect(messages).toEqual(['User rejected tool "probe".\n\nUser note:\ngo ahead, but only once'])
  })

  it('validates the note endpoint', async () => {
    const h = await harness({ config: { noteMaxChars: 10 } })
    const config = await configOf(h.routes)
    expect(config).toMatchObject({ protocol: 1, noteMaxChars: 10, resolvedTargetLanguage: 'zh-CN' })

    const wrongType = await postNote(h.routes, { sessionId: 's', callId: 'c', note: '', forward: true }, 'text/plain')
    expect(wrongType.status).toBe(415)

    const unknown = await postNote(h.routes, { sessionId: 's', callId: 'c', note: '', forward: true })
    expect(unknown.status).toBe(404)

    const tooLong = await postNote(h.routes, { sessionId: 's', callId: 'c', note: '01234567890', forward: true })
    expect([400, 404]).toContain(tooLong.status)
  })
})
