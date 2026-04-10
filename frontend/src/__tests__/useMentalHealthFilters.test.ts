import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMentalHealthFilters } from '../hooks/useMentalHealthFilters'

describe('useMentalHealthFilters', () => {
  it('starts with all filters showing everything', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    expect(result.current.activeCategory).toBe(null)
    expect(result.current.activeActionType).toBe(null)
  })

  it('toggles category filter', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setCategory('mood'))
    expect(result.current.activeCategory).toBe('mood')
    act(() => result.current.setCategory('mood'))
    expect(result.current.activeCategory).toBe(null)
  })

  it('toggles action type filter', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setActionType('consider'))
    expect(result.current.activeActionType).toBe('consider')
  })

  it('clears all filters', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => {
      result.current.setCategory('mood')
      result.current.setActionType('consider')
    })
    act(() => result.current.clearAll())
    expect(result.current.activeCategory).toBe(null)
    expect(result.current.activeActionType).toBe(null)
  })

  it('filters genes by category', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    const genes = [
      { categories: ['mood', 'stress'] },
      { categories: ['sleep'] },
      { categories: ['mood'] },
    ]
    act(() => result.current.setCategory('mood'))
    const filtered = genes.filter(g => result.current.matchesGene(g as any))
    expect(filtered).toHaveLength(2)
  })

  it('toggles action type filter back to null', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setActionType('consider'))
    expect(result.current.activeActionType).toBe('consider')
    act(() => result.current.setActionType('consider'))
    expect(result.current.activeActionType).toBe(null)
  })

  it('matchesGene returns true for all genes when no category filter is set', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    const gene = { categories: [] as string[] }
    expect(result.current.matchesGene(gene as any)).toBe(true)
  })

  it('matchesGene rejects gene with empty categories when category filter is active', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => result.current.setCategory('mood'))
    const gene = { categories: [] as string[] }
    expect(result.current.matchesGene(gene as any)).toBe(false)
  })

  it('matchesAction with each action type', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    const types = ['consider', 'monitor', 'discuss', 'try'] as const
    for (const type of types) {
      act(() => result.current.setActionType(type))
      const matching = { type } as any
      const nonMatching = { type: type === 'consider' ? 'monitor' : 'consider' } as any
      expect(result.current.matchesAction(matching)).toBe(true)
      expect(result.current.matchesAction(nonMatching)).toBe(false)
    }
  })

  it('both category and action type filters active simultaneously', () => {
    const { result } = renderHook(() => useMentalHealthFilters())
    act(() => {
      result.current.setCategory('sleep')
      result.current.setActionType('monitor')
    })
    expect(result.current.activeCategory).toBe('sleep')
    expect(result.current.activeActionType).toBe('monitor')

    const geneMatch = { categories: ['sleep'] }
    const geneNoMatch = { categories: ['mood'] }
    expect(result.current.matchesGene(geneMatch as any)).toBe(true)
    expect(result.current.matchesGene(geneNoMatch as any)).toBe(false)

    const actionMatch = { type: 'monitor' } as any
    const actionNoMatch = { type: 'consider' } as any
    expect(result.current.matchesAction(actionMatch)).toBe(true)
    expect(result.current.matchesAction(actionNoMatch)).toBe(false)
  })
})
