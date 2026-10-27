/**
 * M0 probe: the real auto-review ask string on 0.2.1-rc.2.
 *
 * The request document assumed `Auto review rejected tool "<tool>"; its body
 * was not executed: <reason>` for the ASK path. The shipped ask path actually
 * emits `Auto review denied tool "<tool>": <reason>` (no `; its body...`
 * suffix); the `rejected tool ...; its body was not executed` string belongs
 * to the direct (non-ask) denial. This probe runs the real auto-review plugin
 * and records what `approval/request` receives.
 *
 * Run from the repository root:
 *   node tests/m0/auto-review-probe.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  ToolCallId,
  createMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import PermissionPresetService, { AUTO_PRESET } from '@deepseek-ai/dsh-permission-presets'
import * as AutoReview from '@deepseek-ai/dsh-experimental-auto-review'

const PRESETS = {
  'read-only': { sandbox: 'read-only', approval: 'ask', name: 'Read only' },
  'workspace-write': { sandbox: 'workspace-write', approval: 'ask', name: 'Workspace write' },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', name: 'Full access' },
}

function decisionChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class RecordingAdapter extends LlmAdapter {
  requests = []
  constructor(script) {
    super()
    this.script = script
  }
  async *stream(options) {
    this.requests.push(options)
    const response = this.script.shift()
    if (response === undefined) throw new Error('review adapter script exhausted')
    yield* response
  }
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

const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(SessionStore)
await ctx.plugin(SessionProjectionRegistry)
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime)
ctx.provide('workingDirectory', {
  defaultDirectory: '/workspace',
  get: session => session.header.cwd ?? '/workspace',
  ensure: agent => Promise.resolve(agent.session.header.cwd ?? '/workspace'),
})
ctx.provide('shell', {
  sandboxMode: 'workspace-write',
  resolve() { throw new Error('not used') },
  run() { throw new Error('not used') },
  start() { throw new Error('not used') },
})
await ctx.plugin(ApprovalService, { policy: 'ask' })
await ctx.plugin(PermissionPresetService, { presets: PRESETS, defaultPreset: 'workspace-write' })
const adapter = new RecordingAdapter([
  decisionChunks('{"risk":"medium","decision":"deny","reason":"irreversible delete of build/"}'),
])
ctx.llm.registerAdapter(['review'], adapter)
await ctx.plugin(AutoReview)

const session = ctx.sessions.create(SessionId('m0-auto-review'), { meta: { cwd: '/workspace' } })
ctx.permissionPresets.set(session, AUTO_PRESET)
const agent = { id: session.id, session, options: { provider: 'review', model: 'same-model' } }

session.append('request/header', {
  header: {
    config: { provider: 'review', model: 'same-model' },
    tools: [{ name: 'probe', description: 'live probe description', parameters: { path: { type: 'string' } } }],
  },
  reason: 'initial',
})
session.append('turn/start', { turn: 1 })
session.append('step/start', { turn: 1, step: 1 })
const callId = ToolCallId('m0-auto-review-call')
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

let runs = 0
ctx.tools.register(defineContentToolFixture({
  name: 'probe',
  description: 'live probe description',
  parameters: { path: { type: 'string' } },
  async execute() { runs += 1; return [{ type: 'text', text: 'ran' }] },
}))

let observed
ctx.on('approval/request', async (request, next) => {
  observed = {
    reason: request.reason,
    displayReason: request.displayReason,
    callId: request.callId,
  }
  const outcome = await next()
  observed.outcome = outcome
  return outcome
}, true)
ctx.on('approval/request', () => Promise.resolve('rejected'))

const result = await ctx.tools.execute({
  signal: new AbortController().signal,
  callId,
  name: 'probe',
  arguments: {},
  agent,
})

check('review ask observed', observed?.reason !== undefined, observed)
check('ASK reason uses "denied": <reason>', observed?.reason
  === 'Auto review denied tool "probe": irreversible delete of build/', observed?.reason)
check('ASK reason does NOT use the direct-deny suffix', !observed?.reason?.includes('; its body was not executed'), observed?.reason)
check('displayReason keeps the raw English reason', observed?.displayReason?.en
  === 'Auto review denied this call: irreversible delete of build/', observed?.displayReason)
check('displayReason carries Chinese copy with the raw reason', observed?.displayReason?.zh
  === 'Auto review 拒绝了此调用：irreversible delete of build/', observed?.displayReason)
check('outcome observed', observed?.outcome === 'rejected', observed?.outcome)
// The recommended default: actual ask, optional reason, and NOT the direct-deny text.
const ASK_PATTERN = /^Auto review denied tool "(?<tool>[^"]+)"(?:: (?<reason>[\s\S]+))?$/
const askMatch = observed?.reason === undefined ? null : ASK_PATTERN.exec(observed.reason)
const directDeny = 'Auto review rejected tool "probe"; its body was not executed'
check('recommended default regex extracts tool and reason', askMatch?.groups?.tool === 'probe'
  && askMatch?.groups?.reason === 'irreversible delete of build/', askMatch?.groups)
check('recommended default regex rejects the direct-deny text', ASK_PATTERN.exec(directDeny) === null)
check('rejected call did not run', runs === 0 && result.isError
  && result.error.message === 'the user rejected tool "probe"', { runs, result })

const asked = session.snapshotEvents().filter(event => event.type === 'approval/asked')
check('approval/asked.reason is the exact asker reason',
  asked.length === 1 && asked[0].data.reason === observed?.reason, asked.map(event => event.data))

await ctx.fiber.dispose()

if (failures.length > 0) {
  console.error(`\n${failures.length} M0 check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll M0 auto-review checks passed')
}
