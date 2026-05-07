import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMyMedications, normalizeDrugName } from '../hooks/useMyMedications'

describe('normalizeDrugName', () => {
  it('lowercases and trims', () => {
    expect(normalizeDrugName('  Fluoxetine  ')).toBe('fluoxetine')
  })

  it('strips parenthetical brand names', () => {
    expect(normalizeDrugName('Fluoxetine (Prozac)')).toBe('fluoxetine')
  })

  it('handles multiple parentheticals', () => {
    expect(normalizeDrugName('Drug (Brand) (Extra)')).toBe('drug')
  })

  it('returns empty for whitespace-only', () => {
    expect(normalizeDrugName('   ')).toBe('')
  })
})

describe('useMyMedications', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => { store[key] = val }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
    })
  })

  it('starts empty when no localStorage', () => {
    const { result } = renderHook(() => useMyMedications())
    expect(result.current.medications).toEqual([])
  })

  it('loads from localStorage', () => {
    store['genome_my_medications'] = JSON.stringify(['Sertraline', 'Omeprazole'])
    const { result } = renderHook(() => useMyMedications())
    expect(result.current.medications).toEqual(['Sertraline', 'Omeprazole'])
  })

  it('adds a medication and persists', () => {
    const { result } = renderHook(() => useMyMedications())
    act(() => result.current.addMedication('Fluoxetine'))
    expect(result.current.medications).toEqual(['Fluoxetine'])
    expect(store['genome_my_medications']).toBe(JSON.stringify(['Fluoxetine']))
  })

  it('deduplicates by normalized name', () => {
    const { result } = renderHook(() => useMyMedications())
    act(() => result.current.addMedication('Fluoxetine'))
    act(() => result.current.addMedication('fluoxetine'))
    act(() => result.current.addMedication('Fluoxetine (Prozac)'))
    expect(result.current.medications).toEqual(['Fluoxetine'])
  })

  it('ignores empty input', () => {
    const { result } = renderHook(() => useMyMedications())
    act(() => result.current.addMedication(''))
    act(() => result.current.addMedication('   '))
    expect(result.current.medications).toEqual([])
  })

  it('removes by normalized name', () => {
    store['genome_my_medications'] = JSON.stringify(['Sertraline', 'Omeprazole'])
    const { result } = renderHook(() => useMyMedications())
    act(() => result.current.removeMedication('sertraline'))
    expect(result.current.medications).toEqual(['Omeprazole'])
  })

  it('clears all', () => {
    store['genome_my_medications'] = JSON.stringify(['A', 'B', 'C'])
    const { result } = renderHook(() => useMyMedications())
    act(() => result.current.clearAll())
    expect(result.current.medications).toEqual([])
    expect(store['genome_my_medications']).toBe('[]')
  })
})
