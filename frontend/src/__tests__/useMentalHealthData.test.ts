import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useMentalHealthData,
  mapStatus,
  mapTier,
  worstStatus,
  matchesSystem,
  vaultGeneToGeneData,
  systemsToCategories,
  mapActionType,
  buildFromVaultGenes,
} from '../hooks/useMentalHealthData'
import type { VaultGene } from '../hooks/useVaultGenes'
import type { PathwaySection, ActionData } from '../types/genomics'

// ── Mock data ───────────────────────────────────────────────────────────────

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

const mockMultiSectionResponse = {
  sections: [
    {
      narrative: {
        pathway: 'Methylation Pathway',
        status: 'actionable',
        body: 'Methylation issue.',
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
          categories: [],
          pathway: 'Methylation Pathway',
        },
      ],
      actions: {
        MTHFR: [
          { id: 'a1', type: 'consider', title: 'Methylfolate', description: '', evidenceTier: 'E2', studyCount: 12, tags: [], geneSymbol: 'MTHFR', done: false },
        ],
      },
    },
    {
      narrative: {
        pathway: 'Serotonin & Neuroplasticity',
        status: 'monitor',
        body: 'Serotonin transport variant.',
        priority: 'Status: monitor',
        hint: '',
        geneCount: 2,
        actionCount: 2,
      },
      genes: [
        {
          symbol: 'SLC6A4',
          variant: '5-HTTLPR',
          rsid: 'rs25531',
          genotype: 'S/L',
          status: 'monitor',
          evidenceTier: 'E2',
          studyCount: 30,
          description: 'Short allele.',
          actionCount: 1,
          categories: [],
          pathway: 'Serotonin & Neuroplasticity',
        },
        {
          symbol: 'BDNF',
          variant: 'Val66Met',
          rsid: 'rs6265',
          genotype: 'G/A',
          status: 'monitor',
          evidenceTier: 'E2',
          studyCount: 25,
          description: 'Reduced BDNF secretion.',
          actionCount: 1,
          categories: [],
          pathway: 'Serotonin & Neuroplasticity',
        },
      ],
      actions: {
        SLC6A4: [
          { id: 'a2', type: 'monitor', title: 'Track mood', description: '', evidenceTier: 'E2', studyCount: 5, tags: [], geneSymbol: 'SLC6A4', done: false },
        ],
        BDNF: [
          { id: 'a3', type: 'try', title: 'Exercise', description: '', evidenceTier: 'E2', studyCount: 10, tags: [], geneSymbol: 'BDNF', done: false },
        ],
      },
    },
  ],
  totalGenes: 3,
  totalActions: 3,
}

