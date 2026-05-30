import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResidenceHistory, RESIDENCE_STORAGE_KEY } from '../hooks/useResidenceHistory'

describe('useResidenceHistory', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => { store[key] = val }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
    })
  })

  it('defaults to empty residences with sane sex/age', () => {
    const { result } = renderHook(() => useResidenceHistory())
    expect(result.current.state.residences).toEqual([])
    expect(result.current.state.sex).toBe('male')
    expect(result.current.state.age).toBeGreaterThan(0)
  })

  it('adds, updates, removes residences and persists', () => {
    const { result } = renderHook(() => useResidenceHistory())
    act(() => result.current.addResidence({ country: 'RU', years: 33 }))
    act(() => result.current.addResidence({ country: 'DE', years: 5 }))
    act(() => result.current.updateResidence('DE', { years: 6 }))
    act(() => result.current.removeResidence('RU'))
    expect(result.current.state.residences).toEqual([{ country: 'DE', years: 6 }])
    expect(JSON.parse(store[RESIDENCE_STORAGE_KEY]).residences).toEqual([{ country: 'DE', years: 6 }])
  })

  it('sets current country, sex and age and persists', () => {
    const { result } = renderHook(() => useResidenceHistory())
    act(() => result.current.setCurrentCountry('DE'))
    act(() => result.current.setSex('female'))
    act(() => result.current.setAge(38))
    const saved = JSON.parse(store[RESIDENCE_STORAGE_KEY])
    expect(saved.currentCountry).toBe('DE')
    expect(saved.sex).toBe('female')
    expect(saved.age).toBe(38)
  })

  it('defaults to no selected modifiers and toggles them, persisting', () => {
    const { result } = renderHook(() => useResidenceHistory())
    expect(result.current.state.modifierIds).toEqual([])
    act(() => result.current.toggleModifier('smoking'))
    act(() => result.current.toggleModifier('anxiety'))
    expect(result.current.state.modifierIds).toEqual(['smoking', 'anxiety'])
    act(() => result.current.toggleModifier('smoking'))
    expect(result.current.state.modifierIds).toEqual(['anxiety'])
    expect(JSON.parse(store[RESIDENCE_STORAGE_KEY]).modifierIds).toEqual(['anxiety'])
  })

  it('recovers from malformed JSON', () => {
    store[RESIDENCE_STORAGE_KEY] = '{not json'
    const { result } = renderHook(() => useResidenceHistory())
    expect(result.current.state.residences).toEqual([])
  })

  it('does not add a duplicate country', () => {
    const { result } = renderHook(() => useResidenceHistory())
    act(() => result.current.addResidence({ country: 'RU', years: 33 }))
    act(() => result.current.addResidence({ country: 'RU', years: 10 }))
    expect(result.current.state.residences).toEqual([{ country: 'RU', years: 33 }])
  })

  describe('sanitization', () => {
    const seed = (value: unknown) => {
      store[RESIDENCE_STORAGE_KEY] = JSON.stringify(value)
    }

    it('clamps a negative years and an out-of-range age on load', () => {
      seed({ residences: [{ country: 'DE', years: -5 }], currentCountry: 'DE', sex: 'female', age: 999, modifierIds: [] })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.residences[0].years).toBe(0)
      expect(result.current.state.age).toBe(110)
    })

    it('clamps an absurdly large years on load to the max bound', () => {
      seed({ residences: [{ country: 'DE', years: 9000 }], currentCountry: 'DE', sex: 'male', age: 30, modifierIds: [] })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.residences[0].years).toBe(110)
    })

    it('drops residences with empty or invalid country on load', () => {
      seed({
        residences: [
          { country: 'DE', years: 10 },
          { country: '', years: 5 },
          { years: 3 },
          { country: 42, years: 2 },
          null,
        ],
        currentCountry: 'DE',
        sex: 'male',
        age: 30,
        modifierIds: [],
      })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.residences).toEqual([{ country: 'DE', years: 10 }])
    })

    it('coerces an invalid sex value to male on load', () => {
      seed({ residences: [], currentCountry: '', sex: 'nonbinary', age: 30, modifierIds: [] })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.sex).toBe('male')
    })

    it('clamps a non-finite age on load to the default', () => {
      seed({ residences: [], currentCountry: '', sex: 'male', age: Number.NaN, modifierIds: [] })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.age).toBeGreaterThan(0)
      expect(Number.isFinite(result.current.state.age)).toBe(true)
    })

    it('clamps a negative age set via a mutation', () => {
      const { result } = renderHook(() => useResidenceHistory())
      act(() => result.current.setAge(-40))
      expect(result.current.state.age).toBe(0)
    })

    it('clamps a negative years set via updateResidence', () => {
      seed({ residences: [{ country: 'DE', years: 10 }], currentCountry: 'DE', sex: 'male', age: 30, modifierIds: [] })
      const { result } = renderHook(() => useResidenceHistory())
      act(() => result.current.updateResidence('DE', { years: -99 }))
      expect(result.current.state.residences[0].years).toBe(0)
    })

    it('drops a residence added with an invalid country via mutation', () => {
      const { result } = renderHook(() => useResidenceHistory())
      act(() => result.current.addResidence({ country: '', years: 5 }))
      expect(result.current.state.residences).toEqual([])
    })

    it('keeps valid state unchanged', () => {
      seed({ residences: [{ country: 'DE', years: 10 }], currentCountry: 'DE', sex: 'female', age: 45, modifierIds: ['m1'] })
      const { result } = renderHook(() => useResidenceHistory())
      expect(result.current.state.residences).toEqual([{ country: 'DE', years: 10 }])
      expect(result.current.state.sex).toBe('female')
      expect(result.current.state.age).toBe(45)
      expect(result.current.state.modifierIds).toEqual(['m1'])
    })
  })
})
