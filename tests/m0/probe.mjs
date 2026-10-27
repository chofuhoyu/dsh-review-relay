/**
 * M0 executable probe (published 0.2.1-rc.2 packages).
 *
 * Validates the assumptions the host half depends on:
 *   1. a prepended `approval/request` listener can observe the full request
 *      (toolName / callId / reason / displayReason) and the final outcome via
 *      `await next()`, and can pass that outcome through unchanged;
 *   2. `agent.inject()` issued while the approval is pending is deferred to the
 *      next step boundary: it lands after `tool/result`, never between the
 *      assistant tool call and its result;
 *   3. an idle `inject()` does NOT open a turn (so `followup()` is required
 *      when the agent is already idle).
 *
 * Run from the repository root:
 *   node tests/m0/probe.mjs
 *
 * The repo-local `node_modules` symlink points at the npx cache that holds the
 * published @deepseek-ai/dsh 0.2.1-rc.2 dependency tree.
 */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  ToolCallId,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import ApprovalService from '@deepseek-ai/dsh-user-approval'

const textResponse = (text) => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
]

const toolCallResponse = (id, name, args) => {
  const callId = ToolCallId(id)
  const json = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: json.slice(0, 7) },
    { type: 'tool-call-delta', index: 0, id: callId, name, argumentsDelta: json.slice(7) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name, arguments: json } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  requests = []
  constructor(script) {
    super()
    this.script = script
  }
  async resolveModel(provider, model) {
    return { provider, id: model, name: model }
  }
  async *stream(options) {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('script exhausted')
    yield* entry
  }
}

async function harness(script) {
  const adapter = new ScriptedAdapter(script)
  const ctx = new Context()
  await ctx.plugin(LlmRuntime, {})
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ApprovalService, {})
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

function waitForIdle(ctx, agent) {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

const failures = []
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS ${name}`)
    return
  }
  failures.push({ name, detail })
  console.log(`FAIL ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
}

async function rejectedScenario() {
  const { ctx, adapter } = await harness([
    toolCallResponse('call-1', 'probe', {}),
    textResponse('done'),
  ])
  let agent
  let observed
  let deliveryMethod
  const pendingDeliveries = new Map()
  ctx.tools.register(defineContentToolFixture({
    name: 'probe',
    description: 'probe tool',
    parameters: {},
    async execute() { return [{ type: 'text', text: 'body ran' }] },
  }))
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'probe') return next()
    return Promise.resolve({
      kind: 'ask',
      reason: 'Auto review denied tool "probe": irreversible delete of build/',
      displayReason: {
        en: 'Auto review denied this call: irreversible delete of build/',
        zh: 'Auto review 拒绝了此调用：不可逆删除 build/',
      },
    })
  })
  // Prepend, observe-only: the exact shape the host half will use.
  ctx.on('approval/request', async (request, next) => {
    observed = {
      toolName: request.toolName,
      callId: request.callId,
      reason: request.reason,
      displayReason: request.displayReason,
      hasAgent: request.agent !== undefined,
    }
    const outcome = await next()
    observed.outcome = outcome
    if (outcome === 'rejected') {
      // Do NOT append from inside the approval listener: approval/decided has
      // not been committed yet, and session append cannot reenter publication.
      // Stage the message by callId and deliver after the tool result commits.
      pendingDeliveries.set(String(request.callId), 'relay probe: user rejected and explained')
    }
    return outcome
  }, true)
  // The interactive answerer stands in for the official remote approval relay.
  ctx.on('approval/request', () => Promise.resolve('rejected'))
  // Deliver only after the matching tool/result is committed. The session/event
  // publication guard forbids appending here, so hop a microtask: it still runs
  // before the next step's preStep, so the message is admitted at the boundary.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'tool/result') return
    const key = String(event.data.message.toolCallId)
    const text = pendingDeliveries.get(key)
    if (text === undefined) return
    pendingDeliveries.delete(key)
    queueMicrotask(() => {
      const message = createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      })
      if (agent.status === 'idle') {
        deliveryMethod = 'followup'
        agent.followup(message)
      } else {
        deliveryMethod = 'inject'
        agent.inject(message)
      }
    })
  })

  agent = await ctx.agentLoop.create(SessionId('m0-rejected'), { provider: 'mock', model: 'mock' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)

  const events = agent.session.snapshotEvents()
  const asked = events.filter(event => event.type === 'approval/asked')
  const decided = events.filter(event => event.type === 'approval/decided')
  const toolCall = events.find(event => event.type === 'tool/call')
  const toolResult = events.find(event => event.type === 'tool/result')
  const injected = events.find(event => event.type === 'user/message'
    && event.data.source.kind === 'user'
    && event.data.content.some(block => block.type === 'text' && block.text.startsWith('relay probe')))

  check('observer saw full request fields', observed?.toolName === 'probe'
    && observed?.callId !== undefined
    && observed?.reason === 'Auto review denied tool "probe": irreversible delete of build/'
    && observed?.displayReason?.zh !== undefined
    && observed?.hasAgent === true, observed)
  check('observer saw final outcome', observed?.outcome === 'rejected', observed?.outcome)
  check('approval audit pair logged', asked.length === 1 && decided.length === 1
    && decided[0].data.outcome === 'rejected', { asked: asked.length, decided: decided.length })
  check('audit reason is the exact asker reason', asked[0]?.data.reason
    === 'Auto review denied tool "probe": irreversible delete of build/')
  const splice = events.find(event => event.type === 'agent/inbox/spliced'
    && event.data.inserted.some(message => message.content.some(block => block.type === 'text'
      && block.text.startsWith('relay probe'))))
  check('inbox splice is committed after approval/decided', splice !== undefined
    && decided[0] !== undefined && decided[0].seq < splice.seq, {
    decided: decided[0]?.seq, splice: splice?.seq,
  })
  check('inbox splice is committed after tool/result', splice !== undefined
    && toolResult !== undefined && toolResult.seq < splice.seq, {
    toolResult: toolResult?.seq, splice: splice?.seq,
  })
  check('injection admitted after tool result', injected !== undefined
    && toolCall !== undefined && toolResult !== undefined
    && toolResult.seq < injected.seq, {
    toolCall: toolCall?.seq, toolResult: toolResult?.seq, injected: injected?.seq,
  })
  check('delivery used inject while the agent was running', deliveryMethod === 'inject', deliveryMethod)
  check('injection is in the next model request after the tool result', (() => {
    const messages = adapter.requests[1]?.messages ?? []
    const resultIndex = messages.findIndex(message => message.role === 'tool')
    const injectIndex = messages.findIndex(message => message.content.some(block => block.type === 'text'
      && block.text.startsWith('relay probe')))
    return resultIndex >= 0 && injectIndex > resultIndex
  })(), adapter.requests.map(request => request.messages.map(message => message.role)))
  check('rejected tool result is still the denial text', toolResult?.type === 'tool/result'
    && JSON.stringify(toolResult.data.message).includes('the user rejected tool'))

  await ctx.fiber.dispose()
}

