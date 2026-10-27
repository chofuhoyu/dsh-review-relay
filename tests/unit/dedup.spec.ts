import { describe, expect, it } from 'vitest'
import { DeliveredSet, deliveryKey } from '../../src/host/dedup.js'

describe('delivery key', () => {
  it('uses the exact session and call id when available', () => {
    expect(deliveryKey({ sessionId: 's1', callId: 'c1', toolName: 'bash', reason: 'r' }))
      .toBe('call:s1:c1')
    expect(deliveryKey({ sessionId: 's2', callId: 'c1', toolName: 'bash', reason: 'r' }))
      .toBe('call:s2:c1')
  })

  it('uses a stable bounded hash without a call id', () => {
    const first = deliveryKey({ sessionId: 's1', toolName: 'bash', reason: 'r' })
    const second = deliveryKey({ sessionId: 's1', toolName: 'bash', reason: 'r' })
    expect(first).toBe(second)
    expect(first).toMatch(/^fallback:[0-9a-f]{32}$/)
    expect(deliveryKey({ sessionId: 's1', toolName: 'bash', reason: 'other' })).not.toBe(first)
  })
})

describe('DeliveredSet', () => {
  it('marks exactly once and clears', () => {
    const set = new DeliveredSet(8, 1000)
    expect(set.mark('a')).toBe(true)
    expect(set.mark('a')).toBe(false)
    expect(set.has('a')).toBe(true)
    set.clear()
    expect(set.mark('a')).toBe(true)
  })

  it('expires after the TTL', () => {
    let now = 0
    const set = new DeliveredSet(8, 1000, () => now)
    expect(set.mark('a')).toBe(true)
    now = 500
    expect(set.mark('a')).toBe(false)
    now = 1001
    expect(set.mark('a')).toBe(true)
  })

  it('stays bounded by evicting the oldest key', () => {
    const set = new DeliveredSet(2, 10_000)
    expect(set.mark('a')).toBe(true)
    expect(set.mark('b')).toBe(true)
    expect(set.mark('c')).toBe(true)
    expect(set.size).toBe(2)
    expect(set.has('a')).toBe(false)
    expect(set.has('b')).toBe(true)
    expect(set.has('c')).toBe(true)
  })
})
