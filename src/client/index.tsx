/** Browser half: install the locale/styles and elect the review-relay card. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { fetchConfig, uiLocale } from './api.js'
import { en, NS, zh } from './locales.js'
import { ReviewRelayPanel, type ReviewRelayInjected } from './panel.js'
import { compileClientPattern, matchApproval, type MatchedApproval } from './select.js'
import { installStyles } from './styles.js'

/** Required client services: the slot registry and copy. */
export const inject = ['slots', 'locale']

/**
 * Install the card only after the host config is available. A failed fetch or
 * invalid pattern leaves the official approval entry untouched.
 * @param ctx - Client plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'review-relay: locale')
  ctx.effect(() => installStyles(), 'review-relay: styles')
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'review-relay: lifetime')
  const getLocale = (): string => uiLocale(ctx.locale.getSnapshot().active)
  void install(ctx, getLocale, lifetime.signal)
}

async function install(ctx: ClientContext, getLocale: () => string, signal: AbortSignal): Promise<void> {
  const config = await fetchConfig(getLocale(), signal)
  if (signal.aborted) return
  if (config === undefined) {
    console.warn('review-relay: config endpoint unavailable; keeping the official approval card')
    return
  }
  if (!config.enabled) return
  let pattern: RegExp
  try {
    pattern = compileClientPattern(config)
  } catch (error: unknown) {
    console.warn('review-relay: invalid recognition pattern; keeping the official approval card', error)
    return
  }

  let entryDispose: (() => void) | undefined
  let degraded = false
  const select = ({ pendingInteraction }: ComposerChainProps): MatchedApproval | null => {
    if (degraded) return null
    return matchApproval(pendingInteraction, config, pattern)
  }

  try {
    ctx.slots.inject('conversation.composer', () => {
      entryDispose = ctx.slots.register({
        name: 'conversation.composer',
        priority: 0,
        select,
        locale: NS,
        inject: (): ReviewRelayInjected => ({
          config,
          getLocale,
          resolveReason: (reason) => ctx.locale.resolveText(reason),
        }),
      }, ReviewRelayPanel)
      return entryDispose
    })
  } catch (error: unknown) {
    console.warn('review-relay: could not register the approval card; keeping the official card', error)
    return
  }

  // A chain entry crash does not abdicate by itself. Removing our entry bumps
  // the chain version, so the official priority-1 entry takes over immediately.
  ctx.effect(() => ctx.slots.onEntryError((key, entry, error) => {
    if (key !== 'conversation.composer') return
    if (entry.locale !== NS) return
    degraded = true
    console.error('review-relay: card crashed; falling back to the official approval card', error)
    entryDispose?.()
    entryDispose = undefined
  }), 'review-relay: crash fallback')
}
