/** One lightweight app-wide toast for successful relay submission. */
import { type ReactNode } from 'react';
/** Current toast value. */
export interface RelayToastState {
    readonly id: number;
    readonly text: string;
    readonly error: boolean;
}
/**
 * Show one relay toast, replacing any previous one and restarting its hold.
 * @param text - already-localized copy.
 * @param error - whether the banner renders the error tone.
 */
export declare function showRelayToast(text: string, error?: boolean): void;
/** Subscribe to toast changes. */
export declare function subscribeRelayToast(listener: () => void): () => void;
/** Read the current toast. */
export declare function relayToastSnapshot(): RelayToastState | null;
/** Clear the toast and its timer on plugin disposal. */
export declare function disposeRelayToast(): void;
/** The overlay banner; renders nothing while no toast is active. */
export declare function RelayToastView(): ReactNode;
