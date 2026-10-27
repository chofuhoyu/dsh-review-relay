/** One lightweight app-wide toast for successful relay submission. */
import { useSyncExternalStore, type ReactNode } from 'react'

/** Current toast value. */
export interface RelayToastState {
  readonly id: number
  readonly text: string
  readonly error: boolean
}

let nextId = 0
let current: RelayToastState | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function publish(next: RelayToastState | null): void {
  current = next
  for (const listener of [...listeners]) listener()
}

/**
 * Show one relay toast, replacing any previous one and restarting its hold.
 * @param text - already-localized copy.
 * @param error - whether the banner renders the error tone.
 */
export function showRelayToast(text: string, error = false): void {
  if (typeof document === 'undefined') return
  nextId += 1
  publish({ id: nextId, text, error })
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    publish(null)
  }, 4000)
}

/** Subscribe to toast changes. */
export function subscribeRelayToast(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Read the current toast. */
export function relayToastSnapshot(): RelayToastState | null {
  return current
}

/** Clear the toast and its timer on plugin disposal. */
export function disposeRelayToast(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  publish(null)
  listeners.clear()
}

/** The overlay banner; renders nothing while no toast is active. */
export function RelayToastView(): ReactNode {
  const toast = useSyncExternalStore(subscribeRelayToast, relayToastSnapshot, relayToastSnapshot)
  if (toast === null) return null
  return (
    <div className={toast.error ? 'rr-toast rr-toast-error' : 'rr-toast'} role="status" aria-live="polite">
      {toast.text}
    </div>
  )
}
