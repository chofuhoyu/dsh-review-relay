import { describe, expect, it } from 'vitest'
import { resolveDeliveryTarget } from '../../src/host/runtime.js'

describe('delivery target', () => {
  it('defaults to the denied tool result', () => {
    expect(resolveDeliveryTarget('tool-result')).toBe('tool-result')
  })

  it('keeps the deprecated auto value on the tool result', () => {
    expect(resolveDeliveryTarget('auto')).toBe('tool-result')
  })

  it('keeps the legacy synthetic-message modes explicit', () => {
    expect(resolveDeliveryTarget('inject')).toBe('inject')
    expect(resolveDeliveryTarget('followup')).toBe('followup')
  })
})
