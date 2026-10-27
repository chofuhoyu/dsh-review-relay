import { describe, expect, it } from 'vitest'
import { en, zh } from '../../src/client/locales.js'

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(match => match[1] ?? '').sort()
}

describe('client locale dictionaries', () => {
  it('have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('have identical placeholder sets per key', () => {
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]))
    }
  })
})
