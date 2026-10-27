/**
 * dsh-review-relay host half: observe Auto review asks, collect the browser
 * note, and relay the reviewer reason back into the same working agent.
 *
 * This plugin never answers the approval waterfall itself; it observes the
 * outcome with a prepended listener and always returns it unchanged.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type ReviewRelayConfig } from './host/config.js'
import { ReviewRelayRuntime } from './host/runtime.js'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'review-relay'

/** Required Host service: the approval waterfall we observe. */
export const inject = ['approval']

export { Config }
export type { ReviewRelayConfig } from './host/config.js'

/**
 * Install the observer, the authenticated client routes, and the delivery
 * queue. Invalid configuration throws here, at load time.
 * @param ctx - Host plugin context.
 * @param config - raw or resolved plugin config.
 */
export function apply(ctx: Context, config?: ReviewRelayConfig): void {
  const resolved = resolveConfig(config)
  if (!resolved.enabled) {
    ctx.logger.info('review-relay: disabled by configuration')
    return
  }
  new ReviewRelayRuntime(ctx, resolved).install()
}
