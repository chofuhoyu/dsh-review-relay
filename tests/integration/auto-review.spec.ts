import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  LlmAdapter,
  ToolCallId,
  createMessage,
  createToolResultMessage,
  type GenerateOptions,
  type StreamChunk,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import PermissionPresetService, { AUTO_PRESET } from '@deepseek-ai/dsh-permission-presets'
import * as AutoReview from '@deepseek-ai/dsh-experimental-auto-review'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as ReviewRelay from '../../src/index.js'

const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

function decisionChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ReviewAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model }
  }
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield* decisionChunks('{"risk":"medium","decision":"deny","reason":"irreversible delete of build/"}')
  }
}

const PRESETS = {
  'read-only': { sandbox: 'read-only', approval: 'ask', name: 'Read only' },
  'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: 'Workspace write' },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', name: 'Full access' },
} as const

async function reviewHarness() {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  ctx.provide('workingDirectory', {
    defaultDirectory: '/workspace',
    get: (session: Session) => session.header.cwd ?? '/workspace',
    ensure: (agent: Agent) => Promise.resolve(agent.session.header.cwd ?? '/workspace'),
  })
  ctx.provide('shell', {
    sandboxMode: 'workspace-write',
    resolve() { throw new Error('not used') },
    run() { throw new Error('not used') },
    start() { throw new Error('not used') },
  })
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(PermissionPresetService, { presets: PRESETS, defaultPreset: 'workspace-write' })
  ctx.llm.registerAdapter(['review'], new ReviewAdapter())
  await ctx.plugin(AutoReview)
  await ctx.plugin(ReviewRelay, { forwardMode: 'always', translate: false })
  contexts.push(ctx)
  return ctx
}

function stubAgent(session: Session, injected: string[]): Agent {
  return {
    id: session.id,
    session,
    options: { provider: 'review', model: 'same-model' },
    status: 'running',
    inject(message: UserMessage) {
      session.append('user/message', message, { surfaceOp: 'append' })
      for (const block of message.content) if (block.type === 'text') injected.push(block.text)
    },
    followup(message: UserMessage) {
      this.inject(message)
    },
  } as Agent
}

describe('real auto-review integration', () => {
  it('recognizes the shipped ask and relays its verbatim reviewer reason', async () => {
    const ctx = await reviewHarness()
    const session = ctx.sessions.create(SessionId('auto-review-relay'), { meta: { cwd: '/workspace' } })
    ctx.permissionPresets.set(session, AUTO_PRESET)
    const injected: string[] = []
    const agent = stubAgent(session, injected)

    session.append('request/header', {
      header: {
        config: { provider: 'review', model: 'same-model' },
        tools: [{ name: 'probe', description: 'live probe description', parameters: { path: { type: 'string' } } }],
      },
      reason: 'initial',
    })
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    const callId = ToolCallId('auto-review-relay-call')
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      stream: [],
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'tool-call', id: callId, name: 'probe', arguments: '{}' }],
        source: { kind: 'model', provider: 'review', model: 'same-model' },
      }),
    }, { surfaceOp: 'append' })
    session.append('tool/call', { turn: 1, step: 1, callId, name: 'probe', arguments: '{}' })
    ctx.tools.register(defineContentToolFixture({
      name: 'probe',
      description: 'live probe description',
      parameters: { path: { type: 'string' } },
      async execute() { return [{ type: 'text', text: 'ran' }] },
    }))

    let observedReason: string | undefined
    ctx.on('approval/request', async (request, next) => {
      observedReason = request.reason
      return await next()
    }, true)
    ctx.on('approval/request', () => Promise.resolve('rejected'))

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId,
      name: 'probe',
      arguments: {},
      agent,
    })
    expect(observedReason).toBe('Auto review denied tool "probe": irreversible delete of build/')
    expect(result.isError).toBe(true)
    expect(result.error?.message).toBe('the user rejected tool "probe"')

    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({ callId, content: result.content, isError: result.isError }),
    }, { surfaceOp: 'append' })

    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(injected).toHaveLength(1)
    expect(injected[0]).toBe([
      'User rejected tool "probe".',
      'Reviewer reason (verbatim):\nirreversible delete of build/',
    ].join('\n\n'))
    const asked = session.snapshotEvents().filter(event => event.type === 'approval/asked')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.type === 'approval/asked' ? asked[0].data.reason : undefined).toBe(observedReason)
  })
})
