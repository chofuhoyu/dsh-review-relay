/** Browser half: install the locale/styles and elect the review-relay card. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Required client services: the slot registry and copy. */
export declare const inject: string[];
/**
 * Install the card only after the host config is available. A failed fetch or
 * invalid pattern leaves the official approval entry untouched.
 * @param ctx - Client plugin context.
 */
export declare function apply(ctx: ClientContext): void;
