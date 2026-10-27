/**
 * Execute the built client artifact exactly as the DSH module loader does:
 * evaluate the closure-factory wrapper with a fake `window.__ModuleLoader__`,
 * materialize the factory with Node's require (React is a loader baseline),
 * then run its `apply` against a minimal client context. This catches wrapper,
 * import, and registration regressions that source-only tests cannot.
 *
 * Run after `npm run build`:
 *   node scripts/verify-client-bundle.mjs
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
let row
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(value) { row = value },
    },
  },
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  URL,
  URLSearchParams,
  Response,
  Request,
  TextEncoder,
}
vm.runInNewContext(source, sandbox, { filename: 'lib/client.js' })

if (row === undefined) throw new Error('client bundle did not call window.__ModuleLoader__.load')
if (row.id !== 'dsh-review-relay') throw new Error(`unexpected bundle id ${String(row.id)}`)
if (typeof row.factory !== 'function') throw new Error('client bundle factory is missing')

const require = createRequire(import.meta.url)
const moduleExports = row.factory(require)
if (!Array.isArray(moduleExports.inject) || !moduleExports.inject.includes('slots') || !moduleExports.inject.includes('locale')) {
  throw new Error('client bundle exports an unexpected inject list')
}
if (typeof moduleExports.apply !== 'function') throw new Error('client bundle does not export apply')

const registrations = []
const errors = []
const context = {
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  locale: {
    register() { return () => {} },
    getSnapshot() { return { active: 'zh', locales: [], revision: 0 } },
    resolveText(text) { return text.en },
  },
  slots: {
    inject(_owner, callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => { registrations.splice(registrations.indexOf(registrations.at(-1)), 1) }
    },
    onEntryError(listener) {
      errors.push(listener)
      return () => { errors.splice(errors.indexOf(listener), 1) }
    },
  },
}

const config = {
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
sandbox.fetch = async () => Response.json(config)
moduleExports.apply(context)
await new Promise(resolve => setTimeout(resolve, 0))

if (registrations.length !== 1) throw new Error(`expected one chain registration, got ${registrations.length}`)
const [registration] = registrations
if (registration.options.name !== 'conversation.composer' || registration.options.priority !== 0) {
  throw new Error('client bundle did not register the priority-0 composer entry')
}
if (typeof registration.options.select !== 'function') throw new Error('chain entry has no selector')
const selected = registration.options.select({
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
if (selected?.review?.reason !== 'because') throw new Error('client bundle selector did not elect the review ask')
console.log('client bundle OK: wrapper, factory, inject list, and priority-0 selection verified')
