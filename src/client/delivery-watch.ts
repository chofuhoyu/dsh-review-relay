/** Short post-rejection poll for the host's injection result. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { fetchDeliveryStatus } from './api.js'
import { showRelayToast } from './toast.js'

const WATCH_WINDOW_MS = 6000
const POLL_MS = 300
const active = new Set<AbortController>()

/**
 * Watch one call's delivery outcome after a successful rejection. The card
 * already showed the immediate success toast; a failure replaces it with an
 * error toast, so injection failures stay visible after the card closes.
 * @param sessionId - rejected session.
 * @param callId - rejected tool call.
 * @param t - card dictionary.
 */
export function watchDelivery(sessionId: string, callId: string, t: TranslateNS<'review-relay'>): void {
  if (typeof document === 'undefined' || callId === '') return
  const controller = new AbortController()
  active.add(controller)
  const deadline = Date.now() + WATCH_WINDOW_MS
  let timer: ReturnType<typeof setTimeout> | undefined

  const finish = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    active.delete(controller)
  }

  const tick = async (): Promise<void> => {
    if (controller.signal.aborted) {
      finish()
      return
    }
    const state = await fetchDeliveryStatus(sessionId, callId, controller.signal)
    if (controller.signal.aborted) {
      finish()
      return
    }
    if (state === 'failed') {
      showRelayToast(t('deliveryFailed'), true)
      finish()
      return
    }
    if (state === 'delivered') {
      finish()
      return
    }
    if (Date.now() >= deadline) {
      finish()
      return
    }
    timer = setTimeout(() => { void tick() }, POLL_MS)
  }

  timer = setTimeout(() => { void tick() }, POLL_MS)
}

/** Cancel every active delivery watcher on plugin disposal. */
export function disposeDeliveryWatch(): void {
  for (const controller of active) controller.abort(new Error('review-relay disposed'))
  active.clear()
}
