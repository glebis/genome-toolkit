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
})
