/**
 * M0 static-contract probe against the DSH source checkout at the pinned
 * 0.2.1-rc.2 commit. It pins the exact source facts the client half depends on,
 * including two facts that are easy to miss:
 *   - the official approval chain entry owns `conversation.approval.detail`,
 *     and a child slot can only be declared once;
 *   - the official detail component only renders a correlated shell command.
 *
 * Run from the repository root:
 *   DSH_SOURCE=/path/to/deepseek-harness node tests/m0/static-contracts.mjs
 * Defaults to /home/chofu/code/deepseek-harness.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.DSH_SOURCE ?? '/home/chofu/code/deepseek-harness'
const failures = []

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function match(path, pattern, label) {
  const text = read(path)
  if (pattern.test(text)) {
    console.log(`PASS ${label}`)
    return
  }
  failures.push({ label, path, pattern: String(pattern) })
  console.log(`FAIL ${label} (${path} did not match ${pattern})`)
}

match('packages/client/ui-approval/src/client/index.ts',
  /priority:\s*1[\s\S]*?select:\s*\(\{ pendingInteraction \}/,
  'official approval chain entry is priority 1 and selects pendingInteraction')
match('packages/client/ui-approval/src/client/index.ts',
  /pendingInteraction instanceof PendingApproval \? pendingInteraction : null/,
  'official selector matches the PendingApproval instance')
match('packages/client/ui-approval/src/client/index.ts',
  /'conversation\.approval\.detail': \{ kind: 'single', scope: 'session' \}/,
  'official entry declares conversation.approval.detail as its child')
match('packages/client/ui-approval/src/client/index.ts',
  /ctx\.remote\.\$on\('approval\/request', function \(request, next\)/,
  'client approval answerer rides the forwarded approval/request waterfall')
match('packages/client/ui-approval/src/client/contract/slots.ts',
  /readonly reason: string \| undefined[\s\S]*?readonly displayReason[\s\S]*?readonly result: Promise<ApprovalDecision>/,
  'PendingApproval exposes reason/displayReason/result')
match('packages/client/ui-approval/src/client/contract/slots.ts',
  /get answerable\(\): boolean[\s\S]*?answer\(outcome: ApprovalDecision\): Promise<void>/,
  'PendingApproval exposes answerable + answer(outcome)')
match('packages/client/ui-slots/src/index.ts',
  /next\.sort\(spec\.kind === 'list'[\s\S]*?\(a, b\) => \(a\.options\.priority \?\? 0\) - \(b\.options\.priority \?\? 0\)/,
  'chain entries sort by ascending priority, then registration order')
match('packages/client/ui-renderer/src/client/scoped-slots.tsx',
  /for \(const entry of entries\)[\s\S]*?if \(matched !== null\) \{[\s\S]*?break/,
  'chain elects the first selector that returns non-null')
match('packages/client/ui-slots/src/index.ts',
  /slot "\$\{childKey\}" is already declared/,
  'a child slot cannot be declared twice (our entry cannot claim approval.detail)')
match('packages/client/ui-chat/src/client/chat/ApprovalCommand.tsx',
  /return command \?\? null/,
  'official approval detail only renders the correlated shell command')
match('packages/api/remotes/src/remote-events.ts',
  /\{ event: 'approval\/request', mode: 'waterfall' \}/,
  'Host forwards approval/request to the client as a waterfall')
match('packages/client/connection/src/rpc-host.ts',
  /register: route => this\.registerFetchRoute\(owner, route\)/,
  'connection.fetch.register is the transport-independent client→host route')
match('packages/client/connection/src/rpc-host.ts',
  /return owner\.effect\(\(\) => \{[\s\S]*?this\.fetchRoutes\.set\(route\.path, registered\)/,
  'fetch route registration is owned by the reading context effect')
match('packages/client/connection/src/rpc.ts',
  /readonly path: string[\s\S]*?readonly methods: readonly ConnectionFetchMethod\[\][\s\S]*?readonly requestBody: ConnectionRequestBodyMode/,
  'connection fetch route carries path, methods, and buffered/streaming body mode')
match('packages/core/agent-loop/src/agent.ts',
  /inject\(input: UserMessage\): void \{\n\s*this\.send\(input, 'next-step', false\)\n\s*\}/,
  'inject() targets next-step without waking the driver')
match('packages/core/agent-loop/src/agent.ts',
  /followup\(input: UserMessage\): void \{\n\s*this\.send\(input, 'next-turn', true\)\n\s*\}/,
  'followup() targets next-turn and wakes the driver')
match('packages/core/agent-loop/src/inbox.ts',
  /claim\(target: InboxTarget, turn: number\): UserMessage\[\] \{[\s\S]*?this\.mutate\('next-step', 0, this\.nextStep\.length/,
  'each step boundary claims next-step before the request is assembled')

if (failures.length > 0) {
  console.error(`\n${failures.length} static contract check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll M0 static contract checks passed')
}
