import { describe, it, expect } from 'vitest'
import { lifeExpectancyAtAge, countryAnchors, blendMarker } from '../lifeBlend'
import type { LifeTable } from '../lifeBlend'

const TABLE: LifeTable = {
  retrieved: '2026-05-30',
  countries: {
    DE: { name: 'Germany', source: 'Eurostat', ex_by_age: { male: { '38': 41.9 }, female: { '38': 45.6 } } },
    RU: { name: 'Russia', source: 'WHO', ex_by_age: { male: { '35': 33.0, '40': 29.0 }, female: { '38': 38.0 } } },
  },
}

describe('lifeExpectancyAtAge', () => {
  it('returns exact-age ex', () => {
    expect(lifeExpectancyAtAge(TABLE, 'DE', 'male', 38)).toBe(41.9)
  })
  it('maps to nearest available bracket when exact age missing', () => {
    // age 38 -> nearest of 35/40 is 40 (tie broken toward later? 38 is closer to 40 by 2 vs 3)
    expect(lifeExpectancyAtAge(TABLE, 'RU', 'male', 38)).toBe(29.0)
  })
  it('returns null for unknown country', () => {
    expect(lifeExpectancyAtAge(TABLE, 'XX', 'male', 38)).toBeNull()
  })
})

describe('countryAnchors', () => {
  it('builds target age = age + ex per residence country', () => {
    const a = countryAnchors(TABLE, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'male', 38)
    expect(a).toEqual([
      { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
      { country: 'RU', name: 'Russia', exAtAge: 29.0, targetAge: 67.0 },
    ])
  })
  it('skips unknown countries', () => {
    const a = countryAnchors(TABLE, [{ country: 'XX', years: 5 }], 'male', 38)
    expect(a).toEqual([])
  })
})

describe('blendMarker', () => {
  const anchors = [
    { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
    { country: 'RU', name: 'Russia', exAtAge: 29.0, targetAge: 67.0 },
  ]
  it('years-weights with current-residence emphasis and reports spread', () => {
    const m = blendMarker(anchors, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'DE')
    expect(m.heuristic).toBe(true)
    expect(m.spread).toEqual({ min: 67.0, max: 79.9 })
    expect(m.targetAge).toBeGreaterThan(67.0)
    expect(m.targetAge).toBeLessThan(79.9)
  })
  it('single country returns that anchor with no emphasis effect', () => {
    const m = blendMarker([anchors[0]], [{ country: 'DE', years: 5 }], 'DE')
    expect(m.targetAge).toBe(79.9)
  })
  it('zero total years falls back to current country anchor', () => {
    const m = blendMarker(anchors, [{ country: 'DE', years: 0 }, { country: 'RU', years: 0 }], 'DE')
    expect(m.targetAge).toBe(79.9)
  })
})
