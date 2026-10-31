/**
 * dsh-review-relay host half: observe Auto review asks, collect the browser
 * note, and relay the reviewer reason back into the same working agent.
 *
 * This plugin never answers the approval waterfall itself; it observes the
 * outcome with a prepended listener and always returns it unchanged.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type ReviewRelayConfig } from './host/config.js';
/** Cordis plugin name used by Loader diagnostics. */
export declare const name = "review-relay";
/** Required Host service: the approval waterfall we observe. */
export declare const inject: string[];
export { Config };
export type { ReviewRelayConfig } from './host/config.js';
/**
 * Install the observer, the authenticated client routes, and the relay
 * queues. Invalid configuration throws here, at load time.
 * @param ctx - Host plugin context.
 * @param config - raw or resolved plugin config.
 */
export declare function apply(ctx: Context, config?: ReviewRelayConfig): void;
