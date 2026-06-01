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
  it('interpolates within a small gap when exact age missing', () => {
    // age 38 sits between brackets 35 (33.0) and 40 (29.0); gap is 5 (== MAX).
    // t = (38-35)/(40-35) = 0.6 -> 33.0 + (29.0-33.0)*0.6 = 30.6
    expect(lifeExpectancyAtAge(TABLE, 'RU', 'male', 38)).toBe(30.6)
  })
  it('returns null when no bracketing pair is within the interpolation gap', () => {
    // Sparse WHO-style table: only at-birth and age-60. A 38yo has lower=0,
    // upper=60 -> gap 60 > MAX_INTERPOLATION_GAP_YEARS, so no anchor.
    const sparse: LifeTable = {
      retrieved: 'x',
      countries: { RU: { name: 'Russia', source: 'WHO', ex_by_age: { male: { '0': 65.6, '60': 14.0 }, female: {} } } },
    }
    expect(lifeExpectancyAtAge(sparse, 'RU', 'male', 38)).toBeNull()
  })
  it('returns null when age is outside the available brackets (no upper)', () => {
    // age 38 is above both 35 and 40? No -- use age 42: lower=40, no upper bracket.
    expect(lifeExpectancyAtAge(TABLE, 'RU', 'male', 42)).toBeNull()
  })
  it('returns null for unknown country', () => {
    expect(lifeExpectancyAtAge(TABLE, 'XX', 'male', 38)).toBeNull()
  })
})

describe('countryAnchors', () => {
  it('builds target age from exact age or interpolated ex per residence country', () => {
    // DE: exact age 38 -> 38 + 41.9 = 79.9.
    // RU: 38 interpolated between 35/40 -> ex 30.6, target = 38 + 30.6 = 68.6
    const a = countryAnchors(TABLE, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'male', 38)
    expect(a).toEqual([
      { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
      { country: 'RU', name: 'Russia', exAtAge: 30.6, targetAge: 68.6 },
    ])
  })
  it('skips sparse age-0/age-60 data for current-age anchors', () => {
    // Only at-birth and age-60 brackets. A 38yo has no bracketing pair within the
    // interpolation gap, so the country yields no anchor (must not borrow age-60 ex).
    const sparse: LifeTable = {
      retrieved: 'x',
      countries: { RU: { name: 'Russia', source: 'WHO', ex_by_age: { male: { '0': 65.6, '60': 14.0 }, female: {} } } },
    }
    const a = countryAnchors(sparse, [{ country: 'RU', years: 38 }], 'male', 38)
    expect(a).toEqual([])
  })
  it('skips unknown countries', () => {
    const a = countryAnchors(TABLE, [{ country: 'XX', years: 5 }], 'male', 38)
    expect(a).toEqual([])
  })
})

describe('blendMarker', () => {
  const anchors = [
    { country: 'DE', name: 'Germany', exAtAge: 41.9, targetAge: 79.9 },
    { country: 'RU', name: 'Russia', exAtAge: 29.0, targetAge: 69.0 },
  ]
  it('years-weights with current-residence emphasis and reports spread', () => {
    const m = blendMarker(anchors, [{ country: 'DE', years: 5 }, { country: 'RU', years: 33 }], 'DE')
    expect(m.heuristic).toBe(true)
    expect(m.spread).toEqual({ min: 69.0, max: 79.9 })
    expect(m.targetAge).toBeGreaterThan(69.0)
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
