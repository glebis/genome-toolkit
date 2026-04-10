import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mockSNPResult = {
  items: [{
    rsid: 'rs123', chromosome: '1', position: 100, genotype: 'A/T',
    is_rsid: true, source: 'genotyped', r2_quality: null,
    significance: null, disease: null, gene_symbol: null,
  }],
  total: 1, page: 1, limit: 100,
}

let mockLocationSearch = ''

beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()

  // Mock fetch
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockSNPResult),
  })

  // Mock localStorage
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
  })

  // Mock window.location with configurable search
  mockLocationSearch = ''
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      search: '',
      pathname: '/snps',
      href: 'http://localhost/snps',
    },
  })

  // Mock history.replaceState
  vi.stubGlobal('history', {
    ...window.history,
    replaceState: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setLocationSearch(qs: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { search: qs, pathname: '/snps', href: `http://localhost/snps${qs}` },
  })
}

async function loadHook() {
  const mod = await import('../hooks/useSNPs')
  return mod.useSNPs
}

describe('useSNPs', () => {
  it('initializes with default filters (clinical=true, page=1)', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    expect(result.current.filters.clinical).toBe(true)
    expect(result.current.filters.page).toBe(1)
    expect(result.current.filters.limit).toBe(100)
    expect(result.current.filters.search).toBe('')
    expect(result.current.filters.chromosome).toBe('')
  })

  it('fetches /api/snps on mount', async () => {
    const useSNPs = await loadHook()
    renderHook(() => useSNPs())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toMatch(/^\/api\/snps\?/)
    })
  })

  it('updateFilters resets page to 1', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    // First set page to 3
    act(() => { result.current.setPage(3) })
    await waitFor(() => expect(result.current.filters.page).toBe(3))

    // Then update a filter — page should reset to 1
    act(() => { result.current.updateFilters({ chromosome: '7' }) })
    await waitFor(() => {
      expect(result.current.filters.page).toBe(1)
      expect(result.current.filters.chromosome).toBe('7')
    })
  })

  it('setPage changes page without resetting other filters', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    act(() => { result.current.updateFilters({ chromosome: '5', gene: 'BRCA1' }) })
    await waitFor(() => expect(result.current.filters.chromosome).toBe('5'))

    act(() => { result.current.setPage(4) })
    await waitFor(() => {
      expect(result.current.filters.page).toBe(4)
      expect(result.current.filters.chromosome).toBe('5')
      expect(result.current.filters.gene).toBe('BRCA1')
    })
  })

  it('resetFilters returns to defaults', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    act(() => {
      result.current.updateFilters({ search: 'rs123', chromosome: '1', clinical: false })
    })
    await waitFor(() => expect(result.current.filters.search).toBe('rs123'))

    act(() => { result.current.resetFilters() })
    await waitFor(() => {
      expect(result.current.filters.search).toBe('')
      expect(result.current.filters.chromosome).toBe('')
      expect(result.current.filters.clinical).toBe(true)
      expect(result.current.filters.page).toBe(1)
    })
  })

  it('activeFilterCount counts non-default filters', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    act(() => {
      result.current.updateFilters({ search: 'test', chromosome: '3', clinical: false })
    })
    await waitFor(() => {
      // search, chromosome, clinical differ from defaults = 3
      expect(result.current.activeFilterCount).toBe(3)
    })
  })

  it('activeFilterCount is 0 with all defaults', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    expect(result.current.activeFilterCount).toBe(0)
  })

  it('persists filters to localStorage without page/limit', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    act(() => {
      result.current.updateFilters({ search: 'MTHFR', chromosome: '1' })
    })

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalled()
      const calls = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[0]).toBe('genome_filters')
      const stored = JSON.parse(lastCall[1])
      expect(stored.search).toBe('MTHFR')
      expect(stored.chromosome).toBe('1')
      expect(stored).not.toHaveProperty('page')
      expect(stored).not.toHaveProperty('limit')
    })
  })

  it('URL params override defaults on init', async () => {
    setLocationSearch('?chr=22&gene=COMT&clinical=false&page=5')

    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    expect(result.current.filters.chromosome).toBe('22')
    expect(result.current.filters.gene).toBe('COMT')
    expect(result.current.filters.clinical).toBe(false)
    expect(result.current.filters.page).toBe(5)
    // Defaults preserved for unset params
    expect(result.current.filters.search).toBe('')
    expect(result.current.filters.limit).toBe(100)
  })

  it('handles fetch error gracefully (non-ok response)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal Server Error' }),
    })

    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    // Result stays at initial empty state because resp.ok is false
    expect(result.current.result.items).toEqual([])
    expect(result.current.result.total).toBe(0)
  })

  it('updates URL via history.replaceState on filter change', async () => {
    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    act(() => { result.current.updateFilters({ gene: 'APOE' }) })

    await waitFor(() => {
      expect(window.history.replaceState).toHaveBeenCalled()
      const calls = (window.history.replaceState as ReturnType<typeof vi.fn>).mock.calls
      const lastUrl = calls[calls.length - 1][2] as string
      expect(lastUrl).toContain('gene=APOE')
    })
  })

  it('fetches with correct query params including clinical=true', async () => {
    const useSNPs = await loadHook()
    renderHook(() => useSNPs())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
      const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain('clinical=true')
      expect(url).toContain('page=1')
      expect(url).toContain('limit=100')
    })
  })

  it('localStorage values are used when no URL params present', async () => {
    const stored = { search: 'saved', chromosome: '10', source: 'imputed', clinical: false, significance: '', gene: '', condition: '', zygosity: '' }
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(stored))

    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    expect(result.current.filters.search).toBe('saved')
    expect(result.current.filters.chromosome).toBe('10')
    expect(result.current.filters.source).toBe('imputed')
    expect(result.current.filters.clinical).toBe(false)
  })

  it('URL params take precedence over localStorage', async () => {
    const stored = { search: 'stored-search', chromosome: '3', source: '', clinical: true, significance: '', gene: '', condition: '', zygosity: '' }
    ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(stored))
    setLocationSearch('?search=url-search&chr=X')

    const useSNPs = await loadHook()
    const { result } = renderHook(() => useSNPs())

    // URL overrides localStorage
    expect(result.current.filters.search).toBe('url-search')
    expect(result.current.filters.chromosome).toBe('X')
    // localStorage value preserved for non-URL params
    expect(result.current.filters.clinical).toBe(true)
  })
})
