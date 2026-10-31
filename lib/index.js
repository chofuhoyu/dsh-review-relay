import { Config, resolveConfig } from './host/config.js';
import { ReviewRelayRuntime } from './host/runtime.js';
/** Cordis plugin name used by Loader diagnostics. */
export const name = 'review-relay';
/** Required Host service: the approval waterfall we observe. */
export const inject = ['approval'];
export { Config };
/**
 * Install the observer, the authenticated client routes, and the relay
 * queues. Invalid configuration throws here, at load time.
 * @param ctx - Host plugin context.
 * @param config - raw or resolved plugin config.
 */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    if (!resolved.enabled) {
        ctx.logger.info('review-relay: disabled by configuration');
        return;
    }
    new ReviewRelayRuntime(ctx, resolved).install();
}
//# sourceMappingURL=index.js.map