function makeVaultGene(overrides: Partial<VaultGene> = {}): VaultGene {
  return {
    symbol: 'MTHFR',
    full_name: 'Methylenetetrahydrofolate Reductase',
    chromosome: '1',
    systems: ['Methylation Pathway'],
    evidence_tier: 'E2',
    personal_status: 'risk',
    relevance: 'high',
    description: 'Reduced folate conversion.',
    personal_variants: [{ rsid: 'rs1801133', genotype: 'T/T', significance: '' }],
    tags: [],
    study_count: 12,
    has_vault_note: true,
    ...overrides,
  }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

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

// ── Helper function unit tests ──────────────────────────────────────────────

describe('mapStatus', () => {
  it('maps "risk" to "actionable"', () => {
    expect(mapStatus('risk')).toBe('actionable')
  })

  it('maps "actionable" to "actionable"', () => {
    expect(mapStatus('actionable')).toBe('actionable')
  })

  it('maps "intermediate" to "monitor"', () => {
    expect(mapStatus('intermediate')).toBe('monitor')
  })

  it('maps "monitor" to "monitor"', () => {
    expect(mapStatus('monitor')).toBe('monitor')
  })

  it('maps "optimal" to "optimal"', () => {
    expect(mapStatus('optimal')).toBe('optimal')
  })

  it('maps "normal" to "optimal"', () => {
    expect(mapStatus('normal')).toBe('optimal')
  })

  it('maps "typical" to "optimal"', () => {
    expect(mapStatus('typical')).toBe('optimal')
  })

  it('maps unknown string to "neutral"', () => {
    expect(mapStatus('unknown')).toBe('neutral')
    expect(mapStatus('')).toBe('neutral')
  })
})

describe('mapTier', () => {
  it('returns valid tiers as-is', () => {
    expect(mapTier('E1')).toBe('E1')
    expect(mapTier('E2')).toBe('E2')
    expect(mapTier('E3')).toBe('E3')
    expect(mapTier('E4')).toBe('E4')
    expect(mapTier('E5')).toBe('E5')
  })

  it('defaults unknown tiers to E3', () => {
    expect(mapTier('E6')).toBe('E3')
    expect(mapTier('')).toBe('E3')
    expect(mapTier('high')).toBe('E3')
  })
})

describe('worstStatus', () => {
  it('returns "actionable" if any status is actionable', () => {
    expect(worstStatus(['optimal', 'actionable', 'monitor'])).toBe('actionable')
  })

  it('returns "monitor" if worst is monitor', () => {
    expect(worstStatus(['optimal', 'monitor'])).toBe('monitor')
  })

  it('returns "optimal" for all optimal', () => {
    expect(worstStatus(['optimal', 'optimal'])).toBe('optimal')
  })

  it('returns "neutral" for empty array', () => {
    expect(worstStatus([])).toBe('neutral')
  })

  it('returns "neutral" for all neutral', () => {
    expect(worstStatus(['neutral', 'neutral'])).toBe('neutral')
  })
})

describe('mapActionType', () => {
  it('returns valid action types as-is', () => {
    expect(mapActionType('consider')).toBe('consider')
    expect(mapActionType('monitor')).toBe('monitor')
    expect(mapActionType('discuss')).toBe('discuss')
    expect(mapActionType('try')).toBe('try')
  })

  it('defaults unknown types to "consider"', () => {
    expect(mapActionType('unknown')).toBe('consider')
    expect(mapActionType('')).toBe('consider')
  })
})

describe('matchesSystem', () => {
  it('matches gene system to tags', () => {
    const gene = makeVaultGene({ systems: ['Methylation Pathway'] })
    expect(matchesSystem(gene, ['Methylation Pathway', 'Methylation'])).toBe(true)
  })

  it('matches case-insensitively', () => {
    const gene = makeVaultGene({ systems: ['serotonin system'] })
    expect(matchesSystem(gene, ['Serotonin System'])).toBe(true)
  })

  it('strips wikilinks from gene systems', () => {
    const gene = makeVaultGene({ systems: ['[[Methylation]]'] })
    expect(matchesSystem(gene, ['Methylation'])).toBe(true)
  })

  it('matches partial inclusion (tag includes system)', () => {
    const gene = makeVaultGene({ systems: ['GABA'] })
    expect(matchesSystem(gene, ['GABA System'])).toBe(true)
  })

  it('returns false when no match', () => {
    const gene = makeVaultGene({ systems: ['Liver and Metabolism'] })
    expect(matchesSystem(gene, ['Serotonin System'])).toBe(false)
  })

  it('handles empty systems array', () => {
    const gene = makeVaultGene({ systems: [] })
    expect(matchesSystem(gene, ['Methylation'])).toBe(false)
  })
})

describe('systemsToCategories', () => {
  it('maps methylation system to mood', () => {
    expect(systemsToCategories(['Methylation Pathway'])).toEqual(['mood'])
  })

  it('maps GABA system to sleep', () => {
    expect(systemsToCategories(['GABA System', 'Sleep Architecture'])).toContain('sleep')
  })

  it('maps stress response to stress', () => {
    expect(systemsToCategories(['Stress Response', 'HPA Axis'])).toContain('stress')
  })

  it('maps dopamine to focus', () => {
    expect(systemsToCategories(['Dopamine System'])).toContain('focus')
  })

  it('strips wikilinks before matching', () => {
    expect(systemsToCategories(['[[Methylation]]'])).toEqual(['mood'])
  })

  it('returns mood as default when no systems match', () => {
    expect(systemsToCategories(['Liver and Metabolism'])).toEqual(['mood'])
  })

  it('returns mood as default for empty systems array', () => {
    expect(systemsToCategories([])).toEqual(['mood'])
  })

  it('produces multiple categories for multi-pathway genes', () => {
    const cats = systemsToCategories(['GABA System', 'Stress Response'])
    expect(cats).toContain('sleep')
    expect(cats).toContain('stress')
  })
})

describe('vaultGeneToGeneData', () => {
  it('converts vault gene to GeneData', () => {
    const gene = makeVaultGene()
    const result = vaultGeneToGeneData(gene, 'Methylation Pathway')

    expect(result.symbol).toBe('MTHFR')
    expect(result.variant).toBe('rs1801133')
    expect(result.rsid).toBe('rs1801133')
    expect(result.genotype).toBe('T/T')
    expect(result.status).toBe('actionable') // risk -> actionable
    expect(result.evidenceTier).toBe('E2')
    expect(result.studyCount).toBe(12)
    expect(result.description).toBe('Reduced folate conversion.')
    expect(result.actionCount).toBe(0)
    expect(result.pathway).toBe('Methylation Pathway')
  })

  it('derives categories from gene systems', () => {
    const gene = makeVaultGene({ systems: ['GABA System'] })
    expect(vaultGeneToGeneData(gene, 'GABA & Sleep').categories).toContain('sleep')
  })

  it('defaults categories to mood when systems are empty', () => {
    const gene = makeVaultGene({ systems: [] })
    expect(vaultGeneToGeneData(gene, 'Test').categories).toEqual(['mood'])
  })

  it('handles gene with no personal variants', () => {
    const gene = makeVaultGene({ personal_variants: [] })
    const result = vaultGeneToGeneData(gene, 'Test')

    expect(result.variant).toBe('')
    expect(result.rsid).toBe('')
    expect(result.genotype).toBe('')
  })

  it('handles undefined personal_variants', () => {
    const gene = makeVaultGene()
    // Force undefined to test defensive code
    ;(gene as any).personal_variants = undefined
    const result = vaultGeneToGeneData(gene, 'Test')

    expect(result.variant).toBe('')
    expect(result.rsid).toBe('')
    expect(result.genotype).toBe('')
  })
})

describe('buildFromVaultGenes', () => {
  it('groups genes into sections by MH_SYSTEMS', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'] }),
      makeVaultGene({ symbol: 'SLC6A4', systems: ['Serotonin System'], personal_status: 'intermediate' }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actions: [] }),
    }) as any

    let sections: PathwaySection[] = []
    let actions: Record<string, ActionData[]> = {}
    await buildFromVaultGenes(genes, (s) => { sections = s }, (a) => { actions = a })

    expect(sections.length).toBe(2)
    const methSection = sections.find(s => s.narrative.pathway === 'Methylation Pathway')
    expect(methSection).toBeDefined()
    expect(methSection!.genes[0].symbol).toBe('MTHFR')

    const seroSection = sections.find(s => s.narrative.pathway === 'Serotonin & Neuroplasticity')
    expect(seroSection).toBeDefined()
    expect(seroSection!.genes[0].symbol).toBe('SLC6A4')
  })

  it('sets section status to worst gene status', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'], personal_status: 'risk' }),
      makeVaultGene({ symbol: 'MTRR', systems: ['Methylation'], personal_status: 'optimal' }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actions: [] }),
    }) as any

    let sections: PathwaySection[] = []
    await buildFromVaultGenes(genes, (s) => { sections = s }, () => {})

    const methSection = sections.find(s => s.narrative.pathway === 'Methylation Pathway')
    expect(methSection!.narrative.status).toBe('actionable')
  })

  it('fetches and assigns actions per gene', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'] }),
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/actions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            actions: [
              { id: 'act1', type: 'consider', title: 'Take folate', description: 'desc', evidence_tier: 'E2', study_count: 5, tags: ['supplement'] },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: false })
    }) as any

    let sections: PathwaySection[] = []
    let actions: Record<string, ActionData[]> = {}
    await buildFromVaultGenes(genes, (s) => { sections = s }, (a) => { actions = a })

    expect(actions.MTHFR).toHaveLength(1)
    expect(actions.MTHFR[0].title).toBe('Take folate')
    expect(actions.MTHFR[0].geneSymbol).toBe('MTHFR')
    expect(actions.MTHFR[0].done).toBe(false)
    expect(sections[0].narrative.actionCount).toBe(1)
    expect(sections[0].genes[0].actionCount).toBe(1)
  })

  it('handles failed action fetch gracefully', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'] }),
    ]

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any

    let sections: PathwaySection[] = []
    let actions: Record<string, ActionData[]> = {}
    await buildFromVaultGenes(genes, (s) => { sections = s }, (a) => { actions = a })

    // Section still built, just no actions
    expect(sections.length).toBe(1)
    expect(sections[0].narrative.actionCount).toBe(0)
    expect(actions.MTHFR).toBeUndefined()
  })

  it('skips genes that do not match any system', async () => {
    const genes = [
      makeVaultGene({ symbol: 'CYP2D6', systems: ['Drug Metabolism'] }),
    ]

    global.fetch = vi.fn() as any

    let sections: PathwaySection[] = []
    await buildFromVaultGenes(genes, (s) => { sections = s }, () => {})

    expect(sections.length).toBe(0)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('builds narrative body from gene descriptions', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'], description: 'Folate issue.' }),
      makeVaultGene({ symbol: 'MTRR', systems: ['Methylation'], description: 'MTR recycling.' }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actions: [] }),
    }) as any

    let sections: PathwaySection[] = []
    await buildFromVaultGenes(genes, (s) => { sections = s }, () => {})

    const methSection = sections.find(s => s.narrative.pathway === 'Methylation Pathway')
    expect(methSection!.narrative.body).toContain('Folate issue.')
    expect(methSection!.narrative.body).toContain('MTR recycling.')
  })

  it('sets priority text based on actionable status', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'], personal_status: 'risk' }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actions: [] }),
    }) as any

    let sections: PathwaySection[] = []
    await buildFromVaultGenes(genes, (s) => { sections = s }, () => {})

    expect(sections[0].narrative.priority).toBe('Priority: methylation pathway support')
  })

  it('sets status text for non-actionable pathways', async () => {
    const genes = [
      makeVaultGene({ symbol: 'SLC6A4', systems: ['Serotonin System'], personal_status: 'intermediate' }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actions: [] }),
    }) as any

    let sections: PathwaySection[] = []
    await buildFromVaultGenes(genes, (s) => { sections = s }, () => {})

    expect(sections[0].narrative.priority).toBe('Status: monitor')
  })

  it('assigns auto-generated action IDs when missing', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'] }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        actions: [
          { title: 'No-ID action', description: 'test' },
        ],
      }),
    }) as any

    let actions: Record<string, ActionData[]> = {}
    await buildFromVaultGenes(genes, () => {}, (a) => { actions = a })

    expect(actions.MTHFR[0].id).toBe('MTHFR-0')
    expect(actions.MTHFR[0].type).toBe('consider') // default
    expect(actions.MTHFR[0].evidenceTier).toBe('E3') // default
  })

  it('handles non-ok action response', async () => {
    const genes = [
      makeVaultGene({ symbol: 'MTHFR', systems: ['Methylation Pathway'] }),
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as any

    let sections: PathwaySection[] = []
    let actions: Record<string, ActionData[]> = {}
    await buildFromVaultGenes(genes, (s) => { sections = s }, (a) => { actions = a })

    expect(sections.length).toBe(1)
    expect(sections[0].narrative.actionCount).toBe(0)
    expect(actions.MTHFR).toBeUndefined()
  })
})

