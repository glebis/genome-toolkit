import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGWASData } from '../hooks/useGWASData'
import { useGWASTraits } from '../hooks/useGWASTraits'
import type { GWASTraitData } from '../hooks/useGWASData'
import type { GWASTrait } from '../hooks/useGWASTraits'

const mockTraitData: GWASTraitData = {
  trait: 'anxiety',
  display_name: 'Anxiety',
  source: 'PGC3',
  config: 'pgc3',
  publication: 'Doe 2023',
  citation: 'cite',
  license: 'CC',
  threshold: 5e-8,
  total_hits: 100,
  matched_hits: 50,
  risk_allele_total: 30,
  risk_allele_max: 50,
  matches: [],
}

const mockTrait: GWASTrait = {
  trait: 'anxiety',
  display_name: 'Anxiety',
  source: 'PGC3',
  publication: 'Doe 2023',
  n_hits: 100,
  threshold: 5e-8,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useGWASData', () => {
  it('loads data for a given trait', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTraitData),
    }) as any

    const { result } = renderHook(() => useGWASData('anxiety'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual(mockTraitData)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith('/api/gwas/anxiety')
  })

  it('starts with loading true', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any

    const { result } = renderHook(() => useGWASData('anxiety'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('sets loading to false after fetch completes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTraitData),
    }) as any

    const { result } = renderHook(() => useGWASData('anxiety'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('parses error detail from non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: 'Trait not found' }),
    }) as any

    const { result } = renderHook(() => useGWASData('unknown'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Trait not found')
    expect(result.current.data).toBeNull()
  })

  it('falls back to status code when error body has no detail', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }) as any

    const { result } = renderHook(() => useGWASData('broken'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('GWAS fetch failed: 500')
  })

  it('falls back to status code when error body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    }) as any

    const { result } = renderHook(() => useGWASData('bad'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('GWAS fetch failed: 502')
  })

  it('handles network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure')) as any

    const { result } = renderHook(() => useGWASData('anxiety'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Network failure')
    expect(result.current.data).toBeNull()
  })

  it('does not update state after unmount (cancelled flag)', async () => {
    let resolveFetch: (v: any) => void
    global.fetch = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveFetch = r }),
    ) as any

    const { result, unmount } = renderHook(() => useGWASData('anxiety'))
    // unmount before fetch resolves — cancelled flag should prevent state updates
    unmount()
    resolveFetch!({
      ok: true,
      json: () => Promise.resolve(mockTraitData),
    })

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50))

    // State should remain at initial values
    expect(result.current.data).toBeNull()
  })

  it('refetches when trait changes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTraitData),
    }) as any

    const { result, rerender } = renderHook(
      ({ trait }) => useGWASData(trait),
      { initialProps: { trait: 'anxiety' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(global.fetch).toHaveBeenCalledWith('/api/gwas/anxiety')

    rerender({ trait: 'depression' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(global.fetch).toHaveBeenCalledWith('/api/gwas/depression')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('useGWASTraits', () => {
  it('loads traits from response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ traits: [mockTrait] }),
    }) as any

    const { result } = renderHook(() => useGWASTraits())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.traits).toEqual([mockTrait])
    expect(global.fetch).toHaveBeenCalledWith('/api/gwas/traits')
  })

  it('starts with loading true and empty traits', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any

    const { result } = renderHook(() => useGWASTraits())
    expect(result.current.loading).toBe(true)
    expect(result.current.traits).toEqual([])
  })

  it('falls back to empty array on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fail')) as any

    const { result } = renderHook(() => useGWASTraits())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.traits).toEqual([])
  })

  it('falls back to empty array when response has no traits key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }) as any

    const { result } = renderHook(() => useGWASTraits())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.traits).toEqual([])
  })
})
