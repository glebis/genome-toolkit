import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMentalHealthData } from '../hooks/useMentalHealthData'

const mockDashboardResponse = {
  sections: [
    {
      narrative: {
        pathway: 'Methylation Pathway',
        status: 'actionable',
        body: 'Reduced folate conversion impacts methylation.',
        priority: 'Priority: methylation pathway support',
        hint: '',
        geneCount: 1,
        actionCount: 1,
      },
      genes: [
        {
          symbol: 'MTHFR',
          variant: 'C677T',
          rsid: 'rs1801133',
          genotype: 'T/T',
          status: 'actionable',
          evidenceTier: 'E2',
          studyCount: 12,
          description: 'Reduced folate.',
          actionCount: 1,
          categories: ['mood'],
          pathway: 'Methylation',
        },
      ],
      actions: {
        MTHFR: [
          {
            id: 'a1',
            type: 'consider',
            title: 'Take methylfolate',
            description: 'Supplement with L-methylfolate.',
            evidenceTier: 'E2',
            studyCount: 12,
            tags: ['supplement'],
            geneSymbol: 'MTHFR',
            done: false,
          },
        ],
      },
    },
  ],
  totalGenes: 1,
  totalActions: 1,
}

function mockFetchOk(data: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }) as any
}

function mockFetchError(status = 500) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  }) as any
}

function mockFetchNetworkError() {
  global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useMentalHealthData', () => {
  it('shows loading state initially', () => {
    // Never-resolving fetch to freeze loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any
    const { result } = renderHook(() => useMentalHealthData())
    expect(result.current.loading).toBe(true)
    expect(result.current.sections).toEqual([])
  })

  it('loads sections on mount', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toHaveLength(1)
    expect(result.current.sections[0].narrative.pathway).toBe('Methylation Pathway')
    expect(result.current.sections[0].genes[0].symbol).toBe('MTHFR')
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/mental-health/dashboard',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('computes totalGenes from sections', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalGenes).toBe(1)
  })

  it('computes totalActions from sections', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalActions).toBe(1)
  })

  it('extracts actions from section.actions into hook actions state', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.actions).toHaveProperty('MTHFR')
    expect(result.current.actions.MTHFR).toHaveLength(1)
    expect(result.current.actions.MTHFR[0].title).toBe('Take methylfolate')
  })

  it('getActionsForGene returns correct actions for a known gene', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    const actions = result.current.getActionsForGene('MTHFR')
    expect(actions).toHaveLength(1)
    expect(actions[0].id).toBe('a1')
    expect(actions[0].geneSymbol).toBe('MTHFR')
  })

  it('getActionsForGene returns empty array for unknown gene', async () => {
    mockFetchOk(mockDashboardResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.getActionsForGene('NONEXISTENT')).toEqual([])
  })

  it('handles API error gracefully', async () => {
    mockFetchError(500)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toEqual([])
    expect(result.current.totalGenes).toBe(0)
    expect(result.current.totalActions).toBe(0)
  })

  it('handles network error gracefully', async () => {
    mockFetchNetworkError()
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toEqual([])
    expect(result.current.totalGenes).toBe(0)
  })

  it('handles empty sections in response', async () => {
    mockFetchOk({ sections: [], totalGenes: 0, totalActions: 0 })
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toEqual([])
    expect(result.current.totalGenes).toBe(0)
    expect(result.current.totalActions).toBe(0)
    expect(result.current.actions).toEqual({})
  })
})
