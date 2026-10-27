import { describe, expect, it } from 'vitest'
import { resolveDeliveryMode } from '../../src/host/runtime.js'

describe('delivery mode', () => {
  it('injects while a turn is open and follows up when idle', () => {
    expect(resolveDeliveryMode('running', 'auto')).toBe('inject')
    expect(resolveDeliveryMode('idle', 'auto')).toBe('followup')
  })

  it('honours explicit modes regardless of status', () => {
    expect(resolveDeliveryMode('idle', 'inject')).toBe('inject')
    expect(resolveDeliveryMode('running', 'followup')).toBe('followup')
  })
})