async function allowedScenario() {
  const { ctx, adapter } = await harness([
    toolCallResponse('call-2', 'probe', {}),
    textResponse('done'),
  ])
  let agent
  let observerSaw
  ctx.tools.register(defineContentToolFixture({
    name: 'probe',
    description: 'probe tool',
    parameters: {},
    async execute() { return [{ type: 'text', text: 'body ran' }] },
  }))
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'probe') return next()
    return Promise.resolve({ kind: 'ask', reason: 'Auto review denied tool "probe": check' })
  })
  ctx.on('approval/request', async (request, next) => {
    const outcome = await next()
    observerSaw = outcome
    if (outcome === 'rejected') {
      agent.inject(createUserMessage({
        content: [{ type: 'text', text: 'must not appear' }],
        source: { kind: 'user' },
      }))
    }
    return outcome
  }, true)
  ctx.on('approval/request', () => Promise.resolve('allowed-once'))

  agent = await ctx.agentLoop.create(SessionId('m0-allowed'), { provider: 'mock', model: 'mock' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
  await waitForIdle(ctx, agent)

  const events = agent.session.snapshotEvents()
  check('allowed outcome passes through unchanged', observerSaw === 'allowed-once', observerSaw)
  check('no injection on allow', !events.some(event => event.type === 'user/message'
    && event.data.source.kind === 'user'
    && event.data.content.some(block => block.type === 'text' && block.text === 'must not appear')))
  const result = events.find(event => event.type === 'tool/result')
  check('allowed tool body ran', result?.type === 'tool/result'
    && JSON.stringify(result.data.message).includes('body ran'))
  await ctx.fiber.dispose()
}

async function idleScenario() {
  const { ctx } = await harness([textResponse('unused')])
  const agent = await ctx.agentLoop.create(SessionId('m0-idle'), { provider: 'mock', model: 'mock' })
  agent.inject(createUserMessage({ content: [{ type: 'text', text: 'idle notice' }], source: { kind: 'user' } }))
  const events = agent.session.snapshotEvents()
  check('idle inject() stages but opens no turn', agent.status === 'idle'
    && events.every(event => event.type !== 'turn/start')
    && events.some(event => event.type === 'agent/inbox/spliced'
      && event.data.target === 'next-step'), events.map(event => event.type))
  await ctx.fiber.dispose()
}

await rejectedScenario()
await allowedScenario()
await idleScenario()

if (failures.length > 0) {
  console.error(`\n${failures.length} M0 check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll M0 checks passed')
}