// ── Hook integration tests ──────────────────────────────────────────────────

describe('useMentalHealthData', () => {
  it('shows loading state initially', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as any
    const { result } = renderHook(() => useMentalHealthData())
    expect(result.current.loading).toBe(true)
    expect(result.current.sections).toEqual([])
    expect(result.current.totalGenes).toBe(0)
    expect(result.current.totalActions).toBe(0)
    expect(result.current.actions).toEqual({})
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

  it('handles multiple sections with actions across genes', async () => {
    mockFetchOk(mockMultiSectionResponse)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toHaveLength(2)
    expect(result.current.totalGenes).toBe(3)
    expect(result.current.totalActions).toBe(3)

    expect(result.current.getActionsForGene('SLC6A4')).toHaveLength(1)
    expect(result.current.getActionsForGene('BDNF')).toHaveLength(1)
    expect(result.current.getActionsForGene('MTHFR')).toHaveLength(1)
  })

  it('handles sections without actions property', async () => {
    mockFetchOk({
      sections: [
        {
          narrative: {
            pathway: 'Stress Response',
            status: 'optimal',
            body: 'Normal stress response.',
            priority: 'Status: optimal',
            hint: '',
            geneCount: 1,
            actionCount: 0,
          },
          genes: [
            {
              symbol: 'CRHR1',
              variant: '',
              rsid: 'rs12345',
              genotype: 'A/A',
              status: 'optimal',
              evidenceTier: 'E3',
              studyCount: 5,
              description: 'Normal.',
              actionCount: 0,
              categories: [],
              pathway: 'Stress Response',
            },
          ],
          // No actions property
        },
      ],
      totalGenes: 1,
      totalActions: 0,
    })
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toHaveLength(1)
    expect(result.current.actions).toEqual({})
    expect(result.current.getActionsForGene('CRHR1')).toEqual([])
  })

  it('aborts fetch on unmount', async () => {
    let abortSignal: AbortSignal | undefined
    global.fetch = vi.fn().mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
      abortSignal = opts.signal
      return new Promise(() => {}) // never resolves
    }) as any

    const { unmount } = renderHook(() => useMentalHealthData())
    unmount()

    expect(abortSignal?.aborted).toBe(true)
  })

  it('handles null/undefined data from API', async () => {
    mockFetchOk(null)
    const { result } = renderHook(() => useMentalHealthData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sections).toEqual([])
    expect(result.current.totalGenes).toBe(0)
  })
})